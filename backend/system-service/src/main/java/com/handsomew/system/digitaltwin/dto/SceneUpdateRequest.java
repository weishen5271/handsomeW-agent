package com.handsomew.system.digitaltwin.dto;

import jakarta.validation.constraints.Size;

public record SceneUpdateRequest(
        @Size(min = 1, max = 128) String name,
        @Size(max = 512) String description
) {
}
