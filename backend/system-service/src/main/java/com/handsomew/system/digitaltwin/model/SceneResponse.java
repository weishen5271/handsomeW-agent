package com.handsomew.system.digitaltwin.model;

import java.time.OffsetDateTime;
import java.util.List;

public record SceneResponse(
        String scene_id,
        String name,
        String description,
        OffsetDateTime created_at,
        OffsetDateTime updated_at,
        int asset_count,
        List<SceneInstanceResponse> instances,
        List<SceneRelationResponse> relations
) {
}
