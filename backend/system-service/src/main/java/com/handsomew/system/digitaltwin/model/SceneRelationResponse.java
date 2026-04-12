package com.handsomew.system.digitaltwin.model;

import java.time.OffsetDateTime;

public record SceneRelationResponse(
        String source_asset_id,
        String target_asset_id,
        String relation_type,
        OffsetDateTime created_at
) {
}
