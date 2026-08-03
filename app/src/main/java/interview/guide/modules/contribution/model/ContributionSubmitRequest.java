package interview.guide.modules.contribution.model;

import lombok.Data;
import java.util.List;

@Data
public class ContributionSubmitRequest {
    private Long companyId;
    private String department;
    private String position;
    private Integer interviewYear;
    private Integer interviewMonth;
    private String interviewType;
    private Integer interviewRound;
    private List<QuestionSubmit> questions;
    private String contributorNickname;
    private boolean anonymous;

    @Data
    public static class QuestionSubmit {
        private String questionText;
        private String followUpText;
        private String categoryKey;
        private String categoryLabel;
        private String difficulty;
        private String questionType;
        private String answerText;
        private List<String> keyPoints;
    }
}
