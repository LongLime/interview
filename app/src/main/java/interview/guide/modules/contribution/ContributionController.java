package interview.guide.modules.contribution;

import interview.guide.modules.contribution.model.*;
import interview.guide.modules.contribution.service.ContributionService;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/contributions")
@RequiredArgsConstructor
@CrossOrigin(origins = "*")
public class ContributionController {

    private final ContributionService contributionService;

    @GetMapping
    public ResponseEntity<Page<ContributionListItemDTO>> listContributions(
            @RequestParam(required = false) Long companyId,
            @RequestParam(required = false) String position,
            @RequestParam(required = false) Integer year,
            @RequestParam(required = false) String type,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "10") int size) {
        return ResponseEntity.ok(contributionService.listContributions(companyId, position, year, type, page, size));
    }

    @GetMapping("/{id}")
    public ResponseEntity<ContributionDetailDTO> getContribution(@PathVariable Long id) {
        return ResponseEntity.ok(contributionService.getContributionDetail(id));
    }

    @PostMapping
    public ResponseEntity<Map<String, Object>> submitContribution(@RequestBody ContributionSubmitRequest request) {
        Long id = contributionService.submitContribution(request);
        return ResponseEntity.ok(Map.of(
                "success", true,
                "message", "面经提交成功，等待审核",
                "id", id
        ));
    }

    @GetMapping("/companies")
    public ResponseEntity<List<CompanyDTO>> listCompanies() {
        return ResponseEntity.ok(contributionService.listCompanies());
    }

    @GetMapping("/topics")
    public ResponseEntity<List<String>> listTopics() {
        return ResponseEntity.ok(contributionService.listTopics());
    }

    @GetMapping("/stats")
    public ResponseEntity<ContributionStatsDTO> getStats() {
        return ResponseEntity.ok(contributionService.getStats());
    }

    @PostMapping("/{id}/helpful")
    public ResponseEntity<Map<String, Object>> markHelpful(@PathVariable Long id) {
        contributionService.markHelpful(id);
        return ResponseEntity.ok(Map.of("success", true, "message", "感谢您的认可！"));
    }
}
