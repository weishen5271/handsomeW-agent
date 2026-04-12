package com.handsomew.system.digitaltwin.model;

import java.time.OffsetDateTime;

public record SceneSummaryResponse(
        String id,
        String name,
        String description,
        OffsetDateTime created_at,
        OffsetDateTime updated_at,
        int asset_count
) {
}
