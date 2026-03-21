import logging
import threading
from dataclasses import dataclass
from typing import Any, List

from langchain_core.documents import Document
from core.llm import MyAgentsLLM

from .config import GraphRAGConfig
from .rag_modules import GraphDataPreparationModule, MilvusIndexConstructionModule
from .rag_modules.graph_rag_retrieval import GraphRAGRetrieval
from .rag_modules.hybrid_retrieval import HybridRetrievalModule
from .rag_modules.intelligent_query_router import IntelligentQueryRouter, QueryAnalysis

logger = logging.getLogger(__name__)


@dataclass
class RuntimeQueryResult:
    documents: List[Document]
    analysis: QueryAnalysis | None


class GraphRAGRuntime:
    def __init__(self, config: GraphRAGConfig | None = None):
        self.config = config or GraphRAGConfig.from_env()
        self.data_module: GraphDataPreparationModule | None = None
        self.index_module: MilvusIndexConstructionModule | None = None
        self.llm_client: MyAgentsLLM | None = None
        self.traditional_retrieval: HybridRetrievalModule | None = None
        self.graph_rag_retrieval: GraphRAGRetrieval | None = None
        self.query_router: IntelligentQueryRouter | None = None
        self.system_ready = False
        self._lock = threading.Lock()

    def ensure_ready(self) -> None:
        if self.system_ready:
            return
        with self._lock:
            if self.system_ready:
                return
            self._initialize_system()
            self._build_knowledge_base()
            self.system_ready = True

    def _initialize_system(self):
        logger.info("初始化本地迁移 GraphRAG 系统")
        self.data_module = GraphDataPreparationModule(
            uri=self.config.neo4j_uri,
            user=self.config.neo4j_user,
            password=self.config.neo4j_password,
            database=self.config.neo4j_database,
        )
        self.index_module = MilvusIndexConstructionModule(
            host=self.config.milvus_host,
            port=self.config.milvus_port,
            collection_name=self.config.milvus_collection_name,
            dimension=self.config.milvus_dimension,
            model_name=self.config.embedding_model,
        )
        self.llm_client = MyAgentsLLM()
        self.traditional_retrieval = HybridRetrievalModule(
            config=self.config,
            milvus_module=self.index_module,
            data_module=self.data_module,
            llm_client=self.llm_client,
        )
        self.graph_rag_retrieval = GraphRAGRetrieval(
            config=self.config,
            llm_client=self.llm_client,
        )
        self.query_router = IntelligentQueryRouter(
            traditional_retrieval=self.traditional_retrieval,
            graph_rag_retrieval=self.graph_rag_retrieval,
            llm_client=self.llm_client,
            config=self.config,
        )

    def _build_knowledge_base(self):
        assert self.data_module and self.index_module and self.traditional_retrieval and self.graph_rag_retrieval

        chunks = None
        if self.index_module.has_collection() and self.index_module.load_collection():
            logger.info("检测到 Milvus 已有集合，直接加载")
            self.data_module.load_graph_data()
            self.data_module.build_recipe_documents()
            chunks = self.data_module.chunk_documents(
                chunk_size=self.config.chunk_size,
                chunk_overlap=self.config.chunk_overlap,
            )
        else:
            logger.info("未检测到可用集合，开始构建知识库")
            self.data_module.load_graph_data()
            self.data_module.build_recipe_documents()
            chunks = self.data_module.chunk_documents(
                chunk_size=self.config.chunk_size,
                chunk_overlap=self.config.chunk_overlap,
            )
            if not self.index_module.build_vector_index(chunks):
                raise RuntimeError("构建向量索引失败")

        self.traditional_retrieval.initialize(chunks)
        self.graph_rag_retrieval.initialize()

    def query(self, question: str, top_k: int | None = None) -> RuntimeQueryResult:
        self.ensure_ready()
        assert self.query_router and self.traditional_retrieval
        k = top_k or self.config.top_k

        documents, analysis = self.query_router.route_query(question, k)
        if not documents:
            # 在 graph 路由空返回时，兜底仍走真实 Milvus+Neo4j 混合检索
            documents = self.traditional_retrieval.hybrid_search(question, k)
        return RuntimeQueryResult(documents=documents, analysis=analysis)

    def close(self):
        if self.data_module:
            self.data_module.close()
        if self.traditional_retrieval:
            self.traditional_retrieval.close()
        if self.graph_rag_retrieval:
            self.graph_rag_retrieval.close()
        if self.index_module:
            self.index_module.close()
        self.system_ready = False


_RUNTIME: GraphRAGRuntime | None = None
_RUNTIME_LOCK = threading.Lock()


def get_graph_rag_runtime() -> GraphRAGRuntime:
    global _RUNTIME
    if _RUNTIME is not None:
        return _RUNTIME
    with _RUNTIME_LOCK:
        if _RUNTIME is None:
            _RUNTIME = GraphRAGRuntime()
    return _RUNTIME
