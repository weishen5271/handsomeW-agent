package com.handsomew.system.alarmflow.service;

import com.handsomew.system.alarmflow.dto.AlarmFlowSaveRequest;
import com.handsomew.system.alarmflow.model.*;
import com.handsomew.system.auth.service.AuthService;
import com.handsomew.system.common.error.ApiException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClientResponseException;

@Service
public class AlarmFlowService {

    private final AlarmFlowRepository repository;
    private final AlarmFlowSyncClient syncClient;
    private final AuthService authService;

    public AlarmFlowService(AlarmFlowRepository repository, AlarmFlowSyncClient syncClient, AuthService authService) {
        this.repository = repository;
        this.syncClient = syncClient;
        this.authService = authService;
    }

    public AlarmFlowResponse save(String assetId, AlarmFlowSaveRequest request, String token) {
        authService.getCurrentUser(token);
        AlarmFlowResponse flow = repository.upsert(assetId, request);
        if ("running".equals(flow.status())) {
            syncClient.deploy(assetId, token);
            return repository.findByAssetId(assetId).orElse(flow);
        }
        return flow;
    }

    public AlarmFlowResponse get(String assetId, String token) {
        authService.getCurrentUser(token);
        return repository.findByAssetId(assetId)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "告警流程不存在"));
    }

    public AlarmFlowDeleteResponse delete(String assetId, String token) {
        authService.getCurrentUser(token);
        try {
            syncClient.stop(assetId, token);
        } catch (WebClientResponseException ignored) {
            // Ignore scheduler sync errors on delete and continue cleaning config.
        }
        if (!repository.deleteByAssetId(assetId)) {
            throw new ApiException(HttpStatus.NOT_FOUND, "告警流程不存在");
        }
        return new AlarmFlowDeleteResponse("deleted");
    }

    public AlarmFlowDeployResponse deploy(String assetId, String token) {
        authService.getCurrentUser(token);
        repository.findByAssetId(assetId)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "告警流程不存在"));
        return syncClient.deploy(assetId, token);
    }

    public AlarmFlowDeployResponse stop(String assetId, String token) {
        authService.getCurrentUser(token);
        repository.findByAssetId(assetId)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "告警流程不存在"));
        return syncClient.stop(assetId, token);
    }

    public AlarmFlowLogListResponse logs(String assetId, String nodeId, int limit, String token) {
        authService.getCurrentUser(token);
        return new AlarmFlowLogListResponse(repository.listLogs(assetId, nodeId, limit));
    }

    public AlarmFlowLiveLogListResponse liveLogs(String assetId, String token) {
        authService.getCurrentUser(token);
        repository.findByAssetId(assetId)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "告警流程不存在"));
        return syncClient.liveLogs(assetId, token);
    }

    public AlarmFlowDeleteResponse clearLiveLogs(String assetId, String token) {
        authService.getCurrentUser(token);
        return syncClient.clearLiveLogs(assetId, token);
    }
}
