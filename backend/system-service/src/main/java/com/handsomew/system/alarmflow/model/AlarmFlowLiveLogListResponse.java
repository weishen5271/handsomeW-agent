package com.handsomew.system.alarmflow.model;

import java.util.List;

public record AlarmFlowLiveLogListResponse(
        List<AlarmFlowLiveLogResponse> logs
) {
}
