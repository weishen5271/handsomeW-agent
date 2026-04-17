package com.handsomew.system.alarmflow.model;

import java.time.OffsetDateTime;

public record AlarmFlowLiveLogResponse(
        String id,
        OffsetDateTime timestamp,
        String level,
        String message,
        String node_id
) {
}
