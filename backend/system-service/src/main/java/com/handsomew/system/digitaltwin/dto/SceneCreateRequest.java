package com.handsomew.system.digitaltwin.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record SceneCreateRequest(
        @NotBlank @Size(max = 64) String id,
        @NotBlank @Size(max = 128) String name,
        @Size(max = 512) String description
) {
}
