package com.handsomew.system.digitaltwin.model;

import java.time.OffsetDateTime;
import java.util.Map;

public record DigitalAssetResponse(
        String id,
        String name,
        String type,
        AssetStatus status,
        String location,
        int health,
        String model_file,
        String minio_object_key,
        Map<String, Object> metadata,
        OffsetDateTime created_at,
        OffsetDateTime updated_at
) {
}
