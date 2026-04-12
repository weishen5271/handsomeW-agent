import { useEffect, useMemo, useRef, useState } from "react";
import {
  Link2,
  Loader2,
  Play,
  RefreshCw,
  Save,
  Square,
  Trash2,
  Unlink2,
  Workflow,
  X,
} from "lucide-react";

type AlarmFlowEditorProps = {
  assetId: string;
  assetName: string;
  apiBaseUrl: string;
  token: string;
  onClose: () => void;
};

type FlowNodePosition = {
  x: number;
  y: number;
};

type FlowNode = {
  id: string;
  type: string;
  position: FlowNodePosition;
  config: Record<string, unknown>;
};

type FlowEdge = {
  source: string;
  target: string;
};

type FlowStatus = "running" | "stopped" | "error";

type FlowResponse = {
  id: string;
  asset_id: string;
  name: string;
  enabled: boolean;
  schedule: string;
  status: FlowStatus;
  nodes: FlowNode[];
  edges: FlowEdge[];
  created_at: string;
  updated_at: string;
};

type FlowLog = {
  node_id: string;
  timestamp: string;
  status: string;
  input_count: number;
  output_count: number;
  duration_ms: number;
  error?: string | null;
  message?: string | null;
};

type FlowLogListResponse = {
  logs: FlowLog[];
};

type NodeTemplate = {
  type: string;
  label: string;
  group: "source" | "process" | "store";
  description: string;
  color: string;
};

const NODE_TEMPLATES: NodeTemplate[] = [
  { type: "http_request", label: "HTTP 请求", group: "source", description: "定时拉取设备或平台告警接口", color: "bg-blue-50 border-blue-200 text-blue-700" },
  { type: "mqtt_subscribe", label: "MQTT 订阅", group: "source", description: "订阅 Topic 实时接收告警", color: "bg-cyan-50 border-cyan-200 text-cyan-700" },
  { type: "database_query", label: "数据库查询", group: "source", description: "定时从数据库拉取告警记录", color: "bg-indigo-50 border-indigo-200 text-indigo-700" },
  { type: "transform", label: "字段映射", group: "process", description: "将原始字段映射成统一告警结构", color: "bg-amber-50 border-amber-200 text-amber-700" },
  { type: "filter", label: "过滤器", group: "process", description: "按条件过滤不需要的告警数据", color: "bg-orange-50 border-orange-200 text-orange-700" },
  { type: "expression_transform", label: "表达式转换", group: "process", description: "计算衍生字段或格式化值", color: "bg-rose-50 border-rose-200 text-rose-700" },
  { type: "neo4j_store", label: "Neo4j 存储", group: "store", description: "写入告警节点并建立设备关系", color: "bg-emerald-50 border-emerald-200 text-emerald-700" },
  { type: "postgres_store", label: "PostgreSQL 存储", group: "store", description: "持久化到告警记录表", color: "bg-violet-50 border-violet-200 text-violet-700" },
];

const GROUP_LABELS: Record<NodeTemplate["group"], string> = {
  source: "数据源节点",
  process: "数据处理节点",
  store: "数据存储节点",
};

const WORKSPACE_WIDTH = 2200;
const WORKSPACE_HEIGHT = 1400;
const NODE_WIDTH = 220;
const NODE_HEIGHT = 128;

type NodeFlowState = "healthy" | "idle" | "error" | "pending";

type NodeFlowInsight = {
  nodeId: string;
  state: NodeFlowState;
  lastLog: FlowLog | null;
  lastSeen: string | null;
  runs: number;
  totalInput: number;
  totalOutput: number;
  errorCount: number;
};

function createDefaultConfig(nodeType: string): Record<string, unknown> {
  if (nodeType === "http_request") {
    return {
      url: "",
      method: "GET",
      headersText: '{\n  "Authorization": "Bearer xxx"\n}',
      bodyText: "",
      response_path: "$.alarms[*]",
      timeout_seconds: 15,
    };
  }
  if (nodeType === "mqtt_subscribe") {
    return {
      broker_url: "mqtt://127.0.0.1:1883",
      topic: "factory/alarms/#",
      qos: 0,
      username: "",
      password: "",
    };
  }
  if (nodeType === "database_query") {
    return {
      connection_string: "",
      sql: "SELECT * FROM alarm_source ORDER BY occurrence_time DESC LIMIT 100",
    };
  }
  if (nodeType === "transform") {
    return {
      mappingsText: JSON.stringify(
        [
          { source: "$.alarm_time", target: "occurrence_time" },
          { source: "$.level", target: "severity" },
          { source: "$.message", target: "description" },
          { source: "$.type", target: "alarm_type" },
          { source: "$.asset_id", target: "asset_id" },
        ],
        null,
        2,
      ),
    };
  }
  if (nodeType === "filter") {
    return {
      condition: 'item.get("severity") in ("high", "critical", "Critical")',
    };
  }
  if (nodeType === "expression_transform") {
    return {
      target_field: "severity_label",
      expression: 'item.get("severity", "").upper()',
    };
  }
  if (nodeType === "neo4j_store") {
    return {
      node_type: "Alarm",
      asset_id_field: "asset_id",
      propertiesText: JSON.stringify(["occurrence_time", "severity", "alarm_type", "description"], null, 2),
    };
  }
  return {
    table_name: "alarm_records",
    asset_id_field: "asset_id",
  };
}

function getNodeTemplate(nodeType: string): NodeTemplate {
  return NODE_TEMPLATES.find((item) => item.type === nodeType) ?? NODE_TEMPLATES[0];
}

function isSourceNode(nodeType: string): boolean {
  return getNodeTemplate(nodeType).group === "source";
}

function getNodeFlowState(node: FlowNode, lastLog: FlowLog | null): NodeFlowState {
  if (!lastLog) return "pending";
  if (lastLog.status === "error") return "error";
  if (isSourceNode(node.type)) {
    return lastLog.output_count > 0 ? "healthy" : "idle";
  }
  return lastLog.input_count > 0 || lastLog.output_count > 0 ? "healthy" : "idle";
}

function getNodeStateLabel(state: NodeFlowState): string {
  if (state === "healthy") return "有数据";
  if (state === "idle") return "已执行无数据";
  if (state === "error") return "异常";
  return "待验证";
}

function getNodeStateClass(state: NodeFlowState): string {
  if (state === "healthy") return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (state === "idle") return "bg-amber-50 text-amber-700 border-amber-200";
  if (state === "error") return "bg-red-50 text-red-700 border-red-200";
  return "bg-slate-100 text-slate-600 border-slate-200";
}

