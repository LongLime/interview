package interview.guide.modules.contribution.repository;

import interview.guide.modules.contribution.model.ContributionCompanyEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface ContributionCompanyRepository extends JpaRepository<ContributionCompanyEntity, Long> {
    List<ContributionCompanyEntity> findAllByOrderByTierAscNameAsc();
}
