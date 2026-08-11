# InterviewGuide

智能 AI 面试辅助平台。当前主后端使用 Python、FastAPI、Pydantic v2 和 SQLAlchemy 2
async，前端使用 React 18、TypeScript 和 Vite。

> `backend/` 是当前唯一主后端。根目录 `app/` 中的 Spring Boot 源码仅作为 legacy
> reference 保留，不由 `docker-compose.yml` 构建，也不应继续承载新功能。

## 当前状态

- 主分支：`master`
- Python 重构与 job-agent 移植提交：`7f659b9`
- Python 后端测试：52 项通过
- Ruff：`app`、`tests`、`alembic` 检查通过
- 前端：TypeScript 和 Vite 生产构建通过
- 数据库迁移：Alembic revision `20260809_01`

新对话继续开发时，先阅读本 README 和 `backend/`。不要修改或提交工作区外的
`interview_old` 备份目录。

## 已实现功能

- 认证：注册、登录、JWT、当前用户，兼容旧 Spring BCrypt 密码，新密码使用 Argon2。
- 简历：PDF/DOCX/TXT 上传与解析、对象存储、历史记录、重新分析、完整分析结果和 PDF 导出。
- 简历评分：确定性四维评分、候选人画像、风格风险、逐项证据和修改建议。
- 岗位匹配：岗位目录、单 JD 匹配、两阶段智能匹配、任务状态、取消、SSE 和结果查询。
- 文字面试：Skill/JD 出题、答题、后台 AI 评估、详情、历史记录和报告导出。
- 语音面试：保留前后端协议和会话接口；实际 ASR/TTS 能力取决于配置的服务。
- 面试日程：邀请文本解析、日历、状态管理。
- 知识库/RAG：上传、管理、检索、流式问答和聊天会话。
- Provider：OpenAI-compatible 模型配置、测试和默认模型切换。
- 其他：招聘会、抓取任务、面经贡献等前端兼容接口。

## Job-agent 移植范围

`backend/` 已移植 job-agent 在 InterviewGuide 产品中的完整核心算法闭环：

- 权威四维简历评分：完整性 25、清晰度 20、说服力 40、专业性 15。
- 完整评分规则、档位说明、候选人画像、风格风险和逐项建议 Schema。
- 模型只返回事实和裁决，分数、等级、score impact、screen score、annotation delta 和
  verdict 均由 Python 确定性计算。
- 简历分析结果会持久化完整 JSON、候选人画像、风格检测、等级、Provider、模型、版本和
  token usage，并可通过分析历史/详情接口读取。
- 单 JD 详细匹配会严格校验招聘要求和简历原文证据，允许负分和超过 100 的分数，不做截断。
- 持久化岗位支持两阶段智能匹配：批量初筛、阈值晋级、按初筛分排序、并发详细分析。
- 智能匹配支持一个简历一个活动任务、状态查询、取消、进度 SSE 和已提交结果保留。

有意保留的差异和边界：

- `parse_success=false` 时简历总分强制为 0，避免无法解析的内容获得虚假分数。
- 仅支持项目现有的 OpenAI-compatible Provider，不提供 Anthropic 原生 Messages API。
- 批量初筛使用非流式结构化响应，整批完成后校验 ID 去重和完整覆盖，因此未移植
  `IncrementalArrayParser`。
- 智能匹配任务和 SSE 通知为单 FastAPI 进程内状态；进程重启或多 worker 不共享任务状态，
  但已经提交到 `match_results` 的结果会保留。
- 当前没有岗位匹配前端页面，能力通过 API 提供。

## 技术栈

| 层 | 技术 |
| --- | --- |
| 后端 | Python 3.11+、FastAPI、Pydantic v2、SQLAlchemy 2 async、asyncpg |
| 数据库 | PostgreSQL 16、pgvector、Alembic |
| AI | OpenAI-compatible HTTP API、严格 JSON Schema、Pydantic 校验 |
| 存储 | MinIO/S3、boto3 |
| 缓存 | Redis 7 |
| 导出 | ReportLab |
| 前端 | React 18、TypeScript 5.6、Vite 5、Tailwind CSS 4 |
| 工具 | uv、pytest、Ruff、pnpm |

## 目录结构

