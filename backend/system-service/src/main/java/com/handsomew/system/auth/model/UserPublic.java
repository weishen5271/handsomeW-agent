package com.handsomew.system.auth.model;

import java.time.OffsetDateTime;

public record UserPublic(
        long id,
        String username,
        UserRole role,
        OffsetDateTime created_at
) {
}
