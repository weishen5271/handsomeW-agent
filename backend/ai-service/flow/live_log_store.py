from collections import defaultdict, deque
from datetime import datetime, timezone
from threading import Lock
from typing import Any
from uuid import uuid4


class AlarmFlowLiveLogStore:
    def __init__(self, max_entries: int = 300) -> None:
        self._max_entries = max_entries
        self._lock = Lock()
        self._logs: dict[str, deque[dict[str, Any]]] = defaultdict(lambda: deque(maxlen=self._max_entries))

    def append(self, asset_id: str, *, level: str, message: str, node_id: str | None = None) -> dict[str, Any]:
        entry = {
            "id": uuid4().hex,
            "timestamp": datetime.now(timezone.utc),
            "level": level,
            "message": message,
            "node_id": node_id,
        }
        with self._lock:
            self._logs[asset_id].append(entry)
        return entry

    def list(self, asset_id: str) -> list[dict[str, Any]]:
        with self._lock:
            return list(self._logs.get(asset_id, deque()))

    def clear(self, asset_id: str) -> None:
        with self._lock:
            self._logs.pop(asset_id, None)


alarm_flow_live_log_store = AlarmFlowLiveLogStore()
