import json
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse, StreamingResponse

from api.agent_service import AgentService
from api.auth import get_current_user
from api.schemas import (
    AgentChatRequest,
    AgentChatResponse,
    AgentType,
    ChatMemoryResponse,
    ChatSessionResponse,
    ContextDocResponse,
    TogglePinResponse,
)
from api.user_store import (
    add_context_doc,
    create_chat_session,
    delete_chat_session,
    delete_context_doc,
    get_chat_session,
    list_chat_memories,
    list_chat_sessions,
    list_context_docs,
    toggle_pin_memory,
)

router = APIRouter(prefix="/agents", tags=["agents"])
_UI_FILE = Path(__file__).resolve().parents[2] / "front" / "chat_ui.html"


@router.get("", response_model=list[str])
async def list_agents() -> list[str]:
    return [agent.value for agent in AgentType]


@router.get("/sessions", response_model=list[ChatSessionResponse])
async def get_sessions(
    limit: int = 20,
    current_user: dict = Depends(get_current_user),
) -> list[ChatSessionResponse]:
    rows = list_chat_sessions(user_id=current_user["id"], limit=limit)
    return [ChatSessionResponse(**row) for row in rows]


@router.post("/sessions", response_model=ChatSessionResponse)
async def create_session(
    current_user: dict = Depends(get_current_user),
) -> ChatSessionResponse:
    row = create_chat_session(user_id=current_user["id"])
    return ChatSessionResponse(**row)


@router.delete("/sessions/{session_id}")
async def delete_session(
    session_id: str,
    current_user: dict = Depends(get_current_user),
) -> dict[str, str]:
    deleted = delete_chat_session(user_id=current_user["id"], session_id=session_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="会话不存在")
    return {"status": "deleted"}


@router.get("/sessions/{session_id}/messages", response_model=list[ChatMemoryResponse])
async def get_session_messages(
    session_id: str,
    limit: int = 500,
    current_user: dict = Depends(get_current_user),
) -> list[ChatMemoryResponse]:
    session = get_chat_session(user_id=current_user["id"], session_id=session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="会话不存在")

    rows = list_chat_memories(user_id=current_user["id"], session_id=session_id, limit=limit)
    return [ChatMemoryResponse(**row) for row in rows]


@router.get("/ui")
async def chat_ui() -> FileResponse:
    return FileResponse(_UI_FILE)


@router.post("/{agent_type}/chat", response_model=AgentChatResponse)
async def chat(
    agent_type: AgentType,
    request: AgentChatRequest,
    current_user: dict = Depends(get_current_user),
) -> AgentChatResponse:
    try:
        service = AgentService()
        result = await service.run(
            user_id=current_user["id"],
            agent_type=agent_type,
            user_input=request.input,
            session_id=request.session_id,
            history=request.history,
            system_prompt=request.system_prompt,
            enable_rag=request.enable_rag,
            temperature=request.temperature,
            max_tokens=request.max_tokens,
        )
    except ValueError as exc:
        raise HTTPException(status_code=500, detail=f"LLM 配置错误：{exc}") from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"智能体执行失败：{exc}") from exc

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
    user_id: int,
) -> StreamingResponse:
    async def event_generator():
        try:
            async for event in service.run_stream(
                user_id=user_id,
                agent_type=agent_type,
                user_input=request.input,
                session_id=request.session_id,
                history=request.history,
                system_prompt=request.system_prompt,
                enable_rag=request.enable_rag,
                temperature=request.temperature,
                max_tokens=request.max_tokens,
            ):
                event_type = event.get("type", "message")
                payload = json.dumps(event.get("data", {}), ensure_ascii=False)
                yield f"event: {event_type}\ndata: {payload}\n\n"

            yield "event: end\ndata: {}\n\n"
        except ValueError as exc:
            payload = json.dumps({"message": f"LLM 配置错误：{exc}"}, ensure_ascii=False)
            yield f"event: error\ndata: {payload}\n\n"
        except Exception as exc:
            payload = json.dumps({"message": f"智能体执行失败：{exc}"}, ensure_ascii=False)
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
async def chat_stream(
    agent_type: AgentType,
    request: AgentChatRequest,
    current_user: dict = Depends(get_current_user),
) -> StreamingResponse:
    service = AgentService()
    return _build_streaming_response(service, agent_type, request, current_user["id"])


@router.post("/sessions/{session_id}/messages/{memory_id}/pin", response_model=TogglePinResponse)
async def toggle_pin(
    session_id: str,
    memory_id: int,
    current_user: dict = Depends(get_current_user),
) -> TogglePinResponse:
    session = get_chat_session(user_id=current_user["id"], session_id=session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="会话不存在")
    result = toggle_pin_memory(user_id=current_user["id"], memory_id=memory_id)
    if result is None:
        raise HTTPException(status_code=404, detail="消息不存在")
    return TogglePinResponse(**result)


@router.get("/sessions/{session_id}/context-docs", response_model=list[ContextDocResponse])
async def get_context_docs(
    session_id: str,
    current_user: dict = Depends(get_current_user),
) -> list[ContextDocResponse]:
    session = get_chat_session(user_id=current_user["id"], session_id=session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="会话不存在")
    docs = list_context_docs(user_id=current_user["id"], session_id=session_id)
    return [ContextDocResponse(**d) for d in docs]


@router.post("/sessions/{session_id}/context-docs", response_model=ContextDocResponse)
async def upload_context_doc(
    session_id: str,
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user),
) -> ContextDocResponse:
    session = get_chat_session(user_id=current_user["id"], session_id=session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="会话不存在")

    MAX_SIZE = 2 * 1024 * 1024  # 2MB
    raw = await file.read()
    if len(raw) > MAX_SIZE:
        raise HTTPException(status_code=413, detail="文件大小不能超过 2MB")

    try:
        content = raw.decode("utf-8")
    except UnicodeDecodeError:
        raise HTTPException(status_code=400, detail="仅支持 UTF-8 文本文件")

    doc = add_context_doc(
        user_id=current_user["id"],
        session_id=session_id,
        file_name=file.filename or "unknown.txt",
        content=content,
    )
    return ContextDocResponse(**doc)


@router.delete("/sessions/{session_id}/context-docs/{doc_id}")
async def remove_context_doc(
    session_id: str,
    doc_id: int,
    current_user: dict = Depends(get_current_user),
) -> dict:
    session = get_chat_session(user_id=current_user["id"], session_id=session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="会话不存在")
    deleted = delete_context_doc(user_id=current_user["id"], doc_id=doc_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="文档不存在")
    return {"status": "deleted"}


@router.get("/{agent_type}/chat/stream")
async def chat_stream_get(
    agent_type: AgentType,
    input: str,
    system_prompt: str | None = None,
    current_user: dict = Depends(get_current_user),
) -> StreamingResponse:
    service = AgentService()
    request = AgentChatRequest(input=input, system_prompt=system_prompt)
    return _build_streaming_response(service, agent_type, request, current_user["id"])
