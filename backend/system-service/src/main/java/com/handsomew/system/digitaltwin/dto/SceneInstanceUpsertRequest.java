package com.handsomew.system.digitaltwin.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;

public record SceneInstanceUpsertRequest(
        @NotBlank @Size(max = 64) String asset_id,
        double position_x,
        double position_y,
        double position_z,
        double rotation_x,
        double rotation_y,
        double rotation_z,
        @Positive double scale
) {
}
