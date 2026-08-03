package interview.guide.modules.contribution.repository;

import interview.guide.modules.contribution.model.ContributionQuestionEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface ContributionQuestionRepository extends JpaRepository<ContributionQuestionEntity, Long> {

    List<ContributionQuestionEntity> findByContributionId(Long contributionId);

    @Query("SELECT COUNT(q) FROM ContributionQuestionEntity q WHERE q.contribution.id = :contributionId")
    Integer countByContributionId(@Param("contributionId") Long contributionId);

    @Query("SELECT COUNT(q) FROM ContributionQuestionEntity q")
    Long countTotal();

    @Query("SELECT DISTINCT q.categoryLabel FROM ContributionQuestionEntity q WHERE q.categoryLabel IS NOT NULL")
    List<String> findAllCategoryLabels();

    List<ContributionQuestionEntity> findByCategoryKeyOrderByCreatedAtDesc(String categoryKey);
}
