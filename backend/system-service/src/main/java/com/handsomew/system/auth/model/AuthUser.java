package com.handsomew.system.auth.model;

public record AuthUser(
        long id,
        String username,
        UserRole role
) {
}
