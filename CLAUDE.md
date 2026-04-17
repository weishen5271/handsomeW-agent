# Project Rules — handsomeW-agent

## 语言与风格

- 用户交互默认使用中文
- 代码注释使用英文
- Git commit message 使用英文

## 文档规范

- 所有项目文档统一存放在 `docs/` 目录下
- 文档默认使用 Markdown（`.md`）格式
- 文件命名使用 kebab-case，如 `graph-rag-integration.md`
- 根目录仅保留 `README.md` 和 `README.zh-CN.md`

## 项目结构

- `backend/system-service/`：Spring Boot 系统服务（Java 17+）
- `backend/ai-service/`：Python AI 服务（FastAPI）
- `front/`：React + Vite + TypeScript 前端
- `docs/`：项目文档
- `workspace/`：运行时工作区文件

## 开发约定

- Python 使用 `uv` 管理依赖
- 前端使用 `npm`，Java 使用 `Maven`
- 不要在未经确认的情况下执行破坏性 git 操作（force push、reset --hard 等）
- 修改前先说明计划，再动手实施
- 保持改动聚焦和最小化，避免不相关的变更
