package interview.guide.modules.auth.service;

import interview.guide.modules.auth.model.*;
import interview.guide.modules.auth.repository.AppUserRepository;
import interview.guide.modules.auth.security.JwtUtil;
import lombok.RequiredArgsConstructor;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class AuthService {

    private final AppUserRepository userRepository;
    private final JwtUtil jwtUtil;
    private final PasswordEncoder passwordEncoder;

    public LoginResponse login(String username, String password) {
        AppUserEntity user = userRepository.findByUsername(username)
                .orElseThrow(() -> new RuntimeException("用户名或密码错误"));

        if (!user.getEnabled()) {
            throw new RuntimeException("账号已被禁用");
        }

        if (!passwordEncoder.matches(password, user.getPasswordHash())) {
            throw new RuntimeException("用户名或密码错误");
        }

        String token = jwtUtil.generateToken(user.getId(), user.getUsername(), user.getRole());
        return new LoginResponse(token, user.getUsername(), user.getNickname(), user.getRole());
    }

    public LoginResponse register(RegisterRequest request) {
        if (request.getUsername() == null || request.getUsername().trim().isEmpty()) {
            throw new RuntimeException("用户名不能为空");
        }
        if (request.getPassword() == null || request.getPassword().length() < 6) {
            throw new RuntimeException("密码至少6位");
        }
        if (userRepository.existsByUsername(request.getUsername())) {
            throw new RuntimeException("用户名已存在");
        }

        AppUserEntity user = new AppUserEntity();
        user.setUsername(request.getUsername().trim());
        user.setPasswordHash(passwordEncoder.encode(request.getPassword()));
        user.setNickname(request.getNickname() != null ? request.getNickname() : request.getUsername());
        user.setRole("USER");
        user.setEnabled(true);
        userRepository.save(user);

        String token = jwtUtil.generateToken(user.getId(), user.getUsername(), user.getRole());
        return new LoginResponse(token, user.getUsername(), user.getNickname(), user.getRole());
    }

    public UserInfoDTO getUserInfo(Long userId) {
        AppUserEntity user = userRepository.findById(userId)
                .orElseThrow(() -> new RuntimeException("用户不存在"));
        return new UserInfoDTO(user.getId(), user.getUsername(), user.getNickname(), user.getRole());
    }
}
