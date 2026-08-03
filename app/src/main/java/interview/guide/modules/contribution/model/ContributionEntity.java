package interview.guide.modules.contribution.model;

import jakarta.persistence.*;
import lombok.Data;
import java.time.LocalDateTime;

@Data
@Entity
@Table(name = "contribution")
public class ContributionEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private Long contributorId;

    private String contributorNickname;

    @Column(name = "is_anonymous")
    private Boolean isAnonymous = true;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "company_id")
    private ContributionCompanyEntity company;

    private String department;

    private String position;

    @Column(name = "interview_year")
    private Integer interviewYear;

    @Column(name = "interview_month")
    private Integer interviewMonth;

    @Column(name = "interview_type")
    private String interviewType;

    @Column(name = "interview_round")
    private Integer interviewRound = 1;

    private String source = "USER";

    private Boolean verified = false;

    private Long verifierId;

    private LocalDateTime verifiedAt;

    @Column(name = "view_count")
    private Integer viewCount = 0;

    @Column(name = "helpful_count")
    private Integer helpfulCount = 0;

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
