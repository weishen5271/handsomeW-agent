from fastapi import APIRouter, Depends, HTTPException, status

from api.auth import get_current_user
from api.digital_twin_store import get_asset_knowledge_graph
from api.schemas import AssetKnowledgeGraphResponse

router = APIRouter(prefix="/digital-twin", tags=["digital-twin-ai"])


@router.get("/assets/{asset_id}/knowledge-graph", response_model=AssetKnowledgeGraphResponse)
async def get_asset_knowledge_graph_api(
    asset_id: str,
    _: dict = Depends(get_current_user),
) -> AssetKnowledgeGraphResponse:
    try:
        graph = get_asset_knowledge_graph(asset_id)
    except RuntimeError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc
    if graph is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="资产不存在")
    return AssetKnowledgeGraphResponse(**graph)
