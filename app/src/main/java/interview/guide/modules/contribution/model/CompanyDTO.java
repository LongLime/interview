package interview.guide.modules.contribution.model;

import lombok.AllArgsConstructor;
import lombok.Data;

@Data
@AllArgsConstructor
public class CompanyDTO {
    private Long id;
    private String name;
    private String shortName;
    private String tier;
}
