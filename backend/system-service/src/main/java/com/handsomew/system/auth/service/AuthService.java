package com.handsomew.system.auth.service;

import com.handsomew.system.auth.dto.UserCreateRequest;
import com.handsomew.system.auth.dto.UserLoginRequest;
import com.handsomew.system.auth.dto.UserRegisterRequest;
import com.handsomew.system.auth.dto.UserUpdateRequest;
import com.handsomew.system.auth.model.AuthResponse;
import com.handsomew.system.auth.model.UserListResponse;
import com.handsomew.system.auth.model.UserPublic;
import com.handsomew.system.auth.model.UserRole;
import com.handsomew.system.common.error.ApiException;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

import java.security.MessageDigest;
import java.util.List;

@Service
public class AuthService {

    private final AuthRepository authRepository;
    private final PasswordHasher passwordHasher;

    public AuthService(AuthRepository authRepository, PasswordHasher passwordHasher) {
        this.authRepository = authRepository;
        this.passwordHasher = passwordHasher;
    }

    public AuthResponse register(UserRegisterRequest request) {
        UserRole role = authRepository.countUsers() == 0 ? UserRole.admin : UserRole.user;
        UserPublic user = createUserInternal(request.username().trim(), request.password(), role);
        String token = authRepository.createSession(user.id());
        return new AuthResponse(token, user);
    }

    public AuthResponse login(UserLoginRequest request) {
        authRepository.cleanupExpiredSessions();
        AuthRepository.UserRecord user = authRepository.findUserByUsername(request.username().trim())
                .orElseThrow(() -> new ApiException(HttpStatus.UNAUTHORIZED, "用户名或密码错误"));
        String expected = passwordHasher.hashPassword(request.password(), user.salt());
        if (!MessageDigest.isEqual(expected.getBytes(), user.passwordHash().getBytes())) {
            throw new ApiException(HttpStatus.UNAUTHORIZED, "用户名或密码错误");
        }
        String token = authRepository.createSession(user.id());
        return new AuthResponse(token, new UserPublic(user.id(), user.username(), user.role(), user.createdAt()));
    }

    public void logout(String token) {
        authRepository.revokeSession(token);
    }

    public UserPublic getCurrentUser(String token) {
        authRepository.cleanupExpiredSessions();
        return authRepository.findUserByToken(token)
                .orElseThrow(() -> new ApiException(HttpStatus.UNAUTHORIZED, "登录状态无效或已过期"));
    }

    public UserPublic requireAdmin(String token) {
        UserPublic user = getCurrentUser(token);
        if (user.role() != UserRole.admin) {
            throw new ApiException(HttpStatus.FORBIDDEN, "需要管理员权限");
        }
        return user;
    }

    public UserListResponse listUsers(int page, int pageSize, String token) {
        requireAdmin(token);
        List<UserPublic> items = authRepository.listUsers(page, pageSize);
        return new UserListResponse(items, page, pageSize, authRepository.countUserList());
    }

    public UserPublic createUser(UserCreateRequest request, String token) {
        requireAdmin(token);
        return createUserInternal(request.username().trim(), request.password(), request.role());
    }

    public UserPublic updateUser(long userId, UserUpdateRequest request, String token) {
        UserPublic currentAdmin = requireAdmin(token);
        if (request.role() == UserRole.user && currentAdmin.id() == userId) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "不能将自己降级为普通用户");
        }
        String newSalt = null;
        String newPasswordHash = null;
        if (request.password() != null && !request.password().isBlank()) {
            newSalt = passwordHasher.generateSaltHex();
            newPasswordHash = passwordHasher.hashPassword(request.password(), newSalt);
        }
        try {
            return authRepository.updateUser(userId, blankToNull(request.username()), newPasswordHash, newSalt, request.role())
                    .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "用户不存在"));
        } catch (DuplicateKeyException ex) {
            throw new ApiException(HttpStatus.CONFLICT, "用户名已存在");
        }
    }

    public void deleteUser(long userId, String token) {
        UserPublic currentAdmin = requireAdmin(token);
        if (currentAdmin.id() == userId) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "不能删除当前登录用户");
        }
        if (!authRepository.deleteUser(userId)) {
            throw new ApiException(HttpStatus.NOT_FOUND, "用户不存在");
        }
    }

    private UserPublic createUserInternal(String username, String password, UserRole role) {
        String salt = passwordHasher.generateSaltHex();
        String passwordHash = passwordHasher.hashPassword(password, salt);
        try {
            return authRepository.createUser(username, passwordHash, salt, role);
        } catch (DuplicateKeyException ex) {
            throw new ApiException(HttpStatus.CONFLICT, "用户名已存在");
        }
    }

    private String blankToNull(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        return value.trim();
    }
}
