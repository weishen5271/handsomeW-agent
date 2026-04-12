package com.handsomew.system.digitaltwin.dto;

import java.util.List;

public record SceneRelationsReplaceRequest(
        List<SceneRelationItem> relations
) {
}
