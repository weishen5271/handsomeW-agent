package com.handsomew.system.digitaltwin.dto;

import com.handsomew.system.digitaltwin.model.AssetStatus;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Size;

import java.util.Map;

public record DigitalAssetUpdateRequest(
        @Size(min = 1, max = 128) String name,
        @Size(min = 1, max = 64) String type,
        AssetStatus status,
        @Size(min = 1, max = 128) String location,
        @Min(0) @Max(100) Integer health,
        @Size(min = 1, max = 256) String model_file,
        @Size(max = 512) String minio_object_key,
        Map<String, Object> metadata
) {
}
