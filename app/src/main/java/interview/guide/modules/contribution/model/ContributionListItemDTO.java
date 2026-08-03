package interview.guide.modules.contribution.model;

import lombok.AllArgsConstructor;
import lombok.Data;
import java.time.LocalDateTime;
import java.util.List;

@Data
@AllArgsConstructor
public class ContributionListItemDTO {
    private Long id;
    private String companyName;
    private Long companyId;
    private String department;
    private String position;
    private Integer interviewYear;
    private Integer interviewMonth;
    private String interviewType;
    private Integer interviewRound;
    private String contributorNickname;
    private boolean anonymous;
    private boolean verified;
    private Integer viewCount;
    private Integer helpfulCount;
    private Integer questionCount;
    private List<String> categoryLabels;
    private LocalDateTime createdAt;
}
