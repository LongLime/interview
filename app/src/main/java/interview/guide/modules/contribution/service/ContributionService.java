package interview.guide.modules.contribution.service;

import interview.guide.modules.contribution.model.*;
import interview.guide.modules.contribution.repository.*;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.time.YearMonth;
import java.util.Arrays;
import java.util.List;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
public class ContributionService {

    private final ContributionRepository contributionRepository;
    private final ContributionQuestionRepository questionRepository;
    private final ContributionCompanyRepository companyRepository;
    private final ContributionTopicRepository topicRepository;

    public Page<ContributionListItemDTO> listContributions(
            Long companyId, String position, Integer year, String type, int page, int size) {

        PageRequest pageRequest = PageRequest.of(page, size, Sort.by(Sort.Direction.DESC, "createdAt"));
        Page<ContributionEntity> entities = contributionRepository.findVerifiedWithFilters(
                companyId, year, type, pageRequest);

        return entities.map(entity -> {
            if (position != null && !position.trim().isEmpty()) {
                String lower = position.toLowerCase();
                if (entity.getPosition() == null || !entity.getPosition().toLowerCase().contains(lower)) {
                    return null;
                }
            }
            return toListItemDTO(entity);
        });
    }

    public ContributionDetailDTO getContributionDetail(Long id) {
        ContributionEntity entity = contributionRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("面经不存在: " + id));

        entity.setViewCount(entity.getViewCount() == null ? 1 : entity.getViewCount() + 1);
        contributionRepository.save(entity);

        return toDetailDTO(entity);
    }

    @Transactional
    public Long submitContribution(ContributionSubmitRequest request) {
        ContributionEntity entity = new ContributionEntity();
        entity.setCompany(companyRepository.findById(request.getCompanyId())
                .orElseThrow(() -> new RuntimeException("公司不存在")));
        entity.setDepartment(request.getDepartment());
        entity.setPosition(request.getPosition());
        entity.setInterviewYear(request.getInterviewYear());
        entity.setInterviewMonth(request.getInterviewMonth());
        entity.setInterviewType(request.getInterviewType() != null ? request.getInterviewType() : "SOCIAL");
        entity.setInterviewRound(request.getInterviewRound() != null ? request.getInterviewRound() : 1);
        entity.setContributorNickname(request.isAnonymous() ? "匿名用户" : request.getContributorNickname());
        entity.setIsAnonymous(request.isAnonymous());
        entity.setVerified(false);
        entity.setSource("USER");

        ContributionEntity saved = contributionRepository.save(entity);

        if (request.getQuestions() != null) {
            for (ContributionSubmitRequest.QuestionSubmit q : request.getQuestions()) {
                ContributionQuestionEntity question = new ContributionQuestionEntity();
                question.setContribution(saved);
                question.setQuestionText(q.getQuestionText());
                question.setFollowUpText(q.getFollowUpText());
                question.setCategoryKey(q.getCategoryKey());
                question.setCategoryLabel(q.getCategoryLabel());
                question.setDifficulty(q.getDifficulty() != null ? q.getDifficulty() : "MEDIUM");
                question.setQuestionType(q.getQuestionType() != null ? q.getQuestionType() : "DISCUSSION");
                question.setAnswerText(q.getAnswerText());
                if (q.getKeyPoints() != null) {
                    question.setKeyPoints(q.getKeyPoints().toArray(new String[0]));
                }
                questionRepository.save(question);
            }
        }

        log.info("用户提交面经: id={}, 公司={}", saved.getId(), entity.getCompany().getName());
        return saved.getId();
    }

    public List<CompanyDTO> listCompanies() {
        return companyRepository.findAllByOrderByTierAscNameAsc().stream()
                .map(c -> new CompanyDTO(c.getId(), c.getName(), c.getShortName(), c.getTier()))
                .collect(Collectors.toList());
    }

    public List<String> listTopics() {
        return topicRepository.findAll().stream()
                .map(ContributionTopicEntity::getTopicLabel)
                .collect(Collectors.toList());
    }

    public ContributionStatsDTO getStats() {
        LocalDateTime thisMonth = YearMonth.now().atDay(1).atStartOfDay();
        return new ContributionStatsDTO(
                contributionRepository.countVerified(),
                questionRepository.countTotal(),
                (long) companyRepository.findAll().size(),
                topicRepository.countTotal(),
                contributionRepository.countPending(),
                contributionRepository.countSince(thisMonth)
        );
    }

    @Transactional
    public void markHelpful(Long id) {
        ContributionEntity entity = contributionRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("面经不存在"));
        entity.setHelpfulCount(entity.getHelpfulCount() == null ? 1 : entity.getHelpfulCount() + 1);
        contributionRepository.save(entity);
    }

    private ContributionListItemDTO toListItemDTO(ContributionEntity entity) {
        List<ContributionQuestionEntity> questions = questionRepository.findByContributionId(entity.getId());
        List<String> categoryLabels = questions.stream()
                .map(ContributionQuestionEntity::getCategoryLabel)
                .filter(c -> c != null)
                .distinct()
                .collect(Collectors.toList());

        return new ContributionListItemDTO(
                entity.getId(),
                entity.getCompany() != null ? entity.getCompany().getName() : "未知公司",
                entity.getCompany() != null ? entity.getCompany().getId() : null,
                entity.getDepartment(),
                entity.getPosition(),
                entity.getInterviewYear(),
                entity.getInterviewMonth(),
                entity.getInterviewType(),
                entity.getInterviewRound(),
                entity.getIsAnonymous() ? "匿名用户" : entity.getContributorNickname(),
                entity.getIsAnonymous(),
                entity.getVerified(),
                entity.getViewCount(),
                entity.getHelpfulCount(),
                questions.size(),
                categoryLabels,
                entity.getCreatedAt()
        );
    }

    private ContributionDetailDTO toDetailDTO(ContributionEntity entity) {
        List<ContributionQuestionEntity> questions = questionRepository.findByContributionId(entity.getId());

        List<ContributionDetailDTO.QuestionDetail> questionDetails = questions.stream()
                .map(q -> new ContributionDetailDTO.QuestionDetail(
                        q.getId(),
                        q.getQuestionText(),
                        q.getFollowUpText(),
                        q.getCategoryKey(),
                        q.getCategoryLabel(),
                        q.getDifficulty(),
                        q.getQuestionType(),
                        q.getAnswerText(),
                        q.getKeyPoints() != null ? Arrays.asList(q.getKeyPoints()) : null,
                        null,
                        q.getCreatedAt()
                ))
                .collect(Collectors.toList());

        return new ContributionDetailDTO(
                entity.getId(),
                entity.getCompany() != null ? entity.getCompany().getName() : "未知公司",
                entity.getCompany() != null ? entity.getCompany().getId() : null,
                entity.getDepartment(),
                entity.getPosition(),
                entity.getInterviewYear(),
                entity.getInterviewMonth(),
                entity.getInterviewType(),
                entity.getInterviewRound(),
                entity.getIsAnonymous() ? "匿名用户" : entity.getContributorNickname(),
                entity.getIsAnonymous(),
                entity.getVerified(),
                entity.getViewCount(),
                entity.getHelpfulCount(),
                questionDetails,
                entity.getCreatedAt()
        );
    }
}
