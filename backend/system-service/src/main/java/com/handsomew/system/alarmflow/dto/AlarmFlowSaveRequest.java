package com.handsomew.system.alarmflow.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import java.util.List;

public record AlarmFlowSaveRequest(
        @NotBlank @Size(max = 200) String name,
        boolean enabled,
        @Size(max = 100) String schedule,
        @Valid List<AlarmFlowNodeRequest> nodes,
        @Valid List<AlarmFlowEdgeRequest> edges
) {
}
