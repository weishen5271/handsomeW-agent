package com.handsomew.system.auth.web;

import com.handsomew.system.auth.dto.UserCreateRequest;
import com.handsomew.system.auth.dto.UserLoginRequest;
import com.handsomew.system.auth.dto.UserRegisterRequest;
import com.handsomew.system.auth.dto.UserUpdateRequest;
import com.handsomew.system.auth.model.AuthResponse;
import com.handsomew.system.auth.model.UserListResponse;
import com.handsomew.system.auth.model.UserPublic;
import com.handsomew.system.auth.service.AuthService;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
public class AuthController {

    private final AuthService authService;
    private final AuthHeaderUtils authHeaderUtils;

    public AuthController(AuthService authService, AuthHeaderUtils authHeaderUtils) {
        this.authService = authService;
        this.authHeaderUtils = authHeaderUtils;
    }

    @PostMapping("/auth/register")
    public AuthResponse register(@Valid @RequestBody UserRegisterRequest request) {
        return authService.register(request);
    }

    @PostMapping("/auth/login")
    public AuthResponse login(@Valid @RequestBody UserLoginRequest request) {
        return authService.login(request);
    }

    @PostMapping("/auth/logout")
    public Map<String, String> logout(@RequestHeader(value = "Authorization", required = false) String authorization) {
        authService.logout(authHeaderUtils.extractBearerToken(authorization));
        return Map.of("status", "ok");
    }

    @GetMapping("/auth/me")
    public UserPublic me(@RequestHeader(value = "Authorization", required = false) String authorization) {
        return authService.getCurrentUser(authHeaderUtils.extractBearerToken(authorization));
    }

    @GetMapping("/users")
    public UserListResponse listUsers(
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(name = "page_size", defaultValue = "10") int pageSize,
            @RequestHeader(value = "Authorization", required = false) String authorization
    ) {
        return authService.listUsers(page, pageSize, authHeaderUtils.extractBearerToken(authorization));
    }

    @PostMapping("/users")
    public UserPublic createUser(
            @Valid @RequestBody UserCreateRequest request,
            @RequestHeader(value = "Authorization", required = false) String authorization
    ) {
        return authService.createUser(request, authHeaderUtils.extractBearerToken(authorization));
    }

    @PatchMapping("/users/{userId}")
    public UserPublic updateUser(
            @PathVariable long userId,
            @Valid @RequestBody UserUpdateRequest request,
            @RequestHeader(value = "Authorization", required = false) String authorization
    ) {
        return authService.updateUser(userId, request, authHeaderUtils.extractBearerToken(authorization));
    }

    @DeleteMapping("/users/{userId}")
    public Map<String, String> deleteUser(
            @PathVariable long userId,
            @RequestHeader(value = "Authorization", required = false) String authorization
    ) {
        authService.deleteUser(userId, authHeaderUtils.extractBearerToken(authorization));
        return Map.of("status", "deleted");
    }
}
