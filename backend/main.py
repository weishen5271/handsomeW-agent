import os
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

load_dotenv(Path(__file__).resolve().parent / ".env")

from api.auth import router as auth_router
from api.alarm_flow_routes import router as alarm_flow_router
from api.digital_twin_routes import router as digital_twin_router
from api.llm_config import router as llm_config_router
from api.routes import router as agent_router
from api.alarm_flow_store import init_alarm_flow_db
from api.digital_twin_store import init_digital_twin_db
from api.user_store import init_db
from flow.scheduler import alarm_flow_scheduler

app = FastAPI(title="handsomeW-agent API", version="0.1.0")


def _parse_cors_origins() -> list[str]:
    raw_origins = os.getenv(
        "CORS_ALLOW_ORIGINS",
        "http://localhost:5173,http://127.0.0.1:5173,http://localhost:3000,http://127.0.0.1:3000",
    )
    return [origin.strip() for origin in raw_origins.split(",") if origin.strip()]


allow_origins = _parse_cors_origins()
allow_origin_regex = os.getenv("CORS_ALLOW_ORIGIN_REGEX")

app.add_middleware(
    CORSMiddleware,
    allow_origins=allow_origins,
    allow_origin_regex=allow_origin_regex,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.on_event("startup")
async def startup() -> None:
    init_db()
    init_digital_twin_db()
    init_alarm_flow_db()
    alarm_flow_scheduler.start()


app.include_router(auth_router)
app.include_router(llm_config_router)
app.include_router(agent_router)
app.include_router(digital_twin_router)
app.include_router(alarm_flow_router)


if __name__ == "__main__":
    host = os.getenv("APP_HOST", "127.0.0.1")
    port = int(os.getenv("APP_PORT", "8000"))
    debug = os.getenv("DEBUG", "false").lower() == "true"

    # PyCharm debug entry: run this file directly in Debug mode.
    uvicorn.run(app, host=host, port=port, reload=debug)
