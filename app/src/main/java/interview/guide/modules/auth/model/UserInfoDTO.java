package interview.guide.modules.auth.model;

import lombok.AllArgsConstructor;
import lombok.Data;

@Data
@AllArgsConstructor
public class UserInfoDTO {
    private Long id;
    private String username;
    private String nickname;
    private String role;
}
