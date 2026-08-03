package interview.guide.modules.careerfair.dto;

import lombok.Data;

@Data
public class ScrapeTaskCreateRequest {
    private String taskName;
    private String sourceUrl;
    private String description;
    private String cronExpression;
}
