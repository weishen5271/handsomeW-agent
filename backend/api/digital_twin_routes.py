from fastapi import APIRouter, Depends, HTTPException, Query, status
from psycopg import IntegrityError

from api.auth import get_current_user
from api.digital_twin_store import (
    create_asset,
    create_scene,
    delete_asset,
    delete_scene,
    get_scene,
    list_asset_relations,
    list_assets,
    list_scene_assets,
    list_scenes,
    replace_scene_assets,
    replace_scene_relations,
    update_asset,
    update_scene,
    upsert_scene_instance,
)
from api.schemas import (
    AssetRelationResponse,
    DigitalAssetListResponse,
    DigitalAssetCreateRequest,
    DigitalAssetResponse,
    DigitalAssetUpdateRequest,
    SceneAssetsReplaceRequest,
    SceneCreateRequest,
    SceneInstanceUpsertRequest,
    SceneRelationResponse,
    SceneRelationsReplaceRequest,
    SceneResponse,
    SceneSummaryListResponse,
    SceneSummaryResponse,
    SceneUpdateRequest,
)

router = APIRouter(prefix="/digital-twin", tags=["digital-twin"])


@router.get("/assets", response_model=DigitalAssetListResponse)
async def get_assets(
    keyword: str | None = Query(default=None),
    status_filter: str | None = Query(default=None, alias="status"),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=10, ge=1, le=200),
    _: dict = Depends(get_current_user),
) -> DigitalAssetListResponse:
    rows, total = list_assets(keyword=keyword, status=status_filter, page=page, page_size=page_size)
    return DigitalAssetListResponse(
        items=[DigitalAssetResponse(**row) for row in rows],
        page=page,
        page_size=page_size,
        total=total,
    )


@router.post("/assets", response_model=DigitalAssetResponse)
async def create_asset_api(
    payload: DigitalAssetCreateRequest,
    _: dict = Depends(get_current_user),
) -> DigitalAssetResponse:
    try:
        row = create_asset(
            asset_id=payload.id.strip(),
            name=payload.name.strip(),
            type_=payload.type.strip(),
            status=payload.status,
            location=payload.location.strip(),
            health=payload.health,
            model_file=payload.model_file.strip(),
            metadata=payload.metadata,
        )
    except IntegrityError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="资产 ID 已存在") from exc
    return DigitalAssetResponse(**row)


@router.patch("/assets/{asset_id}", response_model=DigitalAssetResponse)
async def update_asset_api(
    asset_id: str,
    payload: DigitalAssetUpdateRequest,
    _: dict = Depends(get_current_user),
) -> DigitalAssetResponse:
    row = update_asset(
        asset_id=asset_id,
        name=payload.name.strip() if payload.name is not None else None,
        type_=payload.type.strip() if payload.type is not None else None,
        status=payload.status,
        location=payload.location.strip() if payload.location is not None else None,
        health=payload.health,
        model_file=payload.model_file.strip() if payload.model_file is not None else None,
        metadata=payload.metadata,
    )
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="资产不存在")
    return DigitalAssetResponse(**row)


@router.delete("/assets/{asset_id}")
async def delete_asset_api(asset_id: str, _: dict = Depends(get_current_user)) -> dict[str, str]:
    deleted = delete_asset(asset_id)
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="资产不存在")
    return {"status": "deleted"}


@router.get("/assets/{asset_id}/relations", response_model=list[AssetRelationResponse])
async def get_asset_relations(asset_id: str, _: dict = Depends(get_current_user)) -> list[AssetRelationResponse]:
    rows = list_asset_relations(asset_id)
    return [AssetRelationResponse(**row) for row in rows]


@router.get("/scenes/{scene_id}", response_model=SceneResponse)
async def get_scene_api(scene_id: str, _: dict = Depends(get_current_user)) -> SceneResponse:
    scene = get_scene(scene_id)
    if scene is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="场景不存在")
    return SceneResponse(**scene)


