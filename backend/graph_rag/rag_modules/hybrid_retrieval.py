"""
混合检索模块
基于双层检索范式：实体级 + 主题级检索
结合图结构检索和向量检索，使用Round-robin轮询策略
"""

import json
import logging
from dataclasses import dataclass
from typing import Any, Dict, List, Tuple

from langchain_community.retrievers import BM25Retriever
from langchain_core.documents import Document
from neo4j import GraphDatabase

from .graph_indexing import GraphIndexingModule
from .milvus_index_construction import MilvusIndexConstructionModule

logger = logging.getLogger(__name__)


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
        logger.info("初始化混合检索模块...")
        self.driver = GraphDatabase.driver(
            self.config.neo4j_uri,
            auth=(self.config.neo4j_user, self.config.neo4j_password),
        )
        if chunks:
            self.bm25_retriever = BM25Retriever.from_documents(chunks)
            logger.info("BM25检索器初始化完成，文档数量: %d", len(chunks))

    def extract_query_keywords(self, query: str) -> Tuple[List[str], List[str]]:
        prompt = f"""
分析查询并返回JSON：
查询：{query}
返回格式：
{{
  "entity_keywords": ["实体关键词"],
  "topic_keywords": ["主题关键词"]
}}
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
            entity_keywords = result.get("entity_keywords", [])
            topic_keywords = result.get("topic_keywords", [])
            logger.info("关键词提取完成 - 实体级:%s,主题级:%s", entity_keywords, topic_keywords)
            return entity_keywords, topic_keywords
        except Exception as e:
            logger.error("关键词提取失败: %s", e)
            words = [w for w in query.split() if w.strip()]
            return words[:3], words[3:6] if len(words) > 3 else words[:3]

    def entity_level_retrieval(self, entity_keywords: List[str], top_k: int = 5) -> List[RetrievalResult]:
        results: List[RetrievalResult] = []

        # graph-index (if available)
        for keyword in entity_keywords:
            entities = self.graph_indexing.get_entities_by_key(keyword)
            for entity in entities:
                neighbors = self._get_node_neighbors(entity.metadata.get("node_id", ""), max_neighbors=2)
                enhanced_content = entity.value_content
                if neighbors:
                    enhanced_content += f"\n相关信息: {', '.join(neighbors)}"
                results.append(
                    RetrievalResult(
                        content=enhanced_content,
                        node_id=entity.metadata.get("node_id", ""),
                        node_type=entity.entity_type,
                        relevance_score=0.9,
                        retrieval_level="entity",
                        metadata={
                            "entity_name": entity.entity_name,
                            "entity_type": entity.entity_type,
                            "index_keys": entity.index_keys,
                            "matched_keyword": keyword,
                        },
                    )
                )

        if len(results) < top_k:
            results.extend(self._neo4j_entity_level_search(entity_keywords, top_k - len(results)))

        results.sort(key=lambda x: x.relevance_score, reverse=True)
        logger.info("实体级检索完成，返回 %d 个结果", len(results))
        return results[:top_k]

    def _neo4j_entity_level_search(self, keywords: List[str], limit: int) -> List[RetrievalResult]:
        results: List[RetrievalResult] = []
        if not self.driver or limit <= 0:
            return results
        try:
            with self.driver.session() as session:
                cypher_query = """
                UNWIND $keywords as keyword
                CALL db.index.fulltext.queryNodes('recipe_fulltext_index', keyword + '*')
                YIELD node, score
                WHERE node:Recipe
                RETURN node.nodeId as node_id,
                       node.name as name,
                       node.description as description,
                       labels(node) as labels,
                       score
                ORDER BY score DESC
                LIMIT $limit
                """
                cursor = session.run(cypher_query, {"keywords": keywords, "limit": limit})
                for record in cursor:
                    content_parts = []
                    if record.get("name"):
                        content_parts.append(f"菜品: {record['name']}")
                    if record.get("description"):
                        content_parts.append(f"描述: {record['description']}")
                    results.append(
                        RetrievalResult(
                            content="\n".join(content_parts),
                            node_id=record.get("node_id", ""),
                            node_type="Recipe",
                            relevance_score=float(record.get("score", 0.0)) * 0.7,
                            retrieval_level="entity",
                            metadata={
                                "name": record.get("name", ""),
                                "labels": record.get("labels", []),
                                "source": "neo4j_fallback",
                            },
                        )
                    )
        except Exception as e:
            logger.error("Neo4j补充检索失败: %s", e)
        return results

    def topic_level_retrieval(self, topic_keywords: List[str], top_k: int = 5) -> List[RetrievalResult]:
        results: List[RetrievalResult] = []

        for keyword in topic_keywords:
            relations = self.graph_indexing.get_relations_by_key(keyword)
            for relation in relations:
                source_entity = self.graph_indexing.entity_kv_store.get(relation.source_entity)
                target_entity = self.graph_indexing.entity_kv_store.get(relation.target_entity)
                if not source_entity or not target_entity:
                    continue
                content_parts = [
                    f"主题:{keyword}",
                    relation.value_content,
                    f"相关菜品: {source_entity.entity_name}",
                    f"相关信息: {target_entity.entity_name}",
                ]
                if source_entity.entity_type == "Recipe":
                    first_line = source_entity.value_content.split("\n")[0]
                    content_parts.append(f"菜品详情: {first_line}")
                results.append(
                    RetrievalResult(
                        content="\n".join(content_parts),
                        node_id=relation.source_entity,
                        node_type=source_entity.entity_type,
                        relevance_score=0.95,
                        retrieval_level="topic",
                        metadata={
                            "relation_id": relation.relation_id,
                            "relation_type": relation.relation_type,
                            "source_name": source_entity.entity_name,
                            "target_name": target_entity.entity_name,
                            "matched_keyword": keyword,
                            "index_keys": relation.index_keys,
                        },
                    )
                )

        for keyword in topic_keywords:
            entities = self.graph_indexing.get_entities_by_key(keyword)
            for entity in entities:
                if entity.entity_type != "Recipe":
                    continue
                results.append(
                    RetrievalResult(
                        content=f"主题分类: {keyword}\n{entity.value_content}",
                        node_id=entity.metadata.get("node_id", ""),
                        node_type=entity.entity_type,
                        relevance_score=0.85,
                        retrieval_level="topic",
                        metadata={
                            "entity_name": entity.entity_name,
                            "entity_type": entity.entity_type,
                            "matched_keyword": keyword,
                            "source": "category_match",
                        },
                    )
                )

        if len(results) < top_k:
            results.extend(self._neo4j_topic_level_search(topic_keywords, top_k - len(results)))

        results.sort(key=lambda x: x.relevance_score, reverse=True)
        logger.info("主题级检索完成，返回 %d 个结果", len(results))
        return results[:top_k]

    def _neo4j_topic_level_search(self, keywords: List[str], limit: int) -> List[RetrievalResult]:
        out: List[RetrievalResult] = []
        if not self.driver or limit <= 0:
            return out

        try:
            with self.driver.session() as session:
                cypher_query = """
                UNWIND $keywords as keyword
                MATCH (r:Recipe)
                WHERE toString(r.category) CONTAINS keyword
                   OR toString(r.cuisineType) CONTAINS keyword
                   OR toString(r.tags) CONTAINS keyword
                OPTIONAL MATCH (r)-[:REQUIRES]->(i:Ingredient)
                WITH r, keyword, collect(i.name)[0..3] as ingredients
                RETURN r.nodeId as node_id,
                       r.name as name,
                       r.category as category,
                       r.cuisineType as cuisine_type,
                       r.difficulty as difficulty,
                       ingredients,
                       keyword as matched_keyword
                ORDER BY r.name
                LIMIT $limit
                """
                cursor = session.run(cypher_query, {"keywords": keywords, "limit": limit})
                for record in cursor:
                    content_parts = [f"菜品: {record.get('name', '未知')}"]
                    if record.get("category"):
                        content_parts.append(f"分类: {record['category']}")
                    if record.get("cuisine_type"):
                        content_parts.append(f"菜系: {record['cuisine_type']}")
                    if record.get("difficulty") is not None:
                        content_parts.append(f"难度: {record['difficulty']}")
                    if record.get("ingredients"):
                        ingredients_str = ", ".join(record["ingredients"][:3])
                        content_parts.append(f"主要食材: {ingredients_str}")

                    out.append(
                        RetrievalResult(
                            content="\n".join(content_parts),
                            node_id=record.get("node_id", ""),
                            node_type="Recipe",
                            relevance_score=0.75,
                            retrieval_level="topic",
                            metadata={
                                "name": record.get("name", ""),
                                "category": record.get("category", ""),
                                "cuisine_type": record.get("cuisine_type", ""),
                                "difficulty": record.get("difficulty", 0),
                                "matched_keyword": record.get("matched_keyword", ""),
                                "source": "neo4j_fallback",
                            },
                        )
                    )
        except Exception as e:
            logger.error("Neo4j主题级检索失败: %s", e)

        return out

    def dual_level_retrieval(self, query: str, top_k: int = 5) -> List[Document]:
        logger.info("开始双层检索: %s", query)
        entity_keywords, topic_keywords = self.extract_query_keywords(query)
        entity_results = self.entity_level_retrieval(entity_keywords, top_k)
        topic_results = self.topic_level_retrieval(topic_keywords, top_k)

        all_results = entity_results + topic_results
        seen_nodes = set()
        unique_results = []
        for result in sorted(all_results, key=lambda x: x.relevance_score, reverse=True):
            if result.node_id in seen_nodes:
                continue
            seen_nodes.add(result.node_id)
            unique_results.append(result)

        docs: List[Document] = []
        for result in unique_results[:top_k]:
            recipe_name = result.metadata.get("name") or result.metadata.get("entity_name", "未知菜品")
            docs.append(
                Document(
                    page_content=result.content,
                    metadata={
                        "node_id": result.node_id,
                        "node_type": result.node_type,
                        "retrieval_level": result.retrieval_level,
                        "relevance_score": result.relevance_score,
                        "recipe_name": recipe_name,
                        "search_type": "dual_level",
                        **result.metadata,
                    },
                )
            )

        logger.info("双层检索完成，返回 %d 个文档", len(docs))
        return docs

    def vector_search_enhanced(self, query: str, top_k: int = 5) -> List[Document]:
        try:
            vector_docs = self.milvus_module.similarity_search(query, k=top_k * 2)
            enhanced_docs: List[Document] = []
            for result in vector_docs:
                content = result.get("text", "")
                metadata = result.get("metadata", {})
                node_id = metadata.get("node_id")
                if node_id:
                    neighbors = self._get_node_neighbors(node_id)
                    if neighbors:
                        content += f"\n相关信息:{', '.join(neighbors[:3])}"

                recipe_name = metadata.get("recipe_name", "未知菜品")
                vector_score = result.get("score", 0.0)
                enhanced_docs.append(
                    Document(
                        page_content=content,
                        metadata={
                            **metadata,
                            "recipe_name": recipe_name,
                            "score": vector_score,
                            "search_type": "vector_enhanced",
                        },
                    )
                )
            return enhanced_docs
        except Exception as e:
            logger.error("增强向量检索失败: %s", e)
            return []

    def hybrid_search(self, query: str, top_k: int = 5) -> List[Document]:
        logger.info("开始混合检索: %s", query)
        dual_docs = self.dual_level_retrieval(query, top_k)
        vector_docs = self.vector_search_enhanced(query, top_k)

        merged_docs: List[Document] = []
        seen_doc_ids = set()
        max_len = max(len(dual_docs), len(vector_docs)) if (dual_docs or vector_docs) else 0
        origin_len = len(dual_docs) + len(vector_docs)

        for i in range(max_len):
            if i < len(dual_docs):
                doc = dual_docs[i]
                doc_id = (doc.metadata or {}).get("node_id") or hash(doc.page_content)
                if doc_id not in seen_doc_ids:
                    seen_doc_ids.add(doc_id)
                    doc.metadata["search_method"] = "dual_level"
                    doc.metadata["round_robin_order"] = len(merged_docs)
                    doc.metadata["final_score"] = doc.metadata.get("relevance_score", 0.0)
                    merged_docs.append(doc)

            if i < len(vector_docs):
                doc = vector_docs[i]
                doc_id = (doc.metadata or {}).get("node_id") or hash(doc.page_content)
                if doc_id not in seen_doc_ids:
                    seen_doc_ids.add(doc_id)
                    doc.metadata["search_method"] = "vector_enhanced"
                    doc.metadata["round_robin_order"] = len(merged_docs)
                    vector_score = doc.metadata.get("score", 0.0)
                    similarity_score = max(0.0, 1.0 - vector_score) if vector_score <= 1.0 else 0.0
                    doc.metadata["final_score"] = similarity_score
                    merged_docs.append(doc)

        final_docs = merged_docs[:top_k]
        logger.info("Round-robin合并：从总共%d个结果合并为%d个文档", origin_len, len(final_docs))
        logger.info("混合检索完成，返回 %d 个文档", len(final_docs))
        return final_docs

    def _get_node_neighbors(self, node_id: str, max_neighbors: int = 3) -> List[str]:
        if not self.driver or not node_id:
            return []
        try:
            with self.driver.session() as session:
                query = """
                MATCH (n {nodeId: $node_id})-[r]-(neighbor)
                RETURN neighbor.name as name
                LIMIT $limit
                """
                cursor = session.run(query, {"node_id": node_id, "limit": max_neighbors})
                return [record.get("name") for record in cursor if record.get("name")]
        except Exception as e:
            logger.error("获取邻居节点失败: %s", e)
            return []

    def close(self):
        if self.driver:
            self.driver.close()
            logger.info("Neo4j连接已关闭")
