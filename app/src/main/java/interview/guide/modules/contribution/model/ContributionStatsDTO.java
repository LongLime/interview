package interview.guide.modules.contribution.model;

import lombok.AllArgsConstructor;
import lombok.Data;

@Data
@AllArgsConstructor
public class ContributionStatsDTO {
    private Long totalContributions;
    private Long totalQuestions;
    private Long totalCompanies;
    private Long totalTopics;
    private Long pendingReview;
    private Long thisMonthContributions;
}
