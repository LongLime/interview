#!/usr/bin/env python3
"""
重庆高校就业信息网爬虫 - 使用 Scrapling
"""

from scrapling.fetchers import StealthyFetcher
import json
import sys
import re
from datetime import datetime

BASE_URL = "https://www.cqbys.com/teachin"


def parse_career_fair_page(url):
    """
    使用 Scrapling 抓取单页宣讲会数据

    Args:
        url: 页面URL

    Returns:
        dict: 包含状态和数据的结果
    """
    results = []

    try:
        print(f"正在抓取: {url}", file=sys.stderr)

        # 使用 StealthyFetcher 绕过反爬虫机制，自动处理 JavaScript 渲染
        page = StealthyFetcher.fetch(
            url,
            headless=True,        # 无头模式
            network_idle=True      # 等待网络空闲
        )

        # 等待表格加载
        page.wait_for_selector('table tbody tr', timeout=10000)

        # 使用 CSS 选择器抓取所有表格行
        rows = page.css('table tbody tr')

        print(f"找到 {len(rows)} 行数据", file=sys.stderr)

        for idx, row in enumerate(rows):
            try:
                cells = row.css('td')

                if len(cells) < 4:
                    continue

                # 解析各列数据
                company_cell = cells[0]
                university_cell = cells[1]
                venue_cell = cells[2]
                time_cell = cells[3]

                # 提取公司名称
                company_text = company_cell.text_content(strip=True)

                # 提取详情链接
                link = company_cell.css_first('a[href*="/teachin/view/id/"]', default=None)
                if link:
                    href = link.get_attribute('href')
                    detail_url = href if href.startswith('http') else f"https://www.cqbys.com{href}"

                    # 提取外部ID
                    id_match = re.search(r'/view/id/(\d+)', href)
                    external_id = f"cqbys_{id_match.group(1)}" if id_match else f"cqbys_{href}"
                else:
                    detail_url = ""
                    external_id = f"cqbys_{company_text}"

                # 提取高校名称
                university = university_cell.text_content(strip=True)

                # 提取宣讲地点
                venue = venue_cell.text_content(strip=True)

                # 提取时间信息
                time_text = time_cell.text_content(strip=True)

                # 解析日期和时间
                fair_date = None
                start_time = None
                end_time = None

                time_pattern = re.search(
                    r'(\d{4}-\d{2}-\d{2})\s*(\d{2}:\d{2})?-?(\d{2}:\d{2})?',
                    time_text
                )

                if time_pattern:
                    fair_date = time_pattern.group(1)
                    if time_pattern.group(2):
                        start_time = time_pattern.group(2)
                    if time_pattern.group(3):
                        end_time = time_pattern.group(3)

                result = {
                    'externalId': external_id,
                    'companyName': company_text,
                    'sourceUrl': detail_url,
                    'universityName': university,
                    'venue': venue,
                    'fairDate': fair_date,
                    'startTime': start_time,
                    'endTime': end_time,
                    'fairType': 'offline',
                    'isActive': True
                }

                results.append(result)

            except Exception as e:
                print(f"解析第 {idx} 行失败: {e}", file=sys.stderr)
                continue

        return {
            'success': True,
            'data': results,
            'count': len(results)
        }

    except Exception as e:
        print(f"抓取失败: {e}", file=sys.stderr)
        return {
            'success': False,
            'error': str(e),
            'data': [],
            'count': 0
        }


def scrape_all_pages(start_page=1, max_pages=750):
    """
    抓取所有页面的数据

    Args:
        start_page: 起始页码
        max_pages: 最大页数

    Returns:
        dict: 包含所有页面的数据
    """
    all_results = []
    errors = []

    for page_num in range(start_page, max_pages + 1):
        if page_num == 1:
            url = f"{BASE_URL}?type=offline"
        else:
            url = f"{BASE_URL}?page={page_num}&type=offline"

        print(f"\n{'='*60}", file=sys.stderr)
        print(f"正在抓取第 {page_num} 页", file=sys.stderr)
        print(f"URL: {url}", file=sys.stderr)

        result = parse_career_fair_page(url)

        if result['success']:
            data = result['data']
            if not data:
                print(f"第 {page_num} 页无数据，停止抓取", file=sys.stderr)
                break

            all_results.extend(data)
            print(f"第 {page_num} 页抓取成功，获取 {len(data)} 条数据", file=sys.stderr)
            print(f"累计: {len(all_results)} 条", file=sys.stderr)
        else:
            errors.append({
                'page': page_num,
                'error': result.get('error', '未知错误')
            })
            print(f"第 {page_num} 页抓取失败: {result.get('error')}", file=sys.stderr)

    return {
        'success': len(errors) == 0,
        'data': all_results,
        'total': len(all_results),
        'errors': errors,
        'timestamp': datetime.now().isoformat()
    }


if __name__ == '__main__':
    import argparse

    parser = argparse.ArgumentParser(description='重庆高校就业信息网爬虫')
    parser.add_argument('--page', type=int, default=1, help='起始页码')
    parser.add_argument('--max-pages', type=int, default=750, help='最大页数')
    parser.add_argument('--output', type=str, help='输出文件路径')
    parser.add_argument('--format', choices=['json', 'text'], default='json',
                       help='输出格式')

    args = parser.parse_args()

    # 抓取数据
    result = scrape_all_pages(args.page, args.max_pages)

    # 输出结果
    if args.format == 'json':
        print(json.dumps(result, ensure_ascii=False, indent=2))
    else:
        for item in result['data']:
            print(f"{item['companyName']} - {item['universityName']} - {item['fairDate']}")

    # 保存到文件（如果指定）
    if args.output:
        with open(args.output, 'w', encoding='utf-8') as f:
            if args.format == 'json':
                json.dump(result, f, ensure_ascii=False, indent=2)
            else:
                for item in result['data']:
                    f.write(f"{item['companyName']} - {item['universityName']} - {item['fairDate']}\n")
        print(f"\n结果已保存到: {args.output}", file=sys.stderr)
