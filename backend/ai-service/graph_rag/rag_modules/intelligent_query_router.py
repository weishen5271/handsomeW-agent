"""
智能查询路由器
根据查询特点自动选择最适合的检索策略：
- 传统混合检索：适合简单的信息查找
- 图RAG检索：适合复杂的关系推理和知识发现
"""

import json
import logging
import re
from dataclasses import dataclass
from enum import Enum
from typing import Any, List, Tuple

from langchain_core.documents import Document

logger = logging.getLogger(__name__)


def _load_json_from_text(content: str) -> dict[str, Any]:
    text = (content or "").strip()
    if not text:
        raise ValueError("empty llm response")
    fenced = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", text, re.IGNORECASE)
    if fenced:
        text = fenced.group(1).strip()
    start = text.find("{")
    end = text.rfind("}")
    if start != -1 and end != -1 and end >= start:
        text = text[start:end + 1]
    return json.loads(text)


class SearchStrategy(Enum):
    HYBRID_TRADITIONAL = "hybrid_traditional"
    GRAPH_RAG = "graph_rag"
    COMBINED = "combined"


@dataclass
class QueryAnalysis:
    query_complexity: float
    relationship_intensity: float
    reasoning_required: bool
    entity_count: int
    recommended_strategy: SearchStrategy
    confidence: float
    reasoning: str


