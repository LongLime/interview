@echo off
REM Scrapling HTTP 服务启动脚本 (Windows)

echo ===================================
echo Scrapling HTTP 服务启动脚本
echo ===================================

REM 检查 Python 是否安装
where python >nul 2>&1
if %errorlevel% neq 0 (
    echo 错误: 未找到 Python
    echo 请先安装 Python 3.8 或更高版本
    pause
    exit /b 1
)

REM 获取脚本所在目录
set SCRIPT_DIR=%~dp0
cd /d "%SCRIPT_DIR%"

REM 检查依赖
echo 检查 Python 依赖...
python -c "import scrapling" 2>nul
if %errorlevel% equ 0 (
    echo   [OK] Scrapling 已安装
) else (
    echo   [FAIL] Scrapling 未安装，正在安装...
    pip install -r requirements.txt
)

python -c "import flask" 2>nul
if %errorlevel% equ 0 (
    echo   [OK] Flask 已安装
) else (
    echo   [FAIL] Flask 未安装，正在安装...
    pip install -r requirements.txt
)

REM 检查 Playwright 浏览器
echo 检查 Playwright 浏览器...
python -c "from playwright.sync_api import sync_playwright" 2>nul
if %errorlevel% equ 0 (
    echo   [OK] Playwright 已安装
) else (
    echo   [FAIL] Playwright 未安装，正在安装...
    pip install playwright
    python -m playwright install chromium
)

echo.
echo ===================================
echo 准备启动 Scrapling HTTP 服务...
echo ===================================
echo.
echo API 端点:
echo   GET  http://127.0.0.1:5000/api/health          - 健康检查
echo   POST http://127.0.0.1:5000/api/scrape/page     - 抓取单页
echo   POST http://127.0.0.1:5000/api/scrape/all      - 抓取所有页面
echo   POST http://127.0.0.1:5000/api/scrape/stream   - 流式抓取 (SSE)
echo.
echo 按 Ctrl+C 停止服务
echo.
echo ===================================
echo.

REM 启动服务
python scrapling_server.py

pause
