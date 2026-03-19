import json
from pathlib import Path

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse, StreamingResponse

from api.agent_service import AgentService
from api.schemas import AgentChatRequest, AgentChatResponse, AgentType

router = APIRouter(prefix="/agents", tags=["agents"])
_UI_FILE = Path(__file__).resolve().parents[2] / "front" / "chat_ui.html"


@router.get("", response_model=list[str])
async def list_agents() -> list[str]:
    return [agent.value for agent in AgentType]


@router.get("/ui")
async def chat_ui() -> FileResponse:
    return FileResponse(_UI_FILE)


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


def _build_streaming_response(
    service: AgentService,
    agent_type: AgentType,
    request: AgentChatRequest,
) -> StreamingResponse:
    async def event_generator():
        try:
            async for event in service.run_stream(
                agent_type=agent_type,
                user_input=request.input,
                history=request.history,
                system_prompt=request.system_prompt,
                temperature=request.temperature,
                max_tokens=request.max_tokens,
            ):
                event_type = event.get("type", "message")
                payload = json.dumps(event.get("data", {}), ensure_ascii=False)
                yield f"event: {event_type}\ndata: {payload}\n\n"

            yield "event: end\ndata: {}\n\n"
        except ValueError as exc:
            payload = json.dumps({"message": f"LLM config error: {exc}"}, ensure_ascii=False)
            yield f"event: error\ndata: {payload}\n\n"
        except Exception as exc:
            payload = json.dumps({"message": f"Agent execution failed: {exc}"}, ensure_ascii=False)
            yield f"event: error\ndata: {payload}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/{agent_type}/chat/stream")
async def chat_stream(agent_type: AgentType, request: AgentChatRequest) -> StreamingResponse:
    service = AgentService()
    return _build_streaming_response(service, agent_type, request)


@router.get("/{agent_type}/chat/stream")
async def chat_stream_get(
    agent_type: AgentType,
    input: str,
    system_prompt: str | None = None,
) -> StreamingResponse:
    service = AgentService()
    request = AgentChatRequest(input=input, system_prompt=system_prompt)
    return _build_streaming_response(service, agent_type, request)
