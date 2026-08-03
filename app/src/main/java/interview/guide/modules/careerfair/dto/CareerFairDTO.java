package interview.guide.modules.careerfair.dto;

import lombok.Data;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;

@Data
public class CareerFairDTO {
    private Long id;
    private String externalId;
    private String title;
    private String companyName;
    private String universityName;
    private String venue;
    private String address;
    private LocalDate fairDate;
    private LocalTime startTime;
    private LocalTime endTime;
    private String fairType;
    private String industry;
    private String description;
    private String requirements;
    private String sourceUrl;
    private String posterUrl;
    private String contactInfo;
    private Integer viewCount;
    private Boolean isActive;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
