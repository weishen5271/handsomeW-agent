import json
import queue
import time
from collections import defaultdict, deque
from datetime import datetime, timezone
from typing import Any
from urllib import request

import psycopg
from neo4j import GraphDatabase
from neo4j.exceptions import Neo4jError

from api.alarm_flow_store import create_alarm_record
from flow.live_log_store import alarm_flow_live_log_store

TRIGGER_NODE_TYPES = {"delay_trigger", "cron_trigger"}
MQTT_NODE_TYPES = {"mqtt_subscribe", "mqtt"}
PULL_SOURCE_NODE_TYPES = {"http_request", "http", "database_query", "db_query"}


def _normalize_records(data: Any) -> list[dict[str, Any]]:
    if data is None:
        return []
    if isinstance(data, list):
        return [item if isinstance(item, dict) else {"value": item} for item in data]
    if isinstance(data, dict):
        return [data]
    return [{"value": data}]


def _parse_datetime(value: Any) -> datetime | None:
    if value is None or value == "":
        return None
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    if isinstance(value, (int, float)):
        return datetime.fromtimestamp(float(value), tz=timezone.utc)
    if isinstance(value, str):
        text = value.strip()
        if not text:
            return None
        if text.endswith("Z"):
            text = text[:-1] + "+00:00"
        try:
            parsed = datetime.fromisoformat(text)
            return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)
        except ValueError:
            return None
    return None


def _extract_json_path(payload: Any, path: str | None) -> Any:
    if not path or path == "$":
        return payload
    current = payload
    expression = path.strip()
    if not expression.startswith("$"):
        return None
    expression = expression[1:]
    if expression.startswith("."):
        expression = expression[1:]
    if not expression:
        return current

    for segment in expression.split("."):
        if segment.endswith("[*]"):
            key = segment[:-3]
            current = current.get(key, []) if isinstance(current, dict) else []
        elif "[" in segment and segment.endswith("]"):
            key, raw_index = segment[:-1].split("[", 1)
            if key:
                current = current.get(key) if isinstance(current, dict) else None
            if not isinstance(current, list):
                return None
            try:
                current = current[int(raw_index)]
            except (ValueError, IndexError):
                return None
        else:
            if not isinstance(current, dict):
                return None
            current = current.get(segment)
        if current is None:
            return None
    return current


def _safe_eval(expression: str, item: dict[str, Any]) -> Any:
    safe_globals = {"__builtins__": {}}
    safe_locals = {
        "item": item,
        "len": len,
        "min": min,
        "max": max,
        "sum": sum,
        "str": str,
        "int": int,
        "float": float,
        "bool": bool,
        "abs": abs,
        "round": round,
    }
    return eval(expression, safe_globals, safe_locals)  # noqa: S307


