package interview.guide.modules.careerfair.model;

import jakarta.persistence.*;
import lombok.Data;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;

@Entity
@Table(name = "career_fair")
@Data
public class CareerFairEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "external_id", unique = true)
    private String externalId;

    @Column(name = "title", nullable = false)
    private String title;

    @Column(name = "company_name")
    private String companyName;

    @Column(name = "university_name")
    private String universityName;

    @Column(name = "venue")
    private String venue;

    @Column(name = "address")
    private String address;

    @Column(name = "fair_date")
    private LocalDate fairDate;

    @Column(name = "start_time")
    private LocalTime startTime;

    @Column(name = "end_time")
    private LocalTime endTime;

    @Column(name = "fair_type")
    private String fairType;

    @Column(name = "industry")
    private String industry;

    @Column(name = "description", columnDefinition = "TEXT")
    private String description;

    @Column(name = "requirements", columnDefinition = "TEXT")
    private String requirements;

    @Column(name = "source_url")
    private String sourceUrl;

    @Column(name = "poster_url")
    private String posterUrl;

    @Column(name = "contact_info")
    private String contactInfo;

    @Column(name = "view_count")
    private Integer viewCount = 0;

    @Column(name = "is_active")
    private Boolean isActive = true;

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