function normalizeNodeConfig(node: FlowNode): FlowNode {
  const nextConfig = { ...node.config };
  if (node.type === "http_request") {
    nextConfig.headersText =
      typeof nextConfig.headersText === "string"
        ? nextConfig.headersText
        : JSON.stringify(nextConfig.headers ?? { Authorization: "Bearer xxx" }, null, 2);
    nextConfig.bodyText =
      typeof nextConfig.bodyText === "string"
        ? nextConfig.bodyText
        : nextConfig.body === undefined || nextConfig.body === null
          ? ""
          : JSON.stringify(nextConfig.body, null, 2);
  }
  if (node.type === "transform" && typeof nextConfig.mappingsText !== "string") {
    nextConfig.mappingsText = JSON.stringify(nextConfig.mappings ?? [], null, 2);
  }
  if (node.type === "neo4j_store" && typeof nextConfig.propertiesText !== "string") {
    nextConfig.propertiesText = JSON.stringify(nextConfig.properties ?? [], null, 2);
  }
  return { ...node, config: nextConfig };
}

function buildPayloadNode(node: FlowNode): FlowNode {
  const config = { ...node.config };
  if (node.type === "http_request") {
    const headersText = String(config.headersText ?? "").trim();
    const bodyText = String(config.bodyText ?? "").trim();
    delete config.headersText;
    delete config.bodyText;
    config.headers = headersText ? JSON.parse(headersText) : {};
    if (bodyText) {
      config.body = JSON.parse(bodyText);
    } else {
      delete config.body;
    }
  }
  if (node.type === "transform") {
    const mappingsText = String(config.mappingsText ?? "[]").trim();
    delete config.mappingsText;
    config.mappings = mappingsText ? JSON.parse(mappingsText) : [];
  }
  if (node.type === "neo4j_store") {
    const propertiesText = String(config.propertiesText ?? "[]").trim();
    delete config.propertiesText;
    config.properties = propertiesText ? JSON.parse(propertiesText) : [];
  }
  return { ...node, config };
}

function formatTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-CN", { hour12: false });
}

async function readErrorMessage(response: Response, fallback: string): Promise<string> {
  try {
    const payload = (await response.json()) as { detail?: string };
    if (typeof payload.detail === "string" && payload.detail.trim()) {
      return payload.detail;
    }
  } catch {
    // ignore
  }
  try {
    const text = await response.text();
    if (text.trim()) {
      return text;
    }
  } catch {
    // ignore
  }
  return fallback;
}