class IntelligentQueryRouter:
    def __init__(self, traditional_retrieval, graph_rag_retrieval, llm_client, config):
        self.traditional_retrieval = traditional_retrieval
        self.graph_rag_retrieval = graph_rag_retrieval
        self.llm_client = llm_client
        self.config = config

        self.route_stats = {
            "traditional_count": 0,
            "graph_rag_count": 0,
            "combined_count": 0,
            "total_queries": 0,
        }

    def analyze_query(self, query: str) -> QueryAnalysis:
        logger.info("分析查询特征: %s", query)
        analysis_prompt = f"""
作为RAG系统查询分析器，请分析查询并返回JSON：
查询：{query}

返回字段：
- query_complexity: 0-1
- relationship_intensity: 0-1
- reasoning_required: bool
- entity_count: int
- recommended_strategy: one of [hybrid_traditional, graph_rag, combined]
- confidence: 0-1
- reasoning: string
"""
        try:
            response = self.llm_client.invoke_blocking(
                messages=[{"role": "user", "content": analysis_prompt}],
                temperature=self.config.query_analysis_temperature,
                max_tokens=self.config.query_analysis_max_tokens,
            )
            content = (response.content or "").strip()
            result = _load_json_from_text(content)
            analysis = QueryAnalysis(
                query_complexity=float(result.get("query_complexity", 0.5)),
                relationship_intensity=float(result.get("relationship_intensity", 0.5)),
                reasoning_required=bool(result.get("reasoning_required", False)),
                entity_count=int(result.get("entity_count", 1)),
                recommended_strategy=SearchStrategy(result.get("recommended_strategy", "hybrid_traditional")),
                confidence=float(result.get("confidence", 0.5)),
                reasoning=str(result.get("reasoning", "默认分析")),
            )
            logger.info(
                "查询分析完成: %s (置信度: %.2f)",
                analysis.recommended_strategy.value,
                analysis.confidence,
            )
            return analysis
        except Exception as e:
            logger.error("查询分析失败: %s", e)
            return self._rule_based_analysis(query)

    def _rule_based_analysis(self, query: str) -> QueryAnalysis:
        complexity_keywords = [
            "为什么", "如何", "原因", "分析", "影响", "比较", "区别", "诊断", "排查", "解决",
        ]
        relation_keywords = [
            "依赖", "连接", "关联", "上游", "下游", "影响", "传导", "路径", "关系", "联动",
        ]
        fault_keywords = ["故障", "异常", "报警", "告警", "损坏", "失效", "振动", "温度过高", "压力异常"]
        maintenance_keywords = ["保养", "维护", "维修", "检修", "点检", "更换", "巡检"]
        document_keywords = ["手册", "文档", "指南", "说明书", "SOP", "规程"]
        status_keywords = ["状态", "健康", "健康度", "参数", "运行情况", "多少", "是什么", "在哪"]

        complexity = sum(1 for kw in complexity_keywords if kw in query) / len(complexity_keywords)
        relation_intensity = sum(1 for kw in relation_keywords if kw in query) / len(relation_keywords)
        entity_tokens = re.findall(r"[A-Za-z0-9\-_]+|[\u4e00-\u9fff]{2,}", query)
        entity_count = max(1, len(entity_tokens))

        if any(kw in query for kw in fault_keywords):
            return QueryAnalysis(
                query_complexity=max(complexity, 0.8),
                relationship_intensity=max(relation_intensity, 0.7),
                reasoning_required=True,
                entity_count=entity_count,
                recommended_strategy=SearchStrategy.GRAPH_RAG,
                confidence=0.82,
                reasoning="检测到故障/告警/异常关键词，优先使用图检索进行根因与关系分析。",
            )

        if any(kw in query for kw in ["影响", "下游", "上游", "传导", "依赖"]):
            return QueryAnalysis(
                query_complexity=max(complexity, 0.7),
                relationship_intensity=max(relation_intensity, 0.9),
                reasoning_required=True,
                entity_count=entity_count,
                recommended_strategy=SearchStrategy.GRAPH_RAG,
                confidence=0.86,
                reasoning="检测到影响范围或依赖链问题，需要多跳遍历，优先图检索。",
            )

        if any(kw in query for kw in maintenance_keywords):
            return QueryAnalysis(
                query_complexity=max(complexity, 0.35),
                relationship_intensity=max(relation_intensity, 0.3),
                reasoning_required=False,
                entity_count=entity_count,
                recommended_strategy=SearchStrategy.HYBRID_TRADITIONAL,
                confidence=0.76,
                reasoning="维护查询以事实检索为主，优先走混合检索。",
            )

        if any(kw in query for kw in document_keywords):
            return QueryAnalysis(
                query_complexity=max(complexity, 0.4),
                relationship_intensity=max(relation_intensity, 0.25),
                reasoning_required=False,
                entity_count=entity_count,
                recommended_strategy=SearchStrategy.HYBRID_TRADITIONAL,
                confidence=0.78,
                reasoning="文档/手册查询更适合向量与实体混合检索。",
            )

        if any(kw in query for kw in status_keywords):
            return QueryAnalysis(
                query_complexity=max(complexity, 0.3),
                relationship_intensity=max(relation_intensity, 0.25),
                reasoning_required=False,
                entity_count=entity_count,
                recommended_strategy=SearchStrategy.HYBRID_TRADITIONAL,
                confidence=0.72,
                reasoning="状态与基础属性查询以实体事实检索为主。",
            )

        if complexity > 0.45 and relation_intensity > 0.3:
            strategy = SearchStrategy.COMBINED
            reasoning = "问题兼具推理和关系链路，使用组合检索。"
        elif complexity > 0.3 or relation_intensity > 0.3:
            strategy = SearchStrategy.GRAPH_RAG
            reasoning = "关系/推理信号明显，优先图检索。"
        else:
            strategy = SearchStrategy.COMBINED
            reasoning = "默认使用组合检索，兼顾实体事实与图关系。"

        return QueryAnalysis(
            query_complexity=complexity,
            relationship_intensity=relation_intensity,
            reasoning_required=complexity > 0.3,
            entity_count=entity_count,
            recommended_strategy=strategy,
            confidence=0.6,
            reasoning=reasoning,
        )

    def route_query(self, query: str, top_k: int = 5) -> Tuple[List[Document], QueryAnalysis]:
        logger.info("开始路由查询: %s", query)
        analysis = self.analyze_query(query)
        self._update_route_statistics(analysis.recommended_strategy)

        try:
            if analysis.recommended_strategy == SearchStrategy.HYBRID_TRADITIONAL:
                logger.info("使用传统检索")
                documents = self.traditional_retrieval.hybrid_search(query, top_k)
            elif analysis.recommended_strategy == SearchStrategy.GRAPH_RAG:
                logger.info("使用图检索")
                documents = self.graph_rag_retrieval.graph_rag_search(query, top_k)
            else:
                logger.info("使用组合检索")
                documents = self._combined_search(query, top_k)

            documents = self._post_process_results(documents, analysis)
            logger.info("路由完成，返回 %d 个结果", len(documents))
            return documents, analysis
        except Exception as e:
            logger.error("查询路由失败: %s", e)
            documents = self.traditional_retrieval.hybrid_search(query, top_k)
            return self._post_process_results(documents, analysis), analysis

    def _update_route_statistics(self, strategy: SearchStrategy) -> None:
        self.route_stats["total_queries"] += 1
        if strategy == SearchStrategy.HYBRID_TRADITIONAL:
            self.route_stats["traditional_count"] += 1
        elif strategy == SearchStrategy.GRAPH_RAG:
            self.route_stats["graph_rag_count"] += 1
        elif strategy == SearchStrategy.COMBINED:
            self.route_stats["combined_count"] += 1

    def _post_process_results(self, documents: List[Document], analysis: QueryAnalysis) -> List[Document]:
        for doc in documents:
            doc.metadata = doc.metadata or {}
            doc.metadata.update(
                {
                    "route_strategy": analysis.recommended_strategy.value,
                    "query_complexity": analysis.query_complexity,
                    "route_confidence": analysis.confidence,
                }
            )
        return documents

    def _combined_search(self, query: str, top_k: int) -> List[Document]:
        traditional_k = max(1, top_k // 2)
        graph_k = max(1, top_k - traditional_k)

        traditional_docs = self.traditional_retrieval.hybrid_search(query, traditional_k)
        graph_docs = self.graph_rag_retrieval.graph_rag_search(query, graph_k)

        merged: List[Document] = []
        seen = set()
        for doc in traditional_docs + graph_docs:
            key = (doc.metadata or {}).get("node_id") or hash(doc.page_content)
            if key in seen:
                continue
            seen.add(key)
            merged.append(doc)
            if len(merged) >= top_k:
                break
        return merged

    def get_route_statistics(self) -> dict[str, Any]:
        total = max(self.route_stats["total_queries"], 1)
        return {
            **self.route_stats,
            "traditional_ratio": self.route_stats["traditional_count"] / total,
            "graph_rag_ratio": self.route_stats["graph_rag_count"] / total,
            "combined_ratio": self.route_stats["combined_count"] / total,
        }

    def explain_routing_decision(self, query: str) -> str:
        analysis = self._rule_based_analysis(query)
        return (
            f"[路由解释] strategy={analysis.recommended_strategy.value}, "
            f"complexity={analysis.query_complexity:.2f}, "
            f"relation={analysis.relationship_intensity:.2f}, reason={analysis.reasoning}"
        )
