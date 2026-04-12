package com.handsomew.system.digitaltwin.model;

import java.util.List;

public record DigitalAssetListResponse(
        List<DigitalAssetResponse> items,
        int page,
        int page_size,
        int total
) {
}
