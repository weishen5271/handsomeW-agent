package com.handsomew.system.digitaltwin.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record SceneRelationItem(
        @NotBlank @Size(max = 64) String source_asset_id,
        @NotBlank @Size(max = 64) String target_asset_id,
        @NotBlank @Size(max = 64) String relation_type
) {
}
