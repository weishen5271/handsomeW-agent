"""图数据准备模块。"""

import logging
from dataclasses import dataclass
from typing import Any, Dict, List

from langchain_core.documents import Document
from neo4j import GraphDatabase

logger = logging.getLogger(__name__)


@dataclass
class GraphNode:
    node_id: str
    labels: List[str]
    name: str
    properties: Dict[str, Any]


class GraphDataPreparationModule:
    """从 Neo4j 读取工业设备图谱并转换为文档。"""

    def __init__(self, uri: str, user: str, password: str, database: str):
        self.uri = uri
        self.user = user
        self.password = password
        self.database = database
        self.driver = None
        self.documents: List[Document] = []
        self.chunks: List[Document] = []
        self.equipments: List[GraphNode] = []
        self.sensors: List[GraphNode] = []
        self.production_lines: List[GraphNode] = []
        self.fault_modes: List[GraphNode] = []
        self._connect()

    def _connect(self) -> None:
        try:
            self.driver = GraphDatabase.driver(self.uri, auth=(self.user, self.password))
            with self.driver.session(database=self.database) as session:
                session.run("RETURN 1 AS test").single()
            logger.info("已连接到 Neo4j: %s", self.uri)
        except Exception as exc:
            logger.error("连接到图数据库失败: %s", exc)
            raise

    def close(self) -> None:
        if self.driver:
            self.driver.close()
            logger.info("Neo4j 连接已关闭")

    def load_graph_data(self) -> Dict[str, int]:
        logger.info("正在从图数据库加载数字孪生图谱数据")
        self.equipments = self._load_nodes(
            """
            MATCH (n)
            WHERE n:Equipment OR n:Asset
            RETURN coalesce(n.nodeId, n.id) AS nodeId,
                   labels(n) AS labels,
                   coalesce(n.name, coalesce(n.nodeId, n.id)) AS name,
                   properties(n) AS properties
            ORDER BY name
            """
        )
        self.sensors = self._load_nodes(
            """
            MATCH (n:Sensor)
            RETURN coalesce(n.nodeId, n.id) AS nodeId,
                   labels(n) AS labels,
                   coalesce(n.name, coalesce(n.nodeId, n.id)) AS name,
                   properties(n) AS properties
            ORDER BY name
            """
        )
        self.production_lines = self._load_nodes(
            """
            MATCH (n:ProductionLine)
            RETURN coalesce(n.nodeId, n.id) AS nodeId,
                   labels(n) AS labels,
                   coalesce(n.name, coalesce(n.nodeId, n.id)) AS name,
                   properties(n) AS properties
            ORDER BY name
            """
        )
        self.fault_modes = self._load_nodes(
            """
            MATCH (n:FaultMode)
            RETURN coalesce(n.nodeId, n.id) AS nodeId,
                   labels(n) AS labels,
                   coalesce(n.name, coalesce(n.nodeId, n.id)) AS name,
                   properties(n) AS properties
            ORDER BY name
            """
        )
        stats = {
            "equipments": len(self.equipments),
            "sensors": len(self.sensors),
            "production_lines": len(self.production_lines),
            "fault_modes": len(self.fault_modes),
        }
        logger.info("图谱数据加载完成: %s", stats)
        return stats

    def _load_nodes(self, query: str) -> List[GraphNode]:
        nodes: List[GraphNode] = []
        with self.driver.session(database=self.database) as session:
            for record in session.run(query):
                node_id = record.get("nodeId")
                if not node_id:
                    continue
                nodes.append(
                    GraphNode(
                        node_id=str(node_id),
                        labels=list(record.get("labels") or []),
                        name=str(record.get("name") or node_id),
                        properties=dict(record.get("properties") or {}),
                    )
                )
        return nodes

    def build_equipment_documents(self) -> List[Document]:
        logger.info("正在构建设备知识文档")
        documents: List[Document] = []
        with self.driver.session(database=self.database) as session:
            for equipment in self.equipments:
                if "Sensor" in equipment.labels:
                    continue
                try:
                    documents.append(self._build_single_equipment_document(session, equipment))
                except Exception as exc:
                    logger.warning("构建设备文档失败 %s (%s): %s", equipment.name, equipment.node_id, exc)
        self.documents = documents
        logger.info("成功构建 %d 个设备文档", len(documents))
        return documents

    def build_recipe_documents(self) -> List[Document]:
        """兼容旧调用。"""
        return self.build_equipment_documents()

    def _build_single_equipment_document(self, session, equipment: GraphNode) -> Document:
        node_id = equipment.node_id
        name = equipment.name
        profile = session.run(
            """
            MATCH (e)
            WHERE (e:Equipment OR e:Asset) AND coalesce(e.nodeId, e.id) = $node_id
            OPTIONAL MATCH (e)-[:LOCATED_AT]->(pl:ProductionLine)
            OPTIONAL MATCH (pl:ProductionLine)-[:HAS]->(e)
            OPTIONAL MATCH (e)-[:CONTAINS]->(s:Sensor)
            OPTIONAL MATCH (s:Sensor)-[:BELONGS_TO]->(e)
            OPTIONAL MATCH (e)-[:EXHIBITS]->(f:FaultMode)
            OPTIONAL MATCH (f:FaultMode)-[:AFFECTS]->(e)
            OPTIONAL MATCH (e)-[:USES]->(sp:SparePart)
            OPTIONAL MATCH (e)-[:HAS_DOC]->(d:Document)
            OPTIONAL MATCH (e)-[:DEPENDS_ON]->(dep)
            OPTIONAL MATCH (upstream)-[:DEPENDS_ON]->(e)
            OPTIONAL MATCH (e)-[:REQUIRES]->(mr:MaintenanceRecord)
            OPTIONAL MATCH (e)-[:CAUSES]->(a:Alarm)
            RETURN e AS equipment,
                   coalesce(head(collect(DISTINCT pl.name)), e.location, '未知产线') AS production_line,
                   [x IN collect(DISTINCT s) WHERE x IS NOT NULL | {id: coalesce(x.nodeId, x.id), name: x.name, type: x.type, status: x.status}] AS sensors,
                   [x IN collect(DISTINCT f) WHERE x IS NOT NULL | {id: coalesce(x.nodeId, x.id), name: x.name, symptoms: x.symptoms, root_causes: x.root_causes, solutions: x.solutions}] AS fault_modes,
                   [x IN collect(DISTINCT sp) WHERE x IS NOT NULL | {id: coalesce(x.nodeId, x.id), name: x.name, type: x.type}] AS spare_parts,
                   [x IN collect(DISTINCT d) WHERE x IS NOT NULL | {id: coalesce(x.nodeId, x.id), title: coalesce(x.title, x.name), path: coalesce(x.path, x.url, x.location)}] AS documents,
                   [x IN collect(DISTINCT dep) WHERE x IS NOT NULL | {id: coalesce(x.nodeId, x.id), name: x.name}] AS downstream_dependencies,
                   [x IN collect(DISTINCT upstream) WHERE x IS NOT NULL | {id: coalesce(x.nodeId, x.id), name: x.name}] AS upstream_dependencies,
                   [x IN collect(DISTINCT mr) WHERE x IS NOT NULL | {id: coalesce(x.nodeId, x.id), name: x.name, type: x.maintenance_type, date: coalesce(x.maintenance_date, x.date)}] AS maintenance_records,
                   [x IN collect(DISTINCT a) WHERE x IS NOT NULL | {id: coalesce(x.nodeId, x.id), name: x.name, severity: x.severity}] AS alarms
            """,
            {"node_id": node_id},
        )
        profile = next(iter(profile), None)

        equipment_props = dict(profile["equipment"]) if profile and profile.get("equipment") else dict(equipment.properties)
        production_line = profile.get("production_line") if profile else equipment_props.get("location", "未知产线")
        sensors = profile.get("sensors") or []
        fault_modes = profile.get("fault_modes") or []
        spare_parts = profile.get("spare_parts") or []
        doc_links = profile.get("documents") or []
        downstream_dependencies = profile.get("downstream_dependencies") or []
        upstream_dependencies = profile.get("upstream_dependencies") or []
        maintenance_records = profile.get("maintenance_records") or []
        alarms = profile.get("alarms") or []

        status = equipment_props.get("status", "Unknown")
        health = equipment_props.get("health")
        equipment_type = equipment_props.get("type", "未知设备类型")
        location = equipment_props.get("location") or production_line or "未知位置"

        content_parts = [f"# {name}", "", "## 基本信息"]
        content_parts.append(f"设备编号: {node_id}")
        content_parts.append(f"设备类型: {equipment_type}")
        content_parts.append(f"位置: {location}")
        content_parts.append(f"所属产线: {production_line}")
        content_parts.append(f"当前状态: {status}")
        if health is not None:
            content_parts.append(f"健康度: {health}%")
        if equipment_props.get("model_file"):
            content_parts.append(f"三维模型: {equipment_props['model_file']}")
        if equipment_props.get("description"):
            content_parts.extend(["", "## 描述", str(equipment_props["description"])])

        if sensors:
            content_parts.extend(["", "## 传感器"])
            for sensor in sensors:
                details = [sensor.get("name") or sensor.get("id") or "未知传感器"]
                if sensor.get("type"):
                    details.append(f"类型: {sensor['type']}")
                if sensor.get("status"):
                    details.append(f"状态: {sensor['status']}")
                content_parts.append(f"- {' | '.join(details)}")

        if fault_modes:
            content_parts.extend(["", "## 故障模式"])
            for fault in fault_modes:
                line = [fault.get("name") or fault.get("id") or "未知故障"]
                if fault.get("symptoms"):
                    line.append(f"症状: {fault['symptoms']}")
                if fault.get("root_causes"):
                    line.append(f"根因: {fault['root_causes']}")
                if fault.get("solutions"):
                    line.append(f"建议处理: {fault['solutions']}")
                content_parts.append(f"- {' | '.join(line)}")

        if spare_parts:
            content_parts.extend(["", "## 备件"])
            for part in spare_parts:
                details = [part.get("name") or part.get("id") or "未知备件"]
                if part.get("type"):
                    details.append(f"类型: {part['type']}")
                content_parts.append(f"- {' | '.join(details)}")

        if maintenance_records:
            content_parts.extend(["", "## 维护记录"])
            for record in maintenance_records:
                details = [record.get("name") or record.get("type") or record.get("id") or "未知维护记录"]
                if record.get("type"):
                    details.append(f"维护类型: {record['type']}")
                if record.get("date"):
                    details.append(f"时间: {record['date']}")
                content_parts.append(f"- {' | '.join(details)}")

        if alarms:
            content_parts.extend(["", "## 相关告警"])
            for alarm in alarms:
                details = [alarm.get("name") or alarm.get("id") or "未知告警"]
                if alarm.get("severity"):
                    details.append(f"严重级别: {alarm['severity']}")
                content_parts.append(f"- {' | '.join(details)}")

        if upstream_dependencies or downstream_dependencies:
            content_parts.extend(["", "## 依赖关系"])
            for dep in upstream_dependencies:
                content_parts.append(f"- 上游依赖: {dep.get('name') or dep.get('id')}")
            for dep in downstream_dependencies:
                content_parts.append(f"- 下游依赖: {dep.get('name') or dep.get('id')}")

        if doc_links:
            content_parts.extend(["", "## 相关文档"])
            for item in doc_links:
                content_parts.append(f"- {item.get('title') or item.get('id')}: {item.get('path') or '未登记路径'}")

        metadata = {
            "node_id": node_id,
            "entity_name": name,
            "equipment_name": name,
            "node_type": "Equipment" if "Equipment" in equipment.labels else equipment.labels[0] if equipment.labels else "Asset",
            "equipment_type": equipment_type,
            "status": status,
            "health": health if health is not None else -1,
            "location": location,
            "production_line": production_line,
            "doc_type": "equipment_profile",
            "sensor_names": [item.get("name") for item in sensors if item.get("name")],
            "fault_modes": [item.get("name") for item in fault_modes if item.get("name")],
            "spare_parts": [item.get("name") for item in spare_parts if item.get("name")],
            "document_titles": [item.get("title") for item in doc_links if item.get("title")],
            "keywords": [name, node_id, equipment_type, status, location, production_line],
            "relations": self._build_relation_metadata(
                production_line=production_line,
                sensors=sensors,
                fault_modes=fault_modes,
                spare_parts=spare_parts,
                documents=doc_links,
                upstream_dependencies=upstream_dependencies,
                downstream_dependencies=downstream_dependencies,
                maintenance_records=maintenance_records,
                alarms=alarms,
            ),
            "content_length": 0,
        }
        content = "\n".join(content_parts)
        metadata["content_length"] = len(content)
        return Document(page_content=content, metadata=metadata)

    def _build_relation_metadata(
        self,
        *,
        production_line: str,
        sensors: List[Dict[str, Any]],
        fault_modes: List[Dict[str, Any]],
        spare_parts: List[Dict[str, Any]],
        documents: List[Dict[str, Any]],
        upstream_dependencies: List[Dict[str, Any]],
        downstream_dependencies: List[Dict[str, Any]],
        maintenance_records: List[Dict[str, Any]],
        alarms: List[Dict[str, Any]],
    ) -> List[Dict[str, Any]]:
        relations: List[Dict[str, Any]] = []
        if production_line:
            relations.append({"type": "LOCATED_AT", "target_name": production_line})
        for item in sensors:
            relations.append({"type": "CONTAINS", "target_id": item.get("id"), "target_name": item.get("name")})
        for item in fault_modes:
            relations.append({"type": "EXHIBITS", "target_id": item.get("id"), "target_name": item.get("name")})
        for item in spare_parts:
            relations.append({"type": "USES", "target_id": item.get("id"), "target_name": item.get("name")})
        for item in documents:
            relations.append({"type": "HAS_DOC", "target_id": item.get("id"), "target_name": item.get("title")})
        for item in maintenance_records:
            relations.append({"type": "REQUIRES", "target_id": item.get("id"), "target_name": item.get("name")})
        for item in alarms:
            relations.append({"type": "CAUSES", "target_id": item.get("id"), "target_name": item.get("name")})
        for item in upstream_dependencies:
            relations.append({"type": "DEPENDS_ON_BY", "target_id": item.get("id"), "target_name": item.get("name")})
        for item in downstream_dependencies:
            relations.append({"type": "DEPENDS_ON", "target_id": item.get("id"), "target_name": item.get("name")})
        return relations

    def chunk_documents(self, chunk_size: int = 500, chunk_overlap: int = 50) -> List[Document]:
        logger.info("正在进行文档分块，块大小: %d, 重叠: %d", chunk_size, chunk_overlap)
        if not self.documents:
            raise ValueError("请先构建文档")

        chunks: List[Document] = []
        chunk_id = 0
        for doc in self.documents:
            content = doc.page_content
            if len(content) <= chunk_size:
                chunks.append(
                    Document(
                        page_content=content,
                        metadata={
                            **doc.metadata,
                            "chunk_id": f"{doc.metadata['node_id']}_chunk_{chunk_id}",
                            "parent_id": doc.metadata["node_id"],
                            "chunk_index": 0,
                            "total_chunks": 1,
                            "chunk_size": len(content),
                            "doc_type": "chunk",
                        },
                    )
                )
                chunk_id += 1
                continue

            start = 0
            parts: List[str] = []
            while start < len(content):
                end = min(start + chunk_size, len(content))
                parts.append(content[start:end])
                if end >= len(content):
                    break
                start = max(end - chunk_overlap, start + 1)

            total_chunks = len(parts)
            for idx, part in enumerate(parts):
                chunks.append(
                    Document(
                        page_content=part,
                        metadata={
                            **doc.metadata,
                            "chunk_id": f"{doc.metadata['node_id']}_chunk_{chunk_id}",
                            "parent_id": doc.metadata["node_id"],
                            "chunk_index": idx,
                            "total_chunks": total_chunks,
                            "chunk_size": len(part),
                            "doc_type": "chunk",
                        },
                    )
                )
                chunk_id += 1

        self.chunks = chunks
        logger.info("文档分块完成，共生成 %d 个块", len(chunks))
        return chunks

    def get_statistics(self) -> Dict[str, Any]:
        stats = {
            "total_equipments": len(self.equipments),
            "total_sensors": len(self.sensors),
            "total_production_lines": len(self.production_lines),
            "total_fault_modes": len(self.fault_modes),
            "total_documents": len(self.documents),
            "total_chunks": len(self.chunks),
        }
        if self.documents:
            stats["avg_content_length"] = sum(doc.metadata.get("content_length", 0) for doc in self.documents) / len(
                self.documents
            )
        if self.chunks:
            stats["avg_chunk_size"] = sum(chunk.metadata.get("chunk_size", 0) for chunk in self.chunks) / len(
                self.chunks
            )
        return stats

    def __del__(self):
        self.close()
