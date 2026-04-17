# handsomeW-agent

[中文文档](./README.zh-CN.md)

Lightweight Agent web app evolving toward a dual-backend architecture:
- `backend/system-service`: Spring Boot system service for auth, users, digital twin, workflow orchestration
- `backend/ai-service`: Python AI service for agent runtime, tools, and GraphRAG
- `front`: React + Vite frontend (management UI + chat UI)

---

## 1. Project Layout

- `backend/system-service/`: Spring Boot system service
- `backend/ai-service/`: Python AI service, currently still contains some legacy system APIs for backward compatibility
- `front/`: React + Vite frontend
- `workspace/`: runtime workspace files

## 2. Requirements

- Python `3.10+` (recommended `3.11`)
- Node.js `18+` (recommended `20`)
- PostgreSQL `14+`
- (Optional) Neo4j + Milvus for GraphRAG

## 3. AI Service Setup (Dev)

1. Install dependencies:

```bash
pip install -r backend/ai-service/requirements.txt
```

2. Create `backend/.env`:

```env
APP_HOST=127.0.0.1
APP_PORT=8000
DEBUG=true
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/handsomew_agent
CORS_ALLOW_ORIGINS=http://localhost:5173,http://127.0.0.1:5173,http://localhost:3000,http://127.0.0.1:3000
# CORS_ALLOW_ORIGIN_REGEX=^https://.*\.example\.com$
# Optional: Skill shop (GitHub topic source by default)
# SKILL_SHOP_GITHUB_TOPIC=codex-skill
# Optional: custom fallback index
# SKILL_SHOP_INDEX_URL=https://example.com/skill-index.json
# GRAPH_RAG_ENV_FILE=/absolute/path/to/.env
```

3. Run AI service from repo root:

```bash
uvicorn main:app --app-dir backend/ai-service --host 127.0.0.1 --port 8000 --reload
```

4. Verify:

- Health: `http://127.0.0.1:8000/health`
- Docs: `http://127.0.0.1:8000/docs`

> The app auto-creates tables on startup, but the PostgreSQL database itself must already exist.

## 4. System Service Setup (Dev)

Requirements:

- Java `17+`
- Maven `3.9+`

Run the Spring Boot system service:

```bash
cd backend/system-service
mvn spring-boot:run
```

Optional local env file:

```bash
cp backend/system-service/.env.example backend/system-service/.env
```

If the frontend runs on a different local dev port, configure system-service CORS with:

```env
CORS_ALLOWED_ORIGINS=http://localhost:*,http://127.0.0.1:*
```

Verify:

- Health: `http://127.0.0.1:8081/health`
- System API health: `http://127.0.0.1:8081/api/system/health`

The current codebase includes the Spring Boot system-service skeleton and an AI-service client for the next migration steps. Business APIs are still being moved out of Python incrementally.
The frontend now targets `system-service` as the default `/api` entrypoint, and `system-service` proxies AI endpoints such as `/agents/**`, `/llm-config`, and selected legacy capability routes to `ai-service`.
For local runs with concrete infrastructure values, you can use [application-local.yml](/Users/shenwei/PycharmProjects/handsomeW-agent/backend/system-service/src/main/resources/application-local.yml):

```bash
mvn spring-boot:run -Dspring-boot.run.profiles=local
```

## 5. Frontend Setup (Dev)

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

## 6. Production Deployment

- AI Service:

```bash
uvicorn main:app --app-dir backend/ai-service --host 0.0.0.0 --port 8000
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

    location /system-api/ {
        proxy_pass http://127.0.0.1:8081/api/system/;
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

## 7. Docker Compose Deployment

The repository now includes:

- `docker-compose.yml`
- `backend/ai-service/Dockerfile`
- `backend/system-service/Dockerfile`
- `front/Dockerfile`
- `front/nginx.conf`

Start all services (frontend + ai-service + system-service + PostgreSQL):

```bash
docker compose up -d --build
```

Access:

- Frontend: `http://127.0.0.1:8080`
- AI service health: `http://127.0.0.1:8000/health`
- AI service docs: `http://127.0.0.1:8000/docs`
- System service health: `http://127.0.0.1:8081/health`
- System API health: `http://127.0.0.1:8081/api/system/health`

Stop:

```bash
docker compose down
```

Stop and remove DB volume:

```bash
docker compose down -v
```

## 8. Optional GraphRAG Environment Variables

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
