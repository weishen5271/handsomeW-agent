package com.handsomew.system.digitaltwin.model;

import java.util.List;

public record ResourceListResponse(
        java.util.List<ResourceItemResponse> items,
        int page,
        int page_size,
        int total
) {
}
