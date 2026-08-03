package interview.guide.modules.careerfair.repository;

import interview.guide.modules.careerfair.model.ScrapeRecordEntity;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface ScrapeRecordRepository extends JpaRepository<ScrapeRecordEntity, Long> {

    Page<ScrapeRecordEntity> findByTaskIdOrderByStartedAtDesc(Long taskId, Pageable pageable);

    List<ScrapeRecordEntity> findTop10ByOrderByStartedAtDesc();

    List<ScrapeRecordEntity> findByTaskIdOrderByStartedAtDesc(Long taskId);
}
