package interview.guide.modules.contribution.model;

import jakarta.persistence.*;
import lombok.Data;
import java.time.LocalDateTime;

@Data
@Entity
@Table(name = "contribution_topic")
public class ContributionTopicEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "topic_key", nullable = false, unique = true)
    private String topicKey;

    @Column(name = "topic_label", nullable = false)
    private String topicLabel;

    private String description;

    @Column(name = "question_count")
    private Integer questionCount = 0;

    @Column(name = "contribution_count")
    private Integer contributionCount = 0;

    @Column(name = "created_at")
    private LocalDateTime createdAt;

    @Column(name = "updated_at")
    private LocalDateTime updatedAt;

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
