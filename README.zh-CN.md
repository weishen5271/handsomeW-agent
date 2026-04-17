# handsomeW-agent

[English Documentation](./README.md)

轻量级的 Agent Web 应用，正在演进为双后端架构：
- `backend/system-service`：Spring Boot 系统服务，承载认证、用户、数字孪生、工作流编排等系统业务
- `backend/ai-service`：Python AI 服务，承载 Agent、Tool、GraphRAG 等智能能力
- `front`：React + Vite 前端（管理页 + 聊天页）

---

## 1. 项目结构

- `backend/system-service/`：Spring Boot 系统服务
- `backend/ai-service/`：Python AI 服务；当前仍保留部分旧系统接口以兼容存量前端
- `front/`：前端工程（React + Vite）
- `workspace/`：运行时工作区相关文件

## 2. 环境要求

- Python `3.10+`（推荐 `3.11`）
- Node.js `18+`（推荐 `20`）
- PostgreSQL `14+`
- （可选）Neo4j + Milvus（启用 GraphRAG 时需要）

## 3. AI 服务开发环境部署

1. 安装依赖

```bash
uv sync --directory backend/ai-service
```

2. 配置环境变量（新建 `backend/.env`）

```env
# 服务
APP_HOST=127.0.0.1
APP_PORT=8000
DEBUG=true

# 数据库（必填）
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/handsomew_agent

# CORS
CORS_ALLOW_ORIGINS=http://localhost:5173,http://127.0.0.1:5173,http://localhost:3000,http://127.0.0.1:3000
# CORS_ALLOW_ORIGIN_REGEX=^https://.*\.example\.com$

# 可选：Skill 商店（默认从 GitHub topic 拉取）
# SKILL_SHOP_GITHUB_TOPIC=codex-skill
# 可选：自定义索引兜底
# SKILL_SHOP_INDEX_URL=https://example.com/skill-index.json

# 可选：GraphRAG 外部 env 路径
# GRAPH_RAG_ENV_FILE=/absolute/path/to/.env
```

3. 启动 AI 服务（在仓库根目录执行）

```bash
uv run --directory backend/ai-service uvicorn main:app --host 127.0.0.1 --port 8000 --reload
```

4. 验证

- 健康检查：`http://127.0.0.1:8000/health`
- API 文档：`http://127.0.0.1:8000/docs`

> 注意：当前 Python 服务仍会自动初始化一部分历史表结构，这是为兼容迁移过程保留的能力；后续系统业务会逐步迁移到 `system-service`。

## 4. System Service 开发环境部署

环境要求：

- Java `17+`
- Maven `3.9+`

启动 Spring Boot 系统服务：

```bash
cd backend/system-service
mvn spring-boot:run
```

可选：先复制本地环境配置文件

```bash
cp backend/system-service/.env.example backend/system-service/.env
```

如果前端本地开发端口不是固定的 `5173`，可以给 system-service 配置：

```env
CORS_ALLOWED_ORIGINS=http://localhost:*,http://127.0.0.1:*
```

验证：

- 健康检查：`http://127.0.0.1:8081/health`
- 系统 API 健康检查：`http://127.0.0.1:8081/api/system/health`

当前仓库已具备 `system-service` 骨架与 AI 服务客户端，后续可继续把认证、用户、数字孪生等业务接口逐步迁入 Java。
当前前端默认已切到 `system-service` 作为 `/api` 入口，`system-service` 会继续代理 `/agents/**`、`/llm-config` 以及部分仍保留在 Python 的能力型接口。
如果需要直接使用本地实际配置，可启用 [application-local.yml](/Users/shenwei/PycharmProjects/handsomeW-agent/backend/system-service/src/main/resources/application-local.yml)：

```bash
mvn spring-boot:run -Dspring-boot.run.profiles=local
```

## 5. 前端开发环境部署

1. 安装依赖

```bash
cd front
npm install
```

2. 配置 API 地址（可选）

前端默认请求 `http://127.0.0.1:8000`。如需修改，在 `front/.env.local` 添加：

```env
VITE_API_BASE_URL=http://127.0.0.1:8000
```

3. 启动前端开发服务器

```bash
npm run dev
```

4. 访问

- Vite 默认地址：`http://127.0.0.1:5173`

## 6. 生产部署（前后端）

- AI 服务：

```bash
uv run --directory backend/ai-service uvicorn main:app --host 0.0.0.0 --port 8000
```

- 前端构建：

```bash
cd front
npm run build
```

构建产物：`front/dist/`

- 建议使用 Nginx（或其他反向代理）托管前端静态资源并转发 API。

Nginx 示例：

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

如果使用 `/api` 前缀转发，请把前端 `VITE_API_BASE_URL` 配置为：

```env
VITE_API_BASE_URL=https://your-domain.com/api
```

## 7. Docker Compose 部署

仓库已新增以下文件：

- `docker-compose.yml`
- `backend/ai-service/Dockerfile`
- `backend/system-service/Dockerfile`
- `front/Dockerfile`
- `front/nginx.conf`

一键启动前端、AI 服务、System Service 与 PostgreSQL：

```bash
docker compose up -d --build
```

访问地址：

- 前端：`http://127.0.0.1:8080`
- AI 服务健康检查：`http://127.0.0.1:8000/health`
- AI 服务 API 文档：`http://127.0.0.1:8000/docs`
- System Service 健康检查：`http://127.0.0.1:8081/health`
- System API 健康检查：`http://127.0.0.1:8081/api/system/health`

停止服务：

```bash
docker compose down
```

停止并删除数据库数据卷：

```bash
docker compose down -v
```

## 8. GraphRAG 相关变量（可选）

启用 GraphRAG 时，需在 `backend/.env`（或 `GRAPH_RAG_ENV_FILE` 指向的 env）中补充：

- Neo4j：`NEO4J_URI`、`NEO4J_USER`、`NEO4J_PASSWORD`、`NEO4J_DATABASE`
- Milvus：`MILVUS_HOST`、`MILVUS_PORT`、`MILVUS_COLLECTION_NAME`、`MILVUS_DIMENSION`
- 模型：`EMBEDDING_MODEL`
- 检索参数：`TOP_K`、`TEMPERATURE`、`MAX_TOKENS`
- 任务参数：
  `KEYWORD_EXTRACTION_TEMPERATURE`、`KEYWORD_EXTRACTION_MAX_TOKENS`、
  `QUERY_ANALYSIS_TEMPERATURE`、`QUERY_ANALYSIS_MAX_TOKENS`、
  `GRAPH_QUERY_TEMPERATURE`、`GRAPH_QUERY_MAX_TOKENS`、
  `CHUNK_SIZE`、`CHUNK_OVERLAP`、`MAX_GRAPH_DEPTH`
