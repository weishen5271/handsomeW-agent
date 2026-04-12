package com.handsomew.system.digitaltwin.model;

import java.util.List;

public record SceneSummaryListResponse(
        List<SceneSummaryResponse> items,
        int page,
        int page_size,
        int total
) {
}
