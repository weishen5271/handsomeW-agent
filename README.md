# handsomeW-agent

## Project Structure

- `backend`: service-side Python code
- `front`: frontend page (`chat_ui.html`)

## Run Backend

Install dependencies:

```bash
pip install -r backend/requirements.txt
```

Start server (from repository root):

```bash
uvicorn main:app --app-dir backend --host 127.0.0.1 --port 8000 --reload
```

## PyCharm Debug

1. Open project in PyCharm.
2. Set Python interpreter and install `backend/requirements.txt`.
3. Open `backend/main.py` and click `Debug 'main'`.
4. Service starts with `uvicorn.run(...)` from `backend/main.py`.
5. Open docs at `http://127.0.0.1:8000/docs`.

Optional environment variables:

- `APP_HOST` (default: `127.0.0.1`)
- `APP_PORT` (default: `8000`)
- `DEBUG` (`true` enables reload)
- `DATABASE_URL` (PostgreSQL DSN, default: `postgresql://postgres:postgres@127.0.0.1:5432/handsomew_agent`)
- `CORS_ALLOW_ORIGINS` (comma-separated origins, default: `http://localhost:5173,http://127.0.0.1:5173,http://localhost:3000,http://127.0.0.1:3000`)
- `CORS_ALLOW_ORIGIN_REGEX` (optional regex for allowed origins, for example: `^https://.*\.example\.com$`)
- `GRAPH_RAG_ENV_FILE` (optional path to GraphRAG env file; defaults to `/Users/shenwei/PycharmProjects/graph-rag/.env` if exists)

Database:

- The backend now uses PostgreSQL for user/session/LLM config persistence.
- Make sure the database in `DATABASE_URL` exists before starting the service.

GraphRAG required envs (set in `backend/.env`):

- Neo4j: `NEO4J_URI`, `NEO4J_USER`, `NEO4J_PASSWORD`, `NEO4J_DATABASE`
- Milvus: `MILVUS_HOST`, `MILVUS_PORT`, `MILVUS_COLLECTION_NAME`, `MILVUS_DIMENSION`
- Models: `EMBEDDING_MODEL`
- Retrieval params: `TOP_K`, `TEMPERATURE`, `MAX_TOKENS`
- Task params: `KEYWORD_EXTRACTION_TEMPERATURE`, `KEYWORD_EXTRACTION_MAX_TOKENS`, `QUERY_ANALYSIS_TEMPERATURE`, `QUERY_ANALYSIS_MAX_TOKENS`, `GRAPH_QUERY_TEMPERATURE`, `GRAPH_QUERY_MAX_TOKENS`, `CHUNK_SIZE`, `CHUNK_OVERLAP`, `MAX_GRAPH_DEPTH`

## GraphRAG + Agent Integration

- `graph-rag` core logic is now migrated into this repository under `backend/graph_rag/`.
- Agent chat uses migrated local runtime directly:
  - `GraphRAGRuntime.query(...)`
  - `query_router.route_query(...)`
  - Neo4j graph retrieval + Milvus vector retrieval
- If graph route returns empty, runtime falls back to local hybrid retrieval (still Neo4j + Milvus based).
- Request field `enable_rag` is available in `POST /agents/{agent_type}/chat` and stream API (default: `true`).
