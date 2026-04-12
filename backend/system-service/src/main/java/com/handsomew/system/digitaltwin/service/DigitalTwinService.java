package com.handsomew.system.digitaltwin.service;

import com.handsomew.system.auth.service.AuthService;
import com.handsomew.system.common.error.ApiException;
import com.handsomew.system.digitaltwin.dto.*;
import com.handsomew.system.digitaltwin.model.*;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;
import java.util.Map;

@Service
public class DigitalTwinService {

    private final DigitalTwinRepository repository;
    private final AuthService authService;
    private final MinioStorageService minioStorageService;

    public DigitalTwinService(DigitalTwinRepository repository, AuthService authService, MinioStorageService minioStorageService) {
        this.repository = repository;
        this.authService = authService;
        this.minioStorageService = minioStorageService;
    }

    public DigitalAssetListResponse listAssets(String keyword, String status, int page, int pageSize, String token) {
        authService.getCurrentUser(token);
        return repository.listAssets(keyword, status, page, pageSize);
    }

    public DigitalAssetResponse createAsset(DigitalAssetCreateRequest request, String token) {
        authService.getCurrentUser(token);
        try {
            return repository.createAsset(request);
        } catch (DuplicateKeyException ex) {
            throw new ApiException(HttpStatus.CONFLICT, "资产 ID 已存在");
        }
    }

    public DigitalAssetResponse updateAsset(String assetId, DigitalAssetUpdateRequest request, String token) {
        authService.getCurrentUser(token);
        return repository.updateAsset(assetId, request).orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "资产不存在"));
    }

    public Map<String, String> deleteAsset(String assetId, String token) {
        authService.getCurrentUser(token);
        if (!repository.deleteAsset(assetId)) {
            throw new ApiException(HttpStatus.NOT_FOUND, "资产不存在");
        }
        return Map.of("status", "deleted");
    }

    public DigitalAssetResponse getAsset(String assetId, String token) {
        authService.getCurrentUser(token);
        return repository.getAsset(assetId).orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "资产不存在"));
    }

    public List<AssetRelationResponse> getAssetRelations(String assetId, String token) {
        authService.getCurrentUser(token);
        return repository.listAssetRelations(assetId);
    }

    public ResourceListResponse listResources(String keyword, int page, int pageSize, String token) {
        authService.getCurrentUser(token);
        return repository.listResources(keyword, page, pageSize);
    }

    public Map<String, String> deleteResource(String resourceId, String token) {
        authService.getCurrentUser(token);
        if (!repository.deleteResource(resourceId)) {
            throw new ApiException(HttpStatus.NOT_FOUND, "资源不存在");
        }
        return Map.of("status", "deleted");
    }

    public ResourceItemResponse uploadResource(MultipartFile file, String name, String token) {
        authService.getCurrentUser(token);
        if (file == null || file.isEmpty()) {
            throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, "上传文件为空");
        }
        String originalName = file.getOriginalFilename() == null ? "" : file.getOriginalFilename().trim();
        if (originalName.isEmpty()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "缺少文件名");
        }
        String lower = originalName.toLowerCase();
        if (!(lower.endsWith(".glb") || lower.endsWith(".gltf") || lower.endsWith(".obj") || lower.endsWith(".fbx"))) {
            throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, "仅支持以下格式: .fbx, .glb, .gltf, .obj");
        }
        if (file.getSize() > 100L * 1024 * 1024) {
            throw new ApiException(HttpStatus.PAYLOAD_TOO_LARGE, "文件大小不能超过 100MB");
        }
        MinioStorageService.UploadedResource uploaded = minioStorageService.uploadModel(file);
        String resourceName = (name == null || name.isBlank()) ? stripExtension(originalName) : name.trim();
        try {
            return repository.createResource(resourceName, uploaded.originalFileName(), uploaded.objectKey(), uploaded.url(), uploaded.fileSize(), uploaded.contentType());
        } catch (DuplicateKeyException ex) {
            throw new ApiException(HttpStatus.CONFLICT, "资源已存在，请重试上传");
        }
    }

    public ResourcePreviewUrlResponse previewResource(String resourceId, String token) {
        authService.getCurrentUser(token);
        ResourceItemResponse resource = repository.getResource(resourceId)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "资源不存在"));
        return new ResourcePreviewUrlResponse(resource.id(), resource.object_key(), minioStorageService.previewUrl(resource.object_key()), 3600);
    }

    public SceneSummaryListResponse listScenes(String keyword, int page, int pageSize, String token) {
        authService.getCurrentUser(token);
        return repository.listScenes(keyword, page, pageSize);
    }

    public SceneSummaryResponse createScene(SceneCreateRequest request, String token) {
        authService.getCurrentUser(token);
        try {
            return repository.createScene(request);
        } catch (DuplicateKeyException ex) {
            throw new ApiException(HttpStatus.CONFLICT, "场景 ID 已存在");
        }
    }

    public SceneSummaryResponse updateScene(String sceneId, SceneUpdateRequest request, String token) {
        authService.getCurrentUser(token);
        return repository.updateScene(sceneId, request).orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "场景不存在"));
    }

    public Map<String, String> deleteScene(String sceneId, String token) {
        authService.getCurrentUser(token);
        if (!repository.deleteScene(sceneId)) {
            throw new ApiException(HttpStatus.NOT_FOUND, "场景不存在");
        }
        return Map.of("status", "deleted");
    }

    public SceneResponse getScene(String sceneId, String token) {
        authService.getCurrentUser(token);
        return repository.getScene(sceneId).orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "场景不存在"));
    }

    public List<DigitalAssetResponse> getSceneAssets(String sceneId, String token) {
        authService.getCurrentUser(token);
        repository.getScene(sceneId).orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "场景不存在"));
        return repository.listSceneAssets(sceneId);
    }

    public List<DigitalAssetResponse> replaceSceneAssets(String sceneId, SceneAssetsReplaceRequest request, String token) {
        authService.getCurrentUser(token);
        try {
            return repository.replaceSceneAssets(sceneId, request.asset_ids() == null ? List.of() : request.asset_ids())
                    .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "场景不存在"));
        } catch (Exception ex) {
            throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, ex.getMessage());
        }
    }

    public Map<String, Object> upsertSceneInstance(String sceneId, SceneInstanceUpsertRequest request, String token) {
        authService.getCurrentUser(token);
        return repository.upsertSceneInstance(sceneId, request).orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "场景不存在"));
    }

    public List<SceneRelationResponse> getSceneRelations(String sceneId, String token) {
        authService.getCurrentUser(token);
        repository.getScene(sceneId).orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "场景不存在"));
        return repository.listSceneRelations(sceneId);
    }

    public List<SceneRelationResponse> replaceSceneRelations(String sceneId, SceneRelationsReplaceRequest request, String token) {
        authService.getCurrentUser(token);
        try {
            return repository.replaceSceneRelations(sceneId, request.relations() == null ? List.of() : request.relations())
                    .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "场景不存在"));
        } catch (IllegalArgumentException ex) {
            throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, ex.getMessage());
        }
    }

    private String stripExtension(String filename) {
        int index = filename.lastIndexOf('.');
        return index > 0 ? filename.substring(0, index) : filename;
    }
}
