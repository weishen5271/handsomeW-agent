"""
图 RAG 检索模块
面向数字孪生场景提供多跳遍历、关系路径和子图摘要。
"""

import json
import logging
import re
from dataclasses import dataclass
from enum import Enum
from typing import Any, Dict, List, Optional

from langchain_core.documents import Document
from neo4j import GraphDatabase

logger = logging.getLogger(__name__)


class QueryType(Enum):
    ENTITY_RELATION = "entity_relation"
    MULTI_HOP = "multi_hop"
    SUBGRAPH = "subgraph"
    PATH_FINDING = "path_finding"
    CLUSTERING = "clustering"
    FAULT_DIAGNOSIS = "fault_diagnosis"
    IMPACT_ANALYSIS = "impact_analysis"
    MAINTENANCE_QUERY = "maintenance_query"
    ALARM_CAUSE = "alarm_cause_analysis"
    SPARE_PART_QUERY = "spare_part_query"
    DOCUMENT_SEARCH = "document_search"


@dataclass
class GraphQuery:
    query_type: QueryType
    source_entities: List[str]
    target_entities: List[str] | None = None
    relation_types: List[str] | None = None
    max_depth: int = 2
    max_nodes: int = 50
    constraints: Dict[str, Any] | None = None


@dataclass
class GraphPath:
    nodes: List[Dict[str, Any]]
    relationships: List[Dict[str, Any]]
    path_length: int
    relevance_score: float
    path_type: str


@dataclass
class KnowledgeSubgraph:
    central_nodes: List[Dict[str, Any]]
    connected_nodes: List[Dict[str, Any]]
    relationships: List[Dict[str, Any]]
    graph_metrics: Dict[str, float]
    reasoning_chains: List[str]


