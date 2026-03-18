# handsomeW-agent

## Project Structure

- `backend`: service-side Python code
- `front`: frontend page (`chat_ui.html`)

## Run Backend

Install dependencies:

```bash
pip install -r backend/requirements.txt
```

Start server (from repository root):

```bash
uvicorn main:app --app-dir backend --host 127.0.0.1 --port 8000 --reload
```

## PyCharm Debug

1. Open project in PyCharm.
2. Set Python interpreter and install `backend/requirements.txt`.
3. Open `backend/main.py` and click `Debug 'main'`.
4. Service starts with `uvicorn.run(...)` from `backend/main.py`.
5. Open docs at `http://127.0.0.1:8000/docs`.

Optional environment variables:

- `APP_HOST` (default: `127.0.0.1`)
- `APP_PORT` (default: `8000`)
- `DEBUG` (`true` enables reload)