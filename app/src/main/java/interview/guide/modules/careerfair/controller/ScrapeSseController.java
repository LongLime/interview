package interview.guide.modules.careerfair.controller;

import interview.guide.modules.careerfair.dto.ScrapeResult;
import interview.guide.modules.careerfair.model.CareerFairEntity;
import interview.guide.modules.careerfair.model.ScrapeRecordEntity;
import interview.guide.modules.careerfair.model.ScrapeTaskEntity;
import interview.guide.modules.careerfair.repository.CareerFairRepository;
import interview.guide.modules.careerfair.repository.ScrapeTaskRepository;
import interview.guide.modules.careerfair.service.ScraplingService;
import interview.guide.modules.careerfair.service.ScrapeTaskService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;
import java.util.List;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;

@Slf4j
@RestController
@RequestMapping("/api/scrape-sse")
@RequiredArgsConstructor
public class ScrapeSseController {

    private final ScraplingService scraplingService;
    private final ScrapeTaskService scrapeTaskService;
    private final CareerFairRepository careerFairRepository;
    private final ScrapeTaskRepository scrapeTaskRepository;

    private static final long SSE_TIMEOUT = 30 * 60 * 1000L;
    private final ConcurrentHashMap<Long, SseEmitter> emitters = new ConcurrentHashMap<>();

    @GetMapping(value = "/stream/{taskId}", produces = "text/event-stream")
    public SseEmitter createEmitter(@PathVariable Long taskId) {
        SseEmitter emitter = new SseEmitter(SSE_TIMEOUT);
        emitters.put(taskId, emitter);

        emitter.onCompletion(() -> {
            log.info("SSE connection completed for task: {}", taskId);
            emitters.remove(taskId);
        });
        emitter.onTimeout(() -> {
            log.info("SSE connection timed out for task: {}", taskId);
            emitters.remove(taskId);
        });
        emitter.onError(e -> {
            log.error("SSE error for task {}: {}", taskId, e.getMessage());
            emitters.remove(taskId);
        });

        try {
            emitter.send(SseEmitter.event()
                    .name("connected")
                    .data("{\"status\":\"connected\",\"taskId\":" + taskId + "}"));
        } catch (IOException e) {
            log.error("Failed to send initial SSE event", e);
        }

        return emitter;
    }

