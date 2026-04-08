import argparse
import csv
import os
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
from neo4j import GraphDatabase


PROJECT_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_DATA_DIR = PROJECT_ROOT / "data" / "graph_import"
DEFAULT_ENV_FILE = PROJECT_ROOT / "backend" / ".env"


def load_environment() -> None:
    if DEFAULT_ENV_FILE.exists():
        load_dotenv(DEFAULT_ENV_FILE)


def read_csv_rows(data_dir: Path, filename: str) -> list[dict[str, str]]:
    path = data_dir / filename
    if not path.exists():
        raise FileNotFoundError(f"缺少导入文件: {path}")
    with path.open("r", encoding="utf-8-sig", newline="") as fp:
        return list(csv.DictReader(fp))


def to_int(value: str | None, default: int = 0) -> int:
    try:
        if value is None or value == "":
            return default
        return int(value)
    except ValueError:
        return default


def ensure_constraints(session) -> None:
    statements = [
        "CREATE CONSTRAINT equipment_node_id IF NOT EXISTS FOR (n:Equipment) REQUIRE n.nodeId IS UNIQUE",
        "CREATE CONSTRAINT sensor_node_id IF NOT EXISTS FOR (n:Sensor) REQUIRE n.nodeId IS UNIQUE",
        "CREATE CONSTRAINT line_node_id IF NOT EXISTS FOR (n:ProductionLine) REQUIRE n.nodeId IS UNIQUE",
        "CREATE CONSTRAINT fault_node_id IF NOT EXISTS FOR (n:FaultMode) REQUIRE n.nodeId IS UNIQUE",
        "CREATE CONSTRAINT spare_part_node_id IF NOT EXISTS FOR (n:SparePart) REQUIRE n.nodeId IS UNIQUE",
        "CREATE CONSTRAINT alarm_node_id IF NOT EXISTS FOR (n:Alarm) REQUIRE n.nodeId IS UNIQUE",
        "CREATE CONSTRAINT maintenance_node_id IF NOT EXISTS FOR (n:MaintenanceRecord) REQUIRE n.nodeId IS UNIQUE",
        "CREATE CONSTRAINT document_node_id IF NOT EXISTS FOR (n:Document) REQUIRE n.nodeId IS UNIQUE",
    ]
    for statement in statements:
        session.run(statement)


def merge_nodes(session, rows: list[dict[str, str]], label: str, query: str) -> None:
    for row in rows:
        session.run(query, **row)


def merge_relationships(session, rows: list[dict[str, str]], query: str) -> None:
    for row in rows:
        session.run(query, **row)


