package com.handsomew.system.auth.model;

public record AuthResponse(
        String token,
        UserPublic user
) {
}
