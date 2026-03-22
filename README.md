# handsomeW-agent

[中文文档](./README.zh-CN.md)

Lightweight Agent web app with:
- `backend`: FastAPI backend (auth, user management, LLM config, agent chat, GraphRAG integration)
- `front`: React + Vite frontend (management UI + chat UI)

---

## 1. Project Layout

- `backend/`: FastAPI backend
- `front/`: React + Vite frontend
- `workspace/`: runtime workspace files

## 2. Requirements

- Python `3.10+` (recommended `3.11`)
- Node.js `18+` (recommended `20`)
- PostgreSQL `14+`
- (Optional) Neo4j + Milvus for GraphRAG

## 3. Backend Setup (Dev)

1. Install dependencies:

```bash
pip install -r backend/requirements.txt
```

2. Create `backend/.env`:

```env
APP_HOST=127.0.0.1
APP_PORT=8000
DEBUG=true
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/handsomew_agent
CORS_ALLOW_ORIGINS=http://localhost:5173,http://127.0.0.1:5173,http://localhost:3000,http://127.0.0.1:3000
# CORS_ALLOW_ORIGIN_REGEX=^https://.*\.example\.com$
# GRAPH_RAG_ENV_FILE=/absolute/path/to/.env
```

3. Run backend from repo root:

```bash
uvicorn main:app --app-dir backend --host 127.0.0.1 --port 8000 --reload
```

4. Verify:

- Health: `http://127.0.0.1:8000/health`
- Docs: `http://127.0.0.1:8000/docs`

> The app auto-creates tables on startup, but the PostgreSQL database itself must already exist.

## 4. Frontend Setup (Dev)

1. Install dependencies:

```bash
cd front
npm install
```

2. (Optional) set API base in `front/.env.local`:

```env
VITE_API_BASE_URL=http://127.0.0.1:8000
```

3. Start dev server:

```bash
npm run dev
```

Default URL: `http://127.0.0.1:5173`

## 5. Production Deployment

- Backend:

```bash
uvicorn main:app --app-dir backend --host 0.0.0.0 --port 8000
```

- Frontend build:

```bash
cd front
npm run build
```

Artifacts: `front/dist/`

- Use Nginx (or another reverse proxy) to serve `front/dist/` and proxy API traffic to backend.

Nginx example:

```nginx
server {
    listen 80;
    server_name your-domain.com;

    root /path/to/handsomeW-agent/front/dist;
    index index.html;

    location / {
        try_files $uri /index.html;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:8000/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

If `/api` prefix is used, set:

```env
VITE_API_BASE_URL=https://your-domain.com/api
```

## 6. Docker Compose Deployment

The repository now includes:

- `docker-compose.yml`
- `backend/Dockerfile`
- `front/Dockerfile`
- `front/nginx.conf`

Start all services (frontend + backend + PostgreSQL):

```bash
docker compose up -d --build
```

Access:

- Frontend: `http://127.0.0.1:8080`
- Backend health: `http://127.0.0.1:8000/health`
- API docs: `http://127.0.0.1:8000/docs`

Stop:

```bash
docker compose down
```

Stop and remove DB volume:

```bash
docker compose down -v
```

## 7. Optional GraphRAG Environment Variables

Set these when GraphRAG is enabled:

- Neo4j: `NEO4J_URI`, `NEO4J_USER`, `NEO4J_PASSWORD`, `NEO4J_DATABASE`
- Milvus: `MILVUS_HOST`, `MILVUS_PORT`, `MILVUS_COLLECTION_NAME`, `MILVUS_DIMENSION`
- Model: `EMBEDDING_MODEL`
- Retrieval params: `TOP_K`, `TEMPERATURE`, `MAX_TOKENS`
- Task params:
  `KEYWORD_EXTRACTION_TEMPERATURE`, `KEYWORD_EXTRACTION_MAX_TOKENS`,
  `QUERY_ANALYSIS_TEMPERATURE`, `QUERY_ANALYSIS_MAX_TOKENS`,
  `GRAPH_QUERY_TEMPERATURE`, `GRAPH_QUERY_MAX_TOKENS`,
  `CHUNK_SIZE`, `CHUNK_OVERLAP`, `MAX_GRAPH_DEPTH`
