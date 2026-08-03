package interview.guide.modules.careerfair.dto;

import lombok.Data;
import java.util.List;

@Data
public class ScrapeResult {
    private boolean success;
    private int totalCount;
    private int newCount;
    private int updateCount;
    private String message;
    private List<String> errors;
}
