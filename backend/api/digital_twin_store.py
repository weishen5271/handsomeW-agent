import json
import os
import uuid
from datetime import datetime, timezone
from typing import Any

import psycopg
from neo4j import GraphDatabase
from neo4j.exceptions import Neo4jError
from psycopg.rows import dict_row


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _connect() -> psycopg.Connection:
    db_dsn = os.getenv("DATABASE_URL")
    if not db_dsn:
        raise RuntimeError("缺少 DATABASE_URL 环境变量，请在 backend/.env 中配置 PostgreSQL 连接串")
    return psycopg.connect(db_dsn, row_factory=dict_row)


class SceneGraphStore:
    """Scene-scoped relation storage backed by Neo4j."""

    def __init__(self) -> None:
        self._driver = None
        self._database: str | None = None

    def _ensure_driver(self):
        if self._driver is not None:
            return self._driver
        uri = os.getenv("NEO4J_URI")
        user = os.getenv("NEO4J_USER")
        password = os.getenv("NEO4J_PASSWORD")
        database = os.getenv("NEO4J_DATABASE") or None
        if not uri or not user or not password:
            raise RuntimeError("Neo4j 未配置，请设置 NEO4J_URI / NEO4J_USER / NEO4J_PASSWORD")
        self._driver = GraphDatabase.driver(uri, auth=(user, password))
        self._database = database
        return self._driver

    def replace_scene_relations(self, scene_id: str, relations: list[dict[str, str]]) -> None:
        driver = self._ensure_driver()
        now_iso = _utc_now().isoformat()
        try:
            with driver.session(database=self._database) as session:
                session.run(
                    """
                    MATCH ()-[r:SCENE_FLOW {scene_id: $scene_id}]->()
                    DELETE r
                    """,
                    {"scene_id": scene_id},
                )
                if relations:
                    session.run(
                        """
                        UNWIND $rels AS rel
                        MERGE (src:Asset {id: rel.source_asset_id})
                        MERGE (dst:Asset {id: rel.target_asset_id})
                        MERGE (scene:Scene {id: $scene_id})
                        MERGE (scene)-[:USES_ASSET]->(src)
                        MERGE (scene)-[:USES_ASSET]->(dst)
                        MERGE (src)-[r:SCENE_FLOW {
                          scene_id: $scene_id,
                          source_asset_id: rel.source_asset_id,
                          target_asset_id: rel.target_asset_id,
                          relation_type: rel.relation_type
                        }]->(dst)
                        SET r.updated_at = $now_iso,
                            r.created_at = coalesce(r.created_at, $now_iso)
                        """,
                        {"scene_id": scene_id, "rels": relations, "now_iso": now_iso},
                    )
        except Neo4jError as exc:
            raise RuntimeError(f"Neo4j 写入失败: {exc}") from exc

    def list_scene_relations(self, scene_id: str) -> list[dict[str, Any]]:
        driver = self._ensure_driver()
        try:
            with driver.session(database=self._database) as session:
                rows = session.run(
                    """
                    MATCH (src:Asset)-[r:SCENE_FLOW {scene_id: $scene_id}]->(dst:Asset)
                    RETURN r.source_asset_id AS source_asset_id,
                           r.target_asset_id AS target_asset_id,
                           r.relation_type AS relation_type,
                           r.created_at AS created_at
                    ORDER BY source_asset_id, target_asset_id, relation_type
                    """,
                    {"scene_id": scene_id},
                )
                result: list[dict[str, Any]] = []
                for record in rows:
                    item = record.data()
                    created_at = item.get("created_at")
                    item["created_at"] = str(created_at) if created_at is not None else None
                    result.append(item)
                return result
        except Neo4jError as exc:
            raise RuntimeError(f"Neo4j 读取失败: {exc}") from exc

    def delete_scene(self, scene_id: str) -> None:
        driver = self._ensure_driver()
        try:
            with driver.session(database=self._database) as session:
                session.run(
                    """
                    MATCH ()-[r:SCENE_FLOW {scene_id: $scene_id}]->()
                    DELETE r
                    """,
                    {"scene_id": scene_id},
                )
                session.run(
                    """
                    MATCH (s:Scene {id: $scene_id})
                    DETACH DELETE s
                    """,
                    {"scene_id": scene_id},
                )
        except Neo4jError as exc:
            raise RuntimeError(f"Neo4j 删除失败: {exc}") from exc


