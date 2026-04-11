import json
import os
import uuid
from datetime import datetime, timezone
from typing import Any

import psycopg
from psycopg.rows import dict_row


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _connect() -> psycopg.Connection:
    db_dsn = os.getenv("DATABASE_URL")
    if not db_dsn:
        raise RuntimeError("缺少 DATABASE_URL 环境变量，请在 backend/.env 中配置 PostgreSQL 连接串")
    return psycopg.connect(db_dsn, row_factory=dict_row)


def init_alarm_flow_db() -> None:
    with _connect() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS alarm_flow_configs (
                id TEXT PRIMARY KEY,
                asset_id TEXT NOT NULL UNIQUE,
                name TEXT NOT NULL,
                enabled BOOLEAN NOT NULL DEFAULT false,
                schedule TEXT NOT NULL DEFAULT '',
                config JSONB NOT NULL DEFAULT '{}'::jsonb,
                status TEXT NOT NULL DEFAULT 'stopped',
                created_at TIMESTAMPTZ NOT NULL,
                updated_at TIMESTAMPTZ NOT NULL
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS alarm_flow_logs (
                id BIGSERIAL PRIMARY KEY,
                asset_id TEXT NOT NULL,
                flow_id TEXT NOT NULL,
                node_id TEXT NOT NULL,
                status TEXT NOT NULL,
                input_count INTEGER NOT NULL DEFAULT 0,
                output_count INTEGER NOT NULL DEFAULT 0,
                duration_ms INTEGER NOT NULL DEFAULT 0,
                error TEXT,
                message TEXT,
                created_at TIMESTAMPTZ NOT NULL
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS alarm_records (
                id BIGSERIAL PRIMARY KEY,
                flow_id TEXT NOT NULL,
                asset_id TEXT NOT NULL,
                occurrence_time TIMESTAMPTZ,
                severity TEXT,
                alarm_type TEXT,
                description TEXT,
                payload JSONB NOT NULL DEFAULT '{}'::jsonb,
                created_at TIMESTAMPTZ NOT NULL
            )
            """
        )


def _deserialize_flow(row: dict[str, Any] | None) -> dict[str, Any] | None:
    if row is None:
        return None
    config = row.get("config")
    if isinstance(config, str):
        row["config"] = json.loads(config)
    row["nodes"] = row.get("config", {}).get("nodes", [])
    row["edges"] = row.get("config", {}).get("edges", [])
    return row


def upsert_alarm_flow(
    *,
    asset_id: str,
    name: str,
    enabled: bool,
    schedule: str,
    nodes: list[dict[str, Any]],
    edges: list[dict[str, Any]],
) -> dict[str, Any]:
    now = _utc_now()
    with _connect() as conn:
        existing = conn.execute(
            "SELECT id, status, created_at FROM alarm_flow_configs WHERE asset_id = %s",
            (asset_id,),
        ).fetchone()
        flow_id = existing["id"] if existing else str(uuid.uuid4())
        status_value = existing["status"] if existing else "stopped"
        created_at = existing["created_at"] if existing else now
        row = conn.execute(
            """
            INSERT INTO alarm_flow_configs(id, asset_id, name, enabled, schedule, config, status, created_at, updated_at)
            VALUES (%s, %s, %s, %s, %s, %s::jsonb, %s, %s, %s)
            ON CONFLICT (asset_id) DO UPDATE SET
                name = EXCLUDED.name,
                enabled = EXCLUDED.enabled,
                schedule = EXCLUDED.schedule,
                config = EXCLUDED.config,
                updated_at = EXCLUDED.updated_at
            RETURNING id, asset_id, name, enabled, schedule, config, status, created_at, updated_at
            """,
            (
                flow_id,
                asset_id,
                name,
                enabled,
                schedule,
                json.dumps({"nodes": nodes, "edges": edges}, ensure_ascii=False),
                status_value,
                created_at,
                now,
            ),
        ).fetchone()
    return _deserialize_flow(row) or {}


def get_alarm_flow(asset_id: str) -> dict[str, Any] | None:
    with _connect() as conn:
        row = conn.execute(
            """
            SELECT id, asset_id, name, enabled, schedule, config, status, created_at, updated_at
            FROM alarm_flow_configs
            WHERE asset_id = %s
            """,
            (asset_id,),
        ).fetchone()
    return _deserialize_flow(row)


def delete_alarm_flow(asset_id: str) -> bool:
    with _connect() as conn:
        row = conn.execute("DELETE FROM alarm_flow_configs WHERE asset_id = %s RETURNING id", (asset_id,)).fetchone()
    return row is not None


def update_alarm_flow_status(asset_id: str, *, status: str, enabled: bool | None = None) -> dict[str, Any] | None:
    now = _utc_now()
    set_enabled_sql = ", enabled = %s" if enabled is not None else ""
    params: list[Any] = [status, now]
    if enabled is not None:
        params.append(enabled)
    params.append(asset_id)
    with _connect() as conn:
        row = conn.execute(
            f"""
            UPDATE alarm_flow_configs
            SET status = %s, updated_at = %s{set_enabled_sql}
            WHERE asset_id = %s
            RETURNING id, asset_id, name, enabled, schedule, config, status, created_at, updated_at
            """,
            params,
        ).fetchone()
    return _deserialize_flow(row)


def list_running_alarm_flows() -> list[dict[str, Any]]:
    with _connect() as conn:
        rows = conn.execute(
            """
            SELECT id, asset_id, name, enabled, schedule, config, status, created_at, updated_at
            FROM alarm_flow_configs
            WHERE enabled = true AND status = 'running'
            ORDER BY updated_at DESC
            """
        ).fetchall()
    return [_deserialize_flow(row) for row in rows if row is not None]


def create_alarm_flow_log(
    *,
    asset_id: str,
    flow_id: str,
    node_id: str,
    status: str,
    input_count: int,
    output_count: int,
    duration_ms: int,
    error: str | None = None,
    message: str | None = None,
) -> None:
    now = _utc_now()
    with _connect() as conn:
        conn.execute(
            """
            INSERT INTO alarm_flow_logs(asset_id, flow_id, node_id, status, input_count, output_count, duration_ms, error, message, created_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            """,
            (asset_id, flow_id, node_id, status, input_count, output_count, duration_ms, error, message, now),
        )


def list_alarm_flow_logs(asset_id: str, *, node_id: str | None = None, limit: int = 50) -> list[dict[str, Any]]:
    sql = """
        SELECT node_id, created_at AS timestamp, status, input_count, output_count, duration_ms, error, message
        FROM alarm_flow_logs
        WHERE asset_id = %s
    """
    params: list[Any] = [asset_id]
    if node_id:
        sql += " AND node_id = %s"
        params.append(node_id)
    sql += " ORDER BY created_at DESC LIMIT %s"
    params.append(limit)
    with _connect() as conn:
        return conn.execute(sql, params).fetchall()


def create_alarm_record(
    *,
    flow_id: str,
    asset_id: str,
    occurrence_time: datetime | None,
    severity: str | None,
    alarm_type: str | None,
    description: str | None,
    payload: dict[str, Any],
) -> None:
    with _connect() as conn:
        conn.execute(
            """
            INSERT INTO alarm_records(flow_id, asset_id, occurrence_time, severity, alarm_type, description, payload, created_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s::jsonb, %s)
            """,
            (
                flow_id,
                asset_id,
                occurrence_time,
                severity,
                alarm_type,
                description,
                json.dumps(payload, ensure_ascii=False),
                _utc_now(),
            ),
        )
