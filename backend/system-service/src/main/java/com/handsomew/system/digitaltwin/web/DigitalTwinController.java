package com.handsomew.system.digitaltwin.web;

import com.handsomew.system.auth.web.AuthHeaderUtils;
import com.handsomew.system.digitaltwin.dto.*;
import com.handsomew.system.digitaltwin.model.*;
import com.handsomew.system.digitaltwin.service.DigitalTwinService;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/digital-twin")
public class DigitalTwinController {

    private final DigitalTwinService digitalTwinService;
    private final AuthHeaderUtils authHeaderUtils;

    public DigitalTwinController(DigitalTwinService digitalTwinService, AuthHeaderUtils authHeaderUtils) {
        this.digitalTwinService = digitalTwinService;
        this.authHeaderUtils = authHeaderUtils;
    }

    @GetMapping("/assets")
    public DigitalAssetListResponse getAssets(
            @RequestParam(required = false) String keyword,
            @RequestParam(required = false, name = "status") String status,
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(name = "page_size", defaultValue = "10") int pageSize,
            @RequestHeader(value = "Authorization", required = false) String authorization
    ) {
        return digitalTwinService.listAssets(keyword, status, page, pageSize, authHeaderUtils.extractBearerToken(authorization));
    }

    @PostMapping("/assets")
    public DigitalAssetResponse createAsset(
            @Valid @RequestBody DigitalAssetCreateRequest request,
            @RequestHeader(value = "Authorization", required = false) String authorization
    ) {
        return digitalTwinService.createAsset(request, authHeaderUtils.extractBearerToken(authorization));
    }

    @PatchMapping("/assets/{assetId}")
    public DigitalAssetResponse updateAsset(
            @PathVariable String assetId,
            @Valid @RequestBody DigitalAssetUpdateRequest request,
            @RequestHeader(value = "Authorization", required = false) String authorization
    ) {
        return digitalTwinService.updateAsset(assetId, request, authHeaderUtils.extractBearerToken(authorization));
    }

    @DeleteMapping("/assets/{assetId}")
    public Map<String, String> deleteAsset(
            @PathVariable String assetId,
            @RequestHeader(value = "Authorization", required = false) String authorization
    ) {
        return digitalTwinService.deleteAsset(assetId, authHeaderUtils.extractBearerToken(authorization));
    }

    @GetMapping("/assets/{assetId}")
    public DigitalAssetResponse getAsset(
            @PathVariable String assetId,
            @RequestHeader(value = "Authorization", required = false) String authorization
    ) {
        return digitalTwinService.getAsset(assetId, authHeaderUtils.extractBearerToken(authorization));
    }

    @GetMapping("/assets/{assetId}/relations")
    public List<AssetRelationResponse> getAssetRelations(
            @PathVariable String assetId,
            @RequestHeader(value = "Authorization", required = false) String authorization
    ) {
        return digitalTwinService.getAssetRelations(assetId, authHeaderUtils.extractBearerToken(authorization));
    }

    @GetMapping("/resources")
    public ResourceListResponse getResources(
            @RequestParam(required = false) String keyword,
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(name = "page_size", defaultValue = "10") int pageSize,
            @RequestHeader(value = "Authorization", required = false) String authorization
    ) {
        return digitalTwinService.listResources(keyword, page, pageSize, authHeaderUtils.extractBearerToken(authorization));
    }

    @DeleteMapping("/resources/{resourceId}")
    public Map<String, String> deleteResource(
            @PathVariable String resourceId,
            @RequestHeader(value = "Authorization", required = false) String authorization
    ) {
        return digitalTwinService.deleteResource(resourceId, authHeaderUtils.extractBearerToken(authorization));
    }

    @PostMapping("/resources/upload")
    public ResourceItemResponse uploadResource(
            @RequestParam("file") MultipartFile file,
            @RequestParam(value = "name", required = false) String name,
            @RequestHeader(value = "Authorization", required = false) String authorization
    ) {
        return digitalTwinService.uploadResource(file, name, authHeaderUtils.extractBearerToken(authorization));
    }

