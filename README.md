# InterviewGuide

基于 FastAPI、React 和 PostgreSQL 的智能面试辅助平台，提供简历分析、岗位匹配、文字与
语音模拟面试、知识库 RAG、面试日程和多模型 Provider 管理。

[![Python](https://img.shields.io/badge/Python-3.11+-blue?logo=python)](https://python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.116+-009688?logo=fastapi)](https://fastapi.tiangolo.com/)
[![React](https://img.shields.io/badge/React-18.3-blue?logo=react)](https://react.dev/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-pgvector-336791?logo=postgresql)](https://www.postgresql.org/)

> 当前主后端位于 `backend/`。根目录 `app/` 中的 Spring Boot 源码仅作为 legacy
> reference 保留，不由 `docker-compose.yml` 构建，也不应继续承载新功能。

## 功能

- 用户注册、登录、JWT 鉴权，兼容旧 Spring BCrypt 密码。
- PDF、DOCX、TXT 简历上传、解析、分析历史、重新分析和 PDF 报告导出。
- 确定性四维简历评分、候选人画像、风格风险、逐项证据和改进建议。
- 单 JD 岗位匹配、岗位目录、两阶段智能匹配、任务取消、状态查询和 SSE 进度。
- 文字模拟面试出题、答题、后台 AI 评估、历史记录和报告导出。
- 语音面试会话及 WebSocket 协议接口。
- 面试邀请解析、日程和状态管理。
- 知识库上传、管理、RAG 检索和流式聊天。
- OpenAI-compatible Provider 配置、连接测试和默认模型切换。
- 招聘会、抓取任务和面经贡献等业务接口。

## 技术栈

| 层 | 技术 |
| --- | --- |
| 后端 | Python 3.11+、FastAPI、Pydantic v2、SQLAlchemy 2 async、asyncpg |
| 数据库 | PostgreSQL 14+、pgvector、Alembic |
| AI | OpenAI-compatible HTTP API、JSON Schema、Pydantic 校验 |
| 缓存与存储 | Redis 7、MinIO/S3 |
| 文档 | pypdf、python-docx、ReportLab |
| 前端 | React 18、TypeScript 5.6、Vite 5、Tailwind CSS 4 |
| 工具 | uv、pytest、Ruff、pnpm |

## 项目结构

```text
interview/
|-- backend/                         # 当前 Python/FastAPI 后端
|   |-- app/
|   |   |-- main.py                  # 应用入口、生命周期和路由注册
|   |   |-- api.py                   # 认证、简历、面试、知识库等 API
|   |   |-- match_api.py             # 岗位和匹配 API
|   |   |-- scoring.py               # 简历、初筛和匹配确定性评分
|   |   |-- matching.py              # 匹配 Schema、Prompt 和任务管理器
|   |   |-- models.py                # SQLAlchemy 模型
|   |   |-- integrations.py          # OpenAI-compatible、S3 等集成
|   |   `-- core.py                  # 配置、JWT、密码和统一 Result
|   |-- alembic/                     # 数据库迁移
|   |-- tests/                       # 后端测试
|   |-- pyproject.toml
|   `-- uv.lock
|-- frontend/                        # React 前端
|-- app/                             # 旧 Spring Boot 参考代码
|-- docker-compose.yml
|-- .env.example
`-- README.md
```

## Job-agent 算法移植

`backend/` 已集成 job-agent 在本产品中的核心算法闭环：

- 四维简历评分：完整性 25、清晰度 20、说服力 40、专业性 15。
- AI 只返回事实、档位或裁决；分数、等级、score impact、screen score、annotation delta 和
  verdict 均由 Python 确定性计算。
- 完整分析结果会持久化，包括候选人画像、风格检测、逐项评分、Provider、模型、版本和
  token usage。
- 单 JD 匹配严格校验招聘要求与简历原文证据，分数允许小于 0 或大于 100，不做截断。
- 智能匹配分为批量初筛和并发详细分析，支持阈值晋级、任务取消、状态查询和 SSE。
- 结构化调用或校验失败会重试一次，重试后仍失败则返回明确错误。

有意保留的实现边界：

- `parse_success=false` 时简历评分强制为 0。
- 仅支持 OpenAI-compatible Provider，不提供 Anthropic 原生 Messages API。
- 批量初筛使用非流式结构化响应，并在整批返回后严格校验岗位 ID 去重和完整覆盖。
- 智能匹配任务状态保存在单个 FastAPI 进程内，不支持多 worker 共享或进程重启恢复；已经
  提交到 `match_results` 的结果会保留。
- 当前岗位匹配能力通过 API 提供，尚无对应前端页面。

## 配置

从 `.env.example` 创建根目录 `.env`。不要提交真实密钥。

至少配置安全的 JWT Secret；需要 AI 功能时配置 DashScope 或其他 OpenAI-compatible
Provider：

```dotenv
JWT_SECRET=replace-with-at-least-32-random-characters
DATABASE_URL=postgresql+asyncpg://postgres:password@localhost:5432/interview_guide
AUTO_CREATE_TABLES=false

AI_BAILIAN_API_KEY=
AI_MODEL=qwen3.5-flash
AI_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1

APP_STORAGE_ENDPOINT=http://localhost:9000
APP_STORAGE_ACCESS_KEY=minioadmin
APP_STORAGE_SECRET_KEY=minioadmin
APP_STORAGE_BUCKET=interview-guide
```

未设置 `DATABASE_URL` 时，后端使用 `POSTGRES_HOST`、`POSTGRES_PORT`、`POSTGRES_DB`、
`POSTGRES_USER` 和 `POSTGRES_PASSWORD` 组合连接地址。

## 本地开发

环境要求：Python 3.11+、uv、Node.js 18+、pnpm 10+。推荐使用 Docker 启动 PostgreSQL、
Redis 和 MinIO。

```bash
# 启动依赖
docker compose up -d postgres redis minio createbuckets

# 安装后端依赖并执行迁移
cd backend
uv sync
uv run alembic upgrade head

# 启动 API
uv run uvicorn app.main:app --reload --host 127.0.0.1 --port 8080
```

另开终端启动前端：

```bash
cd frontend
corepack enable
pnpm install
pnpm dev
```

开发地址：

- 前端：<http://localhost:5173>
- API：<http://localhost:8080>
- OpenAPI：<http://localhost:8080/docs>
- MinIO 控制台：<http://localhost:9001>

## Docker 部署

```bash
docker compose up -d --build
```

- 前端：<http://localhost>
- API：<http://localhost:8080>
- OpenAPI：<http://localhost:8080/docs>

Compose 为首次体验设置了 `AUTO_CREATE_TABLES=true`。生产环境必须设置为 `false`，替换默认
PostgreSQL、MinIO 和 JWT 凭据，并在发布前执行 Alembic 迁移。

## 数据库迁移

当前 migration revision 为 `20260809_01`：

- 为 `resume_analyses` 添加完整分析结果、画像、风格、等级、Provider、模型、版本和 token
  字段。
- 新建 `job_targets` 和 `match_results`。
- 添加外键、唯一约束和查询索引。
- 新增分析字段均为 nullable，以保留已有 legacy 数据。

```bash
cd backend
uv run alembic upgrade head

# 只生成 PostgreSQL SQL，不执行
uv run alembic upgrade head --sql
```

## 匹配 API

| 方法 | 路径 | 作用 |
| --- | --- | --- |
| `POST` | `/api/jobs` | 创建岗位/JD |
| `GET` | `/api/jobs` | 查询岗位列表 |
| `GET` | `/api/jobs/{jobId}` | 查询岗位详情 |
| `DELETE` | `/api/jobs/{jobId}` | 删除岗位和关联结果 |
| `POST` | `/api/match/analyze-single` | 对一个简历和 JD 执行详细匹配 |
| `GET` | `/api/match/resume/{resumeId}` | 查询简历的匹配结果 |
| `GET` | `/api/match/results/{resultId}` | 查询单个匹配结果 |
| `POST` | `/api/match/smart` | 启动两阶段智能匹配 |
| `GET` | `/api/match/smart/{taskId}` | 查询任务状态 |
| `GET` | `/api/match/smart/active/{resumeId}` | 查询简历的活动任务 |
| `POST` | `/api/match/smart/{taskId}/cancel` | 取消任务并保留已提交结果 |
| `GET` | `/api/match/smart/stream/{taskId}` | 订阅任务进度 SSE |

JSON 业务接口沿用 `{code,message,data}` envelope；业务错误通常保持 HTTP 200。下载、SSE 和
WebSocket 使用原生协议响应。完整 Schema 以 OpenAPI 文档为准。

## 验证

```bash
cd backend
uv run pytest -q
uv run ruff check app tests alembic
uv run alembic upgrade head --sql

cd ../frontend
pnpm build
```

当前基线：后端 52 项测试通过，Ruff、Alembic PostgreSQL SQL 生成和前端生产构建通过。

## License

AGPL-3.0 License。
