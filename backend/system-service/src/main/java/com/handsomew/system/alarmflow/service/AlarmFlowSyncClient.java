package com.handsomew.system.alarmflow.service;

import com.handsomew.system.alarmflow.model.AlarmFlowDeleteResponse;
import com.handsomew.system.alarmflow.model.AlarmFlowDeployResponse;
import com.handsomew.system.alarmflow.model.AlarmFlowLiveLogListResponse;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.reactive.function.client.WebClient;

@Component
public class AlarmFlowSyncClient {

    private final WebClient aiWebClient;

    public AlarmFlowSyncClient(WebClient aiWebClient) {
        this.aiWebClient = aiWebClient;
    }

    public AlarmFlowDeployResponse deploy(String assetId, String token) {
        return aiWebClient.post()
                .uri("/digital-twin/assets/" + assetId + "/alarm-flow/deploy")
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                .accept(MediaType.APPLICATION_JSON)
                .retrieve()
                .bodyToMono(AlarmFlowDeployResponse.class)
                .block();
    }

    public AlarmFlowDeployResponse stop(String assetId, String token) {
        return aiWebClient.post()
                .uri("/digital-twin/assets/" + assetId + "/alarm-flow/stop")
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                .accept(MediaType.APPLICATION_JSON)
                .retrieve()
                .bodyToMono(AlarmFlowDeployResponse.class)
                .block();
    }

    public AlarmFlowLiveLogListResponse liveLogs(String assetId, String token) {
        return aiWebClient.get()
                .uri("/digital-twin/assets/" + assetId + "/alarm-flow/live-logs")
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                .accept(MediaType.APPLICATION_JSON)
                .retrieve()
                .bodyToMono(AlarmFlowLiveLogListResponse.class)
                .block();
    }

    public AlarmFlowDeleteResponse clearLiveLogs(String assetId, String token) {
        return aiWebClient.delete()
                .uri("/digital-twin/assets/" + assetId + "/alarm-flow/live-logs")
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                .accept(MediaType.APPLICATION_JSON)
                .retrieve()
                .bodyToMono(AlarmFlowDeleteResponse.class)
                .block();
    }
}
