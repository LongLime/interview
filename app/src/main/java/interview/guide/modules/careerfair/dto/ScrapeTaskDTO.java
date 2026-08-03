package interview.guide.modules.careerfair.dto;

import interview.guide.modules.careerfair.model.ScrapeTaskStatus;
import lombok.Data;
import java.time.LocalDateTime;

@Data
public class ScrapeTaskDTO {
    private Long id;
    private String taskName;
    private String sourceUrl;
    private String description;
    private String cronExpression;
    private Boolean isEnabled;
    private ScrapeTaskStatus status;
    private LocalDateTime lastRunTime;
    private LocalDateTime lastSuccessTime;
    private Integer lastRecordCount;
    private Integer totalRunCount;
    private Integer failCount;
    private String errorMessage;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
