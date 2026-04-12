package com.handsomew.system.auth.dto;

import com.handsomew.system.auth.model.UserRole;
import jakarta.validation.constraints.Size;

public record UserUpdateRequest(
        @Size(min = 3, max = 32) String username,
        @Size(min = 6, max = 128) String password,
        UserRole role
) {
}
