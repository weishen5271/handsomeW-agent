package com.handsomew.system.digitaltwin.model;

public record ResourcePreviewUrlResponse(
        String resource_id,
        String object_key,
        String preview_url,
        int expires_in_seconds
) {
}
