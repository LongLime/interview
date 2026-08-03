package interview.guide.modules.careerfair.repository;

import interview.guide.modules.careerfair.model.ScrapeTaskEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface ScrapeTaskRepository extends JpaRepository<ScrapeTaskEntity, Long> {

    List<ScrapeTaskEntity> findByIsEnabledTrue();
}
