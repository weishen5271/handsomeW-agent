from fastapi import APIRouter, Depends

from api.auth import get_current_user
from api.schemas import UserLLMConfigRequest, UserLLMConfigResponse
from api.user_store import get_user_llm_config, upsert_user_llm_config

router = APIRouter(tags=["llm-config"])


def _to_response(config: dict) -> UserLLMConfigResponse:
    return UserLLMConfigResponse(
        user_id=config["user_id"],
        provider=config["provider"],
        model=config["model"],
        base_url=config["base_url"],
        api_key_set=bool(config.get("api_key")),
        created_at=config["created_at"],
        updated_at=config["updated_at"],
    )


@router.get("/llm-config", response_model=UserLLMConfigResponse | None)
async def get_current_user_llm_config(current_user: dict = Depends(get_current_user)) -> UserLLMConfigResponse | None:
    config = get_user_llm_config(current_user["id"])
    if config is None:
        return None
    return _to_response(config)


@router.put("/llm-config", response_model=UserLLMConfigResponse)
async def update_current_user_llm_config(
    payload: UserLLMConfigRequest,
    current_user: dict = Depends(get_current_user),
) -> UserLLMConfigResponse:
    api_key = payload.api_key
    if isinstance(api_key, str):
        api_key = api_key.strip()
    config = upsert_user_llm_config(
        user_id=current_user["id"],
        provider=payload.provider.strip(),
        model=payload.model.strip(),
        base_url=payload.base_url.strip(),
        api_key=api_key,
    )
    return _to_response(config)
