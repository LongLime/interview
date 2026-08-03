package interview.guide.modules.careerfair.scheduler;

import interview.guide.modules.careerfair.dto.ScrapeResult;
import interview.guide.modules.careerfair.model.ScrapeTaskEntity;
import interview.guide.modules.careerfair.model.ScrapeTaskStatus;
import interview.guide.modules.careerfair.repository.ScrapeTaskRepository;
import interview.guide.modules.careerfair.service.CqbysScraperService;
import interview.guide.modules.careerfair.service.ScrapeTaskService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.util.List;

@Slf4j
@Component
@RequiredArgsConstructor
public class CareerFairScrapeScheduler {

    private final ScrapeTaskRepository scrapeTaskRepository;
    private final ScrapeTaskService scrapeTaskService;
    private final CqbysScraperService cqbysScraperService;

    @Scheduled(cron = "0 0 2 * * ?")
    public void scheduledScrape() {
        log.info("开始定时抓取宣讲会数据...");

        List<ScrapeTaskEntity> enabledTasks = scrapeTaskRepository.findByIsEnabledTrue();
        log.info("找到 {} 个启用的抓取任务", enabledTasks.size());

        for (ScrapeTaskEntity task : enabledTasks) {
            executeTask(task);
        }

        log.info("定时抓取任务完成");
    }

    private void executeTask(ScrapeTaskEntity task) {
        log.info("执行任务: {} - {}", task.getTaskName(), task.getSourceUrl());

        Long recordId = scrapeTaskService.startScrapeRecord(task.getId(), task.getSourceUrl()).getId();

        try {
            ScrapeResult result = cqbysScraperService.scrapeCareerFairs(task.getSourceUrl());

            scrapeTaskService.completeScrapeRecord(
                    recordId,
                    result.getTotalCount(),
                    result.getTotalCount(),
                    0,
                    result.isSuccess(),
                    result.getErrors() != null ? String.join("; ", result.getErrors()) : null
            );
            scrapeTaskService.updateTaskAfterScrape(
                    task.getId(),
                    result.isSuccess(),
                    result.getTotalCount(),
                    result.getErrors() != null ? String.join("; ", result.getErrors()) : null
            );

            log.info("任务执行完成: {}, 结果: {}", task.getTaskName(), result.getMessage());

        } catch (Exception e) {
            log.error("任务执行失败: {}", task.getTaskName(), e);
            scrapeTaskService.completeScrapeRecord(recordId, 0, 0, 0, false, e.getMessage());
            scrapeTaskService.updateTaskAfterScrape(task.getId(), false, 0, e.getMessage());
        }
    }
}
