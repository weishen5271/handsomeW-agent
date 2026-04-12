package com.handsomew.system.system.controller;

import com.handsomew.system.common.api.ApiResponse;
import com.handsomew.system.common.api.HealthPayload;
import com.handsomew.system.integration.ai.AiServiceClient;
import com.handsomew.system.integration.ai.dto.AiServiceHealth;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.LinkedHashMap;
import java.util.Map;

@RestController
@RequestMapping
public class SystemHealthController {

    private final AiServiceClient aiServiceClient;

    @Value("${spring.application.version:0.1.0}")
    private String version;

    public SystemHealthController(AiServiceClient aiServiceClient) {
        this.aiServiceClient = aiServiceClient;
    }

    @GetMapping("/health")
    public Map<String, String> health() {
        return Map.of("status", "ok", "service", "system-service");
    }

    @GetMapping("/api/system/health")
    public ApiResponse<HealthPayload> systemHealth() {
        return ApiResponse.success(new HealthPayload("system-service", "ok", version));
    }

    @GetMapping("/api/system/dependencies")
    public ApiResponse<Map<String, Object>> dependencies() {
        AiServiceHealth aiHealth = aiServiceClient.health();
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("systemService", Map.of("status", "ok", "service", "system-service"));
        payload.put("aiService", aiHealth);
        return ApiResponse.success(payload);
    }
}
