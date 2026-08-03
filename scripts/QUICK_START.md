# Scrapling 快速入门指南

## 5分钟快速上手

### 第一步：安装依赖（只需一次）

```bash
cd e:\AI面试\interview-guide\scripts

# 安装 Python 依赖
pip install -r requirements.txt

# 安装浏览器
playwright install chromium
```

### 第二步：启动 Python 服务

打开一个新的终端窗口，运行：

**Windows:**
```bash
cd e:\AI面试\interview-guide\scripts
start_scrapling.bat
```

**Linux/Mac:**
```bash
cd e:\AI面试\interview-guide\scripts
bash start_scrapling.sh
```

看到以下输出表示启动成功：
```
============================================================
Scrapling HTTP 服务启动
============================================================
API 端点:
  GET  /api/health          - 健康检查
  POST /api/scrape/page      - 抓取单页
  POST /api/scrape/all       - 抓取所有页面
  POST /api/scrape/stream    - 流式抓取 (SSE)
============================================================
```

### 第三步：测试抓取

保持 Python 服务运行，打开另一个终端：

```bash
# 测试健康检查
curl http://127.0.0.1:5000/api/health

# 测试抓取第一页
curl -X POST http://127.0.0.1:5000/api/scrape/page \
  -H "Content-Type: application/json" \
  -d '{"page": 1}'
```

如果看到类似以下输出，说明抓取成功：
```json
{
  "success": true,
  "data": [
    {
      "companyName": "公司名称",
      "universityName": "高校名称",
      "venue": "宣讲地点",
      "fairDate": "2024-01-01",
      ...
    }
  ],
  "count": 20
}
```

### 第四步：启动 Spring Boot

在另一个终端窗口：

```bash
cd e:\AI面试\interview-guide
./gradlew bootRun
```

### 第五步：测试前端

1. 打开浏览器访问 `http://localhost:5173`
2. 登录后，在左侧菜单找到"宣讲会"
3. 点击"同步数据"按钮
4. 观察进度条，查看抓取结果

## 常用命令

### 查看所有宣讲会
```bash
curl -X POST http://127.0.0.1:5000/api/scrape/all \
  -H "Content-Type: application/json" \
  -d '{"start_page": 1, "max_pages": 5}' | jq '.total'
```

### 保存到文件
```bash
cd e:\AI面试\interview-guide\scripts
python scrap_cqbys.py --page 1 --max-pages 10 --output results.json
```

### 查看抓取统计
```bash
python test_scrapling.py
```

## 故障排查

### 问题1: "ModuleNotFoundError: No module named 'scrapling'"

**解决**:
```bash
pip install -r requirements.txt
```

### 问题2: "chromium executable doesn't exist"

**解决**:
```bash
playwright install chromium
```

### 问题3: "Connection refused" 错误

**解决**:
1. 确认 Python 服务正在运行
2. 确认端口 5000 未被占用
3. 尝试重启 Python 服务

### 问题4: 抓取数据为空

**可能原因**:
- 网站结构变化
- 网络连接问题

**解决**:
1. 检查 Python 服务日志
2. 手动访问网站
3. 增加等待时间

## 下一步

- 阅读 `README.md` 了解详细配置
- 查看 `INTEGRATION_SUMMARY.md` 了解架构设计
- 根据需要调整抓取参数
- 部署到生产环境

## 技术支持

如有问题，请查看：
1. Python 服务终端输出
2. Spring Boot 日志
3. 浏览器开发者工具
4. Scrapling 官方文档
