package interview.guide.modules.careerfair.model;

import jakarta.persistence.*;
import lombok.Data;
import java.time.LocalDateTime;

@Entity
@Table(name = "scrape_record")
@Data
public class ScrapeRecordEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "task_id")
    private ScrapeTaskEntity task;

    @Column(name = "task_id", insertable = false, updatable = false)
    private Long taskId;

    @Column(name = "source_url")
    private String sourceUrl;

    @Column(name = "record_count")
    private Integer recordCount = 0;

    @Column(name = "new_count")
    private Integer newCount = 0;

    @Column(name = "update_count")
    private Integer updateCount = 0;

    @Enumerated(EnumType.STRING)
    @Column(name = "status")
    private ScrapeRecordStatus status = ScrapeRecordStatus.RUNNING;

    @Column(name = "error_message", columnDefinition = "TEXT")
    private String errorMessage;

    @Column(name = "duration_ms")
    private Long durationMs;

    @Column(name = "started_at")
    private LocalDateTime startedAt;

    @Column(name = "completed_at")
    private LocalDateTime completedAt;

    @PrePersist
    protected void onCreate() {
        startedAt = LocalDateTime.now();
    }
}
