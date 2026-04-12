package com.handsomew.system.common.api;

public record HealthPayload(
        String service,
        String status,
        String version
) {
}
