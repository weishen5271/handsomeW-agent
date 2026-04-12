import threading
import time
from datetime import datetime
from typing import Any

from api.alarm_flow_store import get_alarm_flow, list_running_alarm_flows, update_alarm_flow_status
from flow.executor import flow_executor


def _cron_matches_field(token: str, value: int) -> bool:
    token = token.strip()
    if token == "*":
        return True
    if token.startswith("*/"):
        try:
            interval = int(token[2:])
        except ValueError:
            return False
        return interval > 0 and value % interval == 0
    for part in token.split(","):
        if part.strip().isdigit() and int(part.strip()) == value:
            return True
    return False


def _cron_matches(schedule: str, current: datetime) -> bool:
    parts = schedule.split()
    if len(parts) != 6:
        return False
    second, minute, hour, day, month, weekday = parts
    weekday_value = (current.weekday() + 1) % 7
    return (
        _cron_matches_field(second, current.second)
        and _cron_matches_field(minute, current.minute)
        and _cron_matches_field(hour, current.hour)
        and _cron_matches_field(day, current.day)
        and _cron_matches_field(month, current.month)
        and _cron_matches_field(weekday, weekday_value)
    )


class AlarmFlowScheduler:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._flows: dict[str, dict[str, Any]] = {}
        self._last_triggered: dict[str, str] = {}
        self._stop_event = threading.Event()
        self._thread: threading.Thread | None = None

    def start(self) -> None:
        with self._lock:
            if self._thread and self._thread.is_alive():
                return
            self._stop_event.clear()
            self._flows = {flow["asset_id"]: flow for flow in list_running_alarm_flows()}
            self._thread = threading.Thread(target=self._run, name="alarm-flow-scheduler", daemon=True)
            self._thread.start()

    def register(self, asset_id: str) -> dict[str, Any]:
        flow = get_alarm_flow(asset_id)
        if flow is None:
            raise RuntimeError("告警流程不存在")
        with self._lock:
            self._flows[asset_id] = flow
        return flow

    def unregister(self, asset_id: str) -> None:
        with self._lock:
            self._flows.pop(asset_id, None)
            self._last_triggered.pop(asset_id, None)

    def stop(self) -> None:
        self._stop_event.set()
        thread = self._thread
        if thread and thread.is_alive():
            thread.join(timeout=2)

    def _run(self) -> None:
        while not self._stop_event.is_set():
            now = datetime.now()
            flows = list(self._flows.values())
            for flow in flows:
                schedule = str(flow.get("schedule") or "").strip()
                if not schedule or not _cron_matches(schedule, now):
                    continue
                current_key = now.strftime("%Y-%m-%d %H:%M:%S")
                asset_id = flow["asset_id"]
                if self._last_triggered.get(asset_id) == current_key:
                    continue
                self._last_triggered[asset_id] = current_key
                threading.Thread(target=self._execute_flow, args=(asset_id,), daemon=True).start()
            time.sleep(1)

    def _execute_flow(self, asset_id: str) -> None:
        flow = get_alarm_flow(asset_id)
        if flow is None or not flow.get("enabled"):
            self.unregister(asset_id)
            return
        try:
            flow_executor.execute(flow)
            update_alarm_flow_status(asset_id, status="running", enabled=True)
        except Exception:
            update_alarm_flow_status(asset_id, status="error", enabled=True)


alarm_flow_scheduler = AlarmFlowScheduler()