class GraphRAGRetrieval:
    def __init__(self, config, llm_client):
        self.config = config
        self.llm_client = llm_client
        self.driver = None

    def initialize(self):
        try:
            self.driver = GraphDatabase.driver(
                self.config.neo4j_uri,
                auth=(self.config.neo4j_user, self.config.neo4j_password),
            )
            with self.driver.session(database=self.config.neo4j_database) as session:
                session.run("RETURN 1 AS ok").single()
            logger.info("图 RAG Neo4j 连接初始化成功")
        except Exception as exc:
            logger.error("图 RAG Neo4j 连接初始化失败: %s", exc)
            self.driver = None

    def understand_graph_query(self, query: str) -> GraphQuery:
        prompt = f"""
请把下面工业设备问题转成图查询 JSON：
- query_type: 只能是 entity_relation/multi_hop/subgraph/path_finding/clustering/fault_diagnosis/impact_analysis/maintenance_query/alarm_cause_analysis/spare_part_query/document_search
- source_entities: 核心设备/传感器/产线/故障
- target_entities: 若问题中明确提到目标实体则填写
- relation_types: 若有关系偏好，可从 CONTAINS/LOCATED_AT/DEPENDS_ON/EXHIBITS/CAUSES/REQUIRES/USES/AFFECTS/HAS_DOC 中选择
- max_depth: 1-4

问题：{query}
"""
        try:
            response = self.llm_client.invoke_blocking(
                messages=[{"role": "user", "content": prompt}],
                temperature=self.config.graph_query_temperature,
                max_tokens=self.config.graph_query_max_tokens,
            )
            content = (response.content or "").strip()
            if content.startswith("```"):
                content = content.strip("`")
                if content.startswith("json"):
                    content = content[4:].strip()
            result = json.loads(content)
            return GraphQuery(
                query_type=QueryType(result.get("query_type", "subgraph")),
                source_entities=result.get("source_entities", []) or self._extract_entities_fallback(query),
                target_entities=result.get("target_entities", []),
                relation_types=result.get("relation_types", []),
                max_depth=max(1, min(int(result.get("max_depth", self.config.max_graph_depth)), 4)),
                max_nodes=50,
                constraints=result.get("constraints", {}),
            )
        except Exception as exc:
            logger.error("查询意图理解失败: %s", exc)
            return self._fallback_graph_query(query)

    def _fallback_graph_query(self, query: str) -> GraphQuery:
        normalized = query.lower()
        query_type = QueryType.SUBGRAPH
        relation_types: List[str] | None = None
        if any(token in normalized for token in ["故障", "异常", "振动", "过载", "温度", "压力", "根因", "原因"]):
            query_type = QueryType.FAULT_DIAGNOSIS
            relation_types = ["EXHIBITS", "AFFECTS", "CAUSES", "DEPENDS_ON"]
        elif any(token in normalized for token in ["影响", "上游", "下游", "依赖", "传导", "波及"]):
            query_type = QueryType.IMPACT_ANALYSIS
            relation_types = ["DEPENDS_ON", "AFFECTS", "CONTAINS"]
        elif any(token in normalized for token in ["告警", "报警"]):
            query_type = QueryType.ALARM_CAUSE
            relation_types = ["CAUSES", "EXHIBITS", "AFFECTS"]
        elif any(token in normalized for token in ["备件", "更换", "耗材"]):
            query_type = QueryType.SPARE_PART_QUERY
            relation_types = ["USES", "REQUIRES"]
        elif any(token in normalized for token in ["维护", "保养", "维修", "检修", "点检"]):
            query_type = QueryType.MAINTENANCE_QUERY
            relation_types = ["REQUIRES", "DEPENDS_ON"]
        elif any(token in normalized for token in ["手册", "文档", "指南", "说明书"]):
            query_type = QueryType.DOCUMENT_SEARCH
            relation_types = ["HAS_DOC"]
        elif any(token in normalized for token in ["哪些设备", "关联", "关系", "在哪条产线"]):
            query_type = QueryType.ENTITY_RELATION
            relation_types = ["LOCATED_AT", "CONTAINS", "BELONGS_TO", "HAS"]
        elif any(token in normalized for token in ["路径", "链路"]):
            query_type = QueryType.PATH_FINDING
        elif any(token in normalized for token in ["原因", "根因"]):
            query_type = QueryType.MULTI_HOP
        return GraphQuery(
            query_type=query_type,
            source_entities=self._extract_entities_fallback(query),
            relation_types=relation_types,
            max_depth=self.config.max_graph_depth,
        )

    def _extract_entities_fallback(self, query: str) -> List[str]:
        parts = re.findall(r"[A-Za-z0-9\-_]+|[\u4e00-\u9fff]{2,}", query)
        return [part for part in parts[:3]] or [query]

    def graph_rag_search(self, query: str, top_k: int = 5) -> List[Document]:
        logger.info("开始图 RAG 检索: %s", query)
        if not self.driver:
            return []

        graph_query = self.understand_graph_query(query)
        try:
            if graph_query.query_type in {
                QueryType.MULTI_HOP,
                QueryType.PATH_FINDING,
                QueryType.ENTITY_RELATION,
                QueryType.FAULT_DIAGNOSIS,
                QueryType.IMPACT_ANALYSIS,
                QueryType.ALARM_CAUSE,
            }:
                docs = self._paths_to_documents(self.multi_hop_traversal(graph_query))
            else:
                subgraph = self.extract_knowledge_subgraph(graph_query)
                docs = self._subgraph_to_documents(subgraph, graph_query.query_type)
            docs = self._rank_by_graph_relevance(docs)
            return docs[:top_k]
        except Exception as exc:
            logger.error("图 RAG 检索失败: %s", exc)
            return []

    def multi_hop_traversal(self, graph_query: GraphQuery) -> List[GraphPath]:
        if not self.driver:
            return []
        paths: List[GraphPath] = []
        try:
            with self.driver.session(database=self.config.neo4j_database) as session:
                relation_filter = ""
                params = {
                    "source_entities": graph_query.source_entities,
                    "max_depth": graph_query.max_depth,
                    "limit": max(10, self.config.top_k * 4),
                }
                if graph_query.relation_types:
                    relation_filter = "AND ALL(rel IN relationships(path) WHERE type(rel) IN $relation_types)"
                    params["relation_types"] = graph_query.relation_types
                cursor = session.run(
                    f"""
                    UNWIND $source_entities AS source_name
                    MATCH (source)
                    WHERE toLower(coalesce(source.name, '')) CONTAINS toLower(source_name)
                       OR toLower(coalesce(source.nodeId, source.id, '')) = toLower(source_name)
                    MATCH path = (source)-[*1..{graph_query.max_depth}]-(target)
                    WHERE source <> target
                    {relation_filter}
                    RETURN nodes(path) AS path_nodes,
                           relationships(path) AS rels,
                           length(path) AS path_len
                    LIMIT $limit
                    """,
                    params,
                )
                for record in cursor:
                    parsed = self._parse_neo4j_path(record, graph_query.query_type)
                    if parsed:
                        paths.append(parsed)
        except Exception as exc:
            logger.error("多跳遍历失败: %s", exc)
        return paths

    def extract_knowledge_subgraph(self, graph_query: GraphQuery) -> KnowledgeSubgraph:
        if not self.driver:
            return self._empty_subgraph()
        try:
            with self.driver.session(database=self.config.neo4j_database) as session:
                record = session.run(
                    f"""
                    UNWIND $source_entities AS entity_name
                    MATCH (source)
                    WHERE toLower(coalesce(source.name, '')) CONTAINS toLower(entity_name)
                       OR toLower(coalesce(source.nodeId, source.id, '')) = toLower(entity_name)
                    MATCH path = (source)-[*1..{graph_query.max_depth}]-(neighbor)
                    WITH source,
                         collect(DISTINCT neighbor)[0..{graph_query.max_nodes}] AS nodes,
                         collect(path)[0..20] AS paths
                    RETURN source, nodes, paths
                    LIMIT 1
                    """,
                    {"source_entities": graph_query.source_entities},
                ).single()
                if not record:
                    return self._empty_subgraph()
                central_node = self._node_to_dict(record["source"])
                connected_nodes = [self._node_to_dict(node) for node in record.get("nodes", [])]
                relationships = []
                for path in record.get("paths", []):
                    if path is None:
                        continue
                    for rel in path.relationships:
                        relationships.append({"type": rel.type, **dict(rel)})
                density = 0.0
                node_count = len(connected_nodes)
                rel_count = len(relationships)
                if node_count > 1:
                    density = float(rel_count) / max((node_count * (node_count - 1)) / 2, 1)
                return KnowledgeSubgraph(
                    central_nodes=[central_node],
                    connected_nodes=connected_nodes,
                    relationships=relationships,
                    graph_metrics={
                        "node_count": node_count,
                        "relationship_count": rel_count,
                        "density": density,
                    },
                    reasoning_chains=self._derive_reasoning_chains(central_node, connected_nodes, relationships),
                )
        except Exception as exc:
            logger.error("子图提取失败: %s", exc)
            return self._empty_subgraph()

    def _empty_subgraph(self) -> KnowledgeSubgraph:
        return KnowledgeSubgraph([], [], [], {}, [])

    def _derive_reasoning_chains(
        self,
        central_node: Dict[str, Any],
        connected_nodes: List[Dict[str, Any]],
        relationships: List[Dict[str, Any]],
    ) -> List[str]:
        central_name = central_node.get("name", "该实体")
        chains: List[str] = []
        rel_types = [item.get("type", "RELATED_TO") for item in relationships]
        if "EXHIBITS" in rel_types:
            chains.append(f"{central_name} 与故障模式存在直接表现关系，可用于故障诊断和根因排查。")
        if "DEPENDS_ON" in rel_types:
            chains.append(f"{central_name} 与上下游设备存在依赖关系，故障可能沿依赖链传播。")
        if "CAUSES" in rel_types:
            chains.append(f"{central_name} 相关故障与告警存在因果链，可用于告警归因。")
        if "HAS_DOC" in rel_types:
            chains.append(f"{central_name} 已关联文档，可进一步结合操作手册或维护指南回答。")
        if "REQUIRES" in rel_types:
            chains.append(f"{central_name} 已关联维护记录或维护要求，可用于保养周期和维修历史查询。")
        if "USES" in rel_types:
            chains.append(f"{central_name} 已关联备件信息，可用于更换件和耗材排查。")
        if not chains and connected_nodes:
            chains.append(f"{central_name} 周边已提取 {len(connected_nodes)} 个关联实体，可作为关系网络上下文。")
        return chains[:3]

    def _parse_neo4j_path(self, record, query_type: QueryType) -> Optional[GraphPath]:
        try:
            nodes = [self._node_to_dict(node) for node in record["path_nodes"]]
            relationships = [{"type": rel.type, **dict(rel)} for rel in record["rels"]]
            path_length = int(record["path_len"])
            relevance = 1.0 / max(path_length, 1)
            return GraphPath(
                nodes=nodes,
                relationships=relationships,
                path_length=path_length,
                relevance_score=relevance,
                path_type=query_type.value,
            )
        except Exception as exc:
            logger.error("路径解析失败: %s", exc)
            return None

    def _node_to_dict(self, node) -> Dict[str, Any]:
        return {
            "id": node.get("nodeId", node.get("id", "")),
            "name": node.get("name", node.get("nodeId", node.get("id", ""))),
            "labels": list(node.labels),
            "properties": dict(node),
        }

    def _subgraph_to_documents(self, subgraph: KnowledgeSubgraph, query_type: QueryType) -> List[Document]:
        central_name = subgraph.central_nodes[0].get("name", "知识子图") if subgraph.central_nodes else "知识子图"
        connected_names = [node.get("name", "未知") for node in subgraph.connected_nodes[:10]]
        relation_types = [item.get("type", "RELATED_TO") for item in subgraph.relationships[:10]]
        content_parts = [
            f"核心对象: {central_name}",
            f"相关实体数: {len(subgraph.connected_nodes)}",
            f"关系数: {len(subgraph.relationships)}",
        ]
        if connected_names:
            content_parts.append(f"相关实体: {', '.join(connected_names)}")
        if relation_types:
            content_parts.append(f"关系类型: {', '.join(relation_types)}")
        for chain in subgraph.reasoning_chains:
            content_parts.append(f"推理链: {chain}")
        return [
            Document(
                page_content="\n".join(content_parts),
                metadata={
                    "search_type": "knowledge_subgraph",
                    "entity_name": central_name,
                    "query_type": query_type.value,
                    "node_count": len(subgraph.connected_nodes),
                    "relationship_count": len(subgraph.relationships),
                    "graph_density": subgraph.graph_metrics.get("density", 0.0),
                    "reasoning_chains": subgraph.reasoning_chains,
                    "relevance_score": 0.78,
                },
            )
        ]

    def _build_path_description(self, path: GraphPath) -> str:
        node_names = [item.get("name") or item.get("id") or "unknown" for item in path.nodes]
        rel_types = [item.get("type", "REL") for item in path.relationships]
        return (
            f"路径类型: {path.path_type}\n"
            f"路径长度: {path.path_length}\n"
            f"节点链: {' -> '.join(node_names)}\n"
            f"关系链: {' -> '.join(rel_types)}"
        )

    def _paths_to_documents(self, paths: List[GraphPath]) -> List[Document]:
        documents: List[Document] = []
        for path in paths:
            first_name = path.nodes[0].get("name", "图结构结果") if path.nodes else "图结构结果"
            documents.append(
                Document(
                    page_content=self._build_path_description(path),
                    metadata={
                        "search_type": "graph_path",
                        "entity_name": first_name,
                        "query_type": path.path_type,
                        "path_length": path.path_length,
                        "relevance_score": path.relevance_score,
                        "path_type": path.path_type,
                    },
                )
            )
        return documents

    def _rank_by_graph_relevance(self, documents: List[Document]) -> List[Document]:
        return sorted(documents, key=lambda item: (item.metadata or {}).get("relevance_score", 0.0), reverse=True)

    def close(self):
        if self.driver:
            self.driver.close()
            logger.info("图 RAG Neo4j 连接已关闭")
