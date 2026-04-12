package com.handsomew.system.alarmflow.model;

import java.util.List;

public record AlarmFlowLogListResponse(
        List<AlarmFlowLogResponse> logs
) {
}
