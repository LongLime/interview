package interview.guide.modules.careerfair.service;

import interview.guide.modules.careerfair.dto.*;
import interview.guide.modules.careerfair.model.ScrapeRecordEntity;
import interview.guide.modules.careerfair.model.ScrapeRecordStatus;
import interview.guide.modules.careerfair.model.ScrapeTaskEntity;
import interview.guide.modules.careerfair.model.ScrapeTaskStatus;
import interview.guide.modules.careerfair.repository.ScrapeRecordRepository;
import interview.guide.modules.careerfair.repository.ScrapeTaskRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
public class ScrapeTaskService {

    private final ScrapeTaskRepository scrapeTaskRepository;
    private final ScrapeRecordRepository scrapeRecordRepository;

    @Transactional(readOnly = true)
    public List<ScrapeTaskDTO> getAllTasks() {
        return scrapeTaskRepository.findAll().stream()
                .map(this::convertToDTO)
                .collect(Collectors.toList());
    }

    @Transactional(readOnly = true)
    public ScrapeTaskDTO getTaskById(Long id) {
        ScrapeTaskEntity entity = scrapeTaskRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("抓取任务不存在"));
        return convertToDTO(entity);
    }

    @Transactional
    public ScrapeTaskDTO createTask(ScrapeTaskCreateRequest request) {
        ScrapeTaskEntity entity = new ScrapeTaskEntity();
        entity.setTaskName(request.getTaskName());
        entity.setSourceUrl(request.getSourceUrl());
        entity.setDescription(request.getDescription());
        entity.setCronExpression(request.getCronExpression());
        entity.setIsEnabled(true);
        entity.setStatus(ScrapeTaskStatus.IDLE);

        ScrapeTaskEntity saved = scrapeTaskRepository.save(entity);
        return convertToDTO(saved);
    }

    @Transactional
    public ScrapeTaskDTO updateTask(Long id, ScrapeTaskCreateRequest request) {
        ScrapeTaskEntity entity = scrapeTaskRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("抓取任务不存在"));

        entity.setTaskName(request.getTaskName());
        entity.setSourceUrl(request.getSourceUrl());
        entity.setDescription(request.getDescription());
        entity.setCronExpression(request.getCronExpression());

        ScrapeTaskEntity saved = scrapeTaskRepository.save(entity);
        return convertToDTO(saved);
    }

    @Transactional
    public void deleteTask(Long id) {
        scrapeTaskRepository.deleteById(id);
    }

    @Transactional
    public ScrapeTaskDTO toggleTaskStatus(Long id) {
        ScrapeTaskEntity entity = scrapeTaskRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("抓取任务不存在"));
        entity.setIsEnabled(!entity.getIsEnabled());
        if (!entity.getIsEnabled()) {
            entity.setStatus(ScrapeTaskStatus.DISABLED);
        } else {
            entity.setStatus(ScrapeTaskStatus.IDLE);
        }
        ScrapeTaskEntity saved = scrapeTaskRepository.save(entity);
        return convertToDTO(saved);
    }

    @Transactional
    public ScrapeRecordEntity startScrapeRecord(Long taskId, String sourceUrl) {
        ScrapeRecordEntity record = new ScrapeRecordEntity();
        record.setTaskId(taskId);
        record.setSourceUrl(sourceUrl);
        record.setStatus(ScrapeRecordStatus.RUNNING);
        record.setStartedAt(LocalDateTime.now());
        return scrapeRecordRepository.save(record);
    }

    @Transactional
    public void completeScrapeRecord(Long recordId, int recordCount, int newCount, int updateCount, boolean success, String errorMessage) {
        ScrapeRecordEntity record = scrapeRecordRepository.findById(recordId)
                .orElseThrow(() -> new RuntimeException("抓取记录不存在"));

        record.setRecordCount(recordCount);
        record.setNewCount(newCount);
        record.setUpdateCount(updateCount);
        record.setStatus(success ? ScrapeRecordStatus.SUCCESS : ScrapeRecordStatus.FAILED);
        record.setErrorMessage(errorMessage);
        record.setCompletedAt(LocalDateTime.now());

        if (record.getStartedAt() != null) {
            record.setDurationMs(java.time.Duration.between(record.getStartedAt(), record.getCompletedAt()).toMillis());
        }

        scrapeRecordRepository.save(record);
    }

    @Transactional
    public void updateTaskAfterScrape(Long taskId, boolean success, int recordCount, String errorMessage) {
        ScrapeTaskEntity task = scrapeTaskRepository.findById(taskId)
                .orElseThrow(() -> new RuntimeException("抓取任务不存在"));

        task.setLastRunTime(LocalDateTime.now());
        task.setTotalRunCount(task.getTotalRunCount() + 1);
        task.setLastRecordCount(recordCount);

        if (success) {
            task.setStatus(ScrapeTaskStatus.SUCCESS);
            task.setLastSuccessTime(LocalDateTime.now());
            task.setErrorMessage(null);
        } else {
            task.setStatus(ScrapeTaskStatus.FAILED);
            task.setFailCount(task.getFailCount() + 1);
            task.setErrorMessage(errorMessage);
        }

        scrapeTaskRepository.save(task);
    }

    @Transactional(readOnly = true)
    public Page<ScrapeRecordDTO> getScrapeRecords(Long taskId, int page, int size) {
        Pageable pageable = PageRequest.of(page, size);
        Page<ScrapeRecordEntity> recordPage;
        if (taskId != null) {
            recordPage = scrapeRecordRepository.findByTaskIdOrderByStartedAtDesc(taskId, pageable);
        } else {
            recordPage = scrapeRecordRepository.findAll(pageable);
        }
        return recordPage.map(this::convertToRecordDTO);
    }

    @Transactional(readOnly = true)
    public List<ScrapeRecordDTO> getRecentScrapeRecords(int limit) {
        return scrapeRecordRepository.findTop10ByOrderByStartedAtDesc().stream()
                .map(this::convertToRecordDTO)
                .limit(limit)
                .collect(Collectors.toList());
    }

    private ScrapeTaskDTO convertToDTO(ScrapeTaskEntity entity) {
        ScrapeTaskDTO dto = new ScrapeTaskDTO();
        dto.setId(entity.getId());
        dto.setTaskName(entity.getTaskName());
        dto.setSourceUrl(entity.getSourceUrl());
        dto.setDescription(entity.getDescription());
        dto.setCronExpression(entity.getCronExpression());
        dto.setIsEnabled(entity.getIsEnabled());
        dto.setStatus(entity.getStatus());
        dto.setLastRunTime(entity.getLastRunTime());
        dto.setLastSuccessTime(entity.getLastSuccessTime());
        dto.setLastRecordCount(entity.getLastRecordCount());
        dto.setTotalRunCount(entity.getTotalRunCount());
        dto.setFailCount(entity.getFailCount());
        dto.setErrorMessage(entity.getErrorMessage());
        dto.setCreatedAt(entity.getCreatedAt());
        dto.setUpdatedAt(entity.getUpdatedAt());
        return dto;
    }

    private ScrapeRecordDTO convertToRecordDTO(ScrapeRecordEntity entity) {
        ScrapeRecordDTO dto = new ScrapeRecordDTO();
        dto.setId(entity.getId());
        dto.setTaskId(entity.getTaskId());
        dto.setSourceUrl(entity.getSourceUrl());
        dto.setRecordCount(entity.getRecordCount());
        dto.setNewCount(entity.getNewCount());
        dto.setUpdateCount(entity.getUpdateCount());
        dto.setStatus(entity.getStatus());
        dto.setErrorMessage(entity.getErrorMessage());
        dto.setDurationMs(entity.getDurationMs());
        dto.setStartedAt(entity.getStartedAt());
        dto.setCompletedAt(entity.getCompletedAt());
        if (entity.getTask() != null) {
            dto.setTaskName(entity.getTask().getTaskName());
        }
        return dto;
    }
}
