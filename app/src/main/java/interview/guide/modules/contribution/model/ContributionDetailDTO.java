package interview.guide.modules.contribution.model;

import lombok.AllArgsConstructor;
import lombok.Data;
import java.time.LocalDateTime;
import java.util.List;

@Data
@AllArgsConstructor
public class ContributionDetailDTO {
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
    private List<QuestionDetail> questions;
    private LocalDateTime createdAt;

    @Data
    @AllArgsConstructor
    public static class QuestionDetail {
        private Long id;
        private String questionText;
        private String followUpText;
        private String categoryKey;
        private String categoryLabel;
        private String difficulty;
        private String questionType;
        private String answerText;
        private List<String> keyPoints;
        private List<String> topics;
        private LocalDateTime createdAt;
    }
}
