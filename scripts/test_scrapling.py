#!/usr/bin/env python3
"""
快速测试脚本 - 测试 Scrapling 抓取功能
"""

import sys
import os

# 添加当前目录到路径
sys.path.insert(0, os.path.dirname(__file__))

from scrap_cqbys import parse_career_fair_page
import json


def test_single_page():
    """测试单页抓取"""
    print("=" * 60)
    print("测试 Scrapling 单页抓取")
    print("=" * 60)

    url = "https://www.cqbys.com/teachin?type=offline"

    print(f"\n正在抓取: {url}\n")

    result = parse_career_fair_page(url)

    if result['success']:
        print(f"✓ 抓取成功！获取 {result['count']} 条数据\n")

        # 显示前3条数据
        if result['data']:
            print("前 3 条数据示例:")
            print("-" * 60)
            for i, item in enumerate(result['data'][:3], 1):
                print(f"\n{i}. {item['companyName']}")
                print(f"   高校: {item['universityName']}")
                print(f"   地点: {item['venue']}")
                print(f"   时间: {item['fairDate']} {item.get('startTime', '')}")

                if i >= 3:
                    break

            if len(result['data']) > 3:
                print(f"\n... 还有 {len(result['data']) - 3} 条数据")

            print("\n" + "=" * 60)
            print(f"总数据量: {result['count']} 条")
            print("=" * 60)

            return True
    else:
        print(f"✗ 抓取失败: {result.get('error', '未知错误')}")
        return False


def test_health_check():
    """测试健康检查"""
    try:
        from flask import Flask
        from scrapling_server import app

        with app.test_client() as client:
            response = client.get('/api/health')
            if response.status_code == 200:
                data = json.loads(response.data)
                print(f"✓ 健康检查成功: {data}")
                return True
            else:
                print(f"✗ 健康检查失败: {response.status_code}")
                return False
    except Exception as e:
        print(f"✗ 健康检查失败: {e}")
        return False


if __name__ == '__main__':
    print("\n" + "=" * 60)
    print("Scrapling 功能测试")
    print("=" * 60 + "\n")

    # 测试1: 健康检查
    print("[1/2] 测试 HTTP 服务健康检查...")
    if test_health_check():
        print("✓ HTTP 服务正常\n")
    else:
        print("⚠ HTTP 服务可能未启动（这是正常的，如果只测试抓取功能）\n")

    # 测试2: 单页抓取
    print("[2/2] 测试单页抓取...")
    if test_single_page():
        print("\n✓ 所有测试通过！")
        sys.exit(0)
    else:
        print("\n✗ 测试失败")
        sys.exit(1)