export default function AlarmFlowEditor({ assetId, assetName, apiBaseUrl, token, onClose }: AlarmFlowEditorProps) {
  const [flowId, setFlowId] = useState("");
  const [flowName, setFlowName] = useState(`${assetName} 告警接入流程`);
  const [schedule, setSchedule] = useState("0 */5 * * * *");
  const [enabled, setEnabled] = useState(true);
  const [status, setStatus] = useState<FlowStatus>("stopped");
  const [nodes, setNodes] = useState<FlowNode[]>([]);
  const [edges, setEdges] = useState<FlowEdge[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeKey, setSelectedEdgeKey] = useState<string | null>(null);
  const [linkingNodeId, setLinkingNodeId] = useState<string | null>(null);
  const [linkPreview, setLinkPreview] = useState<{ x: number; y: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deploying, setDeploying] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logs, setLogs] = useState<FlowLog[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [canvasTransform, setCanvasTransform] = useState({ x: 0, y: 0, scale: 1 });
  const [isPanning, setIsPanning] = useState(false);
  const panStateRef = useRef<{ x: number; y: number; originX: number; originY: number } | null>(null);
  const dragStateRef = useRef<{ nodeId: string; pointerOffsetX: number; pointerOffsetY: number } | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);

  const selectedNode = useMemo(() => nodes.find((node) => node.id === selectedNodeId) ?? null, [nodes, selectedNodeId]);
  const selectedNodeTemplate = selectedNode ? getNodeTemplate(selectedNode.type) : null;
  const selectedEdge = useMemo(
    () => edges.find((edge) => `${edge.source}-${edge.target}` === selectedEdgeKey) ?? null,
    [edges, selectedEdgeKey],
  );
  const linkingNode = useMemo(() => nodes.find((node) => node.id === linkingNodeId) ?? null, [nodes, linkingNodeId]);
  const nodeInsights = useMemo(() => {
    const logsByNode = new Map<string, FlowLog[]>();
    logs.forEach((log) => {
      const current = logsByNode.get(log.node_id) ?? [];
      current.push(log);
      logsByNode.set(log.node_id, current);
    });

    return nodes.reduce<Record<string, NodeFlowInsight>>((acc, node) => {
      const nodeLogs = logsByNode.get(node.id) ?? [];
      const lastLog = nodeLogs[0] ?? null;
      acc[node.id] = {
        nodeId: node.id,
        state: getNodeFlowState(node, lastLog),
        lastLog,
        lastSeen: lastLog?.timestamp ?? null,
        runs: nodeLogs.length,
        totalInput: nodeLogs.reduce((sum, item) => sum + item.input_count, 0),
        totalOutput: nodeLogs.reduce((sum, item) => sum + item.output_count, 0),
        errorCount: nodeLogs.filter((item) => item.status === "error").length,
      };
      return acc;
    }, {});
  }, [logs, nodes]);
  const flowOverview = useMemo(() => {
    const insights = Object.values(nodeInsights);
    const sourceNodes = nodes.filter((node) => isSourceNode(node.type));
    const healthySources = sourceNodes.filter((node) => nodeInsights[node.id]?.state === "healthy").length;
    const errorNodes = insights.filter((item) => item.state === "error").length;
    const activeNodes = insights.filter((item) => item.state === "healthy").length;
    const lastActivity = logs[0]?.timestamp ?? null;
    return {
      sourceCount: sourceNodes.length,
      healthySources,
      errorNodes,
      activeNodes,
      lastActivity,
      connected:
        sourceNodes.length > 0
          ? healthySources > 0
            ? "已接入数据"
            : insights.some((item) => item.state === "error")
              ? "接入异常"
              : "暂未取到数据"
          : "待配置数据源",
    };
  }, [logs, nodeInsights, nodes]);
  const groupedTemplates = useMemo(
    () =>
      NODE_TEMPLATES.reduce<Record<NodeTemplate["group"], NodeTemplate[]>>(
        (acc, item) => {
          acc[item.group].push(item);
          return acc;
        },
        { source: [], process: [], store: [] },
      ),
    [],
  );

  const loadLogs = async () => {
    setLogsLoading(true);
    try {
      const query = new URLSearchParams();
      query.set("limit", "120");
      const response = await fetch(`${apiBaseUrl}/digital-twin/assets/${assetId}/alarm-flow/logs?${query.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        throw new Error("数据流转状态加载失败");
      }
      const data = (await response.json()) as FlowLogListResponse;
      setLogs(data.logs);
    } catch (err) {
      setLogs([]);
      setError(err instanceof Error ? err.message : "数据流转状态加载失败");
    } finally {
      setLogsLoading(false);
    }
  };

  const loadFlow = async () => {
    setLoading(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`${apiBaseUrl}/digital-twin/assets/${assetId}/alarm-flow`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.status === 404) {
        setNodes([]);
        setEdges([]);
        setStatus("stopped");
        setFlowId("");
        setSelectedNodeId(null);
        setSelectedEdgeKey(null);
        setLogs([]);
        return;
      }
      if (!response.ok) {
        throw new Error("流程配置加载失败");
      }
      const data = (await response.json()) as FlowResponse;
      setFlowId(data.id);
      setFlowName(data.name);
      setSchedule(data.schedule);
      setEnabled(data.enabled);
      setStatus(data.status);
      setNodes((data.nodes ?? []).map(normalizeNodeConfig));
      setEdges(data.edges ?? []);
      const nextSelectedNodeId = data.nodes?.[0]?.id ?? null;
      setSelectedNodeId(nextSelectedNodeId);
      await loadLogs();
    } catch (err) {
      setError(err instanceof Error ? err.message : "流程配置加载失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadFlow();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assetId]);

  useEffect(() => {
    if (!flowId || status !== "running") return;
    const timer = window.setInterval(() => {
      void loadLogs();
    }, 10000);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flowId, status, assetId]);

  const addNode = (template: NodeTemplate) => {
    const id = `node-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const nextNode = normalizeNodeConfig({
      id,
      type: template.type,
      position: { x: 220 + nodes.length * 42, y: 160 + nodes.length * 24 },
      config: createDefaultConfig(template.type),
    });
    setNodes((prev) => [...prev, nextNode]);
    setSelectedNodeId(id);
    setSelectedEdgeKey(null);
    setLinkingNodeId(null);
  };

  const updateSelectedNodeConfig = (key: string, value: unknown) => {
    if (!selectedNodeId) return;
    setNodes((prev) =>
      prev.map((node) => (node.id === selectedNodeId ? { ...node, config: { ...node.config, [key]: value } } : node)),
    );
  };

  const updateSelectedNodePosition = (nodeId: string, x: number, y: number) => {
    setNodes((prev) =>
      prev.map((node) =>
        node.id === nodeId
          ? {
              ...node,
              position: {
                x: Math.max(20, Math.min(WORKSPACE_WIDTH - NODE_WIDTH - 20, x)),
                y: Math.max(20, Math.min(WORKSPACE_HEIGHT - NODE_HEIGHT - 20, y)),
              },
            }
          : node,
      ),
    );
  };

  const persistFlow = async (): Promise<FlowResponse | null> => {
    const payloadNodes = nodes.map(buildPayloadNode);
    const response = await fetch(`${apiBaseUrl}/digital-twin/assets/${assetId}/alarm-flow`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        name: flowName.trim(),
        enabled,
        schedule: schedule.trim(),
        nodes: payloadNodes,
        edges,
      }),
    });
    if (!response.ok) {
      throw new Error(await readErrorMessage(response, "流程保存失败，请检查节点配置格式"));
    }
    const data = (await response.json()) as FlowResponse;
    setFlowId(data.id);
    setStatus(data.status);
    setNodes((data.nodes ?? []).map(normalizeNodeConfig));
    setEdges(data.edges ?? []);
    return data;
  };

  const saveFlow = async () => {
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const data = await persistFlow();
      setNotice("流程配置已保存");
      return data;
    } catch (err) {
      setError(err instanceof Error ? err.message : "流程保存失败");
      return null;
    } finally {
      setSaving(false);
    }
  };

  const deployFlow = async () => {
    setDeploying(true);
    setError("");
    setNotice("");
    try {
      const savedFlow = await persistFlow();
      if (!savedFlow) {
        throw new Error("流程保存失败");
      }
      const response = await fetch(`${apiBaseUrl}/digital-twin/assets/${assetId}/alarm-flow/deploy`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        throw new Error(await readErrorMessage(response, "流程部署失败"));
      }
      setStatus("running");
      setEnabled(true);
      setNotice("流程已部署，定时任务已启动");
      await loadLogs();
    } catch (err) {
      setError(err instanceof Error ? err.message : "流程部署失败");
    } finally {
      setDeploying(false);
    }
  };

  const stopFlow = async () => {
    setStopping(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`${apiBaseUrl}/digital-twin/assets/${assetId}/alarm-flow/stop`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        throw new Error("流程停用失败");
      }
      setStatus("stopped");
      setEnabled(false);
      setNotice("流程已停用");
    } catch (err) {
      setError(err instanceof Error ? err.message : "流程停用失败");
    } finally {
      setStopping(false);
    }
  };

  const deleteFlow = async () => {
    if (!window.confirm("确认删除当前资产的告警流程配置吗？")) return;
    setError("");
    setNotice("");
    try {
      const response = await fetch(`${apiBaseUrl}/digital-twin/assets/${assetId}/alarm-flow`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        throw new Error("流程删除失败");
      }
      setFlowId("");
      setFlowName(`${assetName} 告警接入流程`);
      setSchedule("0 */5 * * * *");
      setEnabled(true);
      setStatus("stopped");
      setNodes([]);
      setEdges([]);
      setSelectedNodeId(null);
      setSelectedEdgeKey(null);
      setLogs([]);
      setNotice("流程配置已删除");
    } catch (err) {
      setError(err instanceof Error ? err.message : "流程删除失败");
    }
  };

  const removeSelectedNode = () => {
    if (!selectedNodeId) return;
    setNodes((prev) => prev.filter((node) => node.id !== selectedNodeId));
    setEdges((prev) => prev.filter((edge) => edge.source !== selectedNodeId && edge.target !== selectedNodeId));
    setSelectedNodeId(null);
    setSelectedEdgeKey(null);
    setLinkingNodeId(null);
    setLinkPreview(null);
  };

  const removeSelectedEdge = () => {
    if (!selectedEdgeKey) return;
    setEdges((prev) => prev.filter((edge) => `${edge.source}-${edge.target}` !== selectedEdgeKey));
    setSelectedEdgeKey(null);
  };

  const createEdge = (sourceId: string, targetId: string) => {
    if (sourceId === targetId) return;
    const exists = edges.some((edge) => edge.source === sourceId && edge.target === targetId);
    if (!exists) {
      setEdges((prev) => [...prev, { source: sourceId, target: targetId }]);
    }
    setLinkingNodeId(null);
    setLinkPreview(null);
    setSelectedNodeId(targetId);
    setSelectedEdgeKey(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex bg-slate-950/45 backdrop-blur-sm">
      <div className="flex h-full w-full flex-col bg-[var(--color-surface-raised)]">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--color-border)] bg-[var(--color-surface)] px-6 py-4 shadow-sm">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[var(--color-text)]">
              <Workflow size={18} className="text-blue-600" />
              <h2 className="truncate text-lg font-bold">告警数据接入配置</h2>
              {flowId ? <span className="rounded-full bg-[var(--color-surface-raised)] px-2 py-1 text-[10px] font-mono text-[var(--color-text-weak)]">{flowId.slice(0, 12)}</span> : null}
            </div>
            <p className="mt-1 text-sm text-[var(--color-text-weak)]">资产 `{assetId}` / {assetName}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => void loadFlow()} className="btn-secondary">
              <RefreshCw size={14} /> 刷新
            </button>
            <button type="button" onClick={() => void saveFlow()} disabled={saving} className="btn-primary">
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} 保存
            </button>
            <button type="button" onClick={onClose} className="btn-secondary">
              <X size={14} /> 关闭
            </button>
          </div>
        </header>

        {error ? <div className="border-b border-red-100 bg-red-50 px-6 py-2 text-sm text-red-600">{error}</div> : null}
        {notice ? <div className="border-b border-emerald-100 bg-emerald-50 px-6 py-2 text-sm text-emerald-700">{notice}</div> : null}

        {loading ? (
          <div className="flex flex-1 items-center justify-center text-sm text-[var(--color-text-weak)]">
            <span className="inline-flex items-center gap-2">
              <Loader2 size={14} className="animate-spin text-blue-600" /> 正在加载告警流程配置...
            </span>
          </div>
        ) : (
          <div className="grid min-h-0 flex-1 grid-cols-12">
            <aside className="col-span-2 flex min-h-0 flex-col border-r border-[var(--color-border)] bg-[var(--color-surface)]">
              <div className="border-b border-[var(--color-border)] px-4 py-4">
                <label className="block space-y-1">
                  <span className="text-xs font-medium uppercase tracking-wide text-[var(--color-text-weak)]">流程名称</span>
                  <input
                    value={flowName}
                    onChange={(event) => setFlowName(event.target.value)}
                    className="h-10 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-sm outline-none focus:border-blue-300"
                  />
                </label>
                <label className="mt-3 block space-y-1">
                  <span className="text-xs font-medium uppercase tracking-wide text-[var(--color-text-weak)]">Cron 调度</span>
                  <input
                    value={schedule}
                    onChange={(event) => setSchedule(event.target.value)}
                    className="h-10 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-sm font-mono outline-none focus:border-blue-300"
                    placeholder="0 */5 * * * *"
                  />
                </label>
                <label className="mt-3 flex items-center gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-raised)] px-3 py-2 text-sm text-[var(--color-text)]">
                  <input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} />
                  保存时同步更新启用状态
                </label>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
                {(["source", "process", "store"] as const).map((group) => (
                  <div key={group} className="mb-5">
                    <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-text-weak)]">{GROUP_LABELS[group]}</h3>
                    <div className="space-y-2">
                      {groupedTemplates[group].map((template) => (
                        <button
                          key={template.type}
                          type="button"
                          onClick={() => addNode(template)}
                          className={`w-full rounded-2xl border px-3 py-3 text-left transition hover:shadow-sm ${template.color}`}
                        >
                          <div className="text-sm font-semibold">{template.label}</div>
                          <div className="mt-1 text-xs opacity-80">{template.description}</div>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </aside>

            <section className="col-span-7 flex min-h-0 flex-col border-r border-[var(--color-border)] bg-[var(--color-surface-raised)]/80">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3">
                <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--color-text-weak)]">
                  <span className="rounded-full bg-[var(--color-surface-raised)] px-3 py-1">拖拽节点移动</span>
                  <span className="rounded-full bg-[var(--color-surface-raised)] px-3 py-1">拖动画布平移</span>
                  <span className="rounded-full bg-[var(--color-surface-raised)] px-3 py-1">滚轮缩放</span>
                  {linkingNodeId ? <span className="rounded-full bg-blue-50 px-3 py-1 text-blue-700">连线模式中：点击目标节点左侧圆点完成连线</span> : null}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${
                      status === "running"
                        ? "bg-emerald-50 text-emerald-700"
                        : status === "error"
                          ? "bg-red-50 text-red-700"
                          : "bg-[var(--color-surface-raised)] text-[var(--color-text)]"
                    }`}
                  >
                    状态：{status === "running" ? "运行中" : status === "error" ? "异常" : "已停止"}
                  </span>
                  <button type="button" onClick={() => void deployFlow()} disabled={deploying || nodes.length === 0} className="btn-primary">
                    {deploying ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />} 部署
                  </button>
                  <button type="button" onClick={() => void stopFlow()} disabled={stopping || !flowId} className="btn-secondary">
                    {stopping ? <Loader2 size={14} className="animate-spin" /> : <Square size={14} />} 停用
                  </button>
                  <button type="button" onClick={deleteFlow} disabled={!flowId} className="btn-danger">
                    <Trash2 size={14} /> 删除
                  </button>
                </div>
              </div>

              <div
                ref={viewportRef}
                className={`relative min-h-0 flex-1 overflow-hidden ${isPanning ? "cursor-grabbing" : "cursor-grab"}`}
                onMouseDown={(event) => {
                  if (event.target !== event.currentTarget) return;
                  panStateRef.current = { x: event.clientX, y: event.clientY, originX: canvasTransform.x, originY: canvasTransform.y };
                  setIsPanning(true);
                }}
                onMouseMove={(event) => {
                  const rect = viewportRef.current?.getBoundingClientRect();
                  if (rect && linkingNodeId) {
                    setLinkPreview({
                      x: (event.clientX - rect.left - canvasTransform.x) / canvasTransform.scale,
                      y: (event.clientY - rect.top - canvasTransform.y) / canvasTransform.scale,
                    });
                  }
                  if (dragStateRef.current) {
                    if (!rect) return;
                    const nextX = (event.clientX - rect.left - canvasTransform.x) / canvasTransform.scale - dragStateRef.current.pointerOffsetX;
                    const nextY = (event.clientY - rect.top - canvasTransform.y) / canvasTransform.scale - dragStateRef.current.pointerOffsetY;
                    updateSelectedNodePosition(dragStateRef.current.nodeId, nextX, nextY);
                    return;
                  }
                  if (!panStateRef.current) return;
                  setCanvasTransform((prev) => ({
                    ...prev,
                    x: panStateRef.current!.originX + event.clientX - panStateRef.current!.x,
                    y: panStateRef.current!.originY + event.clientY - panStateRef.current!.y,
                  }));
                }}
                onMouseUp={() => {
                  panStateRef.current = null;
                  dragStateRef.current = null;
                  setIsPanning(false);
                }}
                onMouseLeave={() => {
                  panStateRef.current = null;
                  dragStateRef.current = null;
                  setIsPanning(false);
                }}
                onWheel={(event) => {
                  event.preventDefault();
                  setCanvasTransform((prev) => ({
                    ...prev,
                    scale: Math.min(1.8, Math.max(0.55, prev.scale + (event.deltaY < 0 ? 0.1 : -0.1))),
                  }));
                }}
              >
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_1px_1px,rgba(148,163,184,0.22)_1px,transparent_0)]" style={{ backgroundSize: `${24 * canvasTransform.scale}px ${24 * canvasTransform.scale}px` }} />
                <div
                  className="absolute left-0 top-0 origin-top-left"
                  style={{
                    width: WORKSPACE_WIDTH,
                    height: WORKSPACE_HEIGHT,
                    transform: `translate(${canvasTransform.x}px, ${canvasTransform.y}px) scale(${canvasTransform.scale})`,
                  }}
                >
                  <svg className="absolute inset-0 h-full w-full overflow-visible">
                    {edges.map((edge) => {
                      const sourceNode = nodes.find((node) => node.id === edge.source);
                      const targetNode = nodes.find((node) => node.id === edge.target);
                      if (!sourceNode || !targetNode) return null;
                      const key = `${edge.source}-${edge.target}`;
                      const active = selectedEdgeKey === key;
                      const sourceState = nodeInsights[edge.source]?.state ?? "pending";
                      const startX = sourceNode.position.x + NODE_WIDTH;
                      const startY = sourceNode.position.y + NODE_HEIGHT / 2;
                      const endX = targetNode.position.x;
                      const endY = targetNode.position.y + NODE_HEIGHT / 2;
                      const curveX = Math.max(60, Math.abs(endX - startX) / 2);
                      return (
                        <g key={key} className="cursor-pointer" onClick={() => { setSelectedEdgeKey(key); setSelectedNodeId(null); }}>
                          <path
                            d={`M ${startX} ${startY} C ${startX + curveX} ${startY}, ${endX - curveX} ${endY}, ${endX} ${endY}`}
                            fill="none"
                            stroke={active ? "#2563EB" : sourceState === "error" ? "#DC2626" : sourceState === "healthy" ? "#0F766E" : "#94A3B8"}
                            strokeWidth={active ? 3 : 2}
                          />
                        </g>
                      );
                    })}
                    {linkingNode && linkPreview ? (
                      <path
                        d={`M ${linkingNode.position.x + NODE_WIDTH} ${linkingNode.position.y + NODE_HEIGHT / 2} C ${linkingNode.position.x + NODE_WIDTH + 80} ${linkingNode.position.y + NODE_HEIGHT / 2}, ${linkPreview.x - 80} ${linkPreview.y}, ${linkPreview.x} ${linkPreview.y}`}
                        fill="none"
                        stroke="#2563EB"
                        strokeWidth={2}
                        strokeDasharray="8 6"
                      />
                    ) : null}
                  </svg>

                  {nodes.map((node) => {
                    const template = getNodeTemplate(node.type);
                    const active = selectedNodeId === node.id;
                    const linking = linkingNodeId === node.id;
                    const insight = nodeInsights[node.id];
                    return (
                      <div
                        key={node.id}
                        className={`absolute rounded-2xl border p-3 shadow-sm transition ${active ? "border-blue-400 shadow-md" : "border-[var(--color-border)]"} ${linking ? "ring-2 ring-blue-300" : ""}`}
                        style={{ left: node.position.x, top: node.position.y, width: NODE_WIDTH, height: NODE_HEIGHT }}
                        onMouseDown={(event) => {
                          event.stopPropagation();
                          const rect = event.currentTarget.getBoundingClientRect();
                          dragStateRef.current = {
                            nodeId: node.id,
                            pointerOffsetX: (event.clientX - rect.left) / canvasTransform.scale,
                            pointerOffsetY: (event.clientY - rect.top) / canvasTransform.scale,
                          };
                          setSelectedNodeId(node.id);
                          setSelectedEdgeKey(null);
                        }}
                        onClick={(event) => {
                          event.stopPropagation();
                          if (linkingNodeId && linkingNodeId !== node.id) {
                            const exists = edges.some((edge) => edge.source === linkingNodeId && edge.target === node.id);
                            if (!exists) {
                              setEdges((prev) => [...prev, { source: linkingNodeId, target: node.id }]);
                            }
                            setLinkingNodeId(null);
                            setSelectedNodeId(node.id);
                            setSelectedEdgeKey(null);
                            return;
                          }
                          setSelectedNodeId(node.id);
                          setSelectedEdgeKey(null);
                        }}
                      >
                        <button
                          type="button"
                          title="作为输入端"
                          className={`absolute -left-3 top-1/2 h-6 w-6 -translate-y-1/2 rounded-full border-2 bg-[var(--color-surface)] transition ${
                            linkingNodeId && linkingNodeId !== node.id ? "border-blue-400 shadow-sm" : "border-slate-300"
                          }`}
                          onMouseDown={(event) => event.stopPropagation()}
                          onClick={(event) => {
                            event.stopPropagation();
                            if (linkingNodeId && linkingNodeId !== node.id) {
                              createEdge(linkingNodeId, node.id);
                            }
                          }}
                        >
                          <span className={`block h-2.5 w-2.5 rounded-full ${linkingNodeId && linkingNodeId !== node.id ? "bg-blue-500" : "bg-slate-400"}`} />
                        </button>
                        <div
                          className="absolute inset-0 rounded-2xl"
                          style={{
                            background:
                              template.type === "http_request"
                                ? "linear-gradient(135deg, #dbeafe 0%, #eff6ff 100%)"
                                : template.type === "mqtt_subscribe"
                                  ? "linear-gradient(135deg, #cffafe 0%, #ecfeff 100%)"
                                  : template.type === "database_query"
                                    ? "linear-gradient(135deg, #e0e7ff 0%, #eef2ff 100%)"
                                    : template.type === "transform"
                                      ? "linear-gradient(135deg, #fef3c7 0%, #fffbeb 100%)"
                                      : template.type === "filter"
                                        ? "linear-gradient(135deg, #fed7aa 0%, #fff7ed 100%)"
                                        : template.type === "expression_transform"
                                          ? "linear-gradient(135deg, #ffe4e6 0%, #fff1f2 100%)"
                                          : template.type === "neo4j_store"
                                            ? "linear-gradient(135deg, #d1fae5 0%, #ecfdf5 100%)"
                                            : "linear-gradient(135deg, #ede9fe 0%, #f5f3ff 100%)",
                          }}
                        />
                        <div className="relative flex items-start justify-between gap-2">
                          <div>
                            <div className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold ${template.color}`}>{template.label}</div>
                            <div className="mt-2 text-sm font-semibold text-[var(--color-text)]">{template.label}</div>
                          </div>
                          <div className="flex items-center gap-1">
                            <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${getNodeStateClass(insight?.state ?? "pending")}`}>
                              {getNodeStateLabel(insight?.state ?? "pending")}
                            </span>
                            <button
                              type="button"
                              title="删除节点"
                              className="inline-flex h-6 w-6 items-center justify-center rounded-md text-[var(--color-text-weak)] transition hover:bg-[var(--color-surface)]/70 hover:text-red-500"
                              onMouseDown={(event) => event.stopPropagation()}
                              onClick={(event) => {
                                event.stopPropagation();
                                setNodes((prev) => prev.filter((item) => item.id !== node.id));
                                setEdges((prev) => prev.filter((edge) => edge.source !== node.id && edge.target !== node.id));
                                if (selectedNodeId === node.id) {
                                  setSelectedNodeId(null);
                                }
                                setSelectedEdgeKey(null);
                                if (linkingNodeId === node.id) {
                                  setLinkingNodeId(null);
                                  setLinkPreview(null);
                                }
                              }}
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </div>
                        <div className="relative mt-2 line-clamp-2 text-xs text-[var(--color-text)]">{template.description}</div>
                        <div className="relative mt-3 flex items-center justify-between rounded-xl bg-white/70 px-2.5 py-2 text-[11px] text-slate-600">
                          <span>入 {insight?.lastLog?.input_count ?? 0}</span>
                          <span>出 {insight?.lastLog?.output_count ?? 0}</span>
                          <span>{insight?.lastLog ? `${insight.lastLog.duration_ms}ms` : "--"}</span>
                        </div>
                        <button
                          type="button"
                          title="从这里发起连线"
                          className={`absolute -right-3 top-1/2 h-6 w-6 -translate-y-1/2 rounded-full border-2 bg-[var(--color-surface)] transition ${
                            linking ? "border-blue-500 shadow-sm" : "border-slate-300"
                          }`}
                          onMouseDown={(event) => event.stopPropagation()}
                          onClick={(event) => {
                            event.stopPropagation();
                            setLinkingNodeId((prev) => (prev === node.id ? null : node.id));
                            setLinkPreview(null);
                            setSelectedNodeId(node.id);
                            setSelectedEdgeKey(null);
                          }}
                        >
                          <span className={`block h-2.5 w-2.5 rounded-full ${linking ? "bg-blue-600" : "bg-slate-400"}`} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            </section>

            <aside className="col-span-3 flex min-h-0 flex-col bg-[var(--color-surface)]">
              <div className="border-b border-[var(--color-border)] px-4 py-4">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-bold text-[var(--color-text)]">节点配置面板</h3>
                    <p className="mt-1 text-xs text-[var(--color-text-weak)]">点击节点后在这里编辑参数，点击连线可删除关系。</p>
                  </div>
                  {selectedNode ? (
                    <div className="flex items-center gap-2">
                      <button type="button" onClick={() => setLinkingNodeId((prev) => (prev === selectedNode.id ? null : selectedNode.id))} className="btn-secondary h-8 px-2">
                        <Link2 size={14} />
                      </button>
                      <button type="button" onClick={removeSelectedNode} className="btn-danger h-8 px-2">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ) : selectedEdge ? (
                    <button type="button" onClick={removeSelectedEdge} className="btn-danger h-8 px-2">
                      <Unlink2 size={14} />
                    </button>
                  ) : null}
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
                <div className="card mb-5 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-raised)] p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h4 className="text-sm font-semibold text-[var(--color-text)]">数据流转概览</h4>
                      <p className="mt-1 text-xs text-[var(--color-text-weak)]">展示各节点最近一次执行结果，帮助判断数据源是否真正接入。</p>
                    </div>
                    {logsLoading ? <Loader2 size={14} className="animate-spin text-blue-600" /> : null}
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-3">
                    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
                      <div className="text-xs text-[var(--color-text-weak)]">接入状态</div>
                      <div className="mt-1 text-sm font-semibold text-[var(--color-text)]">{flowOverview.connected}</div>
                    </div>
                    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
                      <div className="text-xs text-[var(--color-text-weak)]">最近流转</div>
                      <div className="mt-1 text-sm font-semibold text-[var(--color-text)]">{flowOverview.lastActivity ? formatTime(flowOverview.lastActivity) : "暂无"}</div>
                    </div>
                    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
                      <div className="text-xs text-[var(--color-text-weak)]">正常节点</div>
                      <div className="mt-1 text-sm font-semibold text-[var(--color-text)]">
                        {flowOverview.activeNodes} / {nodes.length}
                      </div>
                    </div>
                    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
                      <div className="text-xs text-[var(--color-text-weak)]">异常节点</div>
                      <div className="mt-1 text-sm font-semibold text-[var(--color-text)]">{flowOverview.errorNodes}</div>
                    </div>
                  </div>
                </div>

                {selectedNode && selectedNodeTemplate ? (
                  <div className="space-y-4">
                    <div className={`card rounded-2xl border px-3 py-3 ${selectedNodeTemplate.color}`}>
                      <div className="text-sm font-semibold">{selectedNodeTemplate.label}</div>
                      <div className="mt-1 text-xs opacity-80">{selectedNode.id}</div>
                    </div>

                    <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-raised)] p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-sm font-semibold text-[var(--color-text)]">当前节点流转状态</div>
                        <span className={`rounded-full border px-2 py-1 text-[10px] font-semibold ${getNodeStateClass(nodeInsights[selectedNode.id]?.state ?? "pending")}`}>
                          {getNodeStateLabel(nodeInsights[selectedNode.id]?.state ?? "pending")}
                        </span>
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                        <div className="rounded-xl bg-[var(--color-surface)] p-3">
                          <div className="text-xs text-[var(--color-text-weak)]">最近输入 / 输出</div>
                          <div className="mt-1 font-semibold text-[var(--color-text)]">
                            {nodeInsights[selectedNode.id]?.lastLog?.input_count ?? 0} / {nodeInsights[selectedNode.id]?.lastLog?.output_count ?? 0}
                          </div>
                        </div>
                        <div className="rounded-xl bg-[var(--color-surface)] p-3">
                          <div className="text-xs text-[var(--color-text-weak)]">累计执行 / 异常</div>
                          <div className="mt-1 font-semibold text-[var(--color-text)]">
                            {nodeInsights[selectedNode.id]?.runs ?? 0} / {nodeInsights[selectedNode.id]?.errorCount ?? 0}
                          </div>
                        </div>
                        <div className="rounded-xl bg-[var(--color-surface)] p-3">
                          <div className="text-xs text-[var(--color-text-weak)]">最近耗时</div>
                          <div className="mt-1 font-semibold text-[var(--color-text)]">{nodeInsights[selectedNode.id]?.lastLog ? `${nodeInsights[selectedNode.id].lastLog!.duration_ms}ms` : "--"}</div>
                        </div>
                        <div className="rounded-xl bg-[var(--color-surface)] p-3">
                          <div className="text-xs text-[var(--color-text-weak)]">最近流转时间</div>
                          <div className="mt-1 font-semibold text-[var(--color-text)]">{nodeInsights[selectedNode.id]?.lastSeen ? formatTime(nodeInsights[selectedNode.id].lastSeen!) : "暂无"}</div>
                        </div>
                      </div>
                      {nodeInsights[selectedNode.id]?.lastLog?.error ? (
                        <div className="mt-3 rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-xs text-red-600">
                          {nodeInsights[selectedNode.id].lastLog!.error}
                        </div>
                      ) : null}
                    </div>

                    {selectedNode.type === "http_request" ? (
                      <>
                        <label className="block space-y-1">
                          <span className="text-sm text-[var(--color-text-weak)]">URL</span>
                          <input value={String(selectedNode.config.url ?? "")} onChange={(event) => updateSelectedNodeConfig("url", event.target.value)} className="h-10 w-full rounded-xl border border-[var(--color-border)] px-3 text-sm outline-none focus:border-blue-300" />
                        </label>
                        <label className="block space-y-1">
                          <span className="text-sm text-[var(--color-text-weak)]">Method</span>
                          <select value={String(selectedNode.config.method ?? "GET")} onChange={(event) => updateSelectedNodeConfig("method", event.target.value)} className="h-10 w-full rounded-xl border border-[var(--color-border)] px-3 text-sm outline-none focus:border-blue-300">
                            <option value="GET">GET</option>
                            <option value="POST">POST</option>
                          </select>
                        </label>
                        <label className="block space-y-1">
                          <span className="text-sm text-[var(--color-text-weak)]">Headers JSON</span>
                          <textarea rows={4} value={String(selectedNode.config.headersText ?? "")} onChange={(event) => updateSelectedNodeConfig("headersText", event.target.value)} className="w-full rounded-xl border border-[var(--color-border)] px-3 py-2 text-sm font-mono outline-none focus:border-blue-300" />
                        </label>
                        <label className="block space-y-1">
                          <span className="text-sm text-[var(--color-text-weak)]">Body JSON</span>
                          <textarea rows={4} value={String(selectedNode.config.bodyText ?? "")} onChange={(event) => updateSelectedNodeConfig("bodyText", event.target.value)} className="w-full rounded-xl border border-[var(--color-border)] px-3 py-2 text-sm font-mono outline-none focus:border-blue-300" />
                        </label>
                        <label className="block space-y-1">
                          <span className="text-sm text-[var(--color-text-weak)]">响应提取路径</span>
                          <input value={String(selectedNode.config.response_path ?? "$")} onChange={(event) => updateSelectedNodeConfig("response_path", event.target.value)} className="h-10 w-full rounded-xl border border-[var(--color-border)] px-3 text-sm font-mono outline-none focus:border-blue-300" />
                        </label>
                      </>
                    ) : null}

                    {selectedNode.type === "mqtt_subscribe" ? (
                      <>
                        <label className="block space-y-1">
                          <span className="text-sm text-[var(--color-text-weak)]">Broker 地址</span>
                          <input value={String(selectedNode.config.broker_url ?? "")} onChange={(event) => updateSelectedNodeConfig("broker_url", event.target.value)} className="h-10 w-full rounded-xl border border-[var(--color-border)] px-3 text-sm outline-none focus:border-blue-300" />
                        </label>
                        <label className="block space-y-1">
                          <span className="text-sm text-[var(--color-text-weak)]">Topic</span>
                          <input value={String(selectedNode.config.topic ?? "")} onChange={(event) => updateSelectedNodeConfig("topic", event.target.value)} className="h-10 w-full rounded-xl border border-[var(--color-border)] px-3 text-sm outline-none focus:border-blue-300" />
                        </label>
                        <label className="block space-y-1">
                          <span className="text-sm text-[var(--color-text-weak)]">QoS</span>
                          <input type="number" min={0} max={2} value={Number(selectedNode.config.qos ?? 0)} onChange={(event) => updateSelectedNodeConfig("qos", Number(event.target.value))} className="h-10 w-full rounded-xl border border-[var(--color-border)] px-3 text-sm outline-none focus:border-blue-300" />
                        </label>
                      </>
                    ) : null}

                    {selectedNode.type === "database_query" ? (
                      <>
                        <label className="block space-y-1">
                          <span className="text-sm text-[var(--color-text-weak)]">连接串</span>
                          <input value={String(selectedNode.config.connection_string ?? "")} onChange={(event) => updateSelectedNodeConfig("connection_string", event.target.value)} className="h-10 w-full rounded-xl border border-[var(--color-border)] px-3 text-sm outline-none focus:border-blue-300" />
                        </label>
                        <label className="block space-y-1">
                          <span className="text-sm text-[var(--color-text-weak)]">SQL</span>
                          <textarea rows={6} value={String(selectedNode.config.sql ?? "")} onChange={(event) => updateSelectedNodeConfig("sql", event.target.value)} className="w-full rounded-xl border border-[var(--color-border)] px-3 py-2 text-sm font-mono outline-none focus:border-blue-300" />
                        </label>
                      </>
                    ) : null}

                    {selectedNode.type === "transform" ? (
                      <label className="block space-y-1">
                        <span className="text-sm text-[var(--color-text-weak)]">字段映射规则 JSON</span>
                        <textarea rows={9} value={String(selectedNode.config.mappingsText ?? "[]")} onChange={(event) => updateSelectedNodeConfig("mappingsText", event.target.value)} className="w-full rounded-xl border border-[var(--color-border)] px-3 py-2 text-sm font-mono outline-none focus:border-blue-300" />
                      </label>
                    ) : null}

                    {selectedNode.type === "filter" ? (
                      <label className="block space-y-1">
                        <span className="text-sm text-[var(--color-text-weak)]">条件表达式</span>
                        <textarea rows={4} value={String(selectedNode.config.condition ?? "")} onChange={(event) => updateSelectedNodeConfig("condition", event.target.value)} className="w-full rounded-xl border border-[var(--color-border)] px-3 py-2 text-sm font-mono outline-none focus:border-blue-300" />
                      </label>
                    ) : null}

                    {selectedNode.type === "expression_transform" ? (
                      <>
                        <label className="block space-y-1">
                          <span className="text-sm text-[var(--color-text-weak)]">目标字段</span>
                          <input value={String(selectedNode.config.target_field ?? "")} onChange={(event) => updateSelectedNodeConfig("target_field", event.target.value)} className="h-10 w-full rounded-xl border border-[var(--color-border)] px-3 text-sm outline-none focus:border-blue-300" />
                        </label>
                        <label className="block space-y-1">
                          <span className="text-sm text-[var(--color-text-weak)]">表达式</span>
                          <textarea rows={4} value={String(selectedNode.config.expression ?? "")} onChange={(event) => updateSelectedNodeConfig("expression", event.target.value)} className="w-full rounded-xl border border-[var(--color-border)] px-3 py-2 text-sm font-mono outline-none focus:border-blue-300" />
                        </label>
                      </>
                    ) : null}

                    {selectedNode.type === "neo4j_store" ? (
                      <>
                        <label className="block space-y-1">
                          <span className="text-sm text-[var(--color-text-weak)]">节点类型</span>
                          <input value={String(selectedNode.config.node_type ?? "Alarm")} onChange={(event) => updateSelectedNodeConfig("node_type", event.target.value)} className="h-10 w-full rounded-xl border border-[var(--color-border)] px-3 text-sm outline-none focus:border-blue-300" />
                        </label>
                        <label className="block space-y-1">
                          <span className="text-sm text-[var(--color-text-weak)]">资产字段名</span>
                          <input value={String(selectedNode.config.asset_id_field ?? "asset_id")} onChange={(event) => updateSelectedNodeConfig("asset_id_field", event.target.value)} className="h-10 w-full rounded-xl border border-[var(--color-border)] px-3 text-sm outline-none focus:border-blue-300" />
                        </label>
                        <label className="block space-y-1">
                          <span className="text-sm text-[var(--color-text-weak)]">属性列表 JSON</span>
                          <textarea rows={5} value={String(selectedNode.config.propertiesText ?? "[]")} onChange={(event) => updateSelectedNodeConfig("propertiesText", event.target.value)} className="w-full rounded-xl border border-[var(--color-border)] px-3 py-2 text-sm font-mono outline-none focus:border-blue-300" />
                        </label>
                      </>
                    ) : null}

                    {selectedNode.type === "postgres_store" ? (
                      <>
                        <label className="block space-y-1">
                          <span className="text-sm text-[var(--color-text-weak)]">表名</span>
                          <input value={String(selectedNode.config.table_name ?? "alarm_records")} onChange={(event) => updateSelectedNodeConfig("table_name", event.target.value)} className="h-10 w-full rounded-xl border border-[var(--color-border)] px-3 text-sm outline-none focus:border-blue-300" />
                        </label>
                        <label className="block space-y-1">
                          <span className="text-sm text-[var(--color-text-weak)]">资产字段名</span>
                          <input value={String(selectedNode.config.asset_id_field ?? "asset_id")} onChange={(event) => updateSelectedNodeConfig("asset_id_field", event.target.value)} className="h-10 w-full rounded-xl border border-[var(--color-border)] px-3 text-sm outline-none focus:border-blue-300" />
                        </label>
                      </>
                    ) : null}
                  </div>
                ) : selectedEdge ? (
                  <div className="card rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-raised)] p-4 text-sm text-[var(--color-text)]">
                    <div className="font-semibold text-[var(--color-text)]">当前选中连线</div>
                    <div className="mt-2">
                      {selectedEdge.source} → {selectedEdge.target}
                    </div>
                    <button type="button" onClick={removeSelectedEdge} className="btn-danger mt-4">
                      <Unlink2 size={14} /> 删除连线
                    </button>
                  </div>
                ) : (
                  <div className="card rounded-2xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface-raised)] p-6 text-sm text-[var(--color-text-weak)]">
                    左侧添加节点后，点击节点即可在这里配置参数；如需连线，请先选中节点，再点右上角连线按钮。
                  </div>
                )}

                <div className="card mt-5 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-raised)]">
                  <div className="border-b border-[var(--color-border)] px-4 py-3">
                    <div className="text-sm font-semibold text-[var(--color-text)]">各节点数据流转情况</div>
                    <p className="mt-1 text-xs text-[var(--color-text-weak)]">重点看数据源节点是否有输出，以及下游节点是否持续收到输入。</p>
                  </div>
                  <div className="max-h-[320px] overflow-y-auto px-4 py-3">
                    {nodes.length === 0 ? (
                      <p className="text-sm text-[var(--color-text-weak)]">暂无节点，请先在左侧添加数据源和处理节点。</p>
                    ) : (
                      <div className="space-y-3">
                        {nodes.map((node) => {
                          const template = getNodeTemplate(node.type);
                          const insight = nodeInsights[node.id];
                          return (
                            <button
                              key={node.id}
                              type="button"
                              onClick={() => {
                                setSelectedNodeId(node.id);
                                setSelectedEdgeKey(null);
                              }}
                              className={`w-full rounded-xl border px-3 py-3 text-left transition ${
                                selectedNodeId === node.id
                                  ? "border-blue-300 bg-blue-50/60"
                                  : "border-[var(--color-border)] bg-[var(--color-surface)] hover:border-blue-200"
                              }`}
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <div className="text-sm font-semibold text-[var(--color-text)]">{template.label}</div>
                                  <div className="mt-1 text-xs text-[var(--color-text-weak)]">{node.id}</div>
                                </div>
                                <span className={`rounded-full border px-2 py-1 text-[10px] font-semibold ${getNodeStateClass(insight?.state ?? "pending")}`}>
                                  {getNodeStateLabel(insight?.state ?? "pending")}
                                </span>
                              </div>
                              <div className="mt-3 grid grid-cols-3 gap-2 text-xs text-[var(--color-text-weak)]">
                                <div>最近输入 {insight?.lastLog?.input_count ?? 0}</div>
                                <div>最近输出 {insight?.lastLog?.output_count ?? 0}</div>
                                <div>累计异常 {insight?.errorCount ?? 0}</div>
                              </div>
                              <div className="mt-2 text-xs text-[var(--color-text-weak)]">
                                {insight?.lastSeen ? `最近流转：${formatTime(insight.lastSeen)}` : "尚未有运行记录"}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </aside>
          </div>
        )}
      </div>
    </div>
  );
}
