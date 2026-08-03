# Scrapling 集成说明

## 概述

本项目使用 Scrapling 作为主要的数据抓取方案。Scrapling 是一个功能强大的 Python 爬虫框架，专门用于处理 JavaScript 渲染的页面和反爬虫机制。

## 架构设计

```
┌─────────────────┐    HTTP/REST     ┌──────────────────────┐
│  Spring Boot    │ ◄────────────── │  Python HTTP Server   │
│  (Java)         │                 │  (Flask + Scrapling)  │
│                 │                 │                      │
│  - REST API     │                 │  - scrap_cqbys.py     │
│  - SSE 进度     │                 │  - scrapling_server.py│
│  - 数据存储     │                 │  - 数据解析           │
└─────────────────┘                 └──────────────────────┘
                                              │
                                              ▼
                                    ┌──────────────────────┐
                                    │  重庆高校就业信息网    │
                                    │  cqbys.com           │
                                    └──────────────────────┘
```

## 组件说明

### 1. Python 爬虫脚本 (`scripts/scrap_cqbys.py`)

核心抓取逻辑，使用 Scrapling 的 `StealthyFetcher` 绕过反爬虫机制：

- **主要功能**：
  - 抓取单页或多页宣讲会数据
  - 解析公司名称、高校名称、宣讲地点、时间等信息
  - 支持 JavaScript 渲染页面的抓取

- **关键特性**：
  - `headless=True`: 无头浏览器模式
  - `network_idle=True`: 等待网络空闲，确保页面完全加载
  - CSS 选择器提取表格数据
  - 自动处理分页

### 2. Python HTTP 服务 (`scripts/scrapling_server.py`)

提供 REST API 接口供 Spring Boot 调用：

- **API 端点**：
  - `GET /api/health`: 健康检查
  - `POST /api/scrape/page`: 抓取单页
  - `POST /api/scrape/all`: 抓取所有页面
  - `POST /api/scrape/stream`: 流式抓取 (SSE)

### 3. Spring Boot 客户端 (`ScraplingService.java`)

Java HTTP 客户端服务：

- **功能**：
  - 调用 Python HTTP API
  - 解析 JSON 响应
  - 转换为 Java 实体类
  - 提供进度回调

## 安装和配置

### 1. 安装 Python 依赖

```bash
cd e:\AI面试\interview-guide\scripts

# 创建虚拟环境（推荐）
python -m venv venv
source venv/Scripts/activate  # Windows

# 安装依赖
pip install -r requirements.txt

# 安装 Playwright 浏览器
playwright install chromium
```

### 2. 启动 Python HTTP 服务

```bash
# 开发模式
python scrapling_server.py

# 生产模式（使用 Gunicorn）
gunicorn -w 4 -k gthread scrapling_server:app
```

服务将在 `http://127.0.0.1:5000` 启动。

### 3. 配置 Spring Boot

在 `application.yml` 中配置 Scrapling API 地址：

```yaml
careerfair:
  scrapling:
    api-url: ${SCRAPLING_API_URL:http://127.0.0.1:5000}
    timeout: 60000
    max-retries: 3
```

或通过环境变量：

```bash
export SCRAPLING_API_URL=http://127.0.0.1:5000
```

## 使用示例

### 测试抓取功能

```bash
# 测试单页抓取
curl -X POST http://127.0.0.1:5000/api/scrape/page \
  -H "Content-Type: application/json" \
  -d '{"page": 1}'

# 测试批量抓取
curl -X POST http://127.0.0.1:5000/api/scrape/all \
  -H "Content-Type: application/json" \
  -d '{"start_page": 1, "max_pages": 10}'

# 保存到文件
python scrap_cqbys.py --page 1 --max-pages 100 --output results.json
```

### 前端触发抓取

1. 打开前端页面
2. 点击"同步数据"按钮
3. 通过 SSE 实时查看抓取进度

## Scrapling 核心特性

### 1. 智能元素追踪 (Adaptive Scraping)

Scrapling 能够自动适应网站结构变化：

```python
# 首次抓取，保存选择器
products = page.css('.product', auto_save=True)

# 后续抓取，自动适应变化
products = page.css('.product', adaptive=True)
```

### 2. 反爬虫绕过

`StealthyFetcher` 内置反爬虫绕过功能：

- 模拟真实浏览器指纹
- 自动处理 Cloudflare Turnstile
- 绕过常见反爬虫机制

### 3. 动态页面支持

支持 JavaScript 渲染的页面：

```python
page = StealthyFetcher.fetch(url, headless=True, network_idle=True)
```

### 4. 智能选择器

支持多种选择方式：

```python
# CSS 选择器
items = page.css('.item')

# XPath 选择器
items = page.xpath('//div[@class="item"]')

# 文本搜索
items = page.search('现场')

# 正则匹配
items = page.regex(r'公司名称.*')
```

## 故障排查

### 1. Scrapling 服务无法启动

**问题**: `ModuleNotFoundError: No module named 'scrapling'`

**解决**:
```bash
pip install scrapling
playwright install chromium
```

### 2. 抓取数据为空

**问题**: 返回的 `data` 数组为空

**解决**:
1. 检查网站结构是否变化
2. 增加等待时间：
   ```python
   page.wait_for_selector('table tbody tr', timeout=15000)
   ```
3. 查看日志输出

### 3. Spring Boot 无法连接 Python 服务

**问题**: `Connection refused` 错误

**解决**:
1. 确认 Python 服务正在运行
2. 检查端口 5000 是否被占用
3. 检查防火墙设置

### 4. 页面加载超时

**问题**: `TimeoutError`

**解决**:
```python
page = StealthyFetcher.fetch(
    url,
    headless=True,
    network_idle=True,
    timeout=60000  # 增加超时时间
)
```

## 性能优化

### 1. 并发抓取

使用异步方式提高抓取效率：

```python
import asyncio
from scrapling.spiders import Spider

class CqbysSpider(Spider):
    name = "cqbys"
    concurrency = 5  # 并发数
    start_urls = [f"https://www.cqbys.com/teachin?page={i}" for i in range(1, 100)]
```

### 2. 代理轮换

```python
from scrapling.fetchers import StealthyFetcher
from scrapling.proxies import ProxyRotator

rotator = ProxyRotator(['proxy1', 'proxy2'])
fetcher = StealthyFetcher(proxy_rotator=rotator)
```

### 3. 请求限流

避免被封禁：

```python
# 请求间隔
import time
time.sleep(2)  # 每页间隔2秒
```

## 部署建议

### 1. Docker 部署

创建 `Dockerfile`:

```dockerfile
FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt && playwright install chromium
COPY . .
EXPOSE 5000
CMD ["gunicorn", "-w", "4", "-k", "gthread", "scrapling_server:app"]
```

### 2. 环境变量配置

```bash
# .env
SCRAPLING_API_URL=http://scrapling:5000
PLAYWRIGHT_BROWSERS_PATH=/tmp/playwright
```

## 参考资料

- [Scrapling 官方文档](https://scrapling.readthedocs.io/)
- [Scrapling GitHub](https://github.com/D4Vinci/Scrapling)
- [Scrapling 选择器文档](https://scrapling.readthedocs.io/en/latest/parsing/selection.html)
- [Scrapling Fetchers 文档](https://scrapling.readthedocs.io/en/latest/fetching/choosing.html)

## 技术支持

如有问题，请查看：
1. Python 服务日志输出
2. Spring Boot 应用日志
3. 浏览器开发者工具 Network 面板
4. Scrapling 官方文档和 GitHub Issues