    @PostMapping("/execute/{taskId}")
    public ScrapeResult executeWithProgress(@PathVariable Long taskId) {
        ScrapeTaskEntity task = scrapeTaskRepository.findById(taskId)
                .orElseThrow(() -> new RuntimeException("任务不存在"));

        SseEmitter emitter = emitters.get(taskId);

        AtomicBoolean success = new AtomicBoolean(false);
        AtomicInteger totalCount = new AtomicInteger(0);
        AtomicInteger newCount = new AtomicInteger(0);
        AtomicInteger updateCount = new AtomicInteger(0);
        AtomicInteger currentPage = new AtomicInteger(1);
        CopyOnWriteArrayList<String> errors = new CopyOnWriteArrayList<>();

        Long recordId = scrapeTaskService.startScrapeRecord(taskId, task.getSourceUrl()).getId();

        sendProgress(emitter, "started", "开始抓取数据...", 0, 0, 0);

        try {
            List<CareerFairEntity> allCareerFairs = new CopyOnWriteArrayList<>();

            sendProgress(emitter, "scraping", "正在连接 Scrapling 服务...", 5, 0, 0);

            int page = 1;
            boolean hasMore = true;
            int totalPages = 0;
            int maxPages = 750;

            while (hasMore && page <= maxPages) {
                log.info("Scrapling 抓取第 {} 页", page);

                int progress = 10 + (int) ((page - 1) * 80.0 / maxPages);
                sendProgress(emitter, "scraping", String.format("正在抓取第 %d/%d 页，已获取 %d 条数据...", page, maxPages, allCareerFairs.size()), progress, page, allCareerFairs.size());

                try {
                    int finalPage = page;
                    List<CareerFairEntity> pageResults = scraplingService.scrapeSinglePage(page,
                            (msg, prog) -> sendProgress(emitter, "scraping", msg, progress + (int)(prog * 0.3), finalPage, allCareerFairs.size()));

                    if (pageResults.isEmpty()) {
                        hasMore = false;
                    } else {
                        allCareerFairs.addAll(pageResults);
                        page++;
                        totalPages++;

                        if (pageResults.size() < 10) {
                            hasMore = false;
                        }
                    }

                    Thread.sleep(1000);

                } catch (Exception e) {
                    log.error("抓取页面失败", e);
                    errors.add("第" + page + "页抓取失败: " + e.getMessage());
                    sendProgress(emitter, "error", "第 " + page + " 页抓取失败，继续下一页...", progress, page, allCareerFairs.size());
                    page++;
                }
            }

            sendProgress(emitter, "saving", "正在保存数据...", 90, totalPages, allCareerFairs.size());

            int savedNew = 0;
            int savedUpdate = 0;
            int skippedExisting = 0;

            for (CareerFairEntity entity : allCareerFairs) {
                try {
                    CareerFairEntity existing = careerFairRepository.findByExternalId(entity.getExternalId()).orElse(null);
                    if (existing == null) {
                        careerFairRepository.save(entity);
                        savedNew++;
                    } else {
                        skippedExisting++;
                    }
                } catch (Exception e) {
                    log.error("保存数据失败: {}", e.getMessage());
                }
            }

            totalCount.set(allCareerFairs.size());
            newCount.set(savedNew);
            updateCount.set(savedUpdate);
            success.set(true);

            scrapeTaskService.completeScrapeRecord(recordId, totalCount.get(), newCount.get(), updateCount.get(), true, null);
            scrapeTaskService.updateTaskAfterScrape(taskId, true, totalCount.get(), null);

            sendProgress(emitter, "completed",
                    String.format("抓取完成！共抓取 %d 条，新增 %d 条（%d 条已存在跳过）", totalCount.get(), savedNew, skippedExisting),
                    100, totalPages, totalCount.get());

            log.info("任务执行完成: taskId={}, total={}, new={}, skipped={}", taskId, totalCount.get(), savedNew, skippedExisting);

        } catch (Exception e) {
            log.error("抓取过程发生错误", e);
            errors.add(e.getMessage());
            success.set(false);
            scrapeTaskService.completeScrapeRecord(recordId, 0, 0, 0, false, e.getMessage());
            scrapeTaskService.updateTaskAfterScrape(taskId, false, 0, e.getMessage());
            sendProgress(emitter, "failed", "抓取失败: " + e.getMessage(), 0, 0, 0);
        } finally {
            try {
                Thread.sleep(2000);
            } catch (InterruptedException ignored) {}
            emitters.remove(taskId);
        }

        ScrapeResult result = new ScrapeResult();
        result.setSuccess(success.get());
        result.setTotalCount(totalCount.get());
        result.setNewCount(newCount.get());
        result.setUpdateCount(updateCount.get());
        result.setMessage(success.get()
                ? String.format("成功抓取 %d 条宣讲会信息，新增 %d 条，更新 %d 条", totalCount.get(), newCount.get(), updateCount.get())
                : "抓取失败");
        result.setErrors(errors);
        return result;
    }

    private void sendProgress(SseEmitter emitter, String status, String message, int progress, int page, int count) {
        if (emitter != null) {
            try {
                String data = String.format(
                        "{\"status\":\"%s\",\"message\":\"%s\",\"progress\":%d,\"page\":%d,\"count\":%d}",
                        status, message.replace("\"", "'"), progress, page, count);
                emitter.send(SseEmitter.event().name("progress").data(data));
            } catch (IOException e) {
                log.error("Failed to send SSE progress event", e);
                emitters.remove(emitter);
            }
        }
    }
}
