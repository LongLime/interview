package interview.guide.modules.careerfair.service;

import interview.guide.modules.careerfair.dto.ScrapeResult;
import interview.guide.modules.careerfair.model.CareerFairEntity;
import lombok.extern.slf4j.Slf4j;
import org.jsoup.Jsoup;
import org.jsoup.nodes.Document;
import org.jsoup.nodes.Element;
import org.jsoup.select.Elements;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Slf4j
@Service
public class CqbysScraperService {

    private static final String USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
    private static final int TIMEOUT_MS = 30000;
    private static final DateTimeFormatter DATE_FORMATTER = DateTimeFormatter.ofPattern("yyyy-MM-dd");
    private static final Pattern TIME_PATTERN = Pattern.compile("(\\d{4}-\\d{2}-\\d{2})\\s*(\\d{2}:\\d{2})?-?(\\d{2}:\\d{2})?");
    private static final Pattern COMPANY_PATTERN = Pattern.compile("现场(.+)");
    private static final Pattern DETAIL_ID_PATTERN = Pattern.compile("/view/id/(\\d+)");

    public ScrapeResult scrapeCareerFairs(String baseUrl) {
        ScrapeResult result = new ScrapeResult();
        List<String> errors = new ArrayList<>();
        List<CareerFairEntity> allEntities = new ArrayList<>();

        try {
            int page = 1;
            boolean hasMore = true;
            int maxPages = 750;

            while (hasMore && page <= maxPages) {
                String pageUrl = buildPageUrl(page);
                log.info("开始抓取第 {} 页: {}", page, pageUrl);

                try {
                    List<CareerFairEntity> pageEntities = scrapeSinglePage(pageUrl, page);

                    if (pageEntities.isEmpty()) {
                        hasMore = false;
                    } else {
                        allEntities.addAll(pageEntities);
                        log.info("第 {} 页抓取成功，获取 {} 条数据", page, pageEntities.size());
                        page++;

                        if (pageEntities.size() < 10) {
                            hasMore = false;
                        }
                    }

                    Thread.sleep(800);

                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                    break;
                } catch (Exception e) {
                    log.error("抓取页面失败: {}", pageUrl, e);
                    errors.add("第" + page + "页抓取失败: " + e.getMessage());
                    page++;
                }
            }

            result.setSuccess(true);
            result.setTotalCount(allEntities.size());
            result.setMessage(String.format("成功抓取 %d 条宣讲会信息", allEntities.size()));

            if (!errors.isEmpty()) {
                result.setErrors(errors);
            }

        } catch (Exception e) {
            log.error("抓取过程发生错误", e);
            result.setSuccess(false);
            result.setMessage("抓取失败: " + e.getMessage());
            errors.add(e.getMessage());
            result.setErrors(errors);
        }

        return result;
    }

    public String buildPageUrl(int page) {
        if (page == 1) {
            return "https://www.cqbys.com/teachin/index?type=offline";
        }
        return "https://www.cqbys.com/teachin/index?page=" + page + "&type=offline";
    }

    public List<CareerFairEntity> scrapeSinglePage(String pageUrl, int pageNum) {
        List<CareerFairEntity> results = new ArrayList<>();

        try {
            Document doc = Jsoup.connect(pageUrl)
                    .userAgent(USER_AGENT)
                    .timeout(TIMEOUT_MS)
                    .header("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8")
                    .header("Accept-Language", "zh-CN,zh;q=0.9,en;q=0.8")
                    .get();

            log.debug("页面标题: {}", doc.title());
            log.debug("页面长度: {}", doc.body().text().length());

            Elements rows = doc.select("table tbody tr");

            log.info("找到表格行: {} 行", rows.size());

            if (rows.isEmpty()) {
                log.info("第一个选择器没找到，尝试其他选择器...");
                rows = doc.select("table tr");
                log.info("使用 table tr，找到: {} 行", rows.size());
            }

            if (rows.isEmpty()) {
                rows = doc.select("tr");
                log.info("使用通用tr选择器，找到: {} 行", rows.size());
            }

            if (rows.isEmpty()) {
                Elements tables = doc.select("table");
                log.info("找到表格: {} 个", tables.size());
                for (Element table : tables) {
                    Elements tableRows = table.select("tr");
                    log.info("表格内tr行数: {}", tableRows.size());
                    rows.addAll(tableRows);
                }
            }

            if (rows.isEmpty()) {
                Elements links = doc.select("a[href*='/teachin/view/id/']");
                log.info("找到详情链接: {} 个", links.size());

                for (Element link : links) {
                    CareerFairEntity entity = parseFromLink(link, doc);
                    if (entity != null) {
                        results.add(entity);
                    }
                }
            }

            for (Element row : rows) {
                try {
                    CareerFairEntity entity = parseTableRow(row);
                    if (entity != null && entity.getExternalId() != null) {
                        results.add(entity);
                    }
                } catch (Exception e) {
                    log.warn("解析表格行失败", e);
                }
            }

            if (results.isEmpty() && !rows.isEmpty()) {
                log.info("行不为空但解析失败，尝试打印前3行:");
                int count = 0;
                for (Element row : rows) {
                    if (count++ >= 3) break;
                    Elements cells = row.select("td");
                    log.info("第{}行: td数量={}, text={}", count, cells.size(),
                        row.text().length() > 100 ? row.text().substring(0, 100) + "..." : row.text());
                }
            }

            log.info("第 {} 页解析完成，共 {} 条数据", pageNum, results.size());

        } catch (IOException e) {
            log.error("抓取页面失败: {}", pageUrl, e);
        }

        return results;
    }

