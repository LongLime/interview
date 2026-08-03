package interview.guide.modules.contribution.repository;

import interview.guide.modules.contribution.model.ContributionEntity;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.List;

@Repository
public interface ContributionRepository extends JpaRepository<ContributionEntity, Long> {

    Page<ContributionEntity> findByVerifiedTrue(Pageable pageable);

    @Query("SELECT c FROM ContributionEntity c WHERE c.verified = true " +
           "AND (:companyId IS NULL OR c.company.id = :companyId) " +
           "AND (:interviewYear IS NULL OR c.interviewYear = :interviewYear) " +
           "AND (:interviewType IS NULL OR c.interviewType = :interviewType)")
    Page<ContributionEntity> findVerifiedWithFilters(
            @Param("companyId") Long companyId,
            @Param("interviewYear") Integer interviewYear,
            @Param("interviewType") String interviewType,
            Pageable pageable);

    @Query("SELECT COUNT(c) FROM ContributionEntity c WHERE c.verified = true")
    Long countVerified();

    @Query("SELECT COUNT(c) FROM ContributionEntity c WHERE c.verified = false")
    Long countPending();

    @Query("SELECT COUNT(c) FROM ContributionEntity c WHERE c.createdAt >= :since")
    Long countSince(@Param("since") LocalDateTime since);

    List<ContributionEntity> findByCompanyIdOrderByCreatedAtDesc(Long companyId);
}
