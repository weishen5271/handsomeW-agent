package com.handsomew.system.alarmflow.model;

import java.time.OffsetDateTime;

public record AlarmFlowLogResponse(
        String node_id,
        OffsetDateTime timestamp,
        String status,
        int input_count,
        int output_count,
        int duration_ms,
        String error,
        String message
) {
}
