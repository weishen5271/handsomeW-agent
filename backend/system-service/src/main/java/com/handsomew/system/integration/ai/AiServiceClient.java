package com.handsomew.system.integration.ai;

import com.handsomew.system.integration.ai.dto.AiServiceHealth;
import org.springframework.stereotype.Component;
import org.springframework.web.reactive.function.client.WebClient;

@Component
public class AiServiceClient {

    private final WebClient aiWebClient;

    public AiServiceClient(WebClient aiWebClient) {
        this.aiWebClient = aiWebClient;
    }

    public AiServiceHealth health() {
        return aiWebClient.get()
                .uri("/health")
                .retrieve()
                .bodyToMono(AiServiceHealth.class)
                .blockOptional()
                .orElse(new AiServiceHealth("unreachable", "unknown"));
    }
}
