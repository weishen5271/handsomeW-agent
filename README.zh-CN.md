# handsomeW-agent

[English Documentation](./README.md)

轻量级的 Agent Web 应用，包含：
- `backend`：FastAPI 后端（认证、用户管理、LLM 配置、Agent 对话、GraphRAG 集成）
- `front`：React + Vite 前端（管理页 + 聊天页）

---

## 1. 项目结构

- `backend/`：Python 后端
- `front/`：前端工程（React + Vite）
- `workspace/`：运行时工作区相关文件

## 2. 环境要求

- Python `3.10+`（推荐 `3.11`）
- Node.js `18+`（推荐 `20`）
- PostgreSQL `14+`
- （可选）Neo4j + Milvus（启用 GraphRAG 时需要）

## 3. 后端开发环境部署

1. 安装依赖

```bash
pip install -r backend/requirements.txt
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

# 可选：GraphRAG 外部 env 路径
# GRAPH_RAG_ENV_FILE=/absolute/path/to/.env
```

3. 启动后端（在仓库根目录执行）

```bash
uvicorn main:app --app-dir backend --host 127.0.0.1 --port 8000 --reload
```

4. 验证

- 健康检查：`http://127.0.0.1:8000/health`
- API 文档：`http://127.0.0.1:8000/docs`

> 注意：后端启动时会自动初始化表（`users`、`sessions`、`user_llm_configs`），但不会自动创建 PostgreSQL 数据库本身，请先手动创建 `handsomew_agent` 数据库。

## 4. 前端开发环境部署

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

## 5. 生产部署（前后端）

- 后端：

```bash
uvicorn main:app --app-dir backend --host 0.0.0.0 --port 8000
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
}
```

如果使用 `/api` 前缀转发，请把前端 `VITE_API_BASE_URL` 配置为：

```env
VITE_API_BASE_URL=https://your-domain.com/api
```

## 6. GraphRAG 相关变量（可选）

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
