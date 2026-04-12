package com.handsomew.system.config;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpHeaders;
import org.springframework.web.reactive.function.client.WebClient;

@Configuration
@EnableConfigurationProperties({AiServiceProperties.class, MinioProperties.class, CorsProperties.class})
public class ClientConfig {

    @Bean
    public WebClient aiWebClient(AiServiceProperties properties) {
        WebClient.Builder builder = WebClient.builder().baseUrl(properties.getBaseUrl());
        if (!properties.getInternalToken().isBlank()) {
            builder.defaultHeader(HttpHeaders.AUTHORIZATION, "Bearer " + properties.getInternalToken());
        }
        return builder.build();
    }

}