```text
interview/
|-- backend/                         # 当前 Python/FastAPI 后端
|   |-- app/
|   |   |-- main.py                  # 应用入口、生命周期、异常处理、路由注册
|   |   |-- api.py                   # 认证、简历、面试、知识库等兼容 API
|   |   |-- match_api.py             # 岗位与 job-agent 匹配 API
|   |   |-- matching.py              # 匹配 Schema、Prompt、确定性计算、任务管理器
|   |   |-- scoring.py               # 权威简历评分表和初筛/匹配评分表
|   |   |-- models.py                # SQLAlchemy 模型
|   |   |-- schemas.py               # 请求 Schema
|   |   |-- integrations.py          # OpenAI-compatible、S3 等集成
|   |   `-- core.py                  # 配置、JWT、密码和统一 Result
|   |-- alembic/                     # 数据库迁移
|   |-- tests/                       # 后端测试
|   |-- pyproject.toml
|   `-- uv.lock
|-- frontend/                        # React 前端
|-- app/                             # 旧 Spring Boot 参考代码，不再运行
|-- docker-compose.yml               # PostgreSQL、Redis、MinIO、FastAPI、前端
|-- .env.example
`-- README.md
```

## 环境要求

- Python 3.11+
- [uv](https://docs.astral.sh/uv/)
- Node.js 18+
- pnpm 10+
- PostgreSQL 14+，推荐 PostgreSQL 16 + pgvector
- Redis 7 和 S3 兼容对象存储按使用功能选配
- Docker Desktop 和 Docker Compose，可选但推荐

不再需要 JDK 或 Gradle 来运行主后端。

## 配置

从根目录 `.env.example` 创建 `.env`。`.env` 已被 Git 忽略，不要提交真实密钥。

核心配置：

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

启动依赖：

```bash
docker compose up -d postgres redis minio createbuckets
```

执行数据库迁移：

```bash
cd backend
uv sync
uv run alembic upgrade head
```

启动 Python API：

```bash
cd backend
uv run uvicorn app.main:app --reload --host 127.0.0.1 --port 8080
```

启动前端：

```bash
cd frontend
corepack enable
pnpm install
pnpm dev
```

访问地址：

- 前端开发服务器：<http://localhost:5173>
- FastAPI：<http://localhost:8080>
- OpenAPI 文档：<http://localhost:8080/docs>
- MinIO 控制台：<http://localhost:9001>

## Docker 部署

```bash
docker compose up -d --build
```

默认访问：

- 前端：<http://localhost>
- API：<http://localhost:8080>
- API 文档：<http://localhost:8080/docs>

`docker-compose.yml` 为首次体验设置了 `AUTO_CREATE_TABLES=true`。生产环境必须设置为
`false`，并在发布前执行：

```bash
cd backend
uv run alembic upgrade head
```

生产环境还必须替换默认 PostgreSQL、MinIO 和 `JWT_SECRET` 凭据。

## 核心匹配 API

所有 JSON 业务接口沿用 `{code,message,data}` envelope；业务错误通常保持 HTTP 200。
下载、SSE 和 WebSocket 使用原生协议响应。

| 方法 | 路径 | 作用 |
| --- | --- | --- |
| `POST` | `/api/jobs` | 创建持久化岗位/JD |
| `GET` | `/api/jobs` | 查询岗位列表 |
| `GET` | `/api/jobs/{jobId}` | 查询岗位详情 |
| `DELETE` | `/api/jobs/{jobId}` | 删除岗位及关联匹配结果 |
| `POST` | `/api/match/analyze-single` | 对一个简历和 JD 执行详细匹配 |
| `GET` | `/api/match/resume/{resumeId}` | 查询简历的匹配结果 |
| `GET` | `/api/match/results/{resultId}` | 查询一个匹配结果 |
| `POST` | `/api/match/smart` | 启动持久化岗位的两阶段智能匹配 |
| `GET` | `/api/match/smart/{taskId}` | 查询任务状态 |
| `GET` | `/api/match/smart/active/{resumeId}` | 查询简历的活动任务 |
| `POST` | `/api/match/smart/{taskId}/cancel` | 取消任务并保留已提交结果 |
| `GET` | `/api/match/smart/stream/{taskId}` | 订阅任务进度 SSE |

完整请求和响应 Schema 以 <http://localhost:8080/docs> 为准。

## 数据库迁移

当前迁移 `20260809_01`：

- 为 `resume_analyses` 添加完整结果、画像、风格、等级、Provider、模型、版本和 token 字段。
- 新建 `job_targets`。
- 新建 `match_results`、外键、唯一约束和查询索引。
- 所有新增分析字段均为 nullable，保留已有 legacy 数据。

检查 PostgreSQL SQL，不实际执行：

```bash
cd backend
uv run alembic upgrade head --sql
```

## 验证

后端：

```bash
cd backend
uv run pytest -q
uv run ruff check app tests alembic
uv run alembic upgrade head --sql
```

前端：

```bash
cd frontend
pnpm build
```

最后一次完整验证结果：

```text
52 passed
Ruff: all checks passed
TypeScript + Vite build: passed
Alembic PostgreSQL SQL generation: passed
```

Vite 当前会提示 Browserslist 数据较旧，以及两个生产 chunk 超过 500 kB。这些是构建警告，
不影响构建成功。

## 开发约束

- 新后端功能写入 `backend/`，不要继续修改 legacy `app/`，除非任务明确要求维护参考代码。
- 手工修改数据库结构必须增加 Alembic migration。
- 不要在数据库事务中等待 LLM、S3 或其他外部 API。
- AI 只提供结构化事实/裁决，业务分数必须由 Python 计算。
- OpenAI-compatible 结构化结果必须经过 Pydantic 校验；失败最多重试一次后明确报错。
- 不提交 `.env`、API Key、日志、`.venv`、缓存或前端 `dist`。
- 保持 legacy 前端响应字段，除非同步修改前端和契约测试。

## 已知边界

- 智能匹配任务状态是进程内存，暂不支持多 worker 共享和进程重启恢复。
- 岗位匹配只有 API，暂无对应前端页面。
- 语音面试真实效果依赖外部 ASR/TTS 服务和浏览器环境。
- 外部模型和生产 PostgreSQL 数据快照未纳入自动化测试；测试使用确定性 mock 和 SQLite。

## License

AGPL-3.0 License。
