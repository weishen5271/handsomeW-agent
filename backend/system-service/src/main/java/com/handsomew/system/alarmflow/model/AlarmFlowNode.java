package com.handsomew.system.alarmflow.model;

import java.util.Map;

public record AlarmFlowNode(
        String id,
        String type,
        AlarmFlowNodePosition position,
        Map<String, Object> config
) {
}
