package interview.guide.modules.careerfair.service;

import interview.guide.modules.careerfair.dto.*;
import interview.guide.modules.careerfair.model.CareerFairEntity;
import interview.guide.modules.careerfair.repository.CareerFairRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
public class CareerFairService {

    private final CareerFairRepository careerFairRepository;

    @Transactional(readOnly = true)
    public Page<CareerFairDTO> searchCareerFairs(CareerFairSearchRequest request) {
        Pageable pageable = PageRequest.of(request.getPage(), request.getSize());
        Page<CareerFairEntity> page = careerFairRepository.searchCareerFairs(
                request.getKeyword(),
                request.getFairType(),
                request.getStartDate(),
                request.getEndDate(),
                pageable
        );
        return page.map(this::convertToDTO);
    }

    @Transactional(readOnly = true)
    public List<CareerFairDTO> getUpcomingCareerFairs(int limit) {
        Pageable pageable = PageRequest.of(0, limit);
        return careerFairRepository.findUpcomingCareerFairs(pageable)
                .stream()
                .map(this::convertToDTO)
                .collect(Collectors.toList());
    }

    @Transactional(readOnly = true)
    public CareerFairDTO getCareerFairById(Long id) {
        CareerFairEntity entity = careerFairRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("宣讲会不存在"));
        entity.setViewCount(entity.getViewCount() + 1);
        careerFairRepository.save(entity);
        return convertToDTO(entity);
    }

    @Transactional
    public CareerFairDTO saveOrUpdateCareerFair(CareerFairDTO dto) {
        CareerFairEntity entity;
        if (dto.getId() != null) {
            entity = careerFairRepository.findById(dto.getId())
                    .orElse(new CareerFairEntity());
        } else {
            entity = new CareerFairEntity();
        }

        entity.setExternalId(dto.getExternalId());
        entity.setTitle(dto.getTitle());
        entity.setCompanyName(dto.getCompanyName());
        entity.setUniversityName(dto.getUniversityName());
        entity.setVenue(dto.getVenue());
        entity.setAddress(dto.getAddress());
        entity.setFairDate(dto.getFairDate());
        entity.setStartTime(dto.getStartTime());
        entity.setEndTime(dto.getEndTime());
        entity.setFairType(dto.getFairType());
        entity.setIndustry(dto.getIndustry());
        entity.setDescription(dto.getDescription());
        entity.setRequirements(dto.getRequirements());
        entity.setSourceUrl(dto.getSourceUrl());
        entity.setPosterUrl(dto.getPosterUrl());
        entity.setContactInfo(dto.getContactInfo());
        entity.setIsActive(dto.getIsActive());

        CareerFairEntity saved = careerFairRepository.save(entity);
        return convertToDTO(saved);
    }

    @Transactional
    public void deleteCareerFair(Long id) {
        CareerFairEntity entity = careerFairRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("宣讲会不存在"));
        entity.setIsActive(false);
        careerFairRepository.save(entity);
    }

    @Transactional
    public int batchSaveOrUpdate(List<CareerFairDTO> dtos) {
        int newCount = 0;
        int updateCount = 0;

        for (CareerFairDTO dto : dtos) {
            Optional<CareerFairEntity> existing = Optional.empty();
            if (dto.getExternalId() != null) {
                existing = careerFairRepository.findByExternalId(dto.getExternalId());
            }

            CareerFairEntity entity = existing.orElse(new CareerFairEntity());
            boolean isNew = entity.getId() == null;

            entity.setExternalId(dto.getExternalId());
            entity.setTitle(dto.getTitle());
            entity.setCompanyName(dto.getCompanyName());
            entity.setUniversityName(dto.getUniversityName());
            entity.setVenue(dto.getVenue());
            entity.setAddress(dto.getAddress());
            entity.setFairDate(dto.getFairDate());
            entity.setStartTime(dto.getStartTime());
            entity.setEndTime(dto.getEndTime());
            entity.setFairType(dto.getFairType());
            entity.setIndustry(dto.getIndustry());
            entity.setDescription(dto.getDescription());
            entity.setRequirements(dto.getRequirements());
            entity.setSourceUrl(dto.getSourceUrl());
            entity.setPosterUrl(dto.getPosterUrl());
            entity.setContactInfo(dto.getContactInfo());
            entity.setIsActive(true);

            careerFairRepository.save(entity);

            if (isNew) {
                newCount++;
            } else {
                updateCount++;
            }
        }

        log.info("批量保存宣讲会完成: 新增={}, 更新={}", newCount, updateCount);
        return newCount + updateCount;
    }

    private CareerFairDTO convertToDTO(CareerFairEntity entity) {
        CareerFairDTO dto = new CareerFairDTO();
        dto.setId(entity.getId());
        dto.setExternalId(entity.getExternalId());
        dto.setTitle(entity.getTitle());
        dto.setCompanyName(entity.getCompanyName());
        dto.setUniversityName(entity.getUniversityName());
        dto.setVenue(entity.getVenue());
        dto.setAddress(entity.getAddress());
        dto.setFairDate(entity.getFairDate());
        dto.setStartTime(entity.getStartTime());
        dto.setEndTime(entity.getEndTime());
        dto.setFairType(entity.getFairType());
        dto.setIndustry(entity.getIndustry());
        dto.setDescription(entity.getDescription());
        dto.setRequirements(entity.getRequirements());
        dto.setSourceUrl(entity.getSourceUrl());
        dto.setPosterUrl(entity.getPosterUrl());
        dto.setContactInfo(entity.getContactInfo());
        dto.setViewCount(entity.getViewCount());
        dto.setIsActive(entity.getIsActive());
        dto.setCreatedAt(entity.getCreatedAt());
        dto.setUpdatedAt(entity.getUpdatedAt());
        return dto;
    }
}
