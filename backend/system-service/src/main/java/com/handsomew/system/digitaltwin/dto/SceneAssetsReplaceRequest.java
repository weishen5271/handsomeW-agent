package com.handsomew.system.digitaltwin.dto;

import java.util.List;

public record SceneAssetsReplaceRequest(
        List<String> asset_ids
) {
}
