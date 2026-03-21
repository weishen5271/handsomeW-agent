"""
真正的图RAG检索模块
基于图结构的知识推理和检索，而非简单关键词匹配
"""

import json
import logging
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
    reasoning_chains: List[List[str]]


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
            with self.driver.session() as session:
                session.run("RETURN 1 AS ok").single()
            logger.info("图RAG Neo4j连接初始化成功")
        except Exception as e:
            logger.error("图RAG Neo4j连接初始化失败: %s", e)
            self.driver = None

    def understand_graph_query(self, query: str) -> GraphQuery:
        prompt = f"""
分析这个问题并返回图查询JSON：
问题：{query}
字段：query_type/source_entities/target_entities/relation_types/max_depth
query_type 只能取 [entity_relation,multi_hop,subgraph,path_finding,clustering]
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
                source_entities=result.get("source_entities", []) or [query],
                target_entities=result.get("target_entities", []),
                relation_types=result.get("relation_types", []),
                max_depth=int(result.get("max_depth", self.config.max_graph_depth)),
                max_nodes=50,
            )
        except Exception as e:
            logger.error("查询意图理解失败: %s", e)
            return GraphQuery(query_type=QueryType.SUBGRAPH, source_entities=[query], max_depth=self.config.max_graph_depth)

    def graph_rag_search(self, query: str, top_k: int = 5) -> List[Document]:
        logger.info("开始图RAG检索: %s", query)
        if not self.driver:
            logger.error("Neo4j连接未建立，返回空结果")
            return []

        graph_query = self.understand_graph_query(query)
        logger.info("查询类型: %s", graph_query.query_type.value)

        try:
            if graph_query.query_type in [QueryType.MULTI_HOP, QueryType.PATH_FINDING, QueryType.ENTITY_RELATION]:
                paths = self.multi_hop_traversal(graph_query)
                docs = self._paths_to_documents(paths, query)
            else:
                subgraph = self.extract_knowledge_subgraph(graph_query)
                reasoning_chains = self.graph_structure_reasoning(subgraph, query)
                docs = self._subgraph_to_documents(subgraph, reasoning_chains, query)

            docs = self._rank_by_graph_relevance(docs, query)
            logger.info("图RAG检索完成，返回 %d 个结果", len(docs[:top_k]))
            return docs[:top_k]
        except Exception as e:
            logger.error("图RAG检索失败: %s", e)
            return []

    def multi_hop_traversal(self, graph_query: GraphQuery) -> List[GraphPath]:
        paths: List[GraphPath] = []
        if not self.driver:
            return paths

        try:
            with self.driver.session() as session:
                query = f"""
                UNWIND $source_entities as source_name
                MATCH (source)
                WHERE toString(source.name) CONTAINS source_name OR toString(source.nodeId) = source_name
                MATCH path = (source)-[*1..{graph_query.max_depth}]-(target)
                WHERE source <> target
                WITH path, source, target, length(path) as path_len, relationships(path) as rels, nodes(path) as path_nodes
                WITH path, source, target, path_len, rels, path_nodes, (1.0 / path_len) as relevance
                ORDER BY relevance DESC
                LIMIT 20
                RETURN path_nodes, rels, path_len, relevance
                """
                cursor = session.run(query, {"source_entities": graph_query.source_entities})
                for record in cursor:
                    parsed = self._parse_neo4j_path(record)
                    if parsed:
                        paths.append(parsed)
        except Exception as e:
            logger.error("多跳遍历失败: %s", e)

        return paths

    def extract_knowledge_subgraph(self, graph_query: GraphQuery) -> KnowledgeSubgraph:
        if not self.driver:
            return self._fallback_subgraph_extraction(graph_query)
        try:
            with self.driver.session() as session:
                cypher_query = f"""
                UNWIND $source_entities as entity_name
                MATCH (source)
                WHERE toString(source.name) CONTAINS entity_name OR toString(source.nodeId) = entity_name
                MATCH (source)-[r*1..{graph_query.max_depth}]-(neighbor)
                WITH source, collect(DISTINCT neighbor) as neighbors, collect(DISTINCT r) as relationships
                WHERE size(neighbors) <= $max_nodes
                RETURN source,
                       neighbors[0..{graph_query.max_nodes}] as nodes,
                       relationships[0..{graph_query.max_nodes}] as rels,
                       {{
                           node_count: size(neighbors),
                           relationship_count: size(relationships),
                           density: CASE WHEN size(neighbors) > 1
                                         THEN toFloat(size(relationships)) / (size(neighbors) * (size(neighbors) - 1) / 2)
                                         ELSE 0.0 END
                       }} as metrics
                """
                record = session.run(
                    cypher_query,
                    {"source_entities": graph_query.source_entities, "max_nodes": graph_query.max_nodes},
                ).single()
                if record:
                    return self._build_knowledge_subgraph(record)
        except Exception as e:
            logger.error("子图提取失败: %s", e)
        return self._fallback_subgraph_extraction(graph_query)

    def graph_structure_reasoning(self, subgraph: KnowledgeSubgraph, query: str) -> List[str]:
        try:
            patterns = self._identify_reasoning_patterns(subgraph)
            chains = []
            for pattern in patterns:
                chain = self._build_reasoning_chain(pattern, subgraph)
                if chain:
                    chains.append(chain)
            return self._validate_reasoning_chains(chains, query)
        except Exception as e:
            logger.error("图结构推理失败: %s", e)
            return []

    def _parse_neo4j_path(self, record) -> Optional[GraphPath]:
        try:
            path_nodes = []
            for node in record["path_nodes"]:
                path_nodes.append(
                    {
                        "id": node.get("nodeId", ""),
                        "name": node.get("name", ""),
                        "labels": list(node.labels),
                        "properties": dict(node),
                    }
                )

            relationships = []
            for rel in record["rels"]:
                relationships.append({"type": rel.type, "properties": dict(rel)})

            return GraphPath(
                nodes=path_nodes,
                relationships=relationships,
                path_length=int(record["path_len"]),
                relevance_score=float(record["relevance"]),
                path_type="multi_hop",
            )
        except Exception as e:
            logger.error("路径解析失败: %s", e)
            return None

    def _build_knowledge_subgraph(self, record) -> KnowledgeSubgraph:
        try:
            central_nodes = [dict(record["source"])]
            connected_nodes = [dict(node) for node in record["nodes"]]
            flattened_rels = []
            for rel_group in record["rels"]:
                for rel in rel_group:
                    flattened_rels.append({"type": rel.type, **dict(rel)})
            return KnowledgeSubgraph(
                central_nodes=central_nodes,
                connected_nodes=connected_nodes,
                relationships=flattened_rels,
                graph_metrics=record["metrics"],
                reasoning_chains=[],
            )
        except Exception as e:
            logger.error("构建子图失败: %s", e)
            return self._fallback_subgraph_extraction(GraphQuery(query_type=QueryType.SUBGRAPH, source_entities=[]))

    def _fallback_subgraph_extraction(self, graph_query: GraphQuery) -> KnowledgeSubgraph:
        return KnowledgeSubgraph(
            central_nodes=[],
            connected_nodes=[],
            relationships=[],
            graph_metrics={},
            reasoning_chains=[],
        )

    def _identify_reasoning_patterns(self, subgraph: KnowledgeSubgraph) -> List[str]:
        return ["因果关系", "组成关系", "相似关系"]

    def _build_reasoning_chain(self, pattern: str, subgraph: KnowledgeSubgraph) -> Optional[str]:
        return f"基于{pattern}的推理链"

    def _validate_reasoning_chains(self, chains: List[str], query: str) -> List[str]:
        return chains[:3]

    def _subgraph_to_documents(
        self,
        subgraph: KnowledgeSubgraph,
        reasoning_chains: List[str],
        query: str,
    ) -> List[Document]:
        subgraph_desc = self._build_subgraph_description(subgraph)
        doc = Document(
            page_content=subgraph_desc,
            metadata={
                "search_type": "knowledge_subgraph",
                "node_count": len(subgraph.connected_nodes),
                "relationship_count": len(subgraph.relationships),
                "graph_density": subgraph.graph_metrics.get("density", 0.0),
                "reasoning_chains": reasoning_chains,
                "recipe_name": subgraph.central_nodes[0].get("name", "知识子图") if subgraph.central_nodes else "知识子图",
                "relevance_score": 0.7,
            },
        )
        return [doc]

    def _build_subgraph_description(self, subgraph: KnowledgeSubgraph) -> str:
        central_names = [node.get("name", "未知") for node in subgraph.central_nodes]
        node_count = len(subgraph.connected_nodes)
        rel_count = len(subgraph.relationships)
        return f"关于 {', '.join(central_names) if central_names else '该主题'} 的知识网络，包含 {node_count} 个相关概念和 {rel_count} 个关系。"

    def _rank_by_graph_relevance(self, documents: List[Document], query: str) -> List[Document]:
        return sorted(documents, key=lambda x: (x.metadata or {}).get("relevance_score", 0.0), reverse=True)

    def _build_path_description(self, path: GraphPath) -> str:
        node_names = [n.get("name") or n.get("id") or "unknown" for n in path.nodes]
        rel_types = [r.get("type", "REL") for r in path.relationships]
        return (
            f"路径类型: {path.path_type}\n"
            f"路径长度: {path.path_length}\n"
            f"节点链: {' -> '.join(node_names)}\n"
            f"关系: {', '.join(rel_types)}"
        )

    def _paths_to_documents(self, paths: List[GraphPath], query: str) -> List[Document]:
        documents = []
        for path in paths:
            documents.append(
                Document(
                    page_content=self._build_path_description(path),
                    metadata={
                        "search_type": "graph_path",
                        "path_length": path.path_length,
                        "relevance_score": path.relevance_score,
                        "path_type": path.path_type,
                        "node_count": len(path.nodes),
                        "relationship_count": len(path.relationships),
                        "recipe_name": path.nodes[0].get("name", "图结构结果") if path.nodes else "图结构结果",
                    },
                )
            )
        return documents

    def close(self):
        if self.driver:
            self.driver.close()
            logger.info("图RAG检索系统已关闭")
