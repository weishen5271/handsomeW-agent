package com.handsomew.system.digitaltwin.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.handsomew.system.digitaltwin.dto.DigitalAssetCreateRequest;
import com.handsomew.system.digitaltwin.dto.DigitalAssetUpdateRequest;
import com.handsomew.system.digitaltwin.dto.SceneCreateRequest;
import com.handsomew.system.digitaltwin.dto.SceneInstanceUpsertRequest;
import com.handsomew.system.digitaltwin.dto.SceneRelationItem;
import com.handsomew.system.digitaltwin.dto.SceneUpdateRequest;
import com.handsomew.system.digitaltwin.model.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.OffsetDateTime;
import java.util.*;

@Repository
public class DigitalTwinRepository {

    private final JdbcTemplate jdbcTemplate;
    private final ObjectMapper objectMapper;

    public DigitalTwinRepository(JdbcTemplate jdbcTemplate, ObjectMapper objectMapper) {
        this.jdbcTemplate = jdbcTemplate;
        this.objectMapper = objectMapper;
    }

    public DigitalAssetListResponse listAssets(String keyword, String status, int page, int pageSize) {
        int offset = Math.max(0, (page - 1) * pageSize);
        List<Object> params = new ArrayList<>();
        StringBuilder where = new StringBuilder(" WHERE 1=1 ");
        if (keyword != null && !keyword.isBlank()) {
            String kw = "%" + keyword.trim() + "%";
            where.append(" AND (id ILIKE ? OR name ILIKE ? OR type ILIKE ? OR location ILIKE ?) ");
            params.add(kw);
            params.add(kw);
            params.add(kw);
            params.add(kw);
        }
        if (status != null && !status.isBlank()) {
            where.append(" AND status = ? ");
            params.add(status);
        }
        Integer total = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM digital_assets " + where,
                Integer.class,
                params.toArray()
        );
        List<DigitalAssetResponse> items = jdbcTemplate.query(
                """
                SELECT id, name, type, status, location, health, model_file, minio_object_key, metadata::text AS metadata_json, created_at, updated_at
                FROM digital_assets
                """ + where + " ORDER BY created_at DESC LIMIT ? OFFSET ?",
                (rs, rowNum) -> mapAsset(rs),
                append(params, pageSize, offset)
        );
        return new DigitalAssetListResponse(items, page, pageSize, total == null ? 0 : total);
    }

    public Optional<DigitalAssetResponse> getAsset(String assetId) {
        List<DigitalAssetResponse> items = jdbcTemplate.query(
                """
                SELECT id, name, type, status, location, health, model_file, minio_object_key, metadata::text AS metadata_json, created_at, updated_at
                FROM digital_assets
                WHERE id = ?
                """,
                (rs, rowNum) -> mapAsset(rs),
                assetId
        );
        return items.stream().findFirst();
    }

    public DigitalAssetResponse createAsset(DigitalAssetCreateRequest request) {
        return jdbcTemplate.queryForObject(
                """
                INSERT INTO digital_assets(id, name, type, status, location, health, model_file, minio_object_key, metadata, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, CAST(? AS jsonb), NOW(), NOW())
                RETURNING id, name, type, status, location, health, model_file, minio_object_key, metadata::text AS metadata_json, created_at, updated_at
                """,
                (rs, rowNum) -> mapAsset(rs),
                request.id().trim(),
                request.name().trim(),
                request.type().trim(),
                request.status().name(),
                request.location().trim(),
                request.health(),
                request.model_file().trim(),
                blankToNull(request.minio_object_key()),
                toJson(request.metadata())
        );
    }

    public Optional<DigitalAssetResponse> updateAsset(String assetId, DigitalAssetUpdateRequest request) {
        Optional<DigitalAssetResponse> current = getAsset(assetId);
        if (current.isEmpty()) {
            return Optional.empty();
        }
        DigitalAssetResponse base = current.get();
        List<DigitalAssetResponse> items = jdbcTemplate.query(
                """
                UPDATE digital_assets
                SET name = ?, type = ?, status = ?, location = ?, health = ?, model_file = ?, minio_object_key = ?, metadata = CAST(? AS jsonb), updated_at = NOW()
                WHERE id = ?
                RETURNING id, name, type, status, location, health, model_file, minio_object_key, metadata::text AS metadata_json, created_at, updated_at
                """,
                (rs, rowNum) -> mapAsset(rs),
                request.name() != null ? request.name().trim() : base.name(),
                request.type() != null ? request.type().trim() : base.type(),
                request.status() != null ? request.status().name() : base.status().name(),
                request.location() != null ? request.location().trim() : base.location(),
                request.health() != null ? request.health() : base.health(),
                request.model_file() != null ? request.model_file().trim() : base.model_file(),
                request.minio_object_key() != null ? blankToNull(request.minio_object_key()) : base.minio_object_key(),
                toJson(request.metadata() != null ? request.metadata() : base.metadata()),
                assetId
        );
        return items.stream().findFirst();
    }

    public boolean deleteAsset(String assetId) {
        return jdbcTemplate.update("DELETE FROM digital_assets WHERE id = ?", assetId) > 0;
    }

    public List<AssetRelationResponse> listAssetRelations(String assetId) {
        return jdbcTemplate.query(
                """
                SELECT source_asset_id, target_asset_id, relation_type, created_at
                FROM asset_relations
                WHERE source_asset_id = ? OR target_asset_id = ?
                ORDER BY created_at ASC
                """,
                (rs, rowNum) -> new AssetRelationResponse(
                        rs.getString("source_asset_id"),
                        rs.getString("target_asset_id"),
                        rs.getString("relation_type"),
                        rs.getObject("created_at", OffsetDateTime.class)
                ),
                assetId, assetId
        );
    }

    public ResourceListResponse listResources(String keyword, int page, int pageSize) {
        int offset = Math.max(0, (page - 1) * pageSize);
        List<Object> params = new ArrayList<>();
        String where = "";
        if (keyword != null && !keyword.isBlank()) {
            String kw = "%" + keyword.trim() + "%";
            where = " WHERE name ILIKE ? OR original_file_name ILIKE ? OR object_key ILIKE ? ";
            params.add(kw);
            params.add(kw);
            params.add(kw);
        }
        Integer total = jdbcTemplate.queryForObject("SELECT COUNT(*) FROM model_resources" + where, Integer.class, params.toArray());
        List<ResourceItemResponse> items = jdbcTemplate.query(
                """
                SELECT id, name, original_file_name, object_key, url, file_size, content_type, created_at, updated_at
                FROM model_resources
                """ + where + " ORDER BY created_at DESC LIMIT ? OFFSET ?",
                (rs, rowNum) -> new ResourceItemResponse(
                        rs.getString("id"),
                        rs.getString("name"),
                        rs.getString("original_file_name"),
                        rs.getString("object_key"),
                        rs.getString("url"),
                        rs.getLong("file_size"),
                        rs.getString("content_type"),
                        rs.getObject("created_at", OffsetDateTime.class),
                        rs.getObject("updated_at", OffsetDateTime.class)
                ),
                append(params, pageSize, offset)
        );
        return new ResourceListResponse(items, page, pageSize, total == null ? 0 : total);
    }

    public boolean deleteResource(String resourceId) {
        return jdbcTemplate.update("DELETE FROM model_resources WHERE id = ?", resourceId) > 0;
    }

    public ResourceItemResponse createResource(String name, String originalFileName, String objectKey, String url, long fileSize, String contentType) {
        return jdbcTemplate.queryForObject(
                """
                INSERT INTO model_resources(id, name, original_file_name, object_key, url, file_size, content_type, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
                RETURNING id, name, original_file_name, object_key, url, file_size, content_type, created_at, updated_at
                """,
                (rs, rowNum) -> new ResourceItemResponse(
                        rs.getString("id"),
                        rs.getString("name"),
                        rs.getString("original_file_name"),
                        rs.getString("object_key"),
                        rs.getString("url"),
                        rs.getLong("file_size"),
                        rs.getString("content_type"),
                        rs.getObject("created_at", OffsetDateTime.class),
                        rs.getObject("updated_at", OffsetDateTime.class)
                ),
                UUID.randomUUID().toString().replace("-", ""),
                name,
                originalFileName,
                objectKey,
                url,
                fileSize,
                contentType
        );
    }

    public Optional<ResourceItemResponse> getResource(String resourceId) {
        List<ResourceItemResponse> items = jdbcTemplate.query(
                """
                SELECT id, name, original_file_name, object_key, url, file_size, content_type, created_at, updated_at
                FROM model_resources
                WHERE id = ?
                """,
                (rs, rowNum) -> new ResourceItemResponse(
                        rs.getString("id"),
                        rs.getString("name"),
                        rs.getString("original_file_name"),
                        rs.getString("object_key"),
                        rs.getString("url"),
                        rs.getLong("file_size"),
                        rs.getString("content_type"),
                        rs.getObject("created_at", OffsetDateTime.class),
                        rs.getObject("updated_at", OffsetDateTime.class)
                ),
                resourceId
        );
        return items.stream().findFirst();
    }

    public SceneSummaryListResponse listScenes(String keyword, int page, int pageSize) {
        int offset = Math.max(0, (page - 1) * pageSize);
        List<Object> params = new ArrayList<>();
        String where = "";
        if (keyword != null && !keyword.isBlank()) {
            String kw = "%" + keyword.trim() + "%";
            where = " WHERE sc.id ILIKE ? OR sc.name ILIKE ? OR sc.description ILIKE ? ";
            params.add(kw);
            params.add(kw);
            params.add(kw);
        }
        Integer total = jdbcTemplate.queryForObject("SELECT COUNT(*) FROM scene_configs sc" + where, Integer.class, params.toArray());
        List<SceneSummaryResponse> items = jdbcTemplate.query(
                """
                SELECT sc.id, sc.name, sc.description, sc.created_at, sc.updated_at, COUNT(si.asset_id)::INT AS asset_count
                FROM scene_configs sc
                LEFT JOIN scene_instances si ON si.scene_id = sc.id
                """ + where + " GROUP BY sc.id, sc.name, sc.description, sc.created_at, sc.updated_at ORDER BY sc.created_at DESC LIMIT ? OFFSET ?",
                (rs, rowNum) -> new SceneSummaryResponse(
                        rs.getString("id"),
                        rs.getString("name"),
                        rs.getString("description"),
                        rs.getObject("created_at", OffsetDateTime.class),
                        rs.getObject("updated_at", OffsetDateTime.class),
                        rs.getInt("asset_count")
                ),
                append(params, pageSize, offset)
        );
        return new SceneSummaryListResponse(items, page, pageSize, total == null ? 0 : total);
    }

    public SceneSummaryResponse createScene(SceneCreateRequest request) {
        return jdbcTemplate.queryForObject(
                """
                INSERT INTO scene_configs(id, name, description, created_at, updated_at)
                VALUES (?, ?, ?, NOW(), NOW())
                RETURNING id, name, description, created_at, updated_at, 0 AS asset_count
                """,
                (rs, rowNum) -> new SceneSummaryResponse(
                        rs.getString("id"),
                        rs.getString("name"),
                        rs.getString("description"),
                        rs.getObject("created_at", OffsetDateTime.class),
                        rs.getObject("updated_at", OffsetDateTime.class),
                        rs.getInt("asset_count")
                ),
                request.id().trim(),
                request.name().trim(),
                request.description() == null ? "" : request.description().trim()
        );
    }

    public Optional<SceneSummaryResponse> updateScene(String sceneId, SceneUpdateRequest request) {
        List<Map<String, Object>> current = jdbcTemplate.queryForList("SELECT * FROM scene_configs WHERE id = ?", sceneId);
        if (current.isEmpty()) {
            return Optional.empty();
        }
        Map<String, Object> base = current.get(0);
        List<SceneSummaryResponse> items = jdbcTemplate.query(
                """
                UPDATE scene_configs
                SET name = ?, description = ?, updated_at = NOW()
                WHERE id = ?
                RETURNING id, name, description, created_at, updated_at
                """,
                (rs, rowNum) -> new SceneSummaryResponse(
                        rs.getString("id"),
                        rs.getString("name"),
                        rs.getString("description"),
                        rs.getObject("created_at", OffsetDateTime.class),
                        rs.getObject("updated_at", OffsetDateTime.class),
                        countSceneAssets(sceneId)
                ),
                request.name() != null ? request.name().trim() : String.valueOf(base.get("name")),
                request.description() != null ? request.description().trim() : String.valueOf(base.get("description")),
                sceneId
        );
        return items.stream().findFirst();
    }

    public boolean deleteScene(String sceneId) {
        jdbcTemplate.update("DELETE FROM scene_relations WHERE scene_id = ?", sceneId);
        return jdbcTemplate.update("DELETE FROM scene_configs WHERE id = ?", sceneId) > 0;
    }

    public Optional<SceneResponse> getScene(String sceneId) {
        List<Map<String, Object>> rows = jdbcTemplate.queryForList("SELECT * FROM scene_configs WHERE id = ?", sceneId);
        if (rows.isEmpty()) {
            return Optional.empty();
        }
        Map<String, Object> scene = rows.get(0);
        List<SceneInstanceResponse> instances = listSceneInstances(sceneId);
        List<SceneRelationResponse> relations = listSceneRelations(sceneId);
        return Optional.of(new SceneResponse(
                String.valueOf(scene.get("id")),
                String.valueOf(scene.get("name")),
                String.valueOf(scene.get("description")),
                ((OffsetDateTime) scene.get("created_at")),
                ((OffsetDateTime) scene.get("updated_at")),
                instances.size(),
                instances,
                relations
        ));
    }

    public List<DigitalAssetResponse> listSceneAssets(String sceneId) {
        return jdbcTemplate.query(
                """
                SELECT da.id, da.name, da.type, da.status, da.location, da.health, da.model_file, da.minio_object_key, da.metadata::text AS metadata_json, da.created_at, da.updated_at
                FROM scene_instances si
                JOIN digital_assets da ON da.id = si.asset_id
                WHERE si.scene_id = ?
                ORDER BY da.id ASC
                """,
                (rs, rowNum) -> mapAsset(rs),
                sceneId
        );
    }

    public Optional<List<DigitalAssetResponse>> replaceSceneAssets(String sceneId, List<String> assetIds) {
        if (!sceneExists(sceneId)) {
            return Optional.empty();
        }
        List<String> uniqueIds = assetIds == null ? List.of() : assetIds.stream().filter(Objects::nonNull).map(String::trim).filter(s -> !s.isEmpty()).distinct().toList();
        if (!uniqueIds.isEmpty()) {
            Integer existing = jdbcTemplate.queryForObject(
                    "SELECT COUNT(*) FROM digital_assets WHERE id IN (" + String.join(",", Collections.nCopies(uniqueIds.size(), "?")) + ")",
                    Integer.class,
                    uniqueIds.toArray()
            );
            if (existing == null || existing != uniqueIds.size()) {
                throw new IllegalArgumentException("存在未找到的资产，无法绑定到场景");
            }
        }
        jdbcTemplate.update("DELETE FROM scene_instances WHERE scene_id = ?", sceneId);
        for (String assetId : uniqueIds) {
            jdbcTemplate.update(
                    """
                    INSERT INTO scene_instances(id, scene_id, asset_id, position_x, position_y, position_z, rotation_x, rotation_y, rotation_z, scale, created_at, updated_at)
                    VALUES (?, ?, ?, 0, 0, 0, 0, 0, 0, 1, NOW(), NOW())
                    """,
                    UUID.randomUUID().toString().replace("-", ""),
                    sceneId,
                    assetId
            );
        }
        return Optional.of(listSceneAssets(sceneId));
    }

    public Optional<Map<String, Object>> upsertSceneInstance(String sceneId, SceneInstanceUpsertRequest request) {
        if (!sceneExists(sceneId)) {
            return Optional.empty();
        }
        List<Map<String, Object>> existing = jdbcTemplate.queryForList(
                "SELECT id FROM scene_instances WHERE scene_id = ? AND asset_id = ?",
                sceneId, request.asset_id().trim()
        );
        if (existing.isEmpty()) {
            jdbcTemplate.update(
                    """
                    INSERT INTO scene_instances(id, scene_id, asset_id, position_x, position_y, position_z, rotation_x, rotation_y, rotation_z, scale, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
                    """,
                    UUID.randomUUID().toString().replace("-", ""),
                    sceneId,
                    request.asset_id().trim(),
                    request.position_x(),
                    request.position_y(),
                    request.position_z(),
                    request.rotation_x(),
                    request.rotation_y(),
                    request.rotation_z(),
                    request.scale()
            );
        } else {
            jdbcTemplate.update(
                    """
                    UPDATE scene_instances
                    SET position_x = ?, position_y = ?, position_z = ?, rotation_x = ?, rotation_y = ?, rotation_z = ?, scale = ?, updated_at = NOW()
                    WHERE id = ?
                    """,
                    request.position_x(),
                    request.position_y(),
                    request.position_z(),
                    request.rotation_x(),
                    request.rotation_y(),
                    request.rotation_z(),
                    request.scale(),
                    existing.get(0).get("id")
            );
        }
        return Optional.of(Map.of("status", "ok"));
    }

    public List<SceneRelationResponse> listSceneRelations(String sceneId) {
        return jdbcTemplate.query(
                """
                SELECT source_asset_id, target_asset_id, relation_type, created_at
                FROM scene_relations
                WHERE scene_id = ?
                ORDER BY created_at ASC
                """,
                (rs, rowNum) -> new SceneRelationResponse(
                        rs.getString("source_asset_id"),
                        rs.getString("target_asset_id"),
                        rs.getString("relation_type"),
                        rs.getObject("created_at", OffsetDateTime.class)
                ),
                sceneId
        );
    }

    public Optional<List<SceneRelationResponse>> replaceSceneRelations(String sceneId, List<SceneRelationItem> relations) {
        if (!sceneExists(sceneId)) {
            return Optional.empty();
        }
        Set<String> sceneAssetIds = new HashSet<>(jdbcTemplate.query(
                "SELECT asset_id FROM scene_instances WHERE scene_id = ?",
                (rs, rowNum) -> rs.getString("asset_id"),
                sceneId
        ));
        for (SceneRelationItem relation : relations) {
            if (!sceneAssetIds.contains(relation.source_asset_id()) || !sceneAssetIds.contains(relation.target_asset_id())) {
                throw new IllegalArgumentException("关系资产必须先绑定到场景: " + relation.source_asset_id() + " -> " + relation.target_asset_id());
            }
        }
        jdbcTemplate.update("DELETE FROM scene_relations WHERE scene_id = ?", sceneId);
        for (SceneRelationItem relation : relations) {
            jdbcTemplate.update(
                    """
                    INSERT INTO scene_relations(scene_id, source_asset_id, target_asset_id, relation_type, created_at)
                    VALUES (?, ?, ?, ?, NOW())
                    """,
                    sceneId,
                    relation.source_asset_id().trim(),
                    relation.target_asset_id().trim(),
                    relation.relation_type().trim()
            );
        }
        return Optional.of(listSceneRelations(sceneId));
    }

    private boolean sceneExists(String sceneId) {
        Integer count = jdbcTemplate.queryForObject("SELECT COUNT(*) FROM scene_configs WHERE id = ?", Integer.class, sceneId);
        return count != null && count > 0;
    }

    private int countSceneAssets(String sceneId) {
        Integer count = jdbcTemplate.queryForObject("SELECT COUNT(*) FROM scene_instances WHERE scene_id = ?", Integer.class, sceneId);
        return count == null ? 0 : count;
    }

    private List<SceneInstanceResponse> listSceneInstances(String sceneId) {
        return jdbcTemplate.query(
                """
                SELECT si.id, si.scene_id, si.asset_id, si.position_x, si.position_y, si.position_z, si.rotation_x, si.rotation_y, si.rotation_z, si.scale,
                       da.name, da.type, da.status, da.location, da.health, da.model_file, da.minio_object_key
                FROM scene_instances si
                JOIN digital_assets da ON da.id = si.asset_id
                WHERE si.scene_id = ?
                ORDER BY da.id ASC
                """,
                (rs, rowNum) -> new SceneInstanceResponse(
                        rs.getString("id"),
                        rs.getString("scene_id"),
                        rs.getString("asset_id"),
                        rs.getDouble("position_x"),
                        rs.getDouble("position_y"),
                        rs.getDouble("position_z"),
                        rs.getDouble("rotation_x"),
                        rs.getDouble("rotation_y"),
                        rs.getDouble("rotation_z"),
                        rs.getDouble("scale"),
                        rs.getString("name"),
                        rs.getString("type"),
                        AssetStatus.valueOf(rs.getString("status")),
                        rs.getString("location"),
                        rs.getInt("health"),
                        rs.getString("model_file"),
                        rs.getString("minio_object_key")
                ),
                sceneId
        );
    }

    private DigitalAssetResponse mapAsset(ResultSet rs) throws SQLException {
        return new DigitalAssetResponse(
                rs.getString("id"),
                rs.getString("name"),
                rs.getString("type"),
                AssetStatus.valueOf(rs.getString("status")),
                rs.getString("location"),
                rs.getInt("health"),
                rs.getString("model_file"),
                rs.getString("minio_object_key"),
                parseJsonMap(rs.getString("metadata_json")),
                rs.getObject("created_at", OffsetDateTime.class),
                rs.getObject("updated_at", OffsetDateTime.class)
        );
    }

    private Map<String, Object> parseJsonMap(String json) {
        if (json == null || json.isBlank()) {
            return Map.of();
        }
        try {
            return objectMapper.readValue(json, new TypeReference<>() {});
        } catch (Exception ex) {
            return Map.of();
        }
    }

    private String toJson(Map<String, Object> value) {
        try {
            return objectMapper.writeValueAsString(value == null ? Map.of() : value);
        } catch (Exception ex) {
            throw new IllegalStateException("JSON 序列化失败", ex);
        }
    }

    private Object[] append(List<Object> params, Object... tail) {
        List<Object> values = new ArrayList<>(params);
        values.addAll(Arrays.asList(tail));
        return values.toArray();
    }

    private String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }
}
