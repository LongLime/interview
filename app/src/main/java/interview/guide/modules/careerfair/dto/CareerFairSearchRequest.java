package interview.guide.modules.careerfair.dto;

import lombok.Data;
import java.time.LocalDate;

@Data
public class CareerFairSearchRequest {
    private String keyword;
    private String fairType;
    private LocalDate startDate;
    private LocalDate endDate;
    private Integer page = 0;
    private Integer size = 20;
}
