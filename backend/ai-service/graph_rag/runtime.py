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
        self._preferred_llm_client: MyAgentsLLM | None = None

    def set_default_llm_client(self, llm_client: MyAgentsLLM | None) -> None:
        if llm_client is None:
            return
        with self._lock:
            self._preferred_llm_client = llm_client
            if self.system_ready:
                self._use_llm_client(llm_client)

    def ensure_ready(self, llm_client: MyAgentsLLM | None = None) -> None:
        if self.system_ready:
            if llm_client is not None:
                with self._lock:
                    self._use_llm_client(llm_client)
            return
        with self._lock:
            if self.system_ready:
                if llm_client is not None:
                    self._use_llm_client(llm_client)
                return
            self._initialize_system(llm_client=llm_client)
            self._build_knowledge_base()
            self.system_ready = True

    def _initialize_system(self, llm_client: MyAgentsLLM | None = None):
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
        self.llm_client = llm_client or self._preferred_llm_client or self.llm_client or MyAgentsLLM()
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

    def _use_llm_client(self, llm_client: MyAgentsLLM) -> None:
        self.llm_client = llm_client
        if self.traditional_retrieval:
            self.traditional_retrieval.llm_client = llm_client
            if hasattr(self.traditional_retrieval, "graph_indexing"):
                self.traditional_retrieval.graph_indexing.llm_client = llm_client
        if self.graph_rag_retrieval:
            self.graph_rag_retrieval.llm_client = llm_client
        if self.query_router:
            self.query_router.llm_client = llm_client

    def _build_knowledge_base(self):
        assert self.data_module and self.index_module and self.traditional_retrieval and self.graph_rag_retrieval

        self.data_module.load_graph_data()
        self.data_module.build_equipment_documents()
        chunks = self.data_module.chunk_documents(
            chunk_size=self.config.chunk_size,
            chunk_overlap=self.config.chunk_overlap,
        )

        should_rebuild = True
        if self.index_module.has_collection() and self.index_module.load_collection():
            should_rebuild = not self.index_module.supports_digital_twin_schema()
            if should_rebuild:
                logger.info("检测到旧版或非数字孪生 Milvus schema，准备重建集合")
            else:
                logger.info("检测到可复用的数字孪生 Milvus 集合，直接加载")
        else:
            logger.info("未检测到可用集合，开始构建知识库")

        if should_rebuild and not self.index_module.build_vector_index(chunks):
            raise RuntimeError("构建向量索引失败")

        self.traditional_retrieval.initialize(chunks)
        self.graph_rag_retrieval.initialize()

    def query(
        self,
        question: str,
        top_k: int | None = None,
        llm_client: MyAgentsLLM | None = None,
    ) -> RuntimeQueryResult:
        self.ensure_ready(llm_client=llm_client)
        assert self.query_router and self.traditional_retrieval
        k = top_k or self.config.top_k
        if llm_client is not None:
            with self._lock:
                self._use_llm_client(llm_client)

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
