package com.handsomew.system.digitaltwin.dto;

import com.handsomew.system.digitaltwin.model.AssetStatus;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.util.Map;

public record DigitalAssetCreateRequest(
        @NotBlank @Size(max = 64) String id,
        @NotBlank @Size(max = 128) String name,
        @NotBlank @Size(max = 64) String type,
        @NotNull AssetStatus status,
        @NotBlank @Size(max = 128) String location,
        @Min(0) @Max(100) int health,
        @NotBlank @Size(max = 256) String model_file,
        @Size(max = 512) String minio_object_key,
        Map<String, Object> metadata
) {
}
