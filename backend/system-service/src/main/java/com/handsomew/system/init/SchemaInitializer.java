package com.handsomew.system.init;

import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

@Component
public class SchemaInitializer implements ApplicationRunner {

    private final JdbcTemplate jdbcTemplate;

    public SchemaInitializer(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    @Override
    public void run(ApplicationArguments args) {
        jdbcTemplate.execute("""
                CREATE TABLE IF NOT EXISTS users (
                    id BIGSERIAL PRIMARY KEY,
                    username TEXT NOT NULL UNIQUE,
                    password_hash TEXT NOT NULL,
                    salt TEXT NOT NULL,
                    role TEXT NOT NULL CHECK(role IN ('admin', 'user')),
                    created_at TIMESTAMPTZ NOT NULL
                )
                """);
        jdbcTemplate.execute("""
                CREATE TABLE IF NOT EXISTS sessions (
                    token TEXT PRIMARY KEY,
                    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    created_at TIMESTAMPTZ NOT NULL,
                    expires_at TIMESTAMPTZ NOT NULL
                )
                """);
        jdbcTemplate.execute("""
                CREATE TABLE IF NOT EXISTS digital_assets (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    type TEXT NOT NULL,
                    status TEXT NOT NULL CHECK(status IN ('Normal', 'Warning', 'Critical')),
                    location TEXT NOT NULL,
                    health SMALLINT NOT NULL CHECK(health >= 0 AND health <= 100),
                    model_file TEXT NOT NULL,
                    minio_object_key TEXT,
                    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
                    created_at TIMESTAMPTZ NOT NULL,
                    updated_at TIMESTAMPTZ NOT NULL
                )
                """);
        jdbcTemplate.execute("""
                CREATE TABLE IF NOT EXISTS scene_configs (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    description TEXT NOT NULL DEFAULT '',
                    created_at TIMESTAMPTZ NOT NULL,
                    updated_at TIMESTAMPTZ NOT NULL
                )
                """);
        jdbcTemplate.execute("""
                CREATE TABLE IF NOT EXISTS model_resources (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    original_file_name TEXT NOT NULL,
                    object_key TEXT NOT NULL UNIQUE,
                    url TEXT NOT NULL,
                    file_size BIGINT NOT NULL CHECK(file_size >= 0),
                    content_type TEXT NOT NULL,
                    created_at TIMESTAMPTZ NOT NULL,
                    updated_at TIMESTAMPTZ NOT NULL
                )
                """);
        jdbcTemplate.execute("""
                CREATE TABLE IF NOT EXISTS scene_instances (
                    id TEXT PRIMARY KEY,
                    scene_id TEXT NOT NULL REFERENCES scene_configs(id) ON DELETE CASCADE,
                    asset_id TEXT NOT NULL REFERENCES digital_assets(id) ON DELETE CASCADE,
                    position_x DOUBLE PRECISION NOT NULL DEFAULT 0,
                    position_y DOUBLE PRECISION NOT NULL DEFAULT 0,
                    position_z DOUBLE PRECISION NOT NULL DEFAULT 0,
                    rotation_x DOUBLE PRECISION NOT NULL DEFAULT 0,
                    rotation_y DOUBLE PRECISION NOT NULL DEFAULT 0,
                    rotation_z DOUBLE PRECISION NOT NULL DEFAULT 0,
                    scale DOUBLE PRECISION NOT NULL DEFAULT 1,
                    created_at TIMESTAMPTZ NOT NULL,
                    updated_at TIMESTAMPTZ NOT NULL,
                    UNIQUE(scene_id, asset_id)
                )
                """);
        jdbcTemplate.execute("""
                CREATE TABLE IF NOT EXISTS asset_relations (
                    id BIGSERIAL PRIMARY KEY,
                    source_asset_id TEXT NOT NULL REFERENCES digital_assets(id) ON DELETE CASCADE,
                    target_asset_id TEXT NOT NULL REFERENCES digital_assets(id) ON DELETE CASCADE,
                    relation_type TEXT NOT NULL DEFAULT 'upstream',
                    created_at TIMESTAMPTZ NOT NULL,
                    UNIQUE(source_asset_id, target_asset_id, relation_type)
                )
                """);
        jdbcTemplate.execute("""
                CREATE TABLE IF NOT EXISTS scene_relations (
                    id BIGSERIAL PRIMARY KEY,
                    scene_id TEXT NOT NULL REFERENCES scene_configs(id) ON DELETE CASCADE,
                    source_asset_id TEXT NOT NULL REFERENCES digital_assets(id) ON DELETE CASCADE,
                    target_asset_id TEXT NOT NULL REFERENCES digital_assets(id) ON DELETE CASCADE,
                    relation_type TEXT NOT NULL DEFAULT 'upstream',
                    created_at TIMESTAMPTZ NOT NULL
                )
                """);
        jdbcTemplate.execute("""
                CREATE TABLE IF NOT EXISTS alarm_flow_configs (
                    id TEXT PRIMARY KEY,
                    asset_id TEXT NOT NULL UNIQUE,
                    name TEXT NOT NULL,
                    enabled BOOLEAN NOT NULL DEFAULT false,
                    schedule TEXT NOT NULL DEFAULT '',
                    config JSONB NOT NULL DEFAULT '{}'::jsonb,
                    status TEXT NOT NULL DEFAULT 'stopped',
                    created_at TIMESTAMPTZ NOT NULL,
                    updated_at TIMESTAMPTZ NOT NULL
                )
                """);
        jdbcTemplate.execute("""
                CREATE TABLE IF NOT EXISTS alarm_flow_logs (
                    id BIGSERIAL PRIMARY KEY,
                    asset_id TEXT NOT NULL,
                    flow_id TEXT NOT NULL,
                    node_id TEXT NOT NULL,
                    status TEXT NOT NULL,
                    input_count INTEGER NOT NULL DEFAULT 0,
                    output_count INTEGER NOT NULL DEFAULT 0,
                    duration_ms INTEGER NOT NULL DEFAULT 0,
                    error TEXT,
                    message TEXT,
                    created_at TIMESTAMPTZ NOT NULL
                )
                """);
        jdbcTemplate.execute("""
                CREATE TABLE IF NOT EXISTS alarm_records (
                    id BIGSERIAL PRIMARY KEY,
                    flow_id TEXT NOT NULL,
                    asset_id TEXT NOT NULL,
                    occurrence_time TIMESTAMPTZ,
                    severity TEXT,
                    alarm_type TEXT,
                    description TEXT,
                    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
                    created_at TIMESTAMPTZ NOT NULL
                )
                """);
        seedDigitalTwin();
    }

    private void seedDigitalTwin() {
        Integer count = jdbcTemplate.queryForObject("SELECT COUNT(*) FROM digital_assets", Integer.class);
        if (count != null && count > 0) {
            return;
        }
        jdbcTemplate.update("""
                INSERT INTO digital_assets(id, name, type, status, location, health, model_file, metadata, created_at, updated_at)
                VALUES
                ('M-102', '主电机', '动力设备', 'Warning', '2号生产线', 68, 'motor_main.glb', '{"vendor":"TwinMind","power_kw":18.5}'::jsonb, NOW(), NOW()),
                ('C-201', '输送带控制器', '控制单元', 'Normal', '2号生产线', 98, 'belt_controller.glb', '{"firmware":"2.3.1"}'::jsonb, NOW(), NOW()),
                ('S-05', '振动传感器', '传感器', 'Normal', '1号生产线', 95, 'vibration_sensor.glb', '{"sampling_hz":5000}'::jsonb, NOW(), NOW()),
                ('H-22', '液压单元', '动力设备', 'Critical', '3号生产线', 32, 'hydraulic_unit.glb', '{"pressure_bar":15}'::jsonb, NOW(), NOW()),
                ('G-04', '工业网关', '通信设备', 'Normal', '全厂区', 88, 'industrial_gateway.glb', '{"ip":"10.8.0.4"}'::jsonb, NOW(), NOW())
                """);
        jdbcTemplate.update("""
                INSERT INTO scene_configs(id, name, description, created_at, updated_at)
                VALUES ('factory-main', '主工厂场景', '默认场景', NOW(), NOW())
                ON CONFLICT (id) DO NOTHING
                """);
        jdbcTemplate.update("""
                INSERT INTO scene_instances(id, scene_id, asset_id, position_x, position_y, position_z, created_at, updated_at)
                VALUES
                ('si_m102', 'factory-main', 'M-102', 2.0, 1.0, 0.0, NOW(), NOW()),
                ('si_c201', 'factory-main', 'C-201', 4.8, 1.5, 0.0, NOW(), NOW()),
                ('si_s05', 'factory-main', 'S-05', 1.0, 3.8, 1.2, NOW(), NOW()),
                ('si_h22', 'factory-main', 'H-22', 6.0, 3.5, 0.0, NOW(), NOW()),
                ('si_g04', 'factory-main', 'G-04', 3.3, 5.0, 2.2, NOW(), NOW())
                ON CONFLICT (scene_id, asset_id) DO NOTHING
                """);
        jdbcTemplate.update("""
                INSERT INTO asset_relations(source_asset_id, target_asset_id, relation_type, created_at)
                VALUES
                ('S-05', 'M-102', 'upstream', NOW()),
                ('C-201', 'M-102', 'upstream', NOW()),
                ('M-102', 'H-22', 'downstream', NOW()),
                ('G-04', 'C-201', 'upstream', NOW())
                ON CONFLICT (source_asset_id, target_asset_id, relation_type) DO NOTHING
                """);
    }
}
