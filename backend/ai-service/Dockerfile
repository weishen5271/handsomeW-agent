FROM python:3.11-slim

COPY --from=ghcr.io/astral-sh/uv:0.11.7 /uv /uvx /bin/

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app/backend/ai-service

COPY backend/ai-service/pyproject.toml ./pyproject.toml
COPY backend/ai-service/uv.lock ./uv.lock
RUN uv sync --frozen --no-dev

COPY backend/ai-service ./

EXPOSE 8000

CMD ["uv", "run", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
