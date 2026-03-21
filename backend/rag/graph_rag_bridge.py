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

    def __init__(self):
        self.runtime = get_graph_rag_runtime()

    @property
    def is_ready(self) -> bool:
        try:
            self.runtime.ensure_ready()
            return True
        except Exception:
            return False

    def build_context(self, query: str, llm_client: MyAgentsLLM | None = None) -> RAGContextResult:
        if not query.strip():
            return RAGContextResult(context_text="", metadata={"enabled": False, "reason": "empty_query"})

        try:
            result = self.runtime.query(query, llm_client=llm_client)
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
                        "recipe_name": meta.get("recipe_name"),
                        "node_id": meta.get("node_id"),
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

    def _format_context(self, documents: list[Any], max_context_chars: int = 2600, top_k: int = 6) -> str:
        if not documents:
            return ""

        parts = [
            "以下是从本地迁移的 GraphRAG 实时检索得到的证据（Neo4j + Milvus），请优先依据这些信息回答："
        ]
        current_len = len(parts[0])

        for idx, doc in enumerate(documents[:top_k], start=1):
            content = getattr(doc, "page_content", "") or ""
            content = re.sub(r"\s+", " ", content).strip()[:380]
            meta = getattr(doc, "metadata", {}) or {}
            recipe_name = meta.get("recipe_name", "未知")
            retrieval_level = meta.get("retrieval_level", meta.get("search_type", "unknown"))
            line = f"{idx}. [{recipe_name}] ({retrieval_level}) {content}"
            if current_len + len(line) > max_context_chars:
                break
            parts.append(line)
            current_len += len(line)

        parts.append("如果检索证据不足，请明确说明不确定性，不要编造。")
        return "\n".join(parts)
