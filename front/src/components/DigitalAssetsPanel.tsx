import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Box, Cpu, Database, Loader2, Move, Pencil, Plus, Search, Siren, Trash2, ZoomIn, ZoomOut } from "lucide-react";
import AlarmFlowEditor from "./AlarmFlowEditor";
import PaginationControls from "./PaginationControls";

export type AssetStatus = "Normal" | "Warning" | "Critical";

export type DigitalAsset = {
  id: string;
  name: string;
  type: string;
  status: AssetStatus;
  location: string;
  health: number;
  modelFile: string;
  minioObjectKey?: string | null;
  metadata: Record<string, unknown>;
};

type ApiAsset = {
  id: string;
  name: string;
  type: string;
  status: AssetStatus;
  location: string;
  health: number;
  model_file: string;
  minio_object_key?: string | null;
  metadata: Record<string, unknown>;
};

type AssetListResponse = {
  items: ApiAsset[];
  page: number;
  page_size: number;
  total: number;
};

type KnowledgeGraphNode = {
  id: string;
  name: string;
  node_type: string;
  labels: string[];
  properties: Record<string, unknown>;
  is_center: boolean;
};

type KnowledgeGraphEdge = {
  source: string;
  target: string;
  relation_type: string;
  properties: Record<string, unknown>;
};

type KnowledgeGraphResponse = {
  asset_id: string;
  asset_name: string;
  summary: Record<string, number>;
  nodes: KnowledgeGraphNode[];
  edges: KnowledgeGraphEdge[];
};

