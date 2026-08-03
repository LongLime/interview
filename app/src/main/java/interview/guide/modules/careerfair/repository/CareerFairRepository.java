package interview.guide.modules.careerfair.repository;

import interview.guide.modules.careerfair.model.CareerFairEntity;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

@Repository
public interface CareerFairRepository extends JpaRepository<CareerFairEntity, Long> {

    Optional<CareerFairEntity> findByExternalId(String externalId);

    Page<CareerFairEntity> findByIsActiveTrueOrderByFairDateDesc(Pageable pageable);

    @Query("SELECT c FROM CareerFairEntity c WHERE c.isActive = true " +
           "AND (:keyword IS NULL OR c.title LIKE %:keyword% OR c.companyName LIKE %:keyword% OR c.universityName LIKE %:keyword%) " +
           "AND (:fairType IS NULL OR c.fairType = :fairType) " +
           "AND (:startDate IS NULL OR c.fairDate >= :startDate) " +
           "AND (:endDate IS NULL OR c.fairDate <= :endDate) " +
           "ORDER BY c.fairDate DESC")
    Page<CareerFairEntity> searchCareerFairs(
            @Param("keyword") String keyword,
            @Param("fairType") String fairType,
            @Param("startDate") LocalDate startDate,
            @Param("endDate") LocalDate endDate,
            Pageable pageable
    );

    List<CareerFairEntity> findByFairDateGreaterThanEqualAndIsActiveTrueOrderByFairDateAsc(LocalDate date);

    @Query("SELECT c FROM CareerFairEntity c WHERE c.isActive = true AND c.fairDate >= CURRENT_DATE ORDER BY c.fairDate ASC, c.startTime ASC")
    List<CareerFairEntity> findUpcomingCareerFairs(Pageable pageable);
}
