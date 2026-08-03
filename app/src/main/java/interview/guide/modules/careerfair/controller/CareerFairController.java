package interview.guide.modules.careerfair.controller;

import interview.guide.common.result.Result;
import interview.guide.modules.careerfair.dto.*;
import interview.guide.modules.careerfair.service.CareerFairService;
import interview.guide.modules.careerfair.service.CqbysScraperService;
import interview.guide.modules.careerfair.service.ScrapeTaskService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@Slf4j
@RestController
@RequestMapping("/api/career-fair")
@RequiredArgsConstructor
public class CareerFairController {

    private final CareerFairService careerFairService;
    private final ScrapeTaskService scrapeTaskService;
    private final CqbysScraperService cqbysScraperService;

    @PostMapping("/search")
    public Result<Page<CareerFairDTO>> searchCareerFairs(@RequestBody CareerFairSearchRequest request) {
        Page<CareerFairDTO> page = careerFairService.searchCareerFairs(request);
        return Result.success(page);
    }

    @GetMapping("/upcoming")
    public Result<List<CareerFairDTO>> getUpcomingCareerFairs(
            @RequestParam(defaultValue = "10") int limit) {
        List<CareerFairDTO> list = careerFairService.getUpcomingCareerFairs(limit);
        return Result.success(list);
    }

    @GetMapping("/{id}")
    public Result<CareerFairDTO> getCareerFairById(@PathVariable Long id) {
        CareerFairDTO dto = careerFairService.getCareerFairById(id);
        return Result.success(dto);
    }

    @PostMapping("/scrape")
    public Result<ScrapeResult> scrapeCareerFairs(@RequestParam String url, @RequestParam(required = false) Long taskId) {
        log.info("手动触发抓取任务: url={}, taskId={}", url, taskId);

        Long recordId = null;
        if (taskId != null) {
            recordId = scrapeTaskService.startScrapeRecord(taskId, url).getId();
        }

        try {
            ScrapeResult result = cqbysScraperService.scrapeCareerFairs(url);

            if (result.isSuccess() && result.getTotalCount() > 0) {
            }

            if (recordId != null) {
                scrapeTaskService.completeScrapeRecord(
                        recordId,
                        result.getTotalCount(),
                        result.getTotalCount(),
                        0,
                        result.isSuccess(),
                        result.getErrors() != null ? String.join("; ", result.getErrors()) : null
                );
                scrapeTaskService.updateTaskAfterScrape(taskId, result.isSuccess(), result.getTotalCount(),
                        result.getErrors() != null ? String.join("; ", result.getErrors()) : null);
            }

            return Result.success(result);
        } catch (Exception e) {
            log.error("抓取执行失败", e);
            if (recordId != null) {
                scrapeTaskService.completeScrapeRecord(recordId, 0, 0, 0, false, e.getMessage());
                scrapeTaskService.updateTaskAfterScrape(taskId, false, 0, e.getMessage());
            }
            return Result.error("抓取失败: " + e.getMessage());
        }
    }
}
