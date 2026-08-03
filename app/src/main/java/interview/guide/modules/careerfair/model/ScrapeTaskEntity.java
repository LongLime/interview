package interview.guide.modules.careerfair.model;

import jakarta.persistence.*;
import lombok.Data;
import java.time.LocalDateTime;

@Entity
@Table(name = "scrape_task")
@Data
public class ScrapeTaskEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "task_name", nullable = false)
    private String taskName;

    @Column(name = "source_url", nullable = false)
    private String sourceUrl;

    @Column(name = "description")
    private String description;

    @Column(name = "cron_expression")
    private String cronExpression;

    @Column(name = "is_enabled")
    private Boolean isEnabled = true;

    @Enumerated(EnumType.STRING)
    @Column(name = "status")
    private ScrapeTaskStatus status = ScrapeTaskStatus.IDLE;

    @Column(name = "last_run_time")
    private LocalDateTime lastRunTime;

    @Column(name = "last_success_time")
    private LocalDateTime lastSuccessTime;

    @Column(name = "last_record_count")
    private Integer lastRecordCount = 0;

    @Column(name = "total_run_count")
    private Integer totalRunCount = 0;

    @Column(name = "fail_count")
    private Integer failCount = 0;

    @Column(name = "error_message", columnDefinition = "TEXT")
    private String errorMessage;

    @Column(name = "created_at", updatable = false)
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
