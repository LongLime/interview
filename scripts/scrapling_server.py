#!/usr/bin/env python3
"""
Scrapling HTTP 服务 - 提供 REST API 接口
用于 Spring Boot 后端调用进行数据抓取
"""

from flask import Flask, request, jsonify
from scrap_cqbys import parse_career_fair_page, scrape_all_pages
import json
import sys
from datetime import datetime

app = Flask(__name__)


@app.route('/api/health', methods=['GET'])
def health_check():
    """健康检查接口"""
    return jsonify({
        'status': 'healthy',
        'service': 'scrapling-api',
        'timestamp': datetime.now().isoformat()
    })


@app.route('/api/scrape/page', methods=['POST'])
def scrape_page():
    """
    抓取单页数据

    Request Body:
    {
        "page": 1,
        "url": "https://www.cqbys.com/teachin?type=offline"
    }

    Response:
    {
        "success": true,
        "data": [...],
        "count": 20
    }
    """
    try:
        req_data = request.get_json()

        if not req_data:
            return jsonify({
                'success': False,
                'error': '请求参数不能为空'
            }), 400

        page_num = req_data.get('page', 1)
        url = req_data.get('url')

        if not url:
            # 使用默认URL
            if page_num == 1:
                url = "https://www.cqbys.com/teachin?type=offline"
            else:
                url = f"https://www.cqbys.com/teachin?page={page_num}&type=offline"

        print(f"抓取请求: page={page_num}, url={url}", file=sys.stderr)

        result = parse_career_fair_page(url)

        return jsonify(result)

    except Exception as e:
        print(f"抓取接口错误: {e}", file=sys.stderr)
        return jsonify({
            'success': False,
            'error': str(e),
            'data': [],
            'count': 0
        }), 500


@app.route('/api/scrape/all', methods=['POST'])
def scrape_all():
    """
    抓取所有页面数据

    Request Body:
    {
        "start_page": 1,
        "max_pages": 100
    }

    Response:
    {
        "success": true,
        "data": [...],
        "total": 1500,
        "errors": []
    }
    """
    try:
        req_data = request.get_json() or {}

        start_page = req_data.get('start_page', 1)
        max_pages = req_data.get('max_pages', 750)

        print(f"批量抓取请求: start={start_page}, max={max_pages}", file=sys.stderr)

        result = scrape_all_pages(start_page, max_pages)

        return jsonify(result)

    except Exception as e:
        print(f"批量抓取接口错误: {e}", file=sys.stderr)
        return jsonify({
            'success': False,
            'error': str(e),
            'data': [],
            'total': 0,
            'errors': []
        }), 500


@app.route('/api/scrape/stream', methods=['POST'])
def scrape_stream():
    """
    流式抓取接口 - 实时返回进度

    这个接口使用 Server-Sent Events (SSE) 逐行返回抓取进度
    """
    from flask import Response

    def generate():
        try:
            req_data = request.get_json() or {}
            start_page = req_data.get('start_page', 1)
            max_pages = req_data.get('max_pages', 750)

            total_count = 0

            for page_num in range(start_page, max_pages + 1):
                if page_num == 1:
                    url = "https://www.cqbys.com/teachin?type=offline"
                else:
                    url = f"https://www.cqbys.com/teachin?page={page_num}&type=offline"

                # 发送进度
                progress = min((page_num / max_pages) * 100, 99)
                yield f"data: {json.dumps({'type': 'progress', 'page': page_num, 'progress': progress})}\n\n"

                # 抓取页面
                result = parse_career_fair_page(url)

                if result['success']:
                    data = result['data']
                    if not data:
                        # 无数据，停止
                        yield f"data: {json.dumps({'type': 'complete', 'message': '无更多数据', 'total': total_count})}\n\n"
                        break

                    total_count += len(data)

                    # 发送数据
                    yield f"data: {json.dumps({'type': 'data', 'page': page_num, 'count': len(data), 'total': total_count, 'items': data})}\n\n"
                else:
                    # 发送错误
                    yield f"data: {json.dumps({'type': 'error', 'page': page_num, 'error': result.get('error')})}\n\n"

                # 短暂延迟
                import time
                time.sleep(1)

            # 发送完成
            yield f"data: {json.dumps({'type': 'finished', 'total': total_count})}\n\n"

        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'error': str(e)})}\n\n"

    return Response(
        generate(),
        mimetype='text/event-stream',
        headers={
            'Cache-Control': 'no-cache',
            'X-Accel-Buffering': 'no'
        }
    )


@app.after_request
def after_request(response):
    """添加 CORS 头"""
    response.headers.add('Access-Control-Allow-Origin', '*')
    response.headers.add('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    response.headers.add('Access-Control-Allow-Headers', 'Content-Type')
    return response


if __name__ == '__main__':
    print("=" * 60)
    print("Scrapling HTTP 服务启动")
    print("=" * 60)
    print("API 端点:")
    print("  GET  /api/health          - 健康检查")
    print("  POST /api/scrape/page      - 抓取单页")
    print("  POST /api/scrape/all       - 抓取所有页面")
    print("  POST /api/scrape/stream    - 流式抓取 (SSE)")
    print("=" * 60)

    # 使用 flask 内置服务器
    app.run(
        host='127.0.0.1',
        port=5000,
        debug=True,
        threaded=True
    )
