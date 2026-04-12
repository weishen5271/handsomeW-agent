package com.handsomew.system.digitaltwin.model;

import java.time.OffsetDateTime;

public record ResourceItemResponse(
        String id,
        String name,
        String original_file_name,
        String object_key,
        String url,
        long file_size,
        String content_type,
        OffsetDateTime created_at,
        OffsetDateTime updated_at
) {
}
