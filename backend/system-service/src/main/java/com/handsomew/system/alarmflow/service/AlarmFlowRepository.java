package com.handsomew.system.alarmflow.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.handsomew.system.alarmflow.dto.AlarmFlowEdgeRequest;
import com.handsomew.system.alarmflow.dto.AlarmFlowNodeRequest;
import com.handsomew.system.alarmflow.dto.AlarmFlowSaveRequest;
import com.handsomew.system.alarmflow.model.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

@Repository
public class AlarmFlowRepository {

    private final JdbcTemplate jdbcTemplate;
    private final ObjectMapper objectMapper;

    public AlarmFlowRepository(JdbcTemplate jdbcTemplate, ObjectMapper objectMapper) {
        this.jdbcTemplate = jdbcTemplate;
        this.objectMapper = objectMapper;
    }

    public AlarmFlowResponse upsert(String assetId, AlarmFlowSaveRequest request) {
        List<Map<String, Object>> existing = jdbcTemplate.queryForList(
                "SELECT id, status, created_at FROM alarm_flow_configs WHERE asset_id = ?",
                assetId
        );
        String flowId = existing.isEmpty() ? UUID.randomUUID().toString() : String.valueOf(existing.get(0).get("id"));
        String status = existing.isEmpty() ? "stopped" : String.valueOf(existing.get(0).get("status"));
        OffsetDateTime createdAt = existing.isEmpty() ? OffsetDateTime.now() : (OffsetDateTime) existing.get(0).get("created_at");
        String configJson = toConfigJson(request.nodes(), request.edges());
        return jdbcTemplate.queryForObject(
                """
                INSERT INTO alarm_flow_configs(id, asset_id, name, enabled, schedule, config, status, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, CAST(? AS jsonb), ?, ?, NOW())
                ON CONFLICT (asset_id) DO UPDATE SET
                  name = EXCLUDED.name,
                  enabled = EXCLUDED.enabled,
                  schedule = EXCLUDED.schedule,
                  config = EXCLUDED.config,
                  updated_at = NOW()
                RETURNING id, asset_id, name, enabled, schedule, config::text AS config_json, status, created_at, updated_at
                """,
                (rs, rowNum) -> mapFlow(rs.getString("id"), rs.getString("asset_id"), rs.getString("name"), rs.getBoolean("enabled"),
                        rs.getString("schedule"), rs.getString("status"), rs.getString("config_json"),
                        rs.getObject("created_at", OffsetDateTime.class), rs.getObject("updated_at", OffsetDateTime.class)),
                flowId, assetId, request.name().trim(), request.enabled(), request.schedule() == null ? "" : request.schedule().trim(), configJson, status, createdAt
        );
    }

    public Optional<AlarmFlowResponse> findByAssetId(String assetId) {
        List<AlarmFlowResponse> items = jdbcTemplate.query(
                """
                SELECT id, asset_id, name, enabled, schedule, config::text AS config_json, status, created_at, updated_at
                FROM alarm_flow_configs
                WHERE asset_id = ?
                """,
                (rs, rowNum) -> mapFlow(rs.getString("id"), rs.getString("asset_id"), rs.getString("name"), rs.getBoolean("enabled"),
                        rs.getString("schedule"), rs.getString("status"), rs.getString("config_json"),
                        rs.getObject("created_at", OffsetDateTime.class), rs.getObject("updated_at", OffsetDateTime.class)),
                assetId
        );
        return items.stream().findFirst();
    }

    public boolean deleteByAssetId(String assetId) {
        return jdbcTemplate.update("DELETE FROM alarm_flow_configs WHERE asset_id = ?", assetId) > 0;
    }

    public List<AlarmFlowLogResponse> listLogs(String assetId, String nodeId, int limit) {
        String sql = """
                SELECT node_id, created_at AS timestamp, status, input_count, output_count, duration_ms, error, message
                FROM alarm_flow_logs
                WHERE asset_id = ?
                """;
        if (nodeId != null && !nodeId.isBlank()) {
            sql += " AND node_id = ? ";
            return jdbcTemplate.query(sql + " ORDER BY created_at DESC LIMIT ?",
                    (rs, rowNum) -> new AlarmFlowLogResponse(
                            rs.getString("node_id"),
                            rs.getObject("timestamp", OffsetDateTime.class),
                            rs.getString("status"),
                            rs.getInt("input_count"),
                            rs.getInt("output_count"),
                            rs.getInt("duration_ms"),
                            rs.getString("error"),
                            rs.getString("message")
                    ),
                    assetId, nodeId, limit);
        }
        return jdbcTemplate.query(sql + " ORDER BY created_at DESC LIMIT ?",
                (rs, rowNum) -> new AlarmFlowLogResponse(
                        rs.getString("node_id"),
                        rs.getObject("timestamp", OffsetDateTime.class),
                        rs.getString("status"),
                        rs.getInt("input_count"),
                        rs.getInt("output_count"),
                        rs.getInt("duration_ms"),
                        rs.getString("error"),
                        rs.getString("message")
                ),
                assetId, limit);
    }

    private String toConfigJson(List<AlarmFlowNodeRequest> nodes, List<AlarmFlowEdgeRequest> edges) {
        try {
            return objectMapper.writeValueAsString(Map.of(
                    "nodes", nodes == null ? List.of() : nodes,
                    "edges", edges == null ? List.of() : edges
            ));
        } catch (Exception ex) {
            throw new IllegalStateException("告警流配置序列化失败", ex);
        }
    }

    private AlarmFlowResponse mapFlow(String id, String assetId, String name, boolean enabled, String schedule, String status,
                                      String configJson, OffsetDateTime createdAt, OffsetDateTime updatedAt) {
        try {
            Map<String, Object> config = objectMapper.readValue(configJson, new TypeReference<>() {});
            List<AlarmFlowNode> nodes = objectMapper.convertValue(config.getOrDefault("nodes", List.of()), new TypeReference<>() {});
            List<AlarmFlowEdge> edges = objectMapper.convertValue(config.getOrDefault("edges", List.of()), new TypeReference<>() {});
            return new AlarmFlowResponse(id, assetId, name, enabled, schedule, status, nodes, edges, createdAt, updatedAt);
        } catch (Exception ex) {
            throw new IllegalStateException("告警流配置反序列化失败", ex);
        }
    }
}
