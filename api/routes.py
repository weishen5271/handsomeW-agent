from fastapi import APIRouter, HTTPException

from api.agent_service import AgentService
from api.schemas import AgentChatRequest, AgentChatResponse, AgentType

router = APIRouter(prefix="/agents", tags=["agents"])


@router.get("", response_model=list[str])
async def list_agents() -> list[str]:
    return [agent.value for agent in AgentType]


@router.post("/{agent_type}/chat", response_model=AgentChatResponse)
async def chat(agent_type: AgentType, request: AgentChatRequest) -> AgentChatResponse:
    try:
        service = AgentService()
        result = await service.run(
            agent_type=agent_type,
            user_input=request.input,
            history=request.history,
            system_prompt=request.system_prompt,
            temperature=request.temperature,
            max_tokens=request.max_tokens,
        )
    except ValueError as exc:
        raise HTTPException(status_code=500, detail=f"LLM config error: {exc}") from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Agent execution failed: {exc}") from exc

    return AgentChatResponse(
        agent=agent_type,
        content=result["content"],
        finish_reason=result["finish_reason"],
        usage=result["usage"],
        metadata=result["metadata"],
    )
