package com.handsomew.system.auth.model;

import java.util.List;

public record UserListResponse(
        List<UserPublic> items,
        int page,
        int page_size,
        int total
) {
}
