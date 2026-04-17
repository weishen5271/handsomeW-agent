import threading
import time
from datetime import datetime
from typing import Any

from api.alarm_flow_store import get_alarm_flow, list_running_alarm_flows, update_alarm_flow_status
from flow.executor import flow_executor
from flow.live_log_store import alarm_flow_live_log_store

TRIGGER_NODE_TYPES = {"delay_trigger", "cron_trigger"}
MQTT_NODE_TYPES = {"mqtt_subscribe", "mqtt"}


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
        self._last_triggered: dict[str, float | str] = {}
        self._running_assets: set[str] = set()
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
            stale_keys = [key for key in self._last_triggered if key.startswith(f"{asset_id}:")]
            for key in stale_keys:
                self._last_triggered.pop(key, None)
            self._running_assets.discard(asset_id)

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
                asset_id = flow["asset_id"]
                if asset_id in self._running_assets:
                    continue
                if self._should_execute(flow, now):
                    threading.Thread(target=self._execute_flow, args=(asset_id,), daemon=True).start()
            time.sleep(1)

    def _should_execute(self, flow: dict[str, Any], now: datetime) -> bool:
        nodes = flow.get("nodes", []) or []
        node_map = {node["id"]: node for node in nodes}
        upstream_counts = {node["id"]: 0 for node in nodes}
        for edge in flow.get("edges", []) or []:
            target = edge.get("target")
            if target in upstream_counts:
                upstream_counts[target] += 1

        root_nodes = [node for node in nodes if upstream_counts.get(node["id"], 0) == 0]
        asset_id = flow["asset_id"]
        has_trigger = False
        for node in root_nodes:
            node_id = node["id"]
            node_type = str(node.get("type") or "").strip().lower()
            config = node.get("config") or {}
            if node_type == "cron_trigger":
                has_trigger = True
                schedule = str(config.get("schedule") or "").strip()
                trigger_key = f"{asset_id}:{node_id}"
                current_key = now.strftime("%Y-%m-%d %H:%M:%S")
                if schedule and _cron_matches(schedule, now) and self._last_triggered.get(trigger_key) != current_key:
                    self._last_triggered[trigger_key] = current_key
                    return True
            elif node_type == "delay_trigger":
                has_trigger = True
                interval_seconds = max(int(config.get("interval_seconds") or 0), 1)
                trigger_key = f"{asset_id}:{node_id}"
                last_value = self._last_triggered.get(trigger_key)
                last_run = float(last_value) if isinstance(last_value, (int, float)) else None
                now_ts = time.time()
                if last_run is None or now_ts - last_run >= interval_seconds:
                    self._last_triggered[trigger_key] = now_ts
                    return True

        if has_trigger:
            return False

        for node in root_nodes:
            node_type = str(node.get("type") or "").strip().lower()
            if node_type in MQTT_NODE_TYPES:
                return True
        return False

    def _execute_flow(self, asset_id: str) -> None:
        with self._lock:
            if asset_id in self._running_assets:
                return
            self._running_assets.add(asset_id)
        flow = get_alarm_flow(asset_id)
        if flow is None or not flow.get("enabled"):
            self.unregister(asset_id)
            return
        try:
            flow_executor.execute(flow)
            update_alarm_flow_status(asset_id, status="running", enabled=True)
        except Exception as exc:
            alarm_flow_live_log_store.append(asset_id, level="error", message=f"流程执行中断：{exc}")
            update_alarm_flow_status(asset_id, status="error", enabled=True)
        finally:
            with self._lock:
                self._running_assets.discard(asset_id)


alarm_flow_scheduler = AlarmFlowScheduler()
