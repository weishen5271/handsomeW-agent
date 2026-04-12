package com.handsomew.system.alarmflow.model;

import java.time.OffsetDateTime;
import java.util.List;

public record AlarmFlowResponse(
        String id,
        String asset_id,
        String name,
        boolean enabled,
        String schedule,
        String status,
        List<AlarmFlowNode> nodes,
        List<AlarmFlowEdge> edges,
        OffsetDateTime created_at,
        OffsetDateTime updated_at
) {
}
