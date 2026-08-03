package interview.guide.modules.careerfair.dto;

import interview.guide.modules.careerfair.model.ScrapeRecordStatus;
import lombok.Data;
import java.time.LocalDateTime;

@Data
public class ScrapeRecordDTO {
    private Long id;
    private Long taskId;
    private String taskName;
    private String sourceUrl;
    private Integer recordCount;
    private Integer newCount;
    private Integer updateCount;
    private ScrapeRecordStatus status;
    private String errorMessage;
    private Long durationMs;
    private LocalDateTime startedAt;
    private LocalDateTime completedAt;
}
