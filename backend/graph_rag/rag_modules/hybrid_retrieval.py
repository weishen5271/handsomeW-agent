"""
混合检索模块
基于实体级索引、图关系补充和向量检索的工业设备知识检索。
"""

import json
import logging
import re
from dataclasses import dataclass
from typing import Any, Dict, List, Tuple

from langchain_community.retrievers import BM25Retriever
from langchain_core.documents import Document
from neo4j import GraphDatabase

from .graph_indexing import GraphIndexingModule
from .milvus_index_construction import MilvusIndexConstructionModule

logger = logging.getLogger(__name__)


def _normalize(text: str) -> str:
    return re.sub(r"\s+", " ", (text or "").strip()).lower()


@dataclass
class RetrievalResult:
    content: str
    node_id: str
    node_type: str
    relevance_score: float
    retrieval_level: str
    metadata: Dict[str, Any]


class HybridRetrievalModule:
    def __init__(self, config, milvus_module: MilvusIndexConstructionModule, data_module, llm_client):
        self.config = config
        self.milvus_module = milvus_module
        self.data_module = data_module
        self.llm_client = llm_client
        self.driver = None
        self.bm25_retriever = None
        self.graph_indexing = GraphIndexingModule(config, llm_client)

    def initialize(self, chunks: List[Document]):
        logger.info("初始化混合检索模块")
        self.driver = GraphDatabase.driver(
            self.config.neo4j_uri,
            auth=(self.config.neo4j_user, self.config.neo4j_password),
        )
        if chunks:
            self.bm25_retriever = BM25Retriever.from_documents(chunks)
            self.graph_indexing.build_from_documents(chunks)
            logger.info("BM25 与图索引初始化完成，文档数量: %d", len(chunks))

    def extract_query_keywords(self, query: str) -> Tuple[List[str], List[str]]:
        prompt = f"""
你是工业设备知识检索助手。请分析用户问题并只返回 JSON：
{{
  "entity_keywords": ["设备/产线/传感器/故障/备件名称"],
  "topic_keywords": ["主题词，如健康状态、根因、告警、维护、操作手册"]
}}

用户问题：{query}
"""
        try:
            response = self.llm_client.invoke_blocking(
                messages=[{"role": "user", "content": prompt}],
                temperature=self.config.keyword_extraction_temperature,
                max_tokens=self.config.keyword_extraction_max_tokens,
            )
            content = (response.content or "").strip()
            if content.startswith("```"):
                content = content.strip("`")
                if content.startswith("json"):
                    content = content[4:].strip()
            result = json.loads(content)
            entity_keywords = [str(item).strip() for item in result.get("entity_keywords", []) if str(item).strip()]
            topic_keywords = [str(item).strip() for item in result.get("topic_keywords", []) if str(item).strip()]
            if entity_keywords or topic_keywords:
                return entity_keywords, topic_keywords
        except Exception as exc:
            logger.error("关键词提取失败: %s", exc)

        tokens = [part for part in re.findall(r"[A-Za-z0-9\-_]+|[\u4e00-\u9fff]{2,}", query) if part.strip()]
        entity_keywords = tokens[:3]
        topic_keywords = tokens[3:6] if len(tokens) > 3 else tokens[:3]
        return entity_keywords, topic_keywords

    def entity_level_retrieval(self, entity_keywords: List[str], top_k: int = 5) -> List[RetrievalResult]:
        results: List[RetrievalResult] = []
        for keyword in entity_keywords:
            for entity in self.graph_indexing.get_entities_by_key(keyword):
                neighbors = self._get_node_neighbors(entity.metadata.get("node_id", ""), max_neighbors=3)
                enhanced_content = entity.value_content
                if neighbors:
                    enhanced_content += f"\n相关实体: {', '.join(neighbors)}"
                results.append(
                    RetrievalResult(
                        content=enhanced_content,
                        node_id=entity.metadata.get("node_id", ""),
                        node_type=entity.entity_type,
                        relevance_score=0.92,
                        retrieval_level="entity",
                        metadata={
                            "entity_name": entity.entity_name,
                            "matched_keyword": keyword,
                            "index_keys": entity.index_keys,
                            **entity.metadata,
                        },
                    )
                )

        if len(results) < top_k:
            results.extend(self._neo4j_entity_level_search(entity_keywords, top_k - len(results)))
        results.sort(key=lambda item: item.relevance_score, reverse=True)
        return results[:top_k]

    def _neo4j_entity_level_search(self, keywords: List[str], limit: int) -> List[RetrievalResult]:
        if not self.driver or limit <= 0:
            return []
        results: List[RetrievalResult] = []
        try:
            with self.driver.session(database=self.config.neo4j_database) as session:
                cursor = session.run(
                    """
                    UNWIND $keywords AS keyword
                    MATCH (e)
                    WHERE (e:Equipment OR e:Asset OR e:Sensor OR e:ProductionLine OR e:FaultMode)
                      AND (
                          toLower(coalesce(e.name, '')) CONTAINS toLower(keyword)
                          OR toLower(coalesce(e.nodeId, e.id, '')) CONTAINS toLower(keyword)
                          OR toLower(coalesce(e.type, '')) CONTAINS toLower(keyword)
                          OR toLower(coalesce(e.location, '')) CONTAINS toLower(keyword)
                      )
                    RETURN DISTINCT coalesce(e.nodeId, e.id) AS node_id,
                           coalesce(e.name, coalesce(e.nodeId, e.id)) AS name,
                           coalesce(e.type, '') AS equipment_type,
                           coalesce(e.status, '') AS status,
                           coalesce(e.location, '') AS location,
                           labels(e) AS labels
                    LIMIT $limit
                    """,
                    {"keywords": keywords, "limit": limit},
                )
                for record in cursor:
                    node_type = (record.get("labels") or ["Entity"])[0]
                    content_parts = [f"实体: {record.get('name', '未知')}"]
                    if record.get("equipment_type"):
                        content_parts.append(f"类型: {record['equipment_type']}")
                    if record.get("status"):
                        content_parts.append(f"状态: {record['status']}")
                    if record.get("location"):
                        content_parts.append(f"位置: {record['location']}")
                    results.append(
                        RetrievalResult(
                            content="\n".join(content_parts),
                            node_id=record.get("node_id", ""),
                            node_type=node_type,
                            relevance_score=0.76,
                            retrieval_level="entity",
                            metadata={
                                "entity_name": record.get("name", ""),
                                "equipment_type": record.get("equipment_type", ""),
                                "status": record.get("status", ""),
                                "location": record.get("location", ""),
                                "source": "neo4j_fallback",
                            },
                        )
                    )
        except Exception as exc:
            logger.error("Neo4j 实体级补充检索失败: %s", exc)
        return results

    def topic_level_retrieval(self, topic_keywords: List[str], top_k: int = 5) -> List[RetrievalResult]:
        results: List[RetrievalResult] = []
        for keyword in topic_keywords:
            for relation in self.graph_indexing.get_relations_by_key(keyword):
                source_entity = self.graph_indexing.entity_kv_store.get(relation.source_entity)
                if not source_entity:
                    continue
                content_parts = [
                    f"主题: {keyword}",
                    relation.value_content,
                    f"相关实体: {source_entity.entity_name}",
                ]
                if relation.metadata.get("target_name"):
                    content_parts.append(f"目标对象: {relation.metadata['target_name']}")
                results.append(
                    RetrievalResult(
                        content="\n".join(content_parts),
                        node_id=source_entity.metadata.get("node_id", ""),
                        node_type=source_entity.entity_type,
                        relevance_score=0.88,
                        retrieval_level="topic",
                        metadata={
                            "entity_name": source_entity.entity_name,
                            "relation_type": relation.relation_type,
                            "target_name": relation.metadata.get("target_name"),
                            "matched_keyword": keyword,
                            "source": "graph_relation_index",
                        },
                    )
                )

        if len(results) < top_k:
            results.extend(self._neo4j_topic_level_search(topic_keywords, top_k - len(results)))
        results.sort(key=lambda item: item.relevance_score, reverse=True)
        return results[:top_k]

    def _neo4j_topic_level_search(self, keywords: List[str], limit: int) -> List[RetrievalResult]:
        if not self.driver or limit <= 0:
            return []

        results: List[RetrievalResult] = []
        try:
            with self.driver.session(database=self.config.neo4j_database) as session:
                cursor = session.run(
                    """
                    UNWIND $keywords AS keyword
                    MATCH (e)
                    WHERE e:Equipment OR e:Asset
                    OPTIONAL MATCH (e)-[:LOCATED_AT]->(pl:ProductionLine)
                    OPTIONAL MATCH (e)-[:EXHIBITS]->(f:FaultMode)
                    WHERE toLower(coalesce(e.status, '')) CONTAINS toLower(keyword)
                       OR toLower(coalesce(e.type, '')) CONTAINS toLower(keyword)
                       OR toLower(coalesce(pl.name, '')) CONTAINS toLower(keyword)
                       OR toLower(coalesce(f.name, '')) CONTAINS toLower(keyword)
                    RETURN DISTINCT coalesce(e.nodeId, e.id) AS node_id,
                           coalesce(e.name, coalesce(e.nodeId, e.id)) AS name,
                           coalesce(e.type, '') AS equipment_type,
                           coalesce(e.status, '') AS status,
                           coalesce(pl.name, e.location, '') AS production_line,
                           collect(DISTINCT f.name)[0..3] AS fault_modes
                    LIMIT $limit
                    """,
                    {"keywords": keywords, "limit": limit},
                )
                for record in cursor:
                    content_parts = [f"设备: {record.get('name', '未知')}"]
                    if record.get("equipment_type"):
                        content_parts.append(f"类型: {record['equipment_type']}")
                    if record.get("status"):
                        content_parts.append(f"状态: {record['status']}")
                    if record.get("production_line"):
                        content_parts.append(f"产线: {record['production_line']}")
                    if record.get("fault_modes"):
                        content_parts.append(f"相关故障: {', '.join(record['fault_modes'])}")
                    results.append(
                        RetrievalResult(
                            content="\n".join(content_parts),
                            node_id=record.get("node_id", ""),
                            node_type="Equipment",
                            relevance_score=0.72,
                            retrieval_level="topic",
                            metadata={
                                "entity_name": record.get("name", ""),
                                "equipment_type": record.get("equipment_type", ""),
                                "status": record.get("status", ""),
                                "production_line": record.get("production_line", ""),
                                "source": "neo4j_topic_fallback",
                            },
                        )
                    )
        except Exception as exc:
            logger.error("Neo4j 主题级检索失败: %s", exc)
        return results

    def dual_level_retrieval(self, query: str, top_k: int = 5) -> List[Document]:
        entity_keywords, topic_keywords = self.extract_query_keywords(query)
        entity_results = self.entity_level_retrieval(entity_keywords, top_k)
        topic_results = self.topic_level_retrieval(topic_keywords, top_k)

        unique_results: List[RetrievalResult] = []
        seen_nodes = set()
        for result in sorted(entity_results + topic_results, key=lambda item: item.relevance_score, reverse=True):
            if result.node_id in seen_nodes:
                continue
            seen_nodes.add(result.node_id)
            unique_results.append(result)

        docs: List[Document] = []
        for result in unique_results[:top_k]:
            docs.append(
                Document(
                    page_content=result.content,
                    metadata={
                        "node_id": result.node_id,
                        "node_type": result.node_type,
                        "entity_name": result.metadata.get("entity_name", "未知实体"),
                        "retrieval_level": result.retrieval_level,
                        "relevance_score": result.relevance_score,
                        "search_type": "dual_level",
                        **result.metadata,
                    },
                )
            )
        return docs

    def vector_search_enhanced(self, query: str, top_k: int = 5) -> List[Document]:
        try:
            vector_docs = self.milvus_module.similarity_search(query, k=top_k * 2)
            enhanced_docs: List[Document] = []
            for result in vector_docs:
                content = result.get("text", "")
                metadata = dict(result.get("metadata", {}))
                node_id = metadata.get("node_id")
                if node_id:
                    neighbors = self._get_node_neighbors(node_id)
                    if neighbors:
                        content += f"\n相关实体: {', '.join(neighbors[:3])}"
                entity_name = metadata.get("entity_name") or metadata.get("equipment_name") or "未知设备"
                enhanced_docs.append(
                    Document(
                        page_content=content,
                        metadata={
                            **metadata,
                            "entity_name": entity_name,
                            "score": result.get("score", 0.0),
                            "search_type": "vector_enhanced",
                        },
                    )
                )
            return enhanced_docs
        except Exception as exc:
            logger.error("增强向量检索失败: %s", exc)
            return []

    def hybrid_search(self, query: str, top_k: int = 5) -> List[Document]:
        logger.info("开始混合检索: %s", query)
        dual_docs = self.dual_level_retrieval(query, top_k)
        vector_docs = self.vector_search_enhanced(query, top_k)

        merged_docs: List[Document] = []
        seen_doc_ids = set()
        max_len = max(len(dual_docs), len(vector_docs)) if (dual_docs or vector_docs) else 0
        for idx in range(max_len):
            if idx < len(dual_docs):
                self._append_doc(merged_docs, seen_doc_ids, dual_docs[idx], "dual_level")
            if idx < len(vector_docs):
                self._append_doc(merged_docs, seen_doc_ids, vector_docs[idx], "vector_enhanced")
        return merged_docs[:top_k]

    def _append_doc(self, merged_docs: List[Document], seen_doc_ids: set, doc: Document, method: str) -> None:
        doc_id = (doc.metadata or {}).get("node_id") or hash(doc.page_content)
        if doc_id in seen_doc_ids:
            return
        seen_doc_ids.add(doc_id)
        doc.metadata = doc.metadata or {}
        doc.metadata["search_method"] = method
        doc.metadata["round_robin_order"] = len(merged_docs)
        if method == "vector_enhanced":
            raw_score = float(doc.metadata.get("score", 0.0))
            doc.metadata["final_score"] = raw_score
        else:
            doc.metadata["final_score"] = float(doc.metadata.get("relevance_score", 0.0))
        merged_docs.append(doc)

    def _get_node_neighbors(self, node_id: str, max_neighbors: int = 3) -> List[str]:
        if not self.driver or not node_id:
            return []
        try:
            with self.driver.session(database=self.config.neo4j_database) as session:
                cursor = session.run(
                    """
                    MATCH (n)-[r]-(neighbor)
                    WHERE coalesce(n.nodeId, n.id) = $node_id
                    RETURN DISTINCT coalesce(neighbor.name, coalesce(neighbor.nodeId, neighbor.id)) AS name
                    LIMIT $limit
                    """,
                    {"node_id": node_id, "limit": max_neighbors},
                )
                return [record.get("name") for record in cursor if record.get("name")]
        except Exception as exc:
            logger.error("获取邻居节点失败: %s", exc)
            return []

    def close(self):
        if self.driver:
            self.driver.close()
            logger.info("Neo4j 连接已关闭")