    private CareerFairEntity parseFromLink(Element link, Document doc) {
        CareerFairEntity entity = new CareerFairEntity();

        String href = link.attr("href");
        if (!href.startsWith("http")) {
            href = "https://www.cqbys.com" + href;
        }
        entity.setSourceUrl(href);

        Matcher idMatcher = DETAIL_ID_PATTERN.matcher(href);
        if (idMatcher.find()) {
            entity.setExternalId("cqbys_" + idMatcher.group(1));
        } else {
            entity.setExternalId("cqbys_" + href.hashCode());
        }

        Element parent = link.parent();
        Element container = parent != null ? parent.parent() : null;

        if (container != null) {
            Element titleCell = container.selectFirst("td:first-child, .title-cell, .name-cell");
            if (titleCell != null) {
                String text = titleCell.text().trim();
                Matcher m = COMPANY_PATTERN.matcher(text);
                if (m.find()) {
                    entity.setCompanyName(m.group(1).trim());
                } else {
                    entity.setCompanyName(text);
                }
            }

            Elements cells = container.select("td");
            if (cells.size() >= 2) {
                entity.setUniversityName(cells.get(1).text().trim());
            }
            if (cells.size() >= 3) {
                entity.setVenue(cells.get(2).text().trim());
            }
            if (cells.size() >= 4) {
                parseDateTime(cells.get(3).text().trim(), entity);
            }
        }

        entity.setFairType("offline");
        entity.setIsActive(true);

        return entity;
    }

    private CareerFairEntity parseTableRow(Element row) {
        Elements cells = row.select("td");

        if (cells.size() < 4) {
            String text = row.text();
            if (text.contains("现场") || text.contains("宣讲")) {
                log.debug("行文本: {}", text.substring(0, Math.min(100, text.length())));
            }
            return null;
        }

        CareerFairEntity entity = new CareerFairEntity();

        Element companyCell = cells.get(0);
        Element schoolCell = cells.get(1);
        Element venueCell = cells.get(2);
        Element timeCell = cells.get(3);

        String companyText = companyCell.text().trim();
        Matcher companyMatcher = COMPANY_PATTERN.matcher(companyText);
        if (companyMatcher.find()) {
            entity.setCompanyName(companyMatcher.group(1).trim());
        } else {
            entity.setCompanyName(companyText);
        }

        Element companyLink = companyCell.selectFirst("a[href*='/teachin/view/id/']");
        if (companyLink == null) {
            companyLink = companyCell.selectFirst("a");
        }
        if (companyLink != null) {
            String href = companyLink.attr("href");
            String detailUrl = href.startsWith("http") ? href : "https://www.cqbys.com" + href;
            entity.setSourceUrl(detailUrl);

            Matcher idMatcher = DETAIL_ID_PATTERN.matcher(href);
            if (idMatcher.find()) {
                entity.setExternalId("cqbys_" + idMatcher.group(1));
            } else {
                entity.setExternalId("cqbys_" + href.hashCode());
            }
        } else {
            entity.setExternalId("cqbys_" + companyText.hashCode());
        }

        entity.setUniversityName(schoolCell.text().trim());
        entity.setVenue(venueCell.text().trim());

        String timeText = timeCell.text().trim();
        parseDateTime(timeText, entity);

        entity.setFairType("offline");
        entity.setIsActive(true);

        return entity;
    }

    private void parseDateTime(String dateTimeStr, CareerFairEntity entity) {
        try {
            Matcher matcher = TIME_PATTERN.matcher(dateTimeStr);
            if (matcher.find()) {
                String dateStr = matcher.group(1);
                entity.setFairDate(LocalDate.parse(dateStr, DATE_FORMATTER));

                String startTimeStr = matcher.group(2);
                if (startTimeStr != null && !startTimeStr.isEmpty()) {
                    entity.setStartTime(LocalTime.parse(startTimeStr));
                }

                String endTimeStr = matcher.group(3);
                if (endTimeStr != null && !endTimeStr.isEmpty()) {
                    entity.setEndTime(LocalTime.parse(endTimeStr));
                }
            }
        } catch (Exception e) {
            log.warn("解析日期时间失败: {}", dateTimeStr);
        }
    }
}