class FlowExecutor:
    def __init__(self) -> None:
        self._neo4j_driver = None
        self._neo4j_database: str | None = None

    def _get_neo4j_driver(self):
        if self._neo4j_driver is not None:
            return self._neo4j_driver
        import os

        uri = os.getenv("NEO4J_URI")
        user = os.getenv("NEO4J_USER")
        password = os.getenv("NEO4J_PASSWORD")
        database = os.getenv("NEO4J_DATABASE") or None
        if not uri or not user or not password:
            raise RuntimeError("Neo4j 未配置，请设置 NEO4J_URI / NEO4J_USER / NEO4J_PASSWORD")
        self._neo4j_driver = GraphDatabase.driver(uri, auth=(user, password))
        self._neo4j_database = database
        return self._neo4j_driver

    def validate(self, flow: dict[str, Any]) -> tuple[list[str], dict[str, dict[str, Any]], dict[str, list[str]]]:
        nodes = flow.get("nodes", [])
        edges = flow.get("edges", [])
        if not nodes:
            raise RuntimeError("流程中没有可执行节点")

        node_map = {node["id"]: node for node in nodes}
        indegree = {node["id"]: 0 for node in nodes}
        downstream: dict[str, list[str]] = defaultdict(list)
        upstream: dict[str, list[str]] = defaultdict(list)
        for edge in edges:
            source = edge["source"]
            target = edge["target"]
            if source not in node_map or target not in node_map:
                continue
            downstream[source].append(target)
            upstream[target].append(source)
            indegree[target] += 1

        queue = deque([node_id for node_id, degree in indegree.items() if degree == 0])
        order: list[str] = []
        while queue:
            node_id = queue.popleft()
            order.append(node_id)
            for target in downstream.get(node_id, []):
                indegree[target] -= 1
                if indegree[target] == 0:
                    queue.append(target)

        if len(order) != len(nodes):
            raise RuntimeError("流程存在循环依赖，无法部署")

        root_nodes = [node_map[node_id] for node_id in order if not upstream.get(node_id)]
        if not root_nodes:
            raise RuntimeError("流程缺少起始节点")

        for node_id in order:
            node = node_map[node_id]
            node_type = (node.get("type") or "").strip().lower()
            config = node.get("config") or {}
            if node_type == "delay_trigger":
                interval_seconds = int(config.get("interval_seconds") or 0)
                if interval_seconds <= 0:
                    raise RuntimeError(f"节点 {node_id} 的延时触发间隔必须大于 0 秒")
            if node_type == "cron_trigger" and not str(config.get("schedule") or "").strip():
                raise RuntimeError(f"节点 {node_id} 缺少轮询 Cron 表达式")
            if node_type in {"http_request", "http"} and not str(config.get("url") or "").strip():
                raise RuntimeError(f"节点 {node_id} 缺少 HTTP URL")
            if node_type in {"mqtt_subscribe", "mqtt"}:
                if not str(config.get("broker_url") or "").strip():
                    raise RuntimeError(f"节点 {node_id} 缺少 MQTT Broker 地址")
                if not str(config.get("topic") or "").strip():
                    raise RuntimeError(f"节点 {node_id} 缺少 MQTT Topic")
            if node_type in {"database_query", "db_query"} and not str(config.get("sql") or "").strip():
                raise RuntimeError(f"节点 {node_id} 缺少 SQL")
            if node_type not in {
                "http_request",
                "http",
                "delay_trigger",
                "cron_trigger",
                "mqtt_subscribe",
                "mqtt",
                "database_query",
                "db_query",
                "transform",
                "field_mapping",
                "filter",
                "expression_transform",
                "expression",
                "neo4j_store",
                "postgres_store",
                "postgresql_store",
                "pg_store",
            }:
                raise RuntimeError(f"不支持的节点类型: {node_type}")

            has_upstream = bool(upstream.get(node_id))
            if node_type in TRIGGER_NODE_TYPES and has_upstream:
                raise RuntimeError(f"触发节点 {node_id} 必须位于流程起点")
            if node_type in PULL_SOURCE_NODE_TYPES and not has_upstream:
                raise RuntimeError(f"节点 {node_id} 需要接在触发节点后面，不能直接作为流程起点")
            if not has_upstream and node_type not in TRIGGER_NODE_TYPES.union(MQTT_NODE_TYPES):
                raise RuntimeError(f"节点 {node_id} 不能直接作为流程起点，请在前面添加触发节点，或改用 MQTT 实时接入")
        return order, node_map, upstream

    def execute(self, flow: dict[str, Any]) -> None:
        order, node_map, upstream = self.validate(flow)
        alarm_flow_live_log_store.append(flow["asset_id"], level="info", message=f"开始执行流程：{flow.get('name') or flow['id']}")
        results: dict[str, list[dict[str, Any]]] = {}
        for node_id in order:
            node = node_map[node_id]
            inputs: list[dict[str, Any]] = []
            for prev in upstream.get(node_id, []):
                inputs.extend(results.get(prev, []))

            started = time.perf_counter()
            try:
                alarm_flow_live_log_store.append(
                    flow["asset_id"],
                    level="info",
                    node_id=node_id,
                    message=f"开始执行节点 {node_id}，当前输入 {len(inputs)} 条",
                )
                outputs = self._execute_node(flow=flow, node=node, records=inputs)
                duration_ms = int((time.perf_counter() - started) * 1000)
                alarm_flow_live_log_store.append(
                    flow["asset_id"],
                    level="success",
                    node_id=node_id,
                    message=f"节点 {node_id} 执行成功，输入 {len(inputs)} 条，输出 {len(outputs)} 条，耗时 {duration_ms}ms",
                )
                results[node_id] = outputs
            except Exception as exc:
                duration_ms = int((time.perf_counter() - started) * 1000)
                alarm_flow_live_log_store.append(
                    flow["asset_id"],
                    level="error",
                    node_id=node_id,
                    message=f"节点 {node_id} 执行失败：{exc}（耗时 {duration_ms}ms）",
                )
                raise
        alarm_flow_live_log_store.append(flow["asset_id"], level="success", message="流程执行完成")

    def _execute_node(self, *, flow: dict[str, Any], node: dict[str, Any], records: list[dict[str, Any]]) -> list[dict[str, Any]]:
        node_type = (node.get("type") or "").strip().lower()
        config = node.get("config") or {}
        if node_type == "delay_trigger":
            return self._execute_delay_trigger(config)
        if node_type == "cron_trigger":
            return self._execute_cron_trigger(config)
        if node_type in {"http_request", "http"}:
            return self._execute_http_node(config)
        if node_type in {"mqtt_subscribe", "mqtt"}:
            return self._execute_mqtt_node(config)
        if node_type in {"database_query", "db_query"}:
            return self._execute_db_node(config)
        if node_type in {"transform", "field_mapping"}:
            return self._execute_mapping_node(config, records)
        if node_type == "filter":
            return self._execute_filter_node(config, records)
        if node_type in {"expression_transform", "expression"}:
            return self._execute_expression_node(config, records)
        if node_type == "neo4j_store":
            return self._execute_neo4j_store(flow, config, records)
        if node_type in {"postgres_store", "postgresql_store", "pg_store"}:
            return self._execute_pg_store(flow, config, records)
        raise RuntimeError(f"不支持的节点类型: {node_type}")

    def _execute_delay_trigger(self, config: dict[str, Any]) -> list[dict[str, Any]]:
        interval_seconds = int(config.get("interval_seconds") or 0)
        return [{"trigger": "delay", "interval_seconds": interval_seconds}]

    def _execute_cron_trigger(self, config: dict[str, Any]) -> list[dict[str, Any]]:
        schedule = str(config.get("schedule") or "").strip()
        return [{"trigger": "cron", "schedule": schedule}]

    def _execute_http_node(self, config: dict[str, Any]) -> list[dict[str, Any]]:
        url = str(config.get("url") or "").strip()
        if not url:
            raise RuntimeError("HTTP 节点缺少 url")
        method = str(config.get("method") or "GET").upper()
        headers = config.get("headers") or {}
        body = config.get("body")
        payload_bytes = None
        if body not in (None, ""):
            payload_bytes = json.dumps(body, ensure_ascii=False).encode("utf-8") if isinstance(body, (dict, list)) else str(body).encode("utf-8")
        req = request.Request(url=url, data=payload_bytes, method=method)
        for key, value in headers.items():
            req.add_header(str(key), str(value))
        if payload_bytes is not None and "Content-Type" not in headers:
            req.add_header("Content-Type", "application/json")
        with request.urlopen(req, timeout=int(config.get("timeout_seconds") or 15)) as response:  # noqa: S310
            raw_body = response.read().decode("utf-8")
        parsed = json.loads(raw_body)
        extracted = _extract_json_path(parsed, config.get("response_path"))
        return _normalize_records(extracted)

    def _execute_db_node(self, config: dict[str, Any]) -> list[dict[str, Any]]:
        import os

        dsn = str(config.get("connection_string") or os.getenv("DATABASE_URL") or "").strip()
        sql = str(config.get("sql") or "").strip()
        if not dsn or not sql:
            raise RuntimeError("数据库节点缺少 connection_string 或 sql")
        with psycopg.connect(dsn, row_factory=psycopg.rows.dict_row) as conn:
            rows = conn.execute(sql).fetchall()
        return [dict(row) for row in rows]

    def _execute_mqtt_node(self, config: dict[str, Any]) -> list[dict[str, Any]]:
        try:
            import paho.mqtt.client as mqtt
        except ImportError as exc:
            raise RuntimeError("当前环境缺少 paho-mqtt，请先同步 backend/ai-service 的 uv 依赖") from exc

        broker_url = str(config.get("broker_url") or "").strip()
        topic = str(config.get("topic") or "").strip()
        if not broker_url:
            raise RuntimeError("MQTT 节点缺少 broker_url")
        if not topic:
            raise RuntimeError("MQTT 节点缺少 topic")

        from urllib.parse import urlparse

        parsed = urlparse(broker_url if "://" in broker_url else f"mqtt://{broker_url}")
        host = parsed.hostname
        port = parsed.port or (8883 if parsed.scheme in {"mqtts", "ssl", "tls"} else 1883)
        if not host:
            raise RuntimeError("MQTT Broker 地址格式无效")

        username = str(config.get("username") or "").strip() or None
        password = str(config.get("password") or "").strip() or None
        qos = int(config.get("qos") or 0)
        timeout_seconds = max(int(config.get("timeout_seconds") or config.get("wait_seconds") or 8), 1)
        response_path = str(config.get("response_path") or "$").strip()
        messages: queue.Queue[dict[str, Any]] = queue.Queue()
        errors: list[str] = []
        connected = {"ready": False}

        client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2)
        if username:
            client.username_pw_set(username, password)
        if parsed.scheme in {"mqtts", "ssl", "tls"}:
            client.tls_set()

        def on_connect(_client, _userdata, _flags, reason_code, _properties=None):
            if getattr(reason_code, "is_failure", False):
                errors.append(f"MQTT 连接失败: {reason_code}")
                return
            result, _mid = _client.subscribe(topic, qos=qos)
            if result != mqtt.MQTT_ERR_SUCCESS:
                errors.append(f"MQTT 订阅失败，错误码: {result}")
                return
            connected["ready"] = True

        def on_message(_client, _userdata, message):
            payload_text = message.payload.decode("utf-8", errors="ignore")
            try:
                payload_data = json.loads(payload_text)
            except json.JSONDecodeError:
                payload_data = {
                    "topic": message.topic,
                    "payload": payload_text,
                    "qos": message.qos,
                }
            extracted = _extract_json_path(payload_data, response_path)
            for item in _normalize_records(extracted):
                if isinstance(item, dict):
                    item.setdefault("topic", message.topic)
                    item.setdefault("qos", message.qos)
                messages.put(item if isinstance(item, dict) else {"value": item})

        def on_disconnect(_client, _userdata, _disconnect_flags, reason_code, _properties=None):
            if reason_code and reason_code != 0 and not messages.qsize():
                errors.append(f"MQTT 已断开: {reason_code}")

        client.on_connect = on_connect
        client.on_message = on_message
        client.on_disconnect = on_disconnect

        try:
            client.connect(host, port=port, keepalive=max(timeout_seconds, 5))
            client.loop_start()
            deadline = time.time() + timeout_seconds
            while time.time() < deadline:
                if errors:
                    raise RuntimeError(errors[0])
                if not messages.empty():
                    break
                time.sleep(0.1)
            if errors:
                raise RuntimeError(errors[0])
            if messages.empty():
                return []

            result: list[dict[str, Any]] = []
            while not messages.empty():
                result.append(messages.get())
            return result
        finally:
            client.loop_stop()
            try:
                client.disconnect()
            except Exception:
                pass

    def _execute_mapping_node(self, config: dict[str, Any], records: list[dict[str, Any]]) -> list[dict[str, Any]]:
        mappings = config.get("mappings") or []
        if not mappings:
            return records
        transformed: list[dict[str, Any]] = []
        for item in records:
            result: dict[str, Any] = {}
            for mapping in mappings:
                target = mapping.get("target")
                if not target:
                    continue
                source = mapping.get("source")
                value = _extract_json_path(item, source) if source else mapping.get("value")
                if value is None and "default" in mapping:
                    value = mapping["default"]
                result[str(target)] = value
            if "asset_id" not in result and item.get("asset_id"):
                result["asset_id"] = item.get("asset_id")
            transformed.append(result)
        return transformed

    def _execute_filter_node(self, config: dict[str, Any], records: list[dict[str, Any]]) -> list[dict[str, Any]]:
        condition = str(config.get("condition") or "").strip()
        if not condition:
            return records
        return [item for item in records if bool(_safe_eval(condition, item))]

    def _execute_expression_node(self, config: dict[str, Any], records: list[dict[str, Any]]) -> list[dict[str, Any]]:
        expression = str(config.get("expression") or "").strip()
        target_field = str(config.get("target_field") or "computed").strip()
        if not expression:
            return records
        output: list[dict[str, Any]] = []
        for item in records:
            copied = dict(item)
            copied[target_field] = _safe_eval(expression, copied)
            output.append(copied)
        return output

    def _execute_neo4j_store(self, flow: dict[str, Any], config: dict[str, Any], records: list[dict[str, Any]]) -> list[dict[str, Any]]:
        driver = self._get_neo4j_driver()
        asset_id_field = str(config.get("asset_id_field") or "asset_id")
        try:
            with driver.session(database=self._neo4j_database) as session:
                for item in records:
                    asset_id = str(item.get(asset_id_field) or flow["asset_id"])
                    occurrence_time = _parse_datetime(item.get("occurrence_time"))
                    occurrence_time_text = occurrence_time.isoformat() if occurrence_time else datetime.now(timezone.utc).isoformat()
                    description = str(item.get("description") or item.get("message") or "")
                    severity = str(item.get("severity") or item.get("level") or "")
                    alarm_type = str(item.get("alarm_type") or item.get("type") or "")
                    session.run(
                        """
                        MERGE (asset:Asset {id: $asset_id})
                        MERGE (alarm:Alarm {
                            flow_id: $flow_id,
                            asset_id: $asset_id,
                            occurrence_time: $occurrence_time,
                            description: $description
                        })
                        SET alarm.severity = $severity,
                            alarm.alarm_type = $alarm_type,
                            alarm.updated_at = datetime($updated_at),
                            alarm.raw_payload = $raw_payload
                        MERGE (asset)-[:HAS_ALARM]->(alarm)
                        """,
                        {
                            "asset_id": asset_id,
                            "flow_id": flow["id"],
                            "occurrence_time": occurrence_time_text,
                            "description": description,
                            "severity": severity,
                            "alarm_type": alarm_type,
                            "updated_at": datetime.now(timezone.utc).isoformat(),
                            "raw_payload": json.dumps(item, ensure_ascii=False),
                        },
                    )
        except Neo4jError as exc:
            raise RuntimeError(f"Neo4j 告警写入失败: {exc}") from exc
        return records

    def _execute_pg_store(self, flow: dict[str, Any], config: dict[str, Any], records: list[dict[str, Any]]) -> list[dict[str, Any]]:
        asset_id_field = str(config.get("asset_id_field") or "asset_id")
        for item in records:
            create_alarm_record(
                flow_id=flow["id"],
                asset_id=str(item.get(asset_id_field) or flow["asset_id"]),
                occurrence_time=_parse_datetime(item.get("occurrence_time")),
                severity=str(item.get("severity") or "") or None,
                alarm_type=str(item.get("alarm_type") or item.get("type") or "") or None,
                description=str(item.get("description") or item.get("message") or "") or None,
                payload=item,
            )
        return records


flow_executor = FlowExecutor()
