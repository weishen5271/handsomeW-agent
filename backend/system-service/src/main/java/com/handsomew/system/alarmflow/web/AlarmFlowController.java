package com.handsomew.system.alarmflow.web;

import com.handsomew.system.alarmflow.dto.AlarmFlowSaveRequest;
import com.handsomew.system.alarmflow.model.*;
import com.handsomew.system.alarmflow.service.AlarmFlowService;
import com.handsomew.system.auth.web.AuthHeaderUtils;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/digital-twin/assets/{assetId}/alarm-flow")
public class AlarmFlowController {

    private final AlarmFlowService alarmFlowService;
    private final AuthHeaderUtils authHeaderUtils;

    public AlarmFlowController(AlarmFlowService alarmFlowService, AuthHeaderUtils authHeaderUtils) {
        this.alarmFlowService = alarmFlowService;
        this.authHeaderUtils = authHeaderUtils;
    }

    @PostMapping
    public AlarmFlowResponse save(@PathVariable String assetId,
                                  @Valid @RequestBody AlarmFlowSaveRequest request,
                                  @RequestHeader(value = "Authorization", required = false) String authorization) {
        return alarmFlowService.save(assetId, request, authHeaderUtils.extractBearerToken(authorization));
    }

    @GetMapping
    public AlarmFlowResponse get(@PathVariable String assetId,
                                 @RequestHeader(value = "Authorization", required = false) String authorization) {
        return alarmFlowService.get(assetId, authHeaderUtils.extractBearerToken(authorization));
    }

    @DeleteMapping
    public AlarmFlowDeleteResponse delete(@PathVariable String assetId,
                                          @RequestHeader(value = "Authorization", required = false) String authorization) {
        return alarmFlowService.delete(assetId, authHeaderUtils.extractBearerToken(authorization));
    }

    @PostMapping("/deploy")
    public AlarmFlowDeployResponse deploy(@PathVariable String assetId,
                                          @RequestHeader(value = "Authorization", required = false) String authorization) {
        return alarmFlowService.deploy(assetId, authHeaderUtils.extractBearerToken(authorization));
    }

    @PostMapping("/stop")
    public AlarmFlowDeployResponse stop(@PathVariable String assetId,
                                        @RequestHeader(value = "Authorization", required = false) String authorization) {
        return alarmFlowService.stop(assetId, authHeaderUtils.extractBearerToken(authorization));
    }

    @GetMapping("/logs")
    public AlarmFlowLogListResponse logs(@PathVariable String assetId,
                                         @RequestParam(required = false, name = "node_id") String nodeId,
                                         @RequestParam(defaultValue = "50") int limit,
                                         @RequestHeader(value = "Authorization", required = false) String authorization) {
        return alarmFlowService.logs(assetId, nodeId, limit, authHeaderUtils.extractBearerToken(authorization));
    }

    @GetMapping("/live-logs")
    public AlarmFlowLiveLogListResponse liveLogs(@PathVariable String assetId,
                                                 @RequestHeader(value = "Authorization", required = false) String authorization) {
        return alarmFlowService.liveLogs(assetId, authHeaderUtils.extractBearerToken(authorization));
    }

    @DeleteMapping("/live-logs")
    public AlarmFlowDeleteResponse clearLiveLogs(@PathVariable String assetId,
                                                 @RequestHeader(value = "Authorization", required = false) String authorization) {
        return alarmFlowService.clearLiveLogs(assetId, authHeaderUtils.extractBearerToken(authorization));
    }
}
