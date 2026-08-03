package interview.guide.modules.contribution.repository;

import interview.guide.modules.contribution.model.ContributionTopicEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface ContributionTopicRepository extends JpaRepository<ContributionTopicEntity, Long> {

    Optional<ContributionTopicEntity> findByTopicKey(String topicKey);

    List<ContributionTopicEntity> findAllByOrderByQuestionCountDesc();

    @Query("SELECT COUNT(t) FROM ContributionTopicEntity t")
    Long countTotal();
}