    @GetMapping("/resources/{resourceId}/preview-url")
    public ResourcePreviewUrlResponse previewResource(
            @PathVariable String resourceId,
            @RequestHeader(value = "Authorization", required = false) String authorization
    ) {
        return digitalTwinService.previewResource(resourceId, authHeaderUtils.extractBearerToken(authorization));
    }

    @GetMapping("/scenes")
    public SceneSummaryListResponse getScenes(
            @RequestParam(required = false) String keyword,
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(name = "page_size", defaultValue = "10") int pageSize,
            @RequestHeader(value = "Authorization", required = false) String authorization
    ) {
        return digitalTwinService.listScenes(keyword, page, pageSize, authHeaderUtils.extractBearerToken(authorization));
    }

    @PostMapping("/scenes")
    public SceneSummaryResponse createScene(
            @Valid @RequestBody SceneCreateRequest request,
            @RequestHeader(value = "Authorization", required = false) String authorization
    ) {
        return digitalTwinService.createScene(request, authHeaderUtils.extractBearerToken(authorization));
    }

    @PatchMapping("/scenes/{sceneId}")
    public SceneSummaryResponse updateScene(
            @PathVariable String sceneId,
            @Valid @RequestBody SceneUpdateRequest request,
            @RequestHeader(value = "Authorization", required = false) String authorization
    ) {
        return digitalTwinService.updateScene(sceneId, request, authHeaderUtils.extractBearerToken(authorization));
    }

    @DeleteMapping("/scenes/{sceneId}")
    public Map<String, String> deleteScene(
            @PathVariable String sceneId,
            @RequestHeader(value = "Authorization", required = false) String authorization
    ) {
        return digitalTwinService.deleteScene(sceneId, authHeaderUtils.extractBearerToken(authorization));
    }

    @GetMapping("/scenes/{sceneId}")
    public SceneResponse getScene(
            @PathVariable String sceneId,
            @RequestHeader(value = "Authorization", required = false) String authorization
    ) {
        return digitalTwinService.getScene(sceneId, authHeaderUtils.extractBearerToken(authorization));
    }

    @GetMapping("/scenes/{sceneId}/assets")
    public List<DigitalAssetResponse> getSceneAssets(
            @PathVariable String sceneId,
            @RequestHeader(value = "Authorization", required = false) String authorization
    ) {
        return digitalTwinService.getSceneAssets(sceneId, authHeaderUtils.extractBearerToken(authorization));
    }

    @PutMapping("/scenes/{sceneId}/assets")
    public List<DigitalAssetResponse> replaceSceneAssets(
            @PathVariable String sceneId,
            @RequestBody SceneAssetsReplaceRequest request,
            @RequestHeader(value = "Authorization", required = false) String authorization
    ) {
        return digitalTwinService.replaceSceneAssets(sceneId, request, authHeaderUtils.extractBearerToken(authorization));
    }

    @PutMapping("/scenes/{sceneId}/instances")
    public Map<String, Object> upsertSceneInstance(
            @PathVariable String sceneId,
            @Valid @RequestBody SceneInstanceUpsertRequest request,
            @RequestHeader(value = "Authorization", required = false) String authorization
    ) {
        return digitalTwinService.upsertSceneInstance(sceneId, request, authHeaderUtils.extractBearerToken(authorization));
    }

    @GetMapping("/scenes/{sceneId}/relations")
    public List<SceneRelationResponse> getSceneRelations(
            @PathVariable String sceneId,
            @RequestHeader(value = "Authorization", required = false) String authorization
    ) {
        return digitalTwinService.getSceneRelations(sceneId, authHeaderUtils.extractBearerToken(authorization));
    }

    @PutMapping("/scenes/{sceneId}/relations")
    public List<SceneRelationResponse> replaceSceneRelations(
            @PathVariable String sceneId,
            @RequestBody SceneRelationsReplaceRequest request,
            @RequestHeader(value = "Authorization", required = false) String authorization
    ) {
        return digitalTwinService.replaceSceneRelations(sceneId, request, authHeaderUtils.extractBearerToken(authorization));
    }
}
