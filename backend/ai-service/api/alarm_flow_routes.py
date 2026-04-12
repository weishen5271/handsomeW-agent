from fastapi import APIRouter, Depends, HTTPException, Query, status

from api.alarm_flow_store import (
    delete_alarm_flow,
    get_alarm_flow,
    list_alarm_flow_logs,
    upsert_alarm_flow,
    update_alarm_flow_status,
)
from api.auth import get_current_user
from api.schemas import (
    AlarmFlowDeleteResponse,
    AlarmFlowDeployResponse,
    AlarmFlowLogListResponse,
    AlarmFlowLogResponse,
    AlarmFlowResponse,
    AlarmFlowSaveRequest,
)
from flow.executor import flow_executor
from flow.scheduler import alarm_flow_scheduler

router = APIRouter(prefix="/digital-twin/assets/{asset_id}/alarm-flow", tags=["alarm-flow"])


@router.post("", response_model=AlarmFlowResponse)
async def save_alarm_flow(
    asset_id: str,
    payload: AlarmFlowSaveRequest,
    _: dict = Depends(get_current_user),
) -> AlarmFlowResponse:
    row = upsert_alarm_flow(
        asset_id=asset_id,
        name=payload.name.strip(),
        enabled=payload.enabled,
        schedule=payload.schedule.strip(),
        nodes=[node.model_dump() for node in payload.nodes],
        edges=[edge.model_dump() for edge in payload.edges],
    )
    if row["status"] == "running":
        alarm_flow_scheduler.register(asset_id)
    return AlarmFlowResponse(**row)


@router.get("", response_model=AlarmFlowResponse)
async def get_alarm_flow_api(asset_id: str, _: dict = Depends(get_current_user)) -> AlarmFlowResponse:
    row = get_alarm_flow(asset_id)
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="告警流程不存在")
    return AlarmFlowResponse(**row)


@router.delete("", response_model=AlarmFlowDeleteResponse)
async def delete_alarm_flow_api(asset_id: str, _: dict = Depends(get_current_user)) -> AlarmFlowDeleteResponse:
    alarm_flow_scheduler.unregister(asset_id)
    deleted = delete_alarm_flow(asset_id)
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="告警流程不存在")
    return AlarmFlowDeleteResponse(status="deleted")


@router.post("/deploy", response_model=AlarmFlowDeployResponse)
async def deploy_alarm_flow_api(asset_id: str, _: dict = Depends(get_current_user)) -> AlarmFlowDeployResponse:
    existing_flow = get_alarm_flow(asset_id)
    if existing_flow is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="告警流程不存在")
    try:
        flow_executor.validate(existing_flow)
    except RuntimeError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc

    flow = update_alarm_flow_status(asset_id, status="running", enabled=True)
    if flow is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="告警流程不存在")
    alarm_flow_scheduler.register(asset_id)
    return AlarmFlowDeployResponse(status="deployed", message="流程已部署，定时任务已启动")


@router.post("/stop", response_model=AlarmFlowDeployResponse)
async def stop_alarm_flow_api(asset_id: str, _: dict = Depends(get_current_user)) -> AlarmFlowDeployResponse:
    flow = update_alarm_flow_status(asset_id, status="stopped", enabled=False)
    if flow is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="告警流程不存在")
    alarm_flow_scheduler.unregister(asset_id)
    return AlarmFlowDeployResponse(status="stopped", message="流程已停用，定时任务已清除")


@router.get("/logs", response_model=AlarmFlowLogListResponse)
async def get_alarm_flow_logs_api(
    asset_id: str,
    node_id: str | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    _: dict = Depends(get_current_user),
) -> AlarmFlowLogListResponse:
    logs = list_alarm_flow_logs(asset_id, node_id=node_id, limit=limit)
    return AlarmFlowLogListResponse(logs=[AlarmFlowLogResponse(**item) for item in logs])
