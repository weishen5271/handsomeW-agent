# handsomeW-agent

## Run

Install dependencies:

```bash
pip install -r requirements.txt
```

Start server (CLI):

```bash
uvicorn main:app --host 127.0.0.1 --port 8000 --reload
```

## PyCharm Debug

1. Open project in PyCharm.
2. Set Python interpreter and install `requirements.txt`.
3. Open `main.py` and click `Debug 'main'`.
4. Service starts with `uvicorn.run(...)` from `main.py`.
5. Open docs at `http://127.0.0.1:8000/docs`.

Optional environment variables:

- `APP_HOST` (default: `127.0.0.1`)
- `APP_PORT` (default: `8000`)
- `DEBUG` (`true` enables reload)
