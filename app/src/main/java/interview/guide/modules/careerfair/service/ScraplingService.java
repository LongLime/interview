package interview.guide.modules.careerfair.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import interview.guide.modules.careerfair.model.CareerFairEntity;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import java.time.LocalDate;
import java.time.LocalTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.function.BiConsumer;

@Slf4j
@Service
public class ScraplingService {

    @Value("${careerfair.scrapling.api-url:http://127.0.0.1:5000}")
    private String apiUrl;

    private final RestTemplate restTemplate;
    private final ObjectMapper objectMapper;

    public ScraplingService(ObjectMapper objectMapper) {
        this.restTemplate = new RestTemplate();
        this.objectMapper = objectMapper;
    }

    public boolean healthCheck() {
        try {
            String url = apiUrl + "/api/health";
            ResponseEntity<String> response = restTemplate.getForEntity(url, String.class);
            return response.getStatusCode().is2xxSuccessful();
        } catch (Exception e) {
            log.error("Scrapling 服务健康检查失败", e);
            return false;
        }
    }

    public List<CareerFairEntity> scrapeSinglePage(int pageNum, BiConsumer<String, Integer> progressCallback) {
        List<CareerFairEntity> results = new ArrayList<>();

        try {
            if (progressCallback != null) {
                progressCallback.accept("正在连接 Scrapling 服务...", 5);
            }

            String url = pageNum == 1
                    ? "https://www.cqbys.com/teachin?type=offline"
                    : "https://www.cqbys.com/teachin?page=" + pageNum + "&type=offline";

            if (progressCallback != null) {
                progressCallback.accept(String.format("正在抓取第 %d 页...", pageNum), 10);
            }

            String apiEndpoint = apiUrl + "/api/scrape/page";

            Map<String, Object> requestBody = Map.of(
                    "page", pageNum,
                    "url", url
            );

            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);

            HttpEntity<Map<String, Object>> request = new HttpEntity<>(requestBody, headers);

            ResponseEntity<String> response = restTemplate.postForEntity(apiEndpoint, request, String.class);

            if (!response.getStatusCode().is2xxSuccessful()) {
                log.error("Scrapling API 调用失败，状态码: {}", response.getStatusCode());
                return results;
            }

            JsonNode rootNode = objectMapper.readTree(response.getBody());
            JsonNode dataNode = rootNode.get("data");

            if (dataNode != null && dataNode.isArray()) {
                for (JsonNode item : dataNode) {
                    CareerFairEntity entity = parseJsonToEntity(item);
                    if (entity != null) {
                        results.add(entity);
                    }
                }
            }

            if (progressCallback != null) {
                progressCallback.accept(String.format("第 %d 页抓取完成，获取 %d 条数据", pageNum, results.size()), 90);
            }

            log.info("Scrapling 抓取第 {} 页成功，获取 {} 条数据", pageNum, results.size());

        } catch (Exception e) {
            log.error("Scrapling 抓取第 {} 页失败: {}", pageNum, e.getMessage());
        }

        return results;
    }

    public ScrapResult scrapeAllPages(int startPage, int maxPages, BiConsumer<String, Integer> progressCallback) {
        List<CareerFairEntity> allResults = new ArrayList<>();
        List<String> errors = new ArrayList<>();

        AtomicBoolean success = new AtomicBoolean(true);
        AtomicInteger totalCount = new AtomicInteger(0);

        try {
            for (int pageNum = startPage; pageNum <= maxPages; pageNum++) {
                int progress = 10 + (int) ((pageNum - startPage) * 80.0 / (maxPages - startPage + 1));

                if (progressCallback != null) {
                    progressCallback.accept(String.format("正在抓取第 %d/%d 页，已获取 %d 条数据...",
                            pageNum, maxPages, allResults.size()), progress);
                }

                List<CareerFairEntity> pageResults = scrapeSinglePage(pageNum, null);

                if (pageResults.isEmpty()) {
                    log.info("第 {} 页无数据，停止抓取", pageNum);
                    break;
                }

                allResults.addAll(pageResults);
                totalCount.addAndGet(pageResults.size());

                // 短暂延迟，避免请求过快
                Thread.sleep(1000);
            }

            if (progressCallback != null) {
                progressCallback.accept("正在保存数据...", 95);
            }

        } catch (Exception e) {
            log.error("批量抓取失败", e);
            errors.add(e.getMessage());
            success.set(false);
        }

        return new ScrapResult(
                success.get(),
                allResults,
                totalCount.get(),
                errors
        );
    }

    private CareerFairEntity parseJsonToEntity(JsonNode node) {
        try {
            CareerFairEntity entity = new CareerFairEntity();

            if (node.has("externalId")) {
                entity.setExternalId(node.get("externalId").asText());
            }

            if (node.has("companyName")) {
                entity.setCompanyName(node.get("companyName").asText());
            }

            if (node.has("sourceUrl")) {
                entity.setSourceUrl(node.get("sourceUrl").asText());
            }

            if (node.has("universityName")) {
                entity.setUniversityName(node.get("universityName").asText());
            }

            if (node.has("venue")) {
                entity.setVenue(node.get("venue").asText());
            }

            if (node.has("fairType")) {
                entity.setFairType(node.get("fairType").asText());
            } else {
                entity.setFairType("offline");
            }

            if (node.has("isActive")) {
                entity.setIsActive(node.get("isActive").asBoolean());
            } else {
                entity.setIsActive(true);
            }

            // 解析日期和时间
            DateTimeFormatter dateFormatter = DateTimeFormatter.ofPattern("yyyy-MM-dd");
            DateTimeFormatter timeFormatter = DateTimeFormatter.ofPattern("HH:mm");

            if (node.has("fairDate") && !node.get("fairDate").isNull()) {
                try {
                    entity.setFairDate(LocalDate.parse(node.get("fairDate").asText(), dateFormatter));
                } catch (Exception e) {
                    log.debug("解析日期失败: {}", node.get("fairDate").asText());
                }
            }

            if (node.has("startTime") && !node.get("startTime").isNull()) {
                try {
                    entity.setStartTime(LocalTime.parse(node.get("startTime").asText(), timeFormatter));
                } catch (Exception e) {
                    log.debug("解析开始时间失败: {}", node.get("startTime").asText());
                }
            }

            if (node.has("endTime") && !node.get("endTime").isNull()) {
                try {
                    entity.setEndTime(LocalTime.parse(node.get("endTime").asText(), timeFormatter));
                } catch (Exception e) {
                    log.debug("解析结束时间失败: {}", node.get("endTime").asText());
                }
            }

            return entity;

        } catch (Exception e) {
            log.error("解析 JSON 数据失败: {}", e.getMessage());
            return null;
        }
    }

    public record ScrapResult(
            boolean success,
            List<CareerFairEntity> data,
            int totalCount,
            List<String> errors
    ) {}
}
