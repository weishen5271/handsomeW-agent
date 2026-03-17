import os

from dotenv import load_dotenv
from fastapi import FastAPI
import uvicorn

from api.routes import router as agent_router

load_dotenv()

app = FastAPI(title="handsomeW-agent API", version="0.1.0")


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


app.include_router(agent_router)


if __name__ == "__main__":
    host = os.getenv("APP_HOST", "127.0.0.1")
    port = int(os.getenv("APP_PORT", "8000"))
    debug = os.getenv("DEBUG", "false").lower() == "true"

    # PyCharm debug entry: run this file directly in Debug mode.
    uvicorn.run("main:app", host=host, port=port, reload=debug)
