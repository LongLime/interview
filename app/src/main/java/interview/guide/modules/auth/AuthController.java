package interview.guide.modules.auth;

import interview.guide.modules.auth.model.*;
import interview.guide.modules.auth.security.JwtUtil;
import interview.guide.modules.auth.service.AuthService;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/auth")
@RequiredArgsConstructor
public class AuthController {

    private final AuthService authService;
    private final JwtUtil jwtUtil;

    @PostMapping("/login")
    public ResponseEntity<LoginResponse> login(@RequestBody LoginRequest request,
                                                HttpServletResponse response) {
        LoginResponse loginResponse = authService.login(request.getUsername(), request.getPassword());
        setTokenCookie(response, loginResponse.getToken());
        return ResponseEntity.ok(loginResponse);
    }

    @PostMapping("/register")
    public ResponseEntity<LoginResponse> register(@RequestBody RegisterRequest request,
                                                   HttpServletResponse response) {
        LoginResponse loginResponse = authService.register(request);
        setTokenCookie(response, loginResponse.getToken());
        return ResponseEntity.ok(loginResponse);
    }

    @GetMapping("/me")
    public ResponseEntity<UserInfoDTO> me(@RequestHeader("Authorization") String authHeader) {
        String token = extractToken(authHeader);
        if (token == null || !jwtUtil.validateToken(token)) {
            return ResponseEntity.status(401).build();
        }
        Long userId = jwtUtil.getUserId(token);
        return ResponseEntity.ok(authService.getUserInfo(userId));
    }

    @PostMapping("/logout")
    public ResponseEntity<Map<String, Object>> logout(HttpServletResponse response) {
        Cookie cookie = new Cookie("auth_token", "");
        cookie.setMaxAge(0);
        cookie.setPath("/");
        cookie.setHttpOnly(true);
        response.addCookie(cookie);
        return ResponseEntity.ok(Map.of("success", true));
    }

    private void setTokenCookie(HttpServletResponse response, String token) {
        Cookie cookie = new Cookie("auth_token", token);
        cookie.setMaxAge(86400);
        cookie.setPath("/");
        cookie.setHttpOnly(true);
        response.addCookie(cookie);
    }

    private String extractToken(String authHeader) {
        if (authHeader != null && authHeader.startsWith("Bearer ")) {
            return authHeader.substring(7);
        }
        return null;
    }
}
