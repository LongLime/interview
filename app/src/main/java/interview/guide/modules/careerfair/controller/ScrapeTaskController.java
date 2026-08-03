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
@RequestMapping("/api/scrape-task")
@RequiredArgsConstructor
public class ScrapeTaskController {

    private final ScrapeTaskService scrapeTaskService;
    private final CareerFairService careerFairService;
    private final CqbysScraperService cqbysScraperService;

    @GetMapping
    public Result<List<ScrapeTaskDTO>> getAllTasks() {
        List<ScrapeTaskDTO> tasks = scrapeTaskService.getAllTasks();
        return Result.success(tasks);
    }

    @GetMapping("/{id}")
    public Result<ScrapeTaskDTO> getTaskById(@PathVariable Long id) {
        ScrapeTaskDTO task = scrapeTaskService.getTaskById(id);
        return Result.success(task);
    }

    @PostMapping
    public Result<ScrapeTaskDTO> createTask(@RequestBody ScrapeTaskCreateRequest request) {
        ScrapeTaskDTO task = scrapeTaskService.createTask(request);
        return Result.success(task);
    }

    @PutMapping("/{id}")
    public Result<ScrapeTaskDTO> updateTask(@PathVariable Long id, @RequestBody ScrapeTaskCreateRequest request) {
        ScrapeTaskDTO task = scrapeTaskService.updateTask(id, request);
        return Result.success(task);
    }

    @DeleteMapping("/{id}")
    public Result<Void> deleteTask(@PathVariable Long id) {
        scrapeTaskService.deleteTask(id);
        return Result.success();
    }

    @PostMapping("/{id}/toggle")
    public Result<ScrapeTaskDTO> toggleTaskStatus(@PathVariable Long id) {
        ScrapeTaskDTO task = scrapeTaskService.toggleTaskStatus(id);
        return Result.success(task);
    }

    @PostMapping("/{id}/execute")
    public Result<ScrapeResult> executeTask(@PathVariable Long id) {
        ScrapeTaskDTO task = scrapeTaskService.getTaskById(id);
        log.info("手动执行任务: taskId={}, url={}", id, task.getSourceUrl());

        Long recordId = scrapeTaskService.startScrapeRecord(id, task.getSourceUrl()).getId();

        try {
            ScrapeResult result = cqbysScraperService.scrapeCareerFairs(task.getSourceUrl());

            if (result.isSuccess() && result.getTotalCount() > 0) {
            }

            scrapeTaskService.completeScrapeRecord(
                    recordId,
                    result.getTotalCount(),
                    result.getTotalCount(),
                    0,
                    result.isSuccess(),
                    result.getErrors() != null ? String.join("; ", result.getErrors()) : null
            );
            scrapeTaskService.updateTaskAfterScrape(id, result.isSuccess(), result.getTotalCount(),
                    result.getErrors() != null ? String.join("; ", result.getErrors()) : null);

            return Result.success(result);
        } catch (Exception e) {
            log.error("任务执行失败", e);
            scrapeTaskService.completeScrapeRecord(recordId, 0, 0, 0, false, e.getMessage());
            scrapeTaskService.updateTaskAfterScrape(id, false, 0, e.getMessage());
            return Result.error("执行失败: " + e.getMessage());
        }
    }

    @GetMapping("/{id}/records")
    public Result<Page<ScrapeRecordDTO>> getTaskRecords(
            @PathVariable Long id,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        Page<ScrapeRecordDTO> records = scrapeTaskService.getScrapeRecords(id, page, size);
        return Result.success(records);
    }

    @GetMapping("/records")
    public Result<Page<ScrapeRecordDTO>> getAllRecords(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        Page<ScrapeRecordDTO> records = scrapeTaskService.getScrapeRecords(null, page, size);
        return Result.success(records);
    }

    @GetMapping("/records/recent")
    public Result<List<ScrapeRecordDTO>> getRecentRecords(
            @RequestParam(defaultValue = "10") int limit) {
        List<ScrapeRecordDTO> records = scrapeTaskService.getRecentScrapeRecords(limit);
        return Result.success(records);
    }
}