@router.put("/scenes/{scene_id}/instances", response_model=dict)
async def upsert_scene_instance_api(
    scene_id: str,
    payload: SceneInstanceUpsertRequest,
    _: dict = Depends(get_current_user),
) -> dict:
    row = upsert_scene_instance(
        scene_id=scene_id,
        asset_id=payload.asset_id,
        position_x=payload.position_x,
        position_y=payload.position_y,
        position_z=payload.position_z,
        rotation_x=payload.rotation_x,
        rotation_y=payload.rotation_y,
        rotation_z=payload.rotation_z,
        scale=payload.scale,
    )
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="场景不存在")
    return row


@router.get("/scenes", response_model=SceneSummaryListResponse)
async def get_scenes(
    keyword: str | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=10, ge=1, le=200),
    _: dict = Depends(get_current_user),
) -> SceneSummaryListResponse:
    rows, total = list_scenes(keyword=keyword, page=page, page_size=page_size)
    return SceneSummaryListResponse(
        items=[SceneSummaryResponse(**row) for row in rows],
        page=page,
        page_size=page_size,
        total=total,
    )


@router.post("/scenes", response_model=SceneSummaryResponse)
async def create_scene_api(
    payload: SceneCreateRequest,
    _: dict = Depends(get_current_user),
) -> SceneSummaryResponse:
    try:
        row = create_scene(scene_id=payload.id.strip(), name=payload.name.strip(), description=payload.description.strip())
    except IntegrityError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="场景 ID 已存在") from exc
    return SceneSummaryResponse(**{**row, "asset_count": 0})


@router.patch("/scenes/{scene_id}", response_model=SceneSummaryResponse)
async def update_scene_api(
    scene_id: str,
    payload: SceneUpdateRequest,
    _: dict = Depends(get_current_user),
) -> SceneSummaryResponse:
    row = update_scene(
        scene_id=scene_id,
        name=payload.name.strip() if payload.name is not None else None,
        description=payload.description.strip() if payload.description is not None else None,
    )
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="场景不存在")
    return SceneSummaryResponse(**{**row, "asset_count": len(list_scene_assets(scene_id))})


@router.delete("/scenes/{scene_id}")
async def delete_scene_api(scene_id: str, _: dict = Depends(get_current_user)) -> dict[str, str]:
    deleted = delete_scene(scene_id)
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="场景不存在")
    return {"status": "deleted"}


@router.get("/scenes/{scene_id}/assets", response_model=list[DigitalAssetResponse])
async def get_scene_assets(scene_id: str, _: dict = Depends(get_current_user)) -> list[DigitalAssetResponse]:
    scene = get_scene(scene_id)
    if scene is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="场景不存在")
    rows = list_scene_assets(scene_id)
    return [DigitalAssetResponse(**row) for row in rows]


@router.put("/scenes/{scene_id}/assets", response_model=list[DigitalAssetResponse])
async def replace_scene_assets_api(
    scene_id: str,
    payload: SceneAssetsReplaceRequest,
    _: dict = Depends(get_current_user),
) -> list[DigitalAssetResponse]:
    try:
        rows = replace_scene_assets(scene_id, payload.asset_ids)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc
    if rows is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="场景不存在")
    return [DigitalAssetResponse(**row) for row in rows]


@router.get("/scenes/{scene_id}/relations", response_model=list[SceneRelationResponse])
async def get_scene_relations(scene_id: str, _: dict = Depends(get_current_user)) -> list[SceneRelationResponse]:
    scene = get_scene(scene_id)
    if scene is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="场景不存在")
    return [SceneRelationResponse(**row) for row in scene["relations"]]


@router.put("/scenes/{scene_id}/relations", response_model=list[SceneRelationResponse])
async def replace_scene_relations_api(
    scene_id: str,
    payload: SceneRelationsReplaceRequest,
    _: dict = Depends(get_current_user),
) -> list[SceneRelationResponse]:
    try:
        rows = replace_scene_relations(
            scene_id,
            [
                {
                    "source_asset_id": item.source_asset_id.strip(),
                    "target_asset_id": item.target_asset_id.strip(),
                    "relation_type": item.relation_type.strip(),
                }
                for item in payload.relations
            ],
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc

    if rows is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="场景不存在")
    return [SceneRelationResponse(**row) for row in rows]
