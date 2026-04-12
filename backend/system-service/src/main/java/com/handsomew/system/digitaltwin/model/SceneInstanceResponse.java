package com.handsomew.system.digitaltwin.model;

public record SceneInstanceResponse(
        String id,
        String scene_id,
        String asset_id,
        double position_x,
        double position_y,
        double position_z,
        double rotation_x,
        double rotation_y,
        double rotation_z,
        double scale,
        String name,
        String type,
        AssetStatus status,
        String location,
        int health,
        String model_file,
        String minio_object_key
) {
}
