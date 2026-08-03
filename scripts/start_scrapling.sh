#!/bin/bash
# Scrapling HTTP 服务启动脚本

echo "==================================="
echo "Scrapling HTTP 服务启动脚本"
echo "==================================="

# 检查 Python 是否安装
if ! command -v python3 &> /dev/null; then
    echo "错误: 未找到 Python3"
    echo "请先安装 Python 3.8 或更高版本"
    exit 1
fi

# 获取脚本所在目录
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# 检查依赖
echo "检查 Python 依赖..."
if python3 -c "import scrapling" 2>/dev/null; then
    echo "✓ Scrapling 已安装"
else
    echo "✗ Scrapling 未安装"
    echo "正在安装..."
    pip install -r requirements.txt
fi

if python3 -c "import flask" 2>/dev/null; then
    echo "✓ Flask 已安装"
else
    echo "✗ Flask 未安装"
    echo "正在安装..."
    pip install -r requirements.txt
fi

# 检查 Playwright 浏览器
echo "检查 Playwright 浏览器..."
if python3 -c "from playwright.sync_api import sync_playwright" 2>/dev/null; then
    echo "✓ Playwright 已安装"
    # 检查浏览器是否安装
    python3 -c "from playwright.sync_api import sync_playwright; p = sync_playwright().start(); p.chromium.launch(); p.stop()" 2>/dev/null && echo "✓ Chromium 浏览器已安装" || echo "⚠ Chromium 浏览器未安装，正在安装..." && python3 -m playwright install chromium
else
    echo "✗ Playwright 未安装"
    echo "正在安装..."
    pip install playwright
    python3 -m playwright install chromium
fi

echo ""
echo "==================================="
echo "准备启动 Scrapling HTTP 服务..."
echo "==================================="
echo ""
echo "API 端点:"
echo "  GET  http://127.0.0.1:5000/api/health          - 健康检查"
echo "  POST http://127.0.0.1:5000/api/scrape/page     - 抓取单页"
echo "  POST http://127.0.0.1:5000/api/scrape/all      - 抓取所有页面"
echo "  POST http://127.0.0.1:5000/api/scrape/stream   - 流式抓取 (SSE)"
echo ""
echo "按 Ctrl+C 停止服务"
echo ""
echo "==================================="
echo ""

# 启动服务
python3 scrapling_server.py