def import_graph(data_dir: Path) -> None:
    uri = os.getenv("NEO4J_URI")
    user = os.getenv("NEO4J_USER")
    password = os.getenv("NEO4J_PASSWORD")
    database = os.getenv("NEO4J_DATABASE") or None
    if not uri or not user or not password:
        raise RuntimeError("缺少 Neo4j 配置，请在 backend/.env 中设置 NEO4J_URI / NEO4J_USER / NEO4J_PASSWORD")

    driver = GraphDatabase.driver(uri, auth=(user, password))
    try:
        with driver.session(database=database) as session:
            ensure_constraints(session)

            merge_nodes(
                session,
                read_csv_rows(data_dir, "production_lines.csv"),
                "ProductionLine",
                """
                MERGE (n:ProductionLine {nodeId: $nodeId})
                SET n.name = $name,
                    n.location = $location,
                    n.capacity = toInteger($capacity)
                """,
            )
            merge_nodes(
                session,
                read_csv_rows(data_dir, "equipments.csv"),
                "Equipment",
                """
                MERGE (n:Equipment {nodeId: $nodeId})
                SET n.name = $name,
                    n.type = $type,
                    n.status = $status,
                    n.health = toInteger($health),
                    n.location = $location,
                    n.model_file = $model_file,
                    n.description = $description
                """,
            )
            merge_nodes(
                session,
                read_csv_rows(data_dir, "sensors.csv"),
                "Sensor",
                """
                MERGE (n:Sensor {nodeId: $nodeId})
                SET n.name = $name,
                    n.type = $type,
                    n.status = $status,
                    n.sampling_hz = toInteger($sampling_hz),
                    n.equipment_id = $equipment_id
                """,
            )
            merge_nodes(
                session,
                read_csv_rows(data_dir, "fault_modes.csv"),
                "FaultMode",
                """
                MERGE (n:FaultMode {nodeId: $nodeId})
                SET n.name = $name,
                    n.symptoms = $symptoms,
                    n.root_causes = $root_causes,
                    n.solutions = $solutions
                """,
            )
            merge_nodes(
                session,
                read_csv_rows(data_dir, "spare_parts.csv"),
                "SparePart",
                """
                MERGE (n:SparePart {nodeId: $nodeId})
                SET n.name = $name,
                    n.type = $type,
                    n.spec = $spec,
                    n.vendor = $vendor
                """,
            )
            merge_nodes(
                session,
                read_csv_rows(data_dir, "alarms.csv"),
                "Alarm",
                """
                MERGE (n:Alarm {nodeId: $nodeId})
                SET n.name = $name,
                    n.severity = $severity,
                    n.source = $source,
                    n.occurrence_time = $occurrence_time
                """,
            )
            merge_nodes(
                session,
                read_csv_rows(data_dir, "maintenance_records.csv"),
                "MaintenanceRecord",
                """
                MERGE (n:MaintenanceRecord {nodeId: $nodeId})
                SET n.name = $name,
                    n.maintenance_type = $maintenance_type,
                    n.date = $date,
                    n.maintenance_date = $date,
                    n.description = $description
                """,
            )
            merge_nodes(
                session,
                read_csv_rows(data_dir, "documents.csv"),
                "Document",
                """
                MERGE (n:Document {nodeId: $nodeId})
                SET n.title = $title,
                    n.name = $title,
                    n.path = $path,
                    n.url = $url,
                    n.doc_type = $doc_type
                """,
            )

            merge_relationships(
                session,
                read_csv_rows(data_dir, "rel_equipment_located_at.csv"),
                """
                MATCH (e:Equipment {nodeId: $equipment_id})
                MATCH (p:ProductionLine {nodeId: $line_id})
                MERGE (e)-[:LOCATED_AT]->(p)
                MERGE (p)-[:HAS]->(e)
                """,
            )
            merge_relationships(
                session,
                read_csv_rows(data_dir, "rel_equipment_contains_sensor.csv"),
                """
                MATCH (e:Equipment {nodeId: $equipment_id})
                MATCH (s:Sensor {nodeId: $sensor_id})
                MERGE (e)-[:CONTAINS]->(s)
                MERGE (s)-[:BELONGS_TO]->(e)
                """,
            )
            merge_relationships(
                session,
                read_csv_rows(data_dir, "rel_equipment_exhibits_fault.csv"),
                """
                MATCH (e:Equipment {nodeId: $equipment_id})
                MATCH (f:FaultMode {nodeId: $fault_id})
                MERGE (e)-[r:EXHIBITS]->(f)
                SET r.severity = $severity,
                    r.occurrence_time = $occurrence_time
                """,
            )
            merge_relationships(
                session,
                read_csv_rows(data_dir, "rel_fault_affects_equipment.csv"),
                """
                MATCH (f:FaultMode {nodeId: $fault_id})
                MATCH (e:Equipment {nodeId: $equipment_id})
                MERGE (f)-[:AFFECTS]->(e)
                """,
            )
            merge_relationships(
                session,
                read_csv_rows(data_dir, "rel_equipment_uses_spare_part.csv"),
                """
                MATCH (e:Equipment {nodeId: $equipment_id})
                MATCH (s:SparePart {nodeId: $spare_part_id})
                MERGE (e)-[r:USES]->(s)
                SET r.quantity = toInteger($quantity),
                    r.unit = $unit
                """,
            )
            merge_relationships(
                session,
                read_csv_rows(data_dir, "rel_equipment_requires_maintenance.csv"),
                """
                MATCH (e:Equipment {nodeId: $equipment_id})
                MATCH (m:MaintenanceRecord {nodeId: $maintenance_id})
                MERGE (e)-[r:REQUIRES]->(m)
                SET r.maintenance_type = $maintenance_type,
                    r.interval = $interval
                """,
            )
            merge_relationships(
                session,
                read_csv_rows(data_dir, "rel_equipment_causes_alarm.csv"),
                """
                MATCH (e:Equipment {nodeId: $equipment_id})
                MATCH (a:Alarm {nodeId: $alarm_id})
                MERGE (e)-[r:CAUSES]->(a)
                SET r.occurrence_time = $occurrence_time
                """,
            )
            merge_relationships(
                session,
                read_csv_rows(data_dir, "rel_equipment_has_doc.csv"),
                """
                MATCH (e:Equipment {nodeId: $equipment_id})
                MATCH (d:Document {nodeId: $document_id})
                MERGE (e)-[:HAS_DOC]->(d)
                """,
            )
            merge_relationships(
                session,
                read_csv_rows(data_dir, "rel_equipment_depends_on.csv"),
                """
                MATCH (src:Equipment {nodeId: $source_equipment_id})
                MATCH (dst:Equipment {nodeId: $target_equipment_id})
                MERGE (src)-[r:DEPENDS_ON]->(dst)
                SET r.direction = $direction
                """,
            )

            counts = {
                "Equipment": session.run("MATCH (n:Equipment) RETURN count(n) AS c").single()["c"],
                "Sensor": session.run("MATCH (n:Sensor) RETURN count(n) AS c").single()["c"],
                "ProductionLine": session.run("MATCH (n:ProductionLine) RETURN count(n) AS c").single()["c"],
                "FaultMode": session.run("MATCH (n:FaultMode) RETURN count(n) AS c").single()["c"],
            }
            print("导入完成，当前关键节点数量:")
            for key, value in counts.items():
                print(f"- {key}: {value}")
    finally:
        driver.close()


def main() -> None:
    load_environment()
    parser = argparse.ArgumentParser(description="导入数字孪生知识图谱示例数据到 Neo4j")
    parser.add_argument(
        "--data-dir",
        default=str(DEFAULT_DATA_DIR),
        help="示例数据目录，默认指向 data/graph_import",
    )
    args = parser.parse_args()
    import_graph(Path(args.data_dir).resolve())


if __name__ == "__main__":
    main()
