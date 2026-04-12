FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

COPY backend/ai-service/requirements.txt /tmp/requirements.txt
RUN pip install --no-cache-dir -r /tmp/requirements.txt

COPY backend/ai-service /app/backend/ai-service

EXPOSE 8000

CMD ["uvicorn", "main:app", "--app-dir", "backend/ai-service", "--host", "0.0.0.0", "--port", "8000"]
