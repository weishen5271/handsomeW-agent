"""基于图数据库的RAG系统配置文件（统一从 .env 读取）"""

import os
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Dict, Any, Callable, Iterable

from dotenv import load_dotenv


def _get_env(
    key: str,
    cast: Callable[[str], Any] = str,
    aliases: Iterable[str] = (),
) -> Any:
    """读取必填环境变量并执行类型转换"""
    value = os.getenv(key)
    if value is None:
        for alias in aliases:
            value = os.getenv(alias)
            if value is not None:
                break

    if value is None or value == "":
        alias_text = f" (aliases: {', '.join(aliases)})" if aliases else ""
        raise ValueError(f"缺少必填环境变量: {key}{alias_text}")

    try:
        return cast(value)
    except ValueError as exc:
        raise ValueError(f"环境变量格式错误: {key}={value}") from exc


@dataclass
class GraphRAGConfig:
    """基于图数据库的RAG系统配置类"""

    # Neo4j数据库配置
    neo4j_uri: str
    neo4j_user: str
    neo4j_password: str
    neo4j_database: str

    # Milvus配置
    milvus_host: str
    milvus_port: int
    milvus_collection_name: str
    milvus_dimension: int

    # 模型配置
    embedding_model: str

    # 检索配置
    top_k: int

    # 回答生成配置
    temperature: float
    max_tokens: int

    # LLM 子任务配置
    keyword_extraction_temperature: float
    keyword_extraction_max_tokens: int
    query_analysis_temperature: float
    query_analysis_max_tokens: int
    graph_query_temperature: float
    graph_query_max_tokens: int

    # 图数据处理配置
    chunk_size: int
    chunk_overlap: int
    max_graph_depth: int

    # RAG Context 配置（可选，有默认值）
    max_context_chars: int = 2600
    max_chars_per_doc: int = 380
    timeout_seconds: int = 30
    bootstrap_timeout_seconds: int = 120

    @classmethod
    def from_env(cls) -> "GraphRAGConfig":
        """从 .env / 环境变量加载配置"""
        # 优先加载当前项目 backend/.env，再加载可选的 GRAPH_RAG_ENV_FILE
        backend_env = Path(__file__).resolve().parents[1] / ".env"
        load_dotenv(backend_env)
        external_env = os.getenv("GRAPH_RAG_ENV_FILE")
        if external_env:
            load_dotenv(external_env, override=False)
        else:
            default_external = Path("/Users/shenwei/PycharmProjects/graph-rag/.env")
            if default_external.exists():
                load_dotenv(default_external, override=False)
        return cls(
            neo4j_uri=_get_env("NEO4J_URI"),
            neo4j_user=_get_env("NEO4J_USER"),
            neo4j_password=_get_env("NEO4J_PASSWORD"),
            neo4j_database=_get_env("NEO4J_DATABASE"),
            milvus_host=_get_env("MILVUS_HOST"),
            milvus_port=_get_env("MILVUS_PORT", int),
            milvus_collection_name=_get_env("MILVUS_COLLECTION_NAME"),
            milvus_dimension=_get_env("MILVUS_DIMENSION", int),
            embedding_model=_get_env("EMBEDDING_MODEL"),
            top_k=_get_env("TOP_K", int),
            temperature=_get_env("TEMPERATURE", float),
            max_tokens=_get_env("MAX_TOKENS", int),
            keyword_extraction_temperature=_get_env("KEYWORD_EXTRACTION_TEMPERATURE", float),
            keyword_extraction_max_tokens=_get_env("KEYWORD_EXTRACTION_MAX_TOKENS", int),
            query_analysis_temperature=_get_env("QUERY_ANALYSIS_TEMPERATURE", float),
            query_analysis_max_tokens=_get_env("QUERY_ANALYSIS_MAX_TOKENS", int),
            graph_query_temperature=_get_env("GRAPH_QUERY_TEMPERATURE", float),
            graph_query_max_tokens=_get_env("GRAPH_QUERY_MAX_TOKENS", int),
            chunk_size=_get_env("CHUNK_SIZE", int),
            chunk_overlap=_get_env("CHUNK_OVERLAP", int),
            max_graph_depth=_get_env("MAX_GRAPH_DEPTH", int),
            # 以下为可选配置，使用默认值
            max_context_chars=_get_env("RAG_MAX_CONTEXT_CHARS", int, aliases=("MAX_CONTEXT_CHARS",)) if os.getenv("RAG_MAX_CONTEXT_CHARS") or os.getenv("MAX_CONTEXT_CHARS") else 2600,
            max_chars_per_doc=_get_env("RAG_MAX_CHARS_PER_DOC", int, aliases=("MAX_CHARS_PER_DOC",)) if os.getenv("RAG_MAX_CHARS_PER_DOC") or os.getenv("MAX_CHARS_PER_DOC") else 380,
            timeout_seconds=_get_env("RAG_TIMEOUT_SECONDS", int, aliases=("RAG_TIMEOUT",)) if os.getenv("RAG_TIMEOUT_SECONDS") or os.getenv("RAG_TIMEOUT") else 30,
            bootstrap_timeout_seconds=_get_env("RAG_BOOTSTRAP_TIMEOUT_SECONDS", int, aliases=("RAG_INIT_TIMEOUT_SECONDS",)) if os.getenv("RAG_BOOTSTRAP_TIMEOUT_SECONDS") or os.getenv("RAG_INIT_TIMEOUT_SECONDS") else 120,
        )

    @classmethod
    def from_dict(cls, config_dict: Dict[str, Any]) -> "GraphRAGConfig":
        """从字典创建配置对象"""
        return cls(**config_dict)

    def to_dict(self) -> Dict[str, Any]:
        """转换为字典"""
        return asdict(self)
