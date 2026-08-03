package interview.guide.modules.contribution.model;

import jakarta.persistence.*;
import lombok.Data;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;
import java.time.LocalDateTime;
import java.util.List;

@Data
@Entity
@Table(name = "contribution_question")
public class ContributionQuestionEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "contribution_id")
    private ContributionEntity contribution;

    @Column(name = "question_text", nullable = false, columnDefinition = "TEXT")
    private String questionText;

    @Column(name = "follow_up_text", columnDefinition = "TEXT")
    private String followUpText;

    @Column(name = "category_key")
    private String categoryKey;

    @Column(name = "category_label")
    private String categoryLabel;

    private String difficulty;

    @Column(name = "question_type")
    private String questionType;

    @Column(name = "answer_text", columnDefinition = "TEXT")
    private String answerText;

    @JdbcTypeCode(SqlTypes.ARRAY)
    @Column(name = "key_points", columnDefinition = "TEXT[]")
    private String[] keyPoints;

    @Column(name = "ideal_answer_hint", columnDefinition = "TEXT")
    private String idealAnswerHint;

    @Column(name = "ai_enhanced")
    private Boolean aiEnhanced = false;

    @Column(name = "ai_summary", columnDefinition = "TEXT")
    private String aiSummary;

    @Column(name = "mapped_skill_id")
    private String mappedSkillId;

    @Column(name = "mapped_ref_file")
    private String mappedRefFile;

    @Column(name = "created_at")
    private LocalDateTime createdAt;

    @Column(name = "updated_at")
    private LocalDateTime updatedAt;

    @Transient
    private List<ContributionTopicEntity> topics;

    @PrePersist
    protected void onCreate() {
        createdAt = LocalDateTime.now();
        updatedAt = LocalDateTime.now();
    }

    @PreUpdate
    protected void onUpdate() {
        updatedAt = LocalDateTime.now();
    }
}