_SCENE_GRAPH_STORE = SceneGraphStore()


def init_digital_twin_db() -> None:
    with _connect() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS digital_assets (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                type TEXT NOT NULL,
                status TEXT NOT NULL CHECK(status IN ('Normal', 'Warning', 'Critical')),
                location TEXT NOT NULL,
                health SMALLINT NOT NULL CHECK(health >= 0 AND health <= 100),
                model_file TEXT NOT NULL,
                metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
                created_at TIMESTAMPTZ NOT NULL,
                updated_at TIMESTAMPTZ NOT NULL
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS scene_configs (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                description TEXT NOT NULL DEFAULT '',
                created_at TIMESTAMPTZ NOT NULL,
                updated_at TIMESTAMPTZ NOT NULL
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS scene_instances (
                id TEXT PRIMARY KEY,
                scene_id TEXT NOT NULL REFERENCES scene_configs(id) ON DELETE CASCADE,
                asset_id TEXT NOT NULL REFERENCES digital_assets(id) ON DELETE CASCADE,
                position_x DOUBLE PRECISION NOT NULL DEFAULT 0,
                position_y DOUBLE PRECISION NOT NULL DEFAULT 0,
                position_z DOUBLE PRECISION NOT NULL DEFAULT 0,
                rotation_x DOUBLE PRECISION NOT NULL DEFAULT 0,
                rotation_y DOUBLE PRECISION NOT NULL DEFAULT 0,
                rotation_z DOUBLE PRECISION NOT NULL DEFAULT 0,
                scale DOUBLE PRECISION NOT NULL DEFAULT 1,
                created_at TIMESTAMPTZ NOT NULL,
                updated_at TIMESTAMPTZ NOT NULL,
                UNIQUE(scene_id, asset_id)
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS asset_relations (
                id BIGSERIAL PRIMARY KEY,
                source_asset_id TEXT NOT NULL REFERENCES digital_assets(id) ON DELETE CASCADE,
                target_asset_id TEXT NOT NULL REFERENCES digital_assets(id) ON DELETE CASCADE,
                relation_type TEXT NOT NULL DEFAULT 'upstream',
                created_at TIMESTAMPTZ NOT NULL,
                UNIQUE(source_asset_id, target_asset_id, relation_type)
            )
            """
        )
        conn.execute(
            """
            INSERT INTO scene_configs(id, name, description, created_at, updated_at)
            SELECT DISTINCT si.scene_id, si.scene_id, '自动迁移场景', %s, %s
            FROM scene_instances si
            WHERE NOT EXISTS (
                SELECT 1
                FROM scene_configs sc
                WHERE sc.id = si.scene_id
            )
            """,
            (_utc_now(), _utc_now()),
        )

    _seed_digital_twin_data()


def _seed_digital_twin_data() -> None:
    with _connect() as conn:
        row = conn.execute("SELECT COUNT(*) AS cnt FROM digital_assets").fetchone()
        if row and int(row["cnt"]) > 0:
            return

        now = _utc_now()
        assets = [
            {
                "id": "M-102",
                "name": "主电机",
                "type": "动力设备",
                "status": "Warning",
                "location": "2号生产线",
                "health": 68,
                "model_file": "motor_main.glb",
                "metadata": {"vendor": "TwinMind", "power_kw": 18.5},
            },
            {
                "id": "C-201",
                "name": "输送带控制器",
                "type": "控制单元",
                "status": "Normal",
                "location": "2号生产线",
                "health": 98,
                "model_file": "belt_controller.glb",
                "metadata": {"firmware": "2.3.1"},
            },
            {
                "id": "S-05",
                "name": "振动传感器",
                "type": "传感器",
                "status": "Normal",
                "location": "1号生产线",
                "health": 95,
                "model_file": "vibration_sensor.glb",
                "metadata": {"sampling_hz": 5000},
            },
            {
                "id": "H-22",
                "name": "液压单元",
                "type": "动力设备",
                "status": "Critical",
                "location": "3号生产线",
                "health": 32,
                "model_file": "hydraulic_unit.glb",
                "metadata": {"pressure_bar": 15},
            },
            {
                "id": "G-04",
                "name": "工业网关",
                "type": "通信设备",
                "status": "Normal",
                "location": "全厂区",
                "health": 88,
                "model_file": "industrial_gateway.glb",
                "metadata": {"ip": "10.8.0.4"},
            },
        ]

        for asset in assets:
            conn.execute(
                """
                INSERT INTO digital_assets(id, name, type, status, location, health, model_file, metadata, created_at, updated_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s::jsonb, %s, %s)
                """,
                (
                    asset["id"],
                    asset["name"],
                    asset["type"],
                    asset["status"],
                    asset["location"],
                    asset["health"],
                    asset["model_file"],
                    json.dumps(asset["metadata"], ensure_ascii=False),
                    now,
                    now,
                ),
            )

        conn.execute(
            """
            INSERT INTO scene_configs(id, name, description, created_at, updated_at)
            VALUES ('factory-main', '主工厂场景', '默认场景', %s, %s)
            ON CONFLICT (id) DO NOTHING
            """,
            (now, now),
        )

        scene_positions = [
            ("M-102", 2.0, 1.0, 0.0),
            ("C-201", 4.8, 1.5, 0.0),
            ("S-05", 1.0, 3.8, 1.2),
            ("H-22", 6.0, 3.5, 0.0),
            ("G-04", 3.3, 5.0, 2.2),
        ]
        for asset_id, x, y, z in scene_positions:
            conn.execute(
                """
                INSERT INTO scene_instances(id, scene_id, asset_id, position_x, position_y, position_z, created_at, updated_at)
                VALUES (%s, 'factory-main', %s, %s, %s, %s, %s, %s)
                """,
                (uuid.uuid4().hex, asset_id, x, y, z, now, now),
            )

        for source_id, target_id, relation_type in [
            ("S-05", "M-102", "upstream"),
            ("C-201", "M-102", "upstream"),
            ("M-102", "H-22", "downstream"),
            ("G-04", "C-201", "upstream"),
        ]:
            conn.execute(
                """
                INSERT INTO asset_relations(source_asset_id, target_asset_id, relation_type, created_at)
                VALUES (%s, %s, %s, %s)
                """,
                (source_id, target_id, relation_type, now),
            )


def list_assets(keyword: str | None = None, status: str | None = None) -> list[dict[str, Any]]:
    clauses: list[str] = []
    params: list[Any] = []
    if keyword:
        clauses.append("(id ILIKE %s OR name ILIKE %s OR type ILIKE %s OR location ILIKE %s)")
        kw = f"%{keyword.strip()}%"
        params.extend([kw, kw, kw, kw])
    if status:
        clauses.append("status = %s")
        params.append(status)

    where_sql = f"WHERE {' AND '.join(clauses)}" if clauses else ""
    with _connect() as conn:
        rows = conn.execute(
            f"""
            SELECT id, name, type, status, location, health, model_file, metadata, created_at, updated_at
            FROM digital_assets
            {where_sql}
            ORDER BY created_at DESC
            """,
            params,
        ).fetchall()
        return [dict(row) for row in rows]


def create_asset(
    asset_id: str,
    name: str,
    type_: str,
    status: str,
    location: str,
    health: int,
    model_file: str,
    metadata: dict[str, Any] | None,
) -> dict[str, Any]:
    now = _utc_now()
    payload_metadata = metadata or {}
    with _connect() as conn:
        row = conn.execute(
            """
            INSERT INTO digital_assets(id, name, type, status, location, health, model_file, metadata, created_at, updated_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s::jsonb, %s, %s)
            RETURNING id, name, type, status, location, health, model_file, metadata, created_at, updated_at
            """,
            (asset_id, name, type_, status, location, health, model_file, json.dumps(payload_metadata, ensure_ascii=False), now, now),
        ).fetchone()
        if row is None:
            raise RuntimeError("创建资产失败")
        return dict(row)


def update_asset(
    asset_id: str,
    name: str | None = None,
    type_: str | None = None,
    status: str | None = None,
    location: str | None = None,
    health: int | None = None,
    model_file: str | None = None,
    metadata: dict[str, Any] | None = None,
) -> dict[str, Any] | None:
    with _connect() as conn:
        current = conn.execute("SELECT * FROM digital_assets WHERE id = %s", (asset_id,)).fetchone()
        if current is None:
            return None

        now = _utc_now()
        next_metadata = metadata if metadata is not None else current["metadata"]
        row = conn.execute(
            """
            UPDATE digital_assets
            SET name = %s,
                type = %s,
                status = %s,
                location = %s,
                health = %s,
                model_file = %s,
                metadata = %s::jsonb,
                updated_at = %s
            WHERE id = %s
            RETURNING id, name, type, status, location, health, model_file, metadata, created_at, updated_at
            """,
            (
                name if name is not None else current["name"],
                type_ if type_ is not None else current["type"],
                status if status is not None else current["status"],
                location if location is not None else current["location"],
                health if health is not None else current["health"],
                model_file if model_file is not None else current["model_file"],
                json.dumps(next_metadata, ensure_ascii=False),
                now,
                asset_id,
            ),
        ).fetchone()
        if row is None:
            return None
        return dict(row)


def delete_asset(asset_id: str) -> bool:
    with _connect() as conn:
        cursor = conn.execute("DELETE FROM digital_assets WHERE id = %s", (asset_id,))
        return cursor.rowcount > 0


def list_asset_relations(asset_id: str) -> list[dict[str, Any]]:
    with _connect() as conn:
        rows = conn.execute(
            """
            SELECT source_asset_id, target_asset_id, relation_type, created_at
            FROM asset_relations
            WHERE source_asset_id = %s OR target_asset_id = %s
            ORDER BY created_at ASC
            """,
            (asset_id, asset_id),
        ).fetchall()
        return [dict(row) for row in rows]


def list_scenes(keyword: str | None = None) -> list[dict[str, Any]]:
    where_sql = ""
    params: list[Any] = []
    if keyword:
        kw = f"%{keyword.strip()}%"
        where_sql = "WHERE sc.id ILIKE %s OR sc.name ILIKE %s OR sc.description ILIKE %s"
        params.extend([kw, kw, kw])

    with _connect() as conn:
        rows = conn.execute(
            f"""
            SELECT sc.id,
                   sc.name,
                   sc.description,
                   sc.created_at,
                   sc.updated_at,
                   COUNT(si.asset_id)::INT AS asset_count
            FROM scene_configs sc
            LEFT JOIN scene_instances si ON si.scene_id = sc.id
            {where_sql}
            GROUP BY sc.id, sc.name, sc.description, sc.created_at, sc.updated_at
            ORDER BY sc.created_at DESC
            """,
            params,
        ).fetchall()
        return [dict(row) for row in rows]


def create_scene(scene_id: str, name: str, description: str | None = None) -> dict[str, Any]:
    now = _utc_now()
    with _connect() as conn:
        row = conn.execute(
            """
            INSERT INTO scene_configs(id, name, description, created_at, updated_at)
            VALUES (%s, %s, %s, %s, %s)
            RETURNING id, name, description, created_at, updated_at
            """,
            (scene_id, name, description or "", now, now),
        ).fetchone()
    if row is None:
        raise RuntimeError("创建场景失败")
    return dict(row)


def update_scene(scene_id: str, name: str | None = None, description: str | None = None) -> dict[str, Any] | None:
    with _connect() as conn:
        current = conn.execute("SELECT * FROM scene_configs WHERE id = %s", (scene_id,)).fetchone()
        if current is None:
            return None
        row = conn.execute(
            """
            UPDATE scene_configs
            SET name = %s,
                description = %s,
                updated_at = %s
            WHERE id = %s
            RETURNING id, name, description, created_at, updated_at
            """,
            (
                name if name is not None else current["name"],
                description if description is not None else current["description"],
                _utc_now(),
                scene_id,
            ),
        ).fetchone()
    return dict(row) if row else None


def _scene_exists(scene_id: str) -> bool:
    with _connect() as conn:
        row = conn.execute("SELECT 1 FROM scene_configs WHERE id = %s", (scene_id,)).fetchone()
        return row is not None


def delete_scene(scene_id: str) -> bool:
    with _connect() as conn:
        deleted = conn.execute("DELETE FROM scene_configs WHERE id = %s", (scene_id,)).rowcount > 0
    if deleted:
        try:
            _SCENE_GRAPH_STORE.delete_scene(scene_id)
        except RuntimeError:
            # Keep relational delete successful even when graph cleanup is unavailable.
            pass
    return deleted


def list_scene_assets(scene_id: str) -> list[dict[str, Any]]:
    with _connect() as conn:
        rows = conn.execute(
            """
            SELECT da.id, da.name, da.type, da.status, da.location, da.health, da.model_file, da.metadata, da.created_at, da.updated_at
            FROM scene_instances si
            JOIN digital_assets da ON da.id = si.asset_id
            WHERE si.scene_id = %s
            ORDER BY da.id ASC
            """,
            (scene_id,),
        ).fetchall()
        return [dict(row) for row in rows]


def replace_scene_assets(scene_id: str, asset_ids: list[str]) -> list[dict[str, Any]] | None:
    if not _scene_exists(scene_id):
        return None

    unique_ids = list(dict.fromkeys([item.strip() for item in asset_ids if item.strip()]))
    now = _utc_now()
    with _connect() as conn:
        if unique_ids:
            rows = conn.execute(
                "SELECT id FROM digital_assets WHERE id = ANY(%s)",
                (unique_ids,),
            ).fetchall()
            existing_asset_ids = {row["id"] for row in rows}
            missing = [asset_id for asset_id in unique_ids if asset_id not in existing_asset_ids]
            if missing:
                raise ValueError(f"资产不存在: {', '.join(missing)}")

        if unique_ids:
            conn.execute(
                "DELETE FROM scene_instances WHERE scene_id = %s AND asset_id <> ALL(%s)",
                (scene_id, unique_ids),
            )
        else:
            conn.execute("DELETE FROM scene_instances WHERE scene_id = %s", (scene_id,))

        for asset_id in unique_ids:
            conn.execute(
                """
                INSERT INTO scene_instances(id, scene_id, asset_id, position_x, position_y, position_z, rotation_x, rotation_y, rotation_z, scale, created_at, updated_at)
                VALUES (%s, %s, %s, 0, 0, 0, 0, 0, 0, 1, %s, %s)
                ON CONFLICT (scene_id, asset_id) DO NOTHING
                """,
                (uuid.uuid4().hex, scene_id, asset_id, now, now),
            )

    return list_scene_assets(scene_id)


def upsert_scene_instance(
    scene_id: str,
    asset_id: str,
    position_x: float,
    position_y: float,
    position_z: float,
    rotation_x: float,
    rotation_y: float,
    rotation_z: float,
    scale: float,
) -> dict[str, Any] | None:
    if not _scene_exists(scene_id):
        return None

    now = _utc_now()
    with _connect() as conn:
        existing = conn.execute(
            "SELECT id FROM scene_instances WHERE scene_id = %s AND asset_id = %s",
            (scene_id, asset_id),
        ).fetchone()
        if existing is None:
            instance_id = uuid.uuid4().hex
            row = conn.execute(
                """
                INSERT INTO scene_instances(id, scene_id, asset_id, position_x, position_y, position_z, rotation_x, rotation_y, rotation_z, scale, created_at, updated_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                RETURNING *
                """,
                (
                    instance_id,
                    scene_id,
                    asset_id,
                    position_x,
                    position_y,
                    position_z,
                    rotation_x,
                    rotation_y,
                    rotation_z,
                    scale,
                    now,
                    now,
                ),
            ).fetchone()
        else:
            row = conn.execute(
                """
                UPDATE scene_instances
                SET position_x = %s,
                    position_y = %s,
                    position_z = %s,
                    rotation_x = %s,
                    rotation_y = %s,
                    rotation_z = %s,
                    scale = %s,
                    updated_at = %s
                WHERE id = %s
                RETURNING *
                """,
                (
                    position_x,
                    position_y,
                    position_z,
                    rotation_x,
                    rotation_y,
                    rotation_z,
                    scale,
                    now,
                    existing["id"],
                ),
            ).fetchone()

    if row is None:
        raise RuntimeError("保存场景实例失败")
    return dict(row)


def _scene_asset_ids(scene_id: str) -> set[str]:
    with _connect() as conn:
        rows = conn.execute("SELECT asset_id FROM scene_instances WHERE scene_id = %s", (scene_id,)).fetchall()
        return {row["asset_id"] for row in rows}


def replace_scene_relations(scene_id: str, relations: list[dict[str, str]]) -> list[dict[str, Any]] | None:
    if not _scene_exists(scene_id):
        return None

    scene_assets = _scene_asset_ids(scene_id)
    for relation in relations:
        source = relation["source_asset_id"].strip()
        target = relation["target_asset_id"].strip()
        if source not in scene_assets or target not in scene_assets:
            raise ValueError(f"关系资产必须先绑定到场景: {source} -> {target}")

    clean_relations = [
        {
            "source_asset_id": item["source_asset_id"].strip(),
            "target_asset_id": item["target_asset_id"].strip(),
            "relation_type": item["relation_type"].strip() or "upstream",
        }
        for item in relations
    ]
    _SCENE_GRAPH_STORE.replace_scene_relations(scene_id, clean_relations)
    return _SCENE_GRAPH_STORE.list_scene_relations(scene_id)


def get_scene(scene_id: str) -> dict[str, Any] | None:
    with _connect() as conn:
        scene_row = conn.execute(
            "SELECT id, name, description, created_at, updated_at FROM scene_configs WHERE id = %s",
            (scene_id,),
        ).fetchone()
        if scene_row is None:
            return None

        rows = conn.execute(
            """
            SELECT
                si.id,
                si.scene_id,
                si.asset_id,
                si.position_x,
                si.position_y,
                si.position_z,
                si.rotation_x,
                si.rotation_y,
                si.rotation_z,
                si.scale,
                da.name,
                da.type,
                da.status,
                da.location,
                da.health,
                da.model_file
            FROM scene_instances si
            JOIN digital_assets da ON da.id = si.asset_id
            WHERE si.scene_id = %s
            ORDER BY da.id ASC
            """,
            (scene_id,),
        ).fetchall()
        instances = [dict(row) for row in rows]

    relations: list[dict[str, Any]] = []
    try:
        relations = _SCENE_GRAPH_STORE.list_scene_relations(scene_id)
    except RuntimeError:
        # Read path remains available even when graph DB is temporarily unavailable.
        relations = []

    return {
        "scene_id": scene_row["id"],
        "name": scene_row["name"],
        "description": scene_row["description"],
        "created_at": scene_row["created_at"],
        "updated_at": scene_row["updated_at"],
        "asset_count": len(instances),
        "instances": instances,
        "relations": relations,
    }