type GraphRegion = {
  key: string;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

type DigitalAssetsPanelProps = {
  apiBaseUrl: string;
  token: string;
};

type AssetForm = {
  id: string;
  name: string;
  type: string;
  status: AssetStatus;
  location: string;
  health: number;
  modelFile: string;
};

const emptyForm: AssetForm = {
  id: "",
  name: "",
  type: "",
  status: "Normal",
  location: "",
  health: 100,
  modelFile: "",
};

function toUiAsset(asset: ApiAsset): DigitalAsset {
  return {
    id: asset.id,
    name: asset.name,
    type: asset.type,
    status: asset.status,
    location: asset.location,
    health: asset.health,
    modelFile: asset.model_file,
    minioObjectKey: asset.minio_object_key,
    metadata: asset.metadata ?? {},
  };
}

function statusLabel(status: AssetStatus): string {
  if (status === "Normal") return "正常";
  if (status === "Warning") return "警告";
  return "危险";
}

function relationDisplayName(relationType: string): string {
  const value = (relationType || "").toUpperCase();
  if (value === "LOCATED_AT") return "位于";
  if (value === "CONTAINS") return "包含";
  if (value === "BELONGS_TO") return "归属";
  if (value === "EXHIBITS") return "表现为";
  if (value === "AFFECTS") return "影响";
  if (value === "USES") return "使用";
  if (value === "REQUIRES") return "需要";
  if (value === "CAUSES") return "触发";
  if (value === "HAS_DOC") return "关联文档";
  if (value === "DEPENDS_ON") return "依赖";
  if (value === "UPSTREAM") return "上游";
  if (value === "DOWNSTREAM") return "下游";
  if (value === "CONTROLS") return "控制";
  if (value === "DEPENDS_ON_BY") return "被依赖";
  return relationType || "关联";
}

function normalizeNodeType(type: string): string {
  if (type === "Asset") return "Equipment";
  return type || "Entity";
}

function typeDisplayName(type: string): string {
  const normalized = normalizeNodeType(type);
  if (normalized === "Equipment") return "设备";
  if (normalized === "ProductionLine") return "产线";
  if (normalized === "Sensor") return "传感器";
  if (normalized === "FaultMode") return "故障模式";
  if (normalized === "Alarm") return "告警";
  if (normalized === "Document") return "文档";
  if (normalized === "SparePart") return "备件";
  if (normalized === "MaintenanceRecord") return "维护记录";
  return "其他实体";
}

function summaryDisplayName(key: string): string {
  const normalized = (key || "").trim();
  if (normalized === "node_count") return "节点总数";
  if (normalized === "edge_count") return "关系总数";
  if (normalized.endsWith("_count")) {
    return `${typeDisplayName(normalized.slice(0, -6))}数量`;
  }
  return typeDisplayName(normalized);
}

function typeStyle(type: string, isCenter = false) {
  const normalized = normalizeNodeType(type);
  if (isCenter || normalized === "Equipment") {
    return {
      fill: "#2563EB",
      stroke: "#93C5FD",
      badge: "bg-blue-50 text-blue-700",
      card: "border-blue-200 bg-blue-50/60",
      line: "#60A5FA",
      text: "text-blue-700",
      regionFill: "#EFF6FF",
      regionStroke: "#BFDBFE",
    };
  }
  if (normalized === "ProductionLine") {
    return {
      fill: "#8B5CF6",
      stroke: "#C4B5FD",
      badge: "bg-violet-50 text-violet-700",
      card: "border-violet-200 bg-violet-50/60",
      line: "#A78BFA",
      text: "text-violet-700",
      regionFill: "#F5F3FF",
      regionStroke: "#DDD6FE",
    };
  }
  if (normalized === "Sensor") {
    return {
      fill: "#10B981",
      stroke: "#6EE7B7",
      badge: "bg-emerald-50 text-emerald-700",
      card: "border-emerald-200 bg-emerald-50/60",
      line: "#34D399",
      text: "text-emerald-700",
      regionFill: "#ECFDF5",
      regionStroke: "#A7F3D0",
    };
  }
  if (normalized === "FaultMode") {
    return {
      fill: "#F43F5E",
      stroke: "#FDA4AF",
      badge: "bg-rose-50 text-rose-700",
      card: "border-rose-200 bg-rose-50/60",
      line: "#FB7185",
      text: "text-rose-700",
      regionFill: "#FFF1F2",
      regionStroke: "#FECDD3",
    };
  }
  if (normalized === "Alarm") {
    return {
      fill: "#F97316",
      stroke: "#FDBA74",
      badge: "bg-orange-50 text-orange-700",
      card: "border-orange-200 bg-orange-50/60",
      line: "#FB923C",
      text: "text-orange-700",
      regionFill: "#FFF7ED",
      regionStroke: "#FED7AA",
    };
  }
  if (normalized === "Document") {
    return {
      fill: "#F59E0B",
      stroke: "#FCD34D",
      badge: "bg-amber-50 text-amber-700",
      card: "border-amber-200 bg-amber-50/60",
      line: "#FBBF24",
      text: "text-amber-700",
      regionFill: "#FFFBEB",
      regionStroke: "#FDE68A",
    };
  }
  if (normalized === "SparePart") {
    return {
      fill: "#06B6D4",
      stroke: "#67E8F9",
      badge: "bg-cyan-50 text-cyan-700",
      card: "border-cyan-200 bg-cyan-50/60",
      line: "#22D3EE",
      text: "text-cyan-700",
      regionFill: "#ECFEFF",
      regionStroke: "#A5F3FC",
    };
  }
  if (normalized === "MaintenanceRecord") {
    return {
      fill: "#64748B",
      stroke: "#CBD5E1",
      badge: "bg-slate-100 text-slate-700",
      card: "border-slate-200 bg-slate-50",
      line: "#94A3B8",
      text: "text-slate-700",
      regionFill: "#F8FAFC",
      regionStroke: "#CBD5E1",
    };
  }
  return {
    fill: "#0EA5E9",
    stroke: "#BAE6FD",
    badge: "bg-sky-50 text-sky-700",
    card: "border-sky-200 bg-sky-50/60",
    line: "#38BDF8",
    text: "text-sky-700",
    regionFill: "#F0F9FF",
    regionStroke: "#BAE6FD",
  };
}

function sortGroupedEntries<T>(entries: [string, T[]][]) {
  const order = [
    "ProductionLine",
    "MaintenanceRecord",
    "SparePart",
    "Sensor",
    "FaultMode",
    "Alarm",
    "Document",
    "Equipment",
    "Entity",
  ];
  return [...entries].sort((a, b) => {
    const aIndex = order.indexOf(a[0]);
    const bIndex = order.indexOf(b[0]);
    const safeA = aIndex === -1 ? order.length : aIndex;
    const safeB = bIndex === -1 ? order.length : bIndex;
    return safeA - safeB || a[0].localeCompare(b[0], "zh-CN");
  });
}

function buildTypeGraphLayout(nodes: KnowledgeGraphNode[]) {
  const width = 1040;
  const height = 620;
  const center = nodes.find((node) => node.is_center) ?? nodes[0] ?? null;
  const related = nodes.filter((node) => !node.is_center);
  const positions: Record<string, { x: number; y: number }> = {};
  const centerX = width / 2;
  const centerY = height / 2;

  if (center) {
    positions[center.id] = { x: centerX, y: centerY };
  }

  if (related.length > 0) {
    const ringCapacities = [6, 10, 14, 18, 24];
    const ringGap = 88;
    const baseRadius = 150;
    let cursor = 0;
    let ringIndex = 0;

    while (cursor < related.length) {
      const count = ringCapacities[ringIndex] ?? Math.max(24, 24 + ringIndex * 6);
      const ringNodes = related.slice(cursor, cursor + count);
      const radius = baseRadius + ringIndex * ringGap;
      ringNodes.forEach((node, index) => {
        const angle = -Math.PI / 2 + (Math.PI * 2 * index) / ringNodes.length;
        positions[node.id] = {
          x: centerX + radius * Math.cos(angle),
          y: centerY + radius * Math.sin(angle),
        };
      });
      cursor += ringNodes.length;
      ringIndex += 1;
    }
  }

  return { width, height, positions, regions: [] };
}

function buildAllTypesGraphLayout(nodes: KnowledgeGraphNode[]) {
  const width = 1120;
  const center = nodes.find((node) => node.is_center) ?? nodes[0] ?? null;
  const related = nodes.filter((node) => !node.is_center);
  const positions: Record<string, { x: number; y: number }> = {};
  const centerX = width / 2;
  const leftX = 36;
  const rightX = width - 296;
  const regionWidth = 260;
  const regionGap = 22;
  const topStart = 36;
  const defaultRegionOrder = [
    ["ProductionLine", "产线", "left"],
    ["MaintenanceRecord", "维护记录", "left"],
    ["SparePart", "备件", "left"],
    ["Document", "文档", "left"],
    ["Sensor", "传感器", "right"],
    ["FaultMode", "故障模式", "right"],
    ["Alarm", "告警", "right"],
    ["Equipment", "关联设备", "right"],
    ["Entity", "其他实体", "bottom"],
  ] as const;
  const supportedRegionKeys = new Set<string>(defaultRegionOrder.map(([key]) => key));

  if (center) {
    positions[center.id] = { x: centerX, y: 270 };
  }

  const groups = new Map<string, KnowledgeGraphNode[]>();
  related.forEach((node) => {
    const type = normalizeNodeType(node.node_type);
    const key = supportedRegionKeys.has(type) ? type : "Entity";
    const list = groups.get(key) ?? [];
    list.push(node);
    groups.set(key, list);
  });

  const buildRegionHeight = (count: number) => {
    if (count <= 0) return 84;
    const columns = count <= 2 ? count : count <= 6 ? 2 : 3;
    const rows = Math.ceil(count / Math.max(columns, 1));
    return Math.max(96, 52 + rows * 70);
  };

  const regions: GraphRegion[] = [];
  let leftY = topStart;
  let rightY = topStart;

  defaultRegionOrder.forEach(([key, label, side]) => {
    if (side === "bottom") return;
    const count = groups.get(key)?.length ?? 0;
    const region: GraphRegion = {
      key,
      label,
      x: side === "left" ? leftX : rightX,
      y: side === "left" ? leftY : rightY,
      width: regionWidth,
      height: buildRegionHeight(count),
    };
    regions.push(region);
    if (side === "left") {
      leftY += region.height + regionGap;
    } else {
      rightY += region.height + regionGap;
    }
  });

  const sideHeight = Math.max(leftY, rightY);
  const bottomRegion: GraphRegion = {
    key: "Entity",
    label: "其他实体",
    x: centerX - 160,
    y: sideHeight + 12,
    width: 320,
    height: buildRegionHeight(groups.get("Entity")?.length ?? 0),
  };
  regions.push(bottomRegion);
  const height = bottomRegion.y + bottomRegion.height + 36;

  for (const region of regions) {
    const group = groups.get(region.key) ?? [];
    if (group.length === 0) continue;
    const innerTop = region.y + 34;
    const innerHeight = Math.max(region.height - 48, 24);
    const innerWidth = Math.max(region.width - 28, 40);
    group.forEach((node, index) => {
      const columns = group.length <= 2 ? group.length : group.length <= 6 ? 2 : 3;
      const rows = Math.ceil(group.length / columns);
      const col = columns === 1 ? 0 : index % columns;
      const row = columns === 1 ? index : Math.floor(index / columns);
      const xStep = columns === 1 ? 0 : innerWidth / (columns + 1);
      const yStep = rows === 1 ? 0 : innerHeight / (rows + 1);
      positions[node.id] = {
        x: columns === 1 ? region.x + region.width / 2 : region.x + 12 + xStep * (col + 1),
        y: rows === 1 ? innerTop + innerHeight / 2 : innerTop + yStep * (row + 1),
      };
    });
  }

  return { width, height, positions, regions };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function edgeKey(edge: KnowledgeGraphEdge, index: number) {
  return `${edge.source}-${edge.target}-${edge.relation_type}-${index}`;
}

function detailLabel(key: string): string {
  if (key === "type") return "类型";
  if (key === "status") return "状态";
  if (key === "location") return "位置";
  if (key === "health") return "健康度";
  if (key === "description") return "描述";
  return key;
}

export default function DigitalAssetsPanel({ apiBaseUrl, token }: DigitalAssetsPanelProps) {
  const [assets, setAssets] = useState<DigitalAsset[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<AssetStatus | "all">("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [total, setTotal] = useState(0);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createSaving, setCreateSaving] = useState(false);
  const [createForm, setCreateForm] = useState<AssetForm>(emptyForm);
  const [detailAssetId, setDetailAssetId] = useState<string | null>(null);
  const [detailSaving, setDetailSaving] = useState(false);
  const [detailForm, setDetailForm] = useState<AssetForm>(emptyForm);
  const [isDetailEditing, setIsDetailEditing] = useState(false);
  const [graphLoading, setGraphLoading] = useState(false);
  const [graphError, setGraphError] = useState("");
  const [showAlarmFlowEditor, setShowAlarmFlowEditor] = useState(false);
  const [knowledgeGraph, setKnowledgeGraph] = useState<KnowledgeGraphResponse | null>(null);
  const [selectedGraphType, setSelectedGraphType] = useState<string>("all");
  const [selectedGraphNodeId, setSelectedGraphNodeId] = useState<string | null>(null);
  const [selectedGraphEdgeKey, setSelectedGraphEdgeKey] = useState<string | null>(null);
  const [graphTransform, setGraphTransform] = useState({ scale: 1, x: 0, y: 0 });
  const [isGraphPanning, setIsGraphPanning] = useState(false);
  const graphPanStartRef = useRef<{ x: number; y: number; originX: number; originY: number } | null>(null);
  const graphViewportRef = useRef<HTMLDivElement | null>(null);

  const detailAsset = useMemo(
    () => assets.find((asset) => asset.id === detailAssetId) ?? null,
    [assets, detailAssetId],
  );

  const nodeMap = useMemo(() => {
    return Object.fromEntries((knowledgeGraph?.nodes ?? []).map((node) => [node.id, node]));
  }, [knowledgeGraph]);
  const graphLegendTypes = useMemo(() => {
    const types = Array.from(new Set((knowledgeGraph?.nodes ?? []).map((node) => normalizeNodeType(node.node_type))));
    return ["Equipment", ...types.filter((type) => type !== "Equipment")];
  }, [knowledgeGraph]);
  const groupedNodes = useMemo(() => {
    const groups = new Map<string, KnowledgeGraphNode[]>();
    (knowledgeGraph?.nodes ?? [])
      .filter((node) => !node.is_center)
      .forEach((node) => {
        const type = normalizeNodeType(node.node_type);
        const list = groups.get(type) ?? [];
        list.push(node);
        groups.set(type, list);
      });
    return sortGroupedEntries(Array.from(groups.entries()));
  }, [knowledgeGraph]);
  const groupedEdges = useMemo(() => {
    const groups = new Map<string, KnowledgeGraphEdge[]>();
    (knowledgeGraph?.edges ?? []).forEach((edge) => {
      const source = nodeMap[edge.source];
      const target = nodeMap[edge.target];
      const type =
        source?.is_center && target
          ? normalizeNodeType(target.node_type)
          : target?.is_center && source
            ? normalizeNodeType(source.node_type)
            : normalizeNodeType(target?.node_type ?? source?.node_type ?? "Entity");
      const list = groups.get(type) ?? [];
      list.push(edge);
      groups.set(type, list);
    });
    return sortGroupedEntries(Array.from(groups.entries()));
  }, [knowledgeGraph, nodeMap]);
  const graphTabTypes = useMemo(
    () => groupedNodes.map(([type, nodes]) => ({ type, count: nodes.length, label: typeDisplayName(type) })),
    [groupedNodes],
  );
  const filteredGraphNodes = useMemo(() => {
    if (!knowledgeGraph) return [];
    const centerNodes = knowledgeGraph.nodes.filter((node) => node.is_center);
    if (selectedGraphType === "all") return knowledgeGraph.nodes;
    return [
      ...centerNodes,
      ...knowledgeGraph.nodes.filter((node) => !node.is_center && normalizeNodeType(node.node_type) === selectedGraphType),
    ];
  }, [knowledgeGraph, selectedGraphType]);
  const filteredGraphNodeMap = useMemo(
    () => Object.fromEntries(filteredGraphNodes.map((node) => [node.id, node])),
    [filteredGraphNodes],
  );
  const filteredGraphEdges = useMemo(() => {
    if (!knowledgeGraph) return [];
    if (selectedGraphType === "all") return knowledgeGraph.edges;
    return knowledgeGraph.edges.filter((edge) => {
      const source = nodeMap[edge.source];
      const target = nodeMap[edge.target];
      const sourceType = normalizeNodeType(source?.node_type ?? "Entity");
      const targetType = normalizeNodeType(target?.node_type ?? "Entity");
      return (
        (source?.is_center && targetType === selectedGraphType) ||
        (target?.is_center && sourceType === selectedGraphType)
      );
    });
  }, [knowledgeGraph, nodeMap, selectedGraphType]);
  const filteredGraphLayout = useMemo(() => buildTypeGraphLayout(filteredGraphNodes), [filteredGraphNodes]);
  const allGraphLayout = useMemo(() => buildAllTypesGraphLayout(filteredGraphNodes), [filteredGraphNodes]);
  const activeGraphLayout = selectedGraphType === "all" ? allGraphLayout : filteredGraphLayout;
  const connectedNodeIds = useMemo(() => {
    const ids = new Set<string>();
    filteredGraphEdges.forEach((edge, index) => {
      const key = edgeKey(edge, index);
      if (selectedGraphEdgeKey === key) {
        ids.add(edge.source);
        ids.add(edge.target);
      }
      if (selectedGraphNodeId && (edge.source === selectedGraphNodeId || edge.target === selectedGraphNodeId)) {
        ids.add(edge.source);
        ids.add(edge.target);
      }
    });
    return ids;
  }, [filteredGraphEdges, selectedGraphEdgeKey, selectedGraphNodeId]);
  const selectedGraphNode = useMemo(
    () => filteredGraphNodes.find((node) => node.id === selectedGraphNodeId) ?? null,
    [filteredGraphNodes, selectedGraphNodeId],
  );
  const selectedGraphEdge = useMemo(
    () => filteredGraphEdges.find((edge, index) => edgeKey(edge, index) === selectedGraphEdgeKey) ?? null,
    [filteredGraphEdges, selectedGraphEdgeKey],
  );

  const fetchAssets = async (targetPage = page, targetPageSize = pageSize) => {
    setLoading(true);
    setError("");
    try {
      const query = new URLSearchParams();
      if (search.trim()) query.set("keyword", search.trim());
      if (statusFilter !== "all") query.set("status", statusFilter);
      query.set("page", String(targetPage));
      query.set("page_size", String(targetPageSize));

      const response = await fetch(`${apiBaseUrl}/digital-twin/assets?${query.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        throw new Error("资产加载失败");
      }
      const data = (await response.json()) as AssetListResponse;
      setAssets(data.items.map(toUiAsset));
      setTotal(data.total);
      const totalPages = Math.max(1, Math.ceil(data.total / targetPageSize));
      if (targetPage > totalPages) {
        setPage(totalPages);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "资产加载失败");
    } finally {
      setLoading(false);
    }
  };

  const fetchAssetKnowledgeGraph = async (assetId: string) => {
    setGraphLoading(true);
    setGraphError("");
    try {
      const response = await fetch(`${apiBaseUrl}/digital-twin/assets/${assetId}/knowledge-graph`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        throw new Error("设备知识图谱加载失败");
      }
      const graph = (await response.json()) as KnowledgeGraphResponse;
      setKnowledgeGraph(graph);
    } catch (e) {
      setKnowledgeGraph(null);
      setGraphError(e instanceof Error ? e.message : "设备知识图谱加载失败");
    } finally {
      setGraphLoading(false);
    }
  };

  useEffect(() => {
    void fetchAssets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, page, pageSize]);

  useEffect(() => {
    if (graphTabTypes.length === 0) {
      setSelectedGraphType("all");
      return;
    }
    if (selectedGraphType !== "all" && !graphTabTypes.some((item) => item.type === selectedGraphType)) {
      setSelectedGraphType(graphTabTypes[0]?.type ?? "all");
    }
  }, [graphTabTypes, selectedGraphType]);

  useEffect(() => {
    if (!knowledgeGraph) {
      setSelectedGraphNodeId(null);
      setSelectedGraphEdgeKey(null);
      return;
    }
    const centerNode = knowledgeGraph.nodes.find((node) => node.is_center) ?? knowledgeGraph.nodes[0] ?? null;
    setSelectedGraphNodeId(centerNode?.id ?? null);
    setSelectedGraphEdgeKey(null);
    setGraphTransform({ scale: 1, x: 0, y: 0 });
  }, [knowledgeGraph]);

  useEffect(() => {
    if (selectedGraphNodeId && !filteredGraphNodeMap[selectedGraphNodeId]) {
      const centerNode = filteredGraphNodes.find((node) => node.is_center) ?? filteredGraphNodes[0] ?? null;
      setSelectedGraphNodeId(centerNode?.id ?? null);
    }
  }, [filteredGraphNodeMap, filteredGraphNodes, selectedGraphNodeId]);

  useEffect(() => {
    if (selectedGraphEdgeKey && !filteredGraphEdges.some((edge, index) => edgeKey(edge, index) === selectedGraphEdgeKey)) {
      setSelectedGraphEdgeKey(null);
    }
  }, [filteredGraphEdges, selectedGraphEdgeKey]);

  const openCreate = () => {
    setCreateForm(emptyForm);
    setShowCreateModal(true);
  };

  const openDetail = (asset: DigitalAsset) => {
    setDetailAssetId(asset.id);
    setIsDetailEditing(false);
    setSelectedGraphType("all");
    setDetailForm({
      id: asset.id,
      name: asset.name,
      type: asset.type,
      status: asset.status,
      location: asset.location,
      health: asset.health,
      modelFile: asset.modelFile,
    });
    void fetchAssetKnowledgeGraph(asset.id);
  };

  const zoomGraph = (direction: "in" | "out") => {
    setGraphTransform((prev) => ({
      ...prev,
      scale: clamp(prev.scale + (direction === "in" ? 0.15 : -0.15), 0.6, 2.2),
    }));
  };

  const resetGraphViewport = () => {
    setGraphTransform({ scale: 1, x: 0, y: 0 });
  };

  const startGraphPan = (clientX: number, clientY: number) => {
    graphPanStartRef.current = { x: clientX, y: clientY, originX: graphTransform.x, originY: graphTransform.y };
    setIsGraphPanning(true);
  };

  const moveGraphPan = (clientX: number, clientY: number) => {
    const pan = graphPanStartRef.current;
    if (!pan) return;
    setGraphTransform((prev) => ({
      ...prev,
      x: pan.originX + clientX - pan.x,
      y: pan.originY + clientY - pan.y,
    }));
  };

  const endGraphPan = () => {
    graphPanStartRef.current = null;
    setIsGraphPanning(false);
  };

  const validateForm = (form: AssetForm, requireId: boolean) => {
    if (requireId && !form.id.trim()) return false;
    if (!form.name.trim() || !form.type.trim() || !form.location.trim() || !form.modelFile.trim()) return false;
    return true;
  };

  const saveCreateAsset = async () => {
    if (!validateForm(createForm, true)) {
      setError("请完整填写资产信息");
      return;
    }
    setCreateSaving(true);
    setError("");
    try {
      const payload = {
        id: createForm.id.trim(),
        name: createForm.name.trim(),
        type: createForm.type.trim(),
        status: createForm.status,
        location: createForm.location.trim(),
        health: createForm.health,
        model_file: createForm.modelFile.trim(),
      };

      const response = await fetch(`${apiBaseUrl}/digital-twin/assets`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        throw new Error("资产新增失败");
      }
      setCreateForm(emptyForm);
      setShowCreateModal(false);
      setPage(1);
      await fetchAssets(1, pageSize);
    } catch (e) {
      setError(e instanceof Error ? e.message : "资产新增失败");
    } finally {
      setCreateSaving(false);
    }
  };

  const saveDetailAsset = async () => {
    if (!detailAssetId) return;
    if (!validateForm(detailForm, false)) {
      setError("请完整填写资产信息");
      return;
    }
    setDetailSaving(true);
    setError("");
    try {
      const response = await fetch(`${apiBaseUrl}/digital-twin/assets/${detailAssetId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: detailForm.name.trim(),
          type: detailForm.type.trim(),
          status: detailForm.status,
          location: detailForm.location.trim(),
          health: detailForm.health,
          model_file: detailForm.modelFile.trim(),
        }),
      });
      if (!response.ok) {
        throw new Error("资产更新失败");
      }
      await fetchAssets();
      if (detailAssetId) {
        await fetchAssetKnowledgeGraph(detailAssetId);
      }
      setIsDetailEditing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "资产更新失败");
    } finally {
      setDetailSaving(false);
    }
  };

  const removeAsset = async (assetId: string) => {
    if (!window.confirm(`确认删除资产 ${assetId} 吗？`)) return;
    setError("");
    try {
      const response = await fetch(`${apiBaseUrl}/digital-twin/assets/${assetId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        throw new Error("删除失败");
      }
      if (detailAssetId === assetId) {
        setDetailAssetId(null);
        setIsDetailEditing(false);
        setDetailForm(emptyForm);
        setKnowledgeGraph(null);
      }
      await fetchAssets(page, pageSize);
    } catch (e) {
      setError(e instanceof Error ? e.message : "删除失败");
    }
  };

  if (detailAssetId) {
    return (
      <div className="h-full overflow-y-auto bg-slate-50/30 p-6 md:p-8">
        <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => {
              setDetailAssetId(null);
              setKnowledgeGraph(null);
              setGraphError("");
            }}
            className="inline-flex items-center gap-1 text-sm text-slate-500 transition hover:text-slate-700"
          >
            <ArrowLeft size={14} /> 返回数字资产库
          </button>
          {detailAsset && (
            <span className="rounded-lg bg-slate-100 px-3 py-1 text-xs font-mono text-slate-600">{detailAsset.id}</span>
          )}
          {detailAsset && (
            <div className="flex items-center gap-2">
              {isDetailEditing ? (
                <>
                  <button type="button" onClick={() => void saveDetailAsset()} disabled={detailSaving} className="btn-top-primary">
                    {detailSaving ? <Loader2 size={14} className="animate-spin" /> : "保存"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (!detailAsset) return;
                      setDetailForm({
                        id: detailAsset.id,
                        name: detailAsset.name,
                        type: detailAsset.type,
                        status: detailAsset.status,
                        location: detailAsset.location,
                        health: detailAsset.health,
                        modelFile: detailAsset.modelFile,
                      });
                      setIsDetailEditing(false);
                    }}
                    className="btn-top-outline"
                  >
                    取消
                  </button>
                </>
              ) : (
                <>
                  <button type="button" onClick={() => setIsDetailEditing(true)} className="btn-top-outline">
                    编辑
                  </button>
                  <button type="button" onClick={() => setShowAlarmFlowEditor(true)} className="btn-top-primary">
                    <Siren size={14} /> 告警数据接入
                  </button>
                </>
              )}
              <button type="button" onClick={() => void removeAsset(detailAsset.id)} className="btn-top-danger">
                删除资产
              </button>
            </div>
          )}
        </header>

        {error && <p className="mb-3 text-sm text-red-500">{error}</p>}

        {!detailAsset ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500 shadow-sm">资产不存在或已被删除。</div>
        ) : (
          <div className="space-y-5">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-bold text-slate-800">设备基础信息</h3>
                    <p className="text-sm text-slate-500">列表页展示设备数据，详情页可继续编辑。</p>
                  </div>
                  <span
                    className={`rounded-lg px-2 py-1 text-[10px] font-bold uppercase ${
                      detailForm.status === "Normal"
                        ? "bg-emerald-50 text-emerald-600"
                        : detailForm.status === "Warning"
                          ? "bg-orange-50 text-orange-600"
                          : "bg-red-50 text-red-600"
                    }`}
                  >
                    {statusLabel(detailForm.status)}
                  </span>
                </div>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <label className="space-y-1">
                    <span className="text-sm text-slate-500">资产 ID</span>
                    <input
                      disabled
                      className="h-10 w-full rounded-xl border border-slate-200 bg-slate-100 px-3 text-slate-500 outline-none"
                      value={detailForm.id}
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-sm text-slate-500">资产名称</span>
                    <input
                      disabled={!isDetailEditing}
                      className="h-10 w-full rounded-xl border border-slate-200 px-3 outline-none focus:border-blue-300"
                      value={detailForm.name}
                      onChange={(e) => setDetailForm((prev) => ({ ...prev, name: e.target.value }))}
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-sm text-slate-500">资产类型</span>
                    <input
                      disabled={!isDetailEditing}
                      className="h-10 w-full rounded-xl border border-slate-200 px-3 outline-none focus:border-blue-300"
                      value={detailForm.type}
                      onChange={(e) => setDetailForm((prev) => ({ ...prev, type: e.target.value }))}
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-sm text-slate-500">部署位置</span>
                    <input
                      disabled={!isDetailEditing}
                      className="h-10 w-full rounded-xl border border-slate-200 px-3 outline-none focus:border-blue-300"
                      value={detailForm.location}
                      onChange={(e) => setDetailForm((prev) => ({ ...prev, location: e.target.value }))}
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-sm text-slate-500">模型文件</span>
                    <input
                      disabled={!isDetailEditing}
                      className="h-10 w-full rounded-xl border border-slate-200 px-3 outline-none focus:border-blue-300"
                      value={detailForm.modelFile}
                      onChange={(e) => setDetailForm((prev) => ({ ...prev, modelFile: e.target.value }))}
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-sm text-slate-500">健康度 (0-100)</span>
                    <input
                      disabled={!isDetailEditing}
                      type="number"
                      min={0}
                      max={100}
                      className="h-10 w-full rounded-xl border border-slate-200 px-3 outline-none focus:border-blue-300"
                      value={detailForm.health}
                      onChange={(e) => setDetailForm((prev) => ({ ...prev, health: Number(e.target.value) }))}
                    />
                  </label>
                  <label className="space-y-1 md:col-span-2">
                    <span className="text-sm text-slate-500">状态</span>
                    <select
                      disabled={!isDetailEditing}
                      className="h-10 w-full rounded-xl border border-slate-200 px-3 outline-none focus:border-blue-300"
                      value={detailForm.status}
                      onChange={(e) => setDetailForm((prev) => ({ ...prev, status: e.target.value as AssetStatus }))}
                    >
                      <option value="Normal">正常</option>
                      <option value="Warning">警告</option>
                      <option value="Critical">危险</option>
                    </select>
                  </label>
                </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-bold text-slate-800">关联知识图谱</h3>
                    <p className="text-sm text-slate-500">展示该设备关联的产线、传感器、故障、告警、文档等知识图谱数据。</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => detailAssetId && void fetchAssetKnowledgeGraph(detailAssetId)}
                    className="btn-top-outline"
                  >
                    刷新图谱
                  </button>
                </div>

                {graphError && <p className="mb-3 text-sm text-red-500">{graphError}</p>}

                {graphLoading ? (
                  <div className="flex h-[360px] items-center justify-center text-sm text-slate-500">
                    <span className="inline-flex items-center gap-2">
                      <Loader2 size={14} className="animate-spin text-blue-600" /> 图谱加载中...
                    </span>
                  </div>
                ) : !knowledgeGraph || knowledgeGraph.nodes.length === 0 ? (
                  <div className="flex h-[360px] items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50 text-sm text-slate-500">
                    暂无可展示的知识图谱数据
                  </div>
                ) : (
                  <>
                    <div className="mb-4 flex flex-wrap gap-2">
                      {Object.entries(knowledgeGraph.summary).map(([key, value]) => (
                        <span key={key} className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600">
                          {summaryDisplayName(key)}: {value}
                        </span>
                      ))}
                    </div>
                    <div className="mb-4 flex flex-wrap gap-2">
                      {graphLegendTypes.map((type) => {
                        const style = typeStyle(type, type === "Equipment");
                        return (
                          <span
                            key={type}
                            className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium ${style.badge}`}
                          >
                            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: style.fill }} />
                            {typeDisplayName(type)}
                          </span>
                        );
                      })}
                    </div>
                    <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                      <div className="mb-4 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => setSelectedGraphType("all")}
                          className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                            selectedGraphType === "all"
                              ? "border-blue-200 bg-blue-50 text-blue-700"
                              : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                          }`}
                        >
                          全部 ({knowledgeGraph.nodes.filter((node) => !node.is_center).length})
                        </button>
                        {graphTabTypes.map(({ type, count, label }) => {
                          const style = typeStyle(type);
                          const active = selectedGraphType === type;
                          return (
                            <button
                              key={type}
                              type="button"
                              onClick={() => setSelectedGraphType(type)}
                              className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${active ? style.badge : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"}`}
                              style={active ? { borderColor: style.stroke } : undefined}
                            >
                              {label} ({count})
                            </button>
                          );
                        })}
                      </div>

                      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2">
                        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                          <span className="rounded-full bg-slate-100 px-2.5 py-1">滚轮缩放</span>
                          <span className="rounded-full bg-slate-100 px-2.5 py-1">拖动画布平移</span>
                          <span className="rounded-full bg-slate-100 px-2.5 py-1">点击节点联动下方详情</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <button type="button" onClick={() => zoomGraph("out")} className="btn-top-outline h-8 px-2">
                            <ZoomOut size={14} />
                          </button>
                          <button type="button" onClick={resetGraphViewport} className="btn-top-outline h-8 gap-1 px-2">
                            <Move size={14} /> 还原视图
                          </button>
                          <button type="button" onClick={() => zoomGraph("in")} className="btn-top-outline h-8 px-2">
                            <ZoomIn size={14} />
                          </button>
                        </div>
                      </div>

                      <div
                        ref={graphViewportRef}
                        className={`overflow-hidden rounded-2xl border border-slate-200 bg-white ${isGraphPanning ? "cursor-grabbing" : "cursor-grab"}`}
                        onMouseDown={(event) => {
                          if (event.button !== 0) return;
                          startGraphPan(event.clientX, event.clientY);
                        }}
                        onMouseMove={(event) => {
                          if (!isGraphPanning) return;
                          moveGraphPan(event.clientX, event.clientY);
                        }}
                        onMouseUp={endGraphPan}
                        onMouseLeave={endGraphPan}
                        onWheel={(event) => {
                          event.preventDefault();
                          setGraphTransform((prev) => ({
                            ...prev,
                            scale: clamp(prev.scale + (event.deltaY < 0 ? 0.1 : -0.1), 0.6, 2.2),
                          }));
                        }}
                      >
                        <svg
                          viewBox={`0 0 ${activeGraphLayout.width} ${activeGraphLayout.height}`}
                          className={`w-full ${selectedGraphType === "all" ? "h-[560px]" : "h-[500px]"}`}
                        >
                          <g transform={`translate(${graphTransform.x} ${graphTransform.y}) scale(${graphTransform.scale})`}>
                          {selectedGraphType === "all" &&
                            allGraphLayout.regions.map((region) => {
                              const style = typeStyle(region.key);
                              const count = (groupedNodes.find(([type]) => type === region.key)?.[1].length ?? 0);
                              return (
                                <g key={region.key}>
                                  <rect
                                    x={region.x}
                                    y={region.y}
                                    width={region.width}
                                    height={region.height}
                                    rx={16}
                                    fill={style.regionFill}
                                    stroke={style.regionStroke}
                                    strokeDasharray="5 5"
                                  />
                                  <text x={region.x + 10} y={region.y + 18} fill={style.fill} className="text-[11px] font-semibold">
                                    {region.label} ({count})
                                  </text>
                                </g>
                              );
                            })}
                          {filteredGraphEdges.map((edge, index) => {
                            const currentKey = edgeKey(edge, index);
                            const source = activeGraphLayout.positions[edge.source];
                            const target = activeGraphLayout.positions[edge.target];
                            if (!source || !target) return null;
                            const sourceNode = filteredGraphNodeMap[edge.source];
                            const style = typeStyle(sourceNode?.node_type ?? "Entity", sourceNode?.is_center ?? false);
                            const relatedToSelection =
                              !selectedGraphNodeId && !selectedGraphEdgeKey
                                ? true
                                : selectedGraphEdgeKey === currentKey ||
                                  (!!selectedGraphNodeId && (edge.source === selectedGraphNodeId || edge.target === selectedGraphNodeId));
                            const midX = (source.x + target.x) / 2;
                            const midY = (source.y + target.y) / 2;
                            return (
                              <g
                                key={currentKey}
                                className="cursor-pointer"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setSelectedGraphEdgeKey(currentKey);
                                  setSelectedGraphNodeId(null);
                                }}
                              >
                              <line
                                x1={source.x}
                                y1={source.y}
                                x2={target.x}
                                y2={target.y}
                                stroke={style.line}
                                strokeWidth={selectedGraphEdgeKey === currentKey ? "3.5" : "2"}
                                strokeOpacity={relatedToSelection ? "0.9" : "0.22"}
                              />
                              <rect
                                x={midX - 42}
                                y={midY - 11}
                                width={84}
                                height={22}
                                rx={11}
                                fill="#FFFFFF"
                                stroke={selectedGraphEdgeKey === currentKey ? style.fill : style.stroke}
                                opacity={relatedToSelection ? 1 : 0.45}
                              />
                              <title>{`${filteredGraphNodeMap[edge.source]?.name ?? edge.source} ${relationDisplayName(edge.relation_type)} ${filteredGraphNodeMap[edge.target]?.name ?? edge.target}`}</title>
                              <text x={midX} y={midY + 4} textAnchor="middle" className="fill-slate-500 text-[10px]">
                                  {relationDisplayName(edge.relation_type)}
                              </text>
                            </g>
                          );
                        })}

                          {selectedGraphType === "all" &&
                            graphTabTypes.map(({ type }) => {
                              const nodes = filteredGraphNodes.filter((node) => !node.is_center && normalizeNodeType(node.node_type) === type);
                              if (nodes.length === 0) return null;
                              const first = allGraphLayout.positions[nodes[0]?.id];
                              const center = filteredGraphNodes.find((node) => node.is_center);
                              const centerPos = center ? allGraphLayout.positions[center.id] : undefined;
                              if (!first || !centerPos) return null;
                              const style = typeStyle(type);
                              return (
                                <line
                                  key={`guide-${type}`}
                                  x1={centerPos.x}
                                  y1={centerPos.y}
                                  x2={first.x}
                                  y2={first.y}
                                  stroke={style.stroke}
                                  strokeWidth="1.2"
                                  strokeDasharray="4 4"
                                  strokeOpacity="0.7"
                                />
                              );
                            })}

                          {filteredGraphNodes.map((node) => {
                            const position = activeGraphLayout.positions[node.id];
                            if (!position) return null;
                            const style = typeStyle(node.node_type, node.is_center);
                            const active = selectedGraphNodeId === node.id;
                            const relatedToSelection =
                              !selectedGraphNodeId && !selectedGraphEdgeKey
                                ? true
                                : active || connectedNodeIds.has(node.id);
                            return (
                              <g
                                key={node.id}
                                className="cursor-pointer"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setSelectedGraphNodeId(node.id);
                                  setSelectedGraphEdgeKey(null);
                                }}
                              >
                                <title>
                                  {[
                                    `${typeDisplayName(node.node_type)}: ${node.name}`,
                                    `ID: ${node.id}`,
                                    ...Object.entries(node.properties ?? {})
                                      .filter(([key]) => key !== "name" && key !== "nodeId" && key !== "id")
                                      .slice(0, 4)
                                      .map(([key, value]) => `${key}: ${String(value)}`),
                                  ].join("\n")}
                                </title>
                                <circle
                                  cx={position.x}
                                  cy={position.y}
                                  r={node.is_center ? 40 : 28}
                                  fill={style.fill}
                                  opacity={relatedToSelection ? 1 : 0.3}
                                />
                                <circle
                                  cx={position.x}
                                  cy={position.y}
                                  r={active ? (node.is_center ? 50 : 38) : node.is_center ? 45 : 33}
                                  fill="none"
                                  stroke={active ? style.fill : style.stroke}
                                  strokeWidth={active ? "3.5" : "2"}
                                  opacity={relatedToSelection ? 1 : 0.35}
                                />
                                <text x={position.x} y={position.y - 2} textAnchor="middle" className="fill-white text-[12px] font-semibold">
                                  {(node.name ?? node.id).slice(0, node.is_center ? 10 : 8)}
                                </text>
                                <text x={position.x} y={position.y + 14} textAnchor="middle" className="fill-white text-[10px]">
                                  {node.id.slice(0, 8)}
                                </text>
                                <text x={position.x} y={position.y + (node.is_center ? 64 : 48)} textAnchor="middle" fill={style.fill} className="text-[11px] font-medium">
                                  {typeDisplayName(node.node_type)}
                                </text>
                              </g>
                            );
                          })}
                          </g>
                        </svg>
                      </div>

                      <div className="mt-4">
                        <div className="rounded-2xl border border-slate-200 bg-white p-4">
                          <div className="mb-2 flex items-center justify-between">
                            <h4 className="text-sm font-semibold text-slate-800">当前关注对象</h4>
                            <span className="text-xs text-slate-500">
                              {selectedGraphNode ? "节点" : selectedGraphEdge ? "关系" : "图谱总览"}
                            </span>
                          </div>
                          {selectedGraphNode ? (
                            <div className="space-y-3 text-sm text-slate-600">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className={`rounded-full px-2 py-1 text-[10px] font-medium ${typeStyle(selectedGraphNode.node_type, selectedGraphNode.is_center).badge}`}>
                                  {typeDisplayName(selectedGraphNode.node_type)}
                                </span>
                                <span className="font-semibold text-slate-800">{selectedGraphNode.name}</span>
                              </div>
                              <div className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2 xl:grid-cols-3">
                                <div className="rounded-xl bg-slate-50 px-3 py-2">
                                  <div className="text-xs text-slate-400">ID</div>
                                  <div className="mt-1 break-all font-medium text-slate-700">{selectedGraphNode.id}</div>
                                </div>
                                <div className="rounded-xl bg-slate-50 px-3 py-2">
                                  <div className="text-xs text-slate-400">关联关系</div>
                                  <div className="mt-1 font-medium text-slate-700">
                                    {filteredGraphEdges.filter((edge) => edge.source === selectedGraphNode.id || edge.target === selectedGraphNode.id).length} 条
                                  </div>
                                </div>
                                {Object.entries(selectedGraphNode.properties ?? {})
                                  .filter(([key]) => !["name", "id", "nodeId"].includes(key))
                                  .slice(0, 6)
                                  .map(([key, value]) => (
                                    <div key={key} className="rounded-xl bg-slate-50 px-3 py-2">
                                      <div className="text-xs text-slate-400">{detailLabel(key)}</div>
                                      <div className="mt-1 break-all font-medium text-slate-700">{String(value)}</div>
                                    </div>
                                  ))}
                              </div>
                              {connectedNodeIds.size > 0 && (
                                <div className="flex flex-wrap gap-2">
                                  {Array.from(connectedNodeIds)
                                    .filter((nodeId) => nodeId !== selectedGraphNode.id)
                                    .slice(0, 8)
                                    .map((nodeId) => {
                                      const node = filteredGraphNodeMap[nodeId];
                                      if (!node) return null;
                                      return (
                                        <button
                                          key={nodeId}
                                          type="button"
                                          onClick={() => {
                                            setSelectedGraphNodeId(nodeId);
                                            setSelectedGraphEdgeKey(null);
                                          }}
                                          className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-600 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
                                        >
                                          {node.name}
                                        </button>
                                      );
                                    })}
                                </div>
                              )}
                            </div>
                          ) : selectedGraphEdge ? (
                            <div className="space-y-3 text-sm text-slate-600">
                              <div className="font-semibold text-slate-800">
                                {(nodeMap[selectedGraphEdge.source]?.name ?? selectedGraphEdge.source)} {relationDisplayName(selectedGraphEdge.relation_type)} {(nodeMap[selectedGraphEdge.target]?.name ?? selectedGraphEdge.target)}
                              </div>
                              <div className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2 xl:grid-cols-3">
                                <div className="rounded-xl bg-slate-50 px-3 py-2">
                                  <div className="text-xs text-slate-400">起点</div>
                                  <div className="mt-1 font-medium text-slate-700">{nodeMap[selectedGraphEdge.source]?.name ?? selectedGraphEdge.source}</div>
                                </div>
                                <div className="rounded-xl bg-slate-50 px-3 py-2">
                                  <div className="text-xs text-slate-400">关系类型</div>
                                  <div className="mt-1 font-medium text-slate-700">{relationDisplayName(selectedGraphEdge.relation_type)}</div>
                                </div>
                                <div className="rounded-xl bg-slate-50 px-3 py-2">
                                  <div className="text-xs text-slate-400">终点</div>
                                  <div className="mt-1 font-medium text-slate-700">{nodeMap[selectedGraphEdge.target]?.name ?? selectedGraphEdge.target}</div>
                                </div>
                                {Object.keys(selectedGraphEdge.properties ?? {}).length > 0 ? (
                                  Object.entries(selectedGraphEdge.properties ?? {})
                                    .slice(0, 6)
                                    .map(([key, value]) => (
                                      <div key={key} className="rounded-xl bg-slate-50 px-3 py-2">
                                        <div className="text-xs text-slate-400">{detailLabel(key)}</div>
                                        <div className="mt-1 break-all font-medium text-slate-700">{String(value)}</div>
                                      </div>
                                    ))
                                ) : (
                                  <div className="rounded-xl bg-slate-50 px-3 py-2 text-slate-500">当前关系暂无附加属性。</div>
                                )}
                              </div>
                            </div>
                          ) : (
                            <div className="grid grid-cols-1 gap-2 text-sm text-slate-600 sm:grid-cols-2 xl:grid-cols-4">
                              <div className="rounded-xl bg-slate-50 px-3 py-2">
                                <div className="text-xs text-slate-400">中心设备</div>
                                <div className="mt-1 font-medium text-slate-700">{knowledgeGraph.asset_name}</div>
                              </div>
                              <div className="rounded-xl bg-slate-50 px-3 py-2">
                                <div className="text-xs text-slate-400">可视节点</div>
                                <div className="mt-1 font-medium text-slate-700">{filteredGraphNodes.length} 个</div>
                              </div>
                              <div className="rounded-xl bg-slate-50 px-3 py-2">
                                <div className="text-xs text-slate-400">可视关系</div>
                                <div className="mt-1 font-medium text-slate-700">{filteredGraphEdges.length} 条</div>
                              </div>
                              <div className="rounded-xl bg-slate-50 px-3 py-2">
                                <div className="text-xs text-slate-400">操作提示</div>
                                <div className="mt-1 font-medium text-slate-700">点击节点或关系查看上下文</div>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </>
                )}
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="mb-4 flex items-center justify-between">
                  <h3 className="text-lg font-bold text-slate-800">关联节点详情</h3>
                  <span className="text-sm text-slate-500">{knowledgeGraph?.nodes.length ?? 0} 个节点</span>
                </div>
                {!knowledgeGraph || knowledgeGraph.nodes.length <= 1 ? (
                  <p className="text-sm text-slate-500">当前设备暂无更多关联节点。</p>
                ) : (
                  <div className="space-y-4">
                    {groupedNodes.map(([type, nodes]) => {
                      const style = typeStyle(type);
                      return (
                        <section key={type} className={`rounded-2xl border p-4 ${style.card}`}>
                          <div className="mb-3 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="h-3 w-3 rounded-full" style={{ backgroundColor: style.fill }} />
                              <h4 className={`text-sm font-semibold ${style.text}`}>{typeDisplayName(type)}</h4>
                            </div>
                            <span className={`rounded-full px-2 py-1 text-[10px] font-medium ${style.badge}`}>{nodes.length} 个节点</span>
                          </div>
                          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                            {nodes.map((node) => (
                              <div
                                key={node.id}
                                className={`rounded-xl border border-white/70 bg-white/80 p-4 shadow-sm transition ${selectedGraphNodeId === node.id ? "ring-2 ring-blue-300" : ""}`}
                                onClick={() => {
                                  setSelectedGraphNodeId(node.id);
                                  setSelectedGraphEdgeKey(null);
                                }}
                              >
                                <div className="mb-2 flex items-center justify-between gap-2">
                                  <div className="text-sm font-semibold text-slate-800">{node.name}</div>
                                  <span className={`rounded-full px-2 py-1 text-[10px] font-medium ${style.badge}`}>
                                    {typeDisplayName(node.node_type)}
                                  </span>
                                </div>
                                <div className="space-y-1 text-xs text-slate-600">
                                  <div>ID: {node.id}</div>
                                  {Object.entries(node.properties ?? {})
                                    .filter(([key]) => key !== "name" && key !== "nodeId" && key !== "id")
                                    .slice(0, 4)
                                    .map(([key, value]) => (
                                      <div key={key}>
                                        {key}: {String(value)}
                                      </div>
                                    ))}
                                </div>
                              </div>
                            ))}
                          </div>
                        </section>
                      );
                    })}
                  </div>
                )}
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="mb-4 flex items-center justify-between">
                  <h3 className="text-lg font-bold text-slate-800">关系链路</h3>
                  <span className="text-sm text-slate-500">{knowledgeGraph?.edges.length ?? 0} 条关系</span>
                </div>
                {!knowledgeGraph || knowledgeGraph.edges.length === 0 ? (
                  <p className="text-sm text-slate-500">暂无可展示关系。</p>
                ) : (
                  <div className="space-y-4">
                    {groupedEdges.map(([type, edges]) => {
                      const style = typeStyle(type);
                      return (
                        <section key={type} className={`rounded-2xl border p-4 ${style.card}`}>
                          <div className="mb-3 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="h-3 w-3 rounded-full" style={{ backgroundColor: style.fill }} />
                              <h4 className={`text-sm font-semibold ${style.text}`}>{typeDisplayName(type)}</h4>
                            </div>
                            <span className={`rounded-full px-2 py-1 text-[10px] font-medium ${style.badge}`}>{edges.length} 条关系</span>
                          </div>
                          <div className="space-y-3">
                            {edges.map((edge, index) => {
                              const source = nodeMap[edge.source];
                              const target = nodeMap[edge.target];
                              const sourceStyle = typeStyle(source?.node_type ?? "Entity", source?.is_center ?? false);
                              const targetStyle = typeStyle(target?.node_type ?? "Entity", target?.is_center ?? false);
                              const currentKey = edgeKey(edge, index);
                              return (
                                <div
                                  key={currentKey}
                                  className={`rounded-xl border p-3 transition ${selectedGraphEdgeKey === currentKey ? "ring-2 ring-blue-300" : ""}`}
                                  style={{
                                    borderColor: sourceStyle.stroke,
                                    background: `linear-gradient(90deg, ${sourceStyle.regionFill} 0%, ${targetStyle.regionFill} 100%)`,
                                  }}
                                  onClick={() => {
                                    setSelectedGraphEdgeKey(currentKey);
                                    setSelectedGraphNodeId(null);
                                  }}
                                >
                                  <div className="flex flex-wrap items-center gap-2 text-sm">
                                    <span className={`rounded-full px-2 py-1 text-[10px] font-medium ${sourceStyle.badge}`}>
                                      {typeDisplayName(source?.node_type ?? "Entity")}
                                    </span>
                                    <span className="font-semibold text-slate-700">{source?.name ?? edge.source}</span>
                                    <span className="rounded-full bg-white/90 px-2 py-1 text-[10px] font-semibold text-slate-600 shadow-sm">
                                      {relationDisplayName(edge.relation_type)}
                                    </span>
                                    <span className="font-semibold text-slate-700">{target?.name ?? edge.target}</span>
                                    <span className={`rounded-full px-2 py-1 text-[10px] font-medium ${targetStyle.badge}`}>
                                      {typeDisplayName(target?.node_type ?? "Entity")}
                                    </span>
                                  </div>
                                  {Object.keys(edge.properties ?? {}).length > 0 && (
                                    <div className="mt-2 text-xs text-slate-500">
                                      {Object.entries(edge.properties)
                                        .slice(0, 4)
                                        .map(([key, value]) => `${key}: ${String(value)}`)
                                        .join(" | ")}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </section>
                      );
                    })}
                  </div>
                )}
            </div>
          </div>
        )}
        {detailAsset && showAlarmFlowEditor ? (
          <AlarmFlowEditor
            assetId={detailAsset.id}
            assetName={detailAsset.name}
            apiBaseUrl={apiBaseUrl}
            token={token}
            onClose={() => setShowAlarmFlowEditor(false)}
          />
        ) : null}
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto bg-slate-50/30 p-6 md:p-8">
      <header className="mb-6 flex flex-wrap items-center justify-end gap-3">
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => void fetchAssets()} className="btn-top-outline gap-2 text-slate-700">
            <Database size={18} /> 同步资产
          </button>
          <button type="button" onClick={openCreate} className="btn-top-primary gap-2">
            <Plus size={18} /> 新增资产
          </button>
        </div>
      </header>

      <div className="mb-4 flex flex-wrap items-center justify-end gap-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
          <input
            className="h-9 w-56 rounded-lg border border-slate-200 bg-white pl-8 pr-3 text-xs outline-none focus:border-blue-300"
            placeholder="搜索资产名称、ID 或位置..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                setPage(1);
                void fetchAssets(1, pageSize);
              }
            }}
          />
        </div>
        <select
          className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-700 outline-none focus:border-blue-300"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as AssetStatus | "all")}
        >
          <option value="all">全部状态</option>
          <option value="Normal">正常</option>
          <option value="Warning">警告</option>
          <option value="Critical">危险</option>
        </select>
        <button
          type="button"
          onClick={() => {
            setPage(1);
            void fetchAssets(1, pageSize);
          }}
          className="btn-top-outline"
        >
          查询
        </button>
      </div>

      {error && <p className="mb-3 text-sm text-red-500">{error}</p>}

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="bg-slate-50">
              <th className="table-th">资产名称</th>
              <th className="table-th">资产ID</th>
              <th className="table-th">类型</th>
              <th className="table-th">位置</th>
              <th className="table-th">健康度</th>
              <th className="table-th">状态</th>
              <th className="table-th">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-sm text-slate-500">
                  <span className="inline-flex items-center gap-2">
                    <Loader2 size={14} className="animate-spin text-blue-600" /> 资产加载中...
                  </span>
                </td>
              </tr>
            ) : assets.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-sm text-slate-500">
                  暂无资产数据
                </td>
              </tr>
            ) : (
              assets.map((asset) => (
                <tr key={asset.id} className="cursor-pointer hover:bg-slate-50/60" onClick={() => openDetail(asset)}>
                  <td className="table-td">
                    <div className="flex items-center justify-center gap-3">
                      <span className="rounded-lg bg-blue-50 p-2 text-blue-600">
                        {asset.type === "动力设备" ? <Cpu size={18} /> : <Box size={18} />}
                      </span>
                      <div>
                        <div className="text-sm font-bold text-slate-800">{asset.name}</div>
                      </div>
                    </div>
                  </td>
                  <td className="table-td font-mono text-xs text-slate-500">{asset.id}</td>
                  <td className="table-td text-sm text-slate-600">{asset.type}</td>
                  <td className="table-td text-sm text-slate-600">{asset.location}</td>
                  <td className="table-td">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className={`h-full rounded-full ${asset.health > 80 ? "bg-emerald-500" : asset.health > 50 ? "bg-orange-500" : "bg-red-500"}`}
                          style={{ width: `${asset.health}%` }}
                        />
                      </div>
                      <span className="text-xs font-bold text-slate-600">{asset.health}%</span>
                    </div>
                  </td>
                  <td className="table-td">
                    <span
                      className={`rounded-lg px-2 py-1 text-[10px] font-bold uppercase ${
                        asset.status === "Normal"
                          ? "bg-emerald-50 text-emerald-600"
                          : asset.status === "Warning"
                            ? "bg-orange-50 text-orange-600"
                            : "bg-red-50 text-red-600"
                      }`}
                    >
                      {statusLabel(asset.status)}
                    </span>
                  </td>
                  <td className="table-td">
                    <div className="flex items-center justify-center gap-2">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          openDetail(asset);
                        }}
                        className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-700 transition hover:bg-slate-50"
                      >
                        <span className="inline-flex items-center gap-1">
                          <Pencil size={13} /> 详情
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          void removeAsset(asset.id);
                        }}
                        className="rounded-lg border border-red-200 bg-red-50 px-2 py-1.5 text-xs text-red-600 transition hover:bg-red-100"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <PaginationControls
        page={page}
        pageSize={pageSize}
        total={total}
        onPageChange={(nextPage) => setPage(nextPage)}
        onPageSizeChange={(nextSize) => {
          setPageSize(nextSize);
          setPage(1);
        }}
      />

      {showCreateModal && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-slate-900/35 p-4">
          <div className="w-full max-w-3xl rounded-2xl border border-slate-200 bg-white p-5 shadow-xl">
            <h3 className="mb-3 text-lg font-bold text-slate-800">新增资产</h3>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <input
                className="h-10 rounded-xl border border-slate-200 px-3 outline-none focus:border-blue-300"
                placeholder="资产 ID"
                value={createForm.id}
                onChange={(e) => setCreateForm((prev) => ({ ...prev, id: e.target.value }))}
              />
              <input
                className="h-10 rounded-xl border border-slate-200 px-3 outline-none focus:border-blue-300"
                placeholder="资产名称"
                value={createForm.name}
                onChange={(e) => setCreateForm((prev) => ({ ...prev, name: e.target.value }))}
              />
              <input
                className="h-10 rounded-xl border border-slate-200 px-3 outline-none focus:border-blue-300"
                placeholder="资产类型"
                value={createForm.type}
                onChange={(e) => setCreateForm((prev) => ({ ...prev, type: e.target.value }))}
              />
              <input
                className="h-10 rounded-xl border border-slate-200 px-3 outline-none focus:border-blue-300"
                placeholder="部署位置"
                value={createForm.location}
                onChange={(e) => setCreateForm((prev) => ({ ...prev, location: e.target.value }))}
              />
              <input
                className="h-10 rounded-xl border border-slate-200 px-3 outline-none focus:border-blue-300"
                placeholder="模型文件"
                value={createForm.modelFile}
                onChange={(e) => setCreateForm((prev) => ({ ...prev, modelFile: e.target.value }))}
              />
              <input
                type="number"
                className="h-10 rounded-xl border border-slate-200 px-3 outline-none focus:border-blue-300"
                min={0}
                max={100}
                value={createForm.health}
                onChange={(e) => setCreateForm((prev) => ({ ...prev, health: Number(e.target.value) }))}
              />
              <select
                className="h-10 rounded-xl border border-slate-200 px-3 outline-none focus:border-blue-300 md:col-span-2"
                value={createForm.status}
                onChange={(e) => setCreateForm((prev) => ({ ...prev, status: e.target.value as AssetStatus }))}
              >
                <option value="Normal">正常</option>
                <option value="Warning">警告</option>
                <option value="Critical">危险</option>
              </select>
            </div>
            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowCreateModal(false);
                  setCreateForm(emptyForm);
                }}
                className="h-10 rounded-xl border border-slate-200 px-4 text-sm text-slate-700 transition hover:bg-slate-50"
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => void saveCreateAsset()}
                disabled={createSaving}
                className="inline-flex h-10 items-center rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:bg-blue-300"
              >
                {createSaving ? <Loader2 size={14} className="animate-spin" /> : "创建资产"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
