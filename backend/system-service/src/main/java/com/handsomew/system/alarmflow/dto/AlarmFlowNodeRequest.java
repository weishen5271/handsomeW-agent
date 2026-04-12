package com.handsomew.system.alarmflow.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import java.util.Map;

public record AlarmFlowNodeRequest(
        @NotBlank @Size(max = 128) String id,
        @NotBlank @Size(max = 64) String type,
        AlarmFlowNodePositionRequest position,
        Map<String, Object> config
) {
}
