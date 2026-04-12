package com.handsomew.system.alarmflow.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record AlarmFlowEdgeRequest(
        @NotBlank @Size(max = 128) String source,
        @NotBlank @Size(max = 128) String target
) {
}
