import asyncio
import logging
import re
from dataclasses import dataclass
from typing import Any

from core.llm import MyAgentsLLM

try:
    from graph_rag import get_graph_rag_runtime
except ModuleNotFoundError:
    from backend.graph_rag import get_graph_rag_runtime

logger = logging.getLogger(__name__)


@dataclass
class RAGContextResult:
    context_text: str
    metadata: dict[str, Any]


class GraphRAGBridge:
    """Agent 与本地迁移 GraphRAG 运行时的桥接层。"""

    def __init__(self, llm_client: MyAgentsLLM | None = None):
        self.runtime = get_graph_rag_runtime()
        self.llm_client = llm_client
        self.config = self.runtime.config
        self.runtime.set_default_llm_client(llm_client)

    @property
    def is_ready(self) -> bool:
        try:
            self.runtime.ensure_ready(llm_client=self.llm_client)
            return True
        except Exception as e:
            logger.error("GraphRAG runtime query failed: %s", e)
            return False

    def build_context(self, query: str, llm_client: MyAgentsLLM | None = None) -> RAGContextResult:
        return asyncio.get_event_loop().run_until_complete(
            self.build_context_async(query, llm_client)
        )

    async def build_context_async(
        self,
        query: str,
        llm_client: MyAgentsLLM | None = None,
    ) -> RAGContextResult:
        """Async version of build_context for non-blocking RAG retrieval."""
        if not query.strip():
            return RAGContextResult(context_text="", metadata={"enabled": False, "reason": "empty_query"})

        try:
            # 在线程池中执行同步的 query 调用，避免阻塞事件循环
            loop = asyncio.get_event_loop()
            result = await loop.run_in_executor(
                None,
                lambda: self.runtime.query(query, llm_client=llm_client),
            )
            docs = result.documents
            analysis = result.analysis
            context_text = self._format_context(docs)

            strategy = None
            confidence = None
            query_complexity = None
            relationship_intensity = None
            reasoning = None
            if analysis is not None:
                strategy = getattr(getattr(analysis, "recommended_strategy", None), "value", None)
                confidence = getattr(analysis, "confidence", None)
                query_complexity = getattr(analysis, "query_complexity", None)
                relationship_intensity = getattr(analysis, "relationship_intensity", None)
                reasoning = getattr(analysis, "reasoning", None)

            sources = []
            for idx, doc in enumerate(docs or []):
                meta = getattr(doc, "metadata", {}) or {}
                sources.append(
                    {
                        "rank": idx + 1,
                        "entity_name": meta.get("entity_name") or meta.get("equipment_name"),
                        "node_id": meta.get("node_id"),
                        "node_type": meta.get("node_type"),
                        "route_strategy": meta.get("route_strategy"),
                        "search_type": meta.get("search_type"),
                        "retrieval_level": meta.get("retrieval_level"),
                        "score": meta.get("final_score", meta.get("relevance_score", meta.get("score"))),
                    }
                )

            return RAGContextResult(
                context_text=context_text,
                metadata={
                    "enabled": True,
                    "retrieval_backend": "graph_db_vector_db",
                    "strategy": strategy,
                    "confidence": confidence,
                    "query_complexity": query_complexity,
                    "relationship_intensity": relationship_intensity,
                    "reasoning": reasoning,
                    "source_count": len(sources),
                    "sources": sources,
                },
            )
        except Exception as exc:
            logger.error("GraphRAG runtime query failed: %s", exc)
            return RAGContextResult(
                context_text="",
                metadata={
                    "enabled": False,
                    "retrieval_backend": "graph_db_vector_db",
                    "reason": "runtime_error",
                    "error": f"{type(exc).__name__}: {exc}",
                    "sources": [],
                },
            )

    def _format_context(
        self,
        documents: list[Any],
        max_context_chars: int | None = None,
        top_k: int | None = None,
        max_chars_per_doc: int | None = None,
    ) -> str:
        if not documents:
            return ""

        # 从配置获取默认值
        config = self.config
        max_chars = max_context_chars or (config.max_context_chars if config else None) or 2600
        k = top_k or (config.top_k if config else None) or 6
        max_per_doc = max_chars_per_doc or (config.max_chars_per_doc if config else None) or 380

        parts = [
            "以下是从本地迁移的 GraphRAG 实时检索得到的证据（Neo4j + Milvus），请优先依据这些信息回答："
        ]
        current_len = len(parts[0])

        for idx, doc in enumerate(documents[:k], start=1):
            content = getattr(doc, "page_content", "") or ""
            content = re.sub(r"\s+", " ", content).strip()[:max_per_doc]
            meta = getattr(doc, "metadata", {}) or {}
            entity_name = meta.get("entity_name") or meta.get("equipment_name") or meta.get("node_id") or "未知实体"
            retrieval_level = meta.get("retrieval_level", meta.get("search_type", "unknown"))
            line = f"{idx}. [{entity_name}] ({retrieval_level}) {content}"
            if current_len + len(line) > max_chars:
                break
            parts.append(line)
            current_len += len(line)

        parts.append("如果检索证据不足，请明确说明不确定性，不要编造。")
        return "\n".join(parts)
