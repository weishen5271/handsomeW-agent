import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Loader2, Plus, RefreshCw, Save, Search, Trash2, X } from "lucide-react";
import PaginationControls from "./PaginationControls";

type AssetStatus = "Normal" | "Warning" | "Critical";

type ApiAsset = {
  id: string;
  name: string;
  type: string;
  status: AssetStatus;
  location: string;
  health: number;
  model_file: string;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

type ApiSceneSummary = {
  id: string;
  name: string;
  description: string;
  created_at: string;
  updated_at: string;
  asset_count: number;
};

type SceneListResponse = {
  items: ApiSceneSummary[];
  page: number;
  page_size: number;
  total: number;
};

type ApiSceneRelation = {
  source_asset_id: string;
  target_asset_id: string;
  relation_type: string;
  created_at?: string | null;
};

type ApiSceneDetail = {
  scene_id: string;
  name: string;
  description: string;
  created_at: string;
  updated_at: string;
  asset_count: number;
  instances: Array<{ asset_id: string }>;
  relations: ApiSceneRelation[];
};

type RelationFormItem = {
  source_asset_id: string;
  target_asset_id: string;
  relation_type: string;
};

type SceneConfigPanelProps = {
  apiBaseUrl: string;
  token: string;
};

function relationTypeLabel(relationType: string): string {
  if (relationType === "upstream") return "上游";
  if (relationType === "downstream") return "下游";
  if (relationType === "depends_on") return "依赖";
  if (relationType === "controls") return "控制";
  return relationType;
}

const emptySceneForm = {
  id: "",
  name: "",
  description: "",
};

export default function SceneConfigPanel({ apiBaseUrl, token }: SceneConfigPanelProps) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [sceneKeyword, setSceneKeyword] = useState("");
  const [scenes, setScenes] = useState<ApiSceneSummary[]>([]);
  const [scenePage, setScenePage] = useState(1);
  const [scenePageSize, setScenePageSize] = useState(10);
  const [sceneTotal, setSceneTotal] = useState(0);
  const [selectedSceneId, setSelectedSceneId] = useState<string | null>(null);
  const [sceneDetail, setSceneDetail] = useState<ApiSceneDetail | null>(null);
  const [showSceneDetail, setShowSceneDetail] = useState(false);

  const [allAssets, setAllAssets] = useState<ApiAsset[]>([]);
  const [selectedAssetIds, setSelectedAssetIds] = useState<string[]>([]);
  const [relationItems, setRelationItems] = useState<RelationFormItem[]>([]);
  const [showGraphModal, setShowGraphModal] = useState(false);

  const [showCreateScene, setShowCreateScene] = useState(false);
  const [createSceneForm, setCreateSceneForm] = useState(emptySceneForm);
  const [editSceneForm, setEditSceneForm] = useState({ name: "", description: "" });

  const apiRequest = async <T,>(path: string, init: RequestInit = {}): Promise<T> => {
    const headers = new Headers(init.headers ?? {});
    if (!headers.has("Content-Type") && init.body) {
      headers.set("Content-Type", "application/json");
    }
    headers.set("Authorization", `Bearer ${token}`);

    const response = await fetch(`${apiBaseUrl}${path}`, {
      ...init,
      headers,
    });

    if (!response.ok) {
      let message = `请求失败 (${response.status})`;
      try {
        const data = (await response.json()) as { detail?: unknown };
        if (typeof data.detail === "string") {
          message = data.detail;
        }
      } catch {
        // ignore
      }
      throw new Error(message);
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return (await response.json()) as T;
  };

  const fetchScenes = async (targetPage = scenePage, targetPageSize = scenePageSize) => {
    setLoading(true);
    setError("");
    try {
      const query = new URLSearchParams();
      if (sceneKeyword.trim()) query.set("keyword", sceneKeyword.trim());
      query.set("page", String(targetPage));
      query.set("page_size", String(targetPageSize));
      const data = await apiRequest<SceneListResponse>(`/digital-twin/scenes?${query.toString()}`);
      setScenes(data.items);
      setSceneTotal(data.total);
      const totalPages = Math.max(1, Math.ceil(data.total / targetPageSize));
      if (targetPage > totalPages) {
        setScenePage(totalPages);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载场景失败");
    } finally {
      setLoading(false);
    }
  };

  const fetchAllAssets = async () => {
    try {
      const list = await apiRequest<{ items: ApiAsset[] }>("/digital-twin/assets?page=1&page_size=200");
      setAllAssets(list.items);
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载资产失败");
    }
  };

  const fetchSceneDetail = async (sceneId: string) => {
    setLoading(true);
    setError("");
    try {
      const detail = await apiRequest<ApiSceneDetail>(`/digital-twin/scenes/${sceneId}`);
      setSceneDetail(detail);
      setEditSceneForm({ name: detail.name, description: detail.description });
      setSelectedAssetIds(detail.instances.map((item) => item.asset_id));
      setRelationItems(
        detail.relations.map((item) => ({
          source_asset_id: item.source_asset_id,
          target_asset_id: item.target_asset_id,
          relation_type: item.relation_type,
        })),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载场景详情失败");
      setSceneDetail(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchScenes();
    void fetchAllAssets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scenePage, scenePageSize]);

  const selectedAssets = useMemo(
    () => allAssets.filter((asset) => selectedAssetIds.includes(asset.id)),
    [allAssets, selectedAssetIds],
  );
  const graphNodes = useMemo(() => {
    const count = Math.max(selectedAssets.length, 1);
    const centerX = 340;
    const centerY = 220;
    const radius = 150;
    const baseAngle = -Math.PI / 2;
    return selectedAssets.map((asset, idx) => {
      const angle = baseAngle + (2 * Math.PI * idx) / count;
      return {
        ...asset,
        x: centerX + radius * Math.cos(angle),
        y: centerY + radius * Math.sin(angle),
      };
    });
  }, [selectedAssets]);
  const graphNodeMap = useMemo(() => {
    return Object.fromEntries(graphNodes.map((node) => [node.id, node]));
  }, [graphNodes]);

  const addRelation = () => {
    if (selectedAssetIds.length < 2) {
      setError("请先在场景中至少选择 2 个资产，再配置上下游关系");
      return;
    }
    setRelationItems((prev) => [
      ...prev,
      {
        source_asset_id: selectedAssetIds[0],
        target_asset_id: selectedAssetIds[1],
        relation_type: "upstream",
      },
    ]);
  };

  const openSceneDetail = async (sceneId: string) => {
    setSelectedSceneId(sceneId);
    setShowSceneDetail(true);
    await fetchSceneDetail(sceneId);
  };

  const createScene = async () => {
    if (!createSceneForm.id.trim() || !createSceneForm.name.trim()) {
      setError("请填写场景 ID 和名称");
      return;
    }

    setSaving(true);
    setError("");
    setSuccess("");
    try {
      await apiRequest<ApiSceneSummary>("/digital-twin/scenes", {
        method: "POST",
        body: JSON.stringify({
          id: createSceneForm.id.trim(),
          name: createSceneForm.name.trim(),
          description: createSceneForm.description.trim(),
        }),
      });
      setCreateSceneForm(emptySceneForm);
      setShowCreateScene(false);
      setSuccess("场景创建成功");
      setScenePage(1);
      await fetchScenes(1, scenePageSize);
    } catch (e) {
      setError(e instanceof Error ? e.message : "创建场景失败");
    } finally {
      setSaving(false);
    }
  };

  const saveSceneMeta = async () => {
    if (!selectedSceneId) return;
    if (!editSceneForm.name.trim()) {
      setError("场景名称不能为空");
      return;
    }

    setSaving(true);
    setError("");
    setSuccess("");
    try {
      await apiRequest<ApiSceneSummary>(`/digital-twin/scenes/${selectedSceneId}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: editSceneForm.name.trim(),
          description: editSceneForm.description.trim(),
        }),
      });
      setSuccess("场景信息已更新");
      await fetchScenes(scenePage, scenePageSize);
      await fetchSceneDetail(selectedSceneId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "场景信息更新失败");
    } finally {
      setSaving(false);
    }
  };

  const saveSceneAssets = async () => {
    if (!selectedSceneId) return;

    setSaving(true);
    setError("");
    setSuccess("");
    try {
      await apiRequest<ApiAsset[]>(`/digital-twin/scenes/${selectedSceneId}/assets`, {
        method: "PUT",
        body: JSON.stringify({ asset_ids: selectedAssetIds }),
      });

      // 资产变更后移除已失效关系
      setRelationItems((prev) =>
        prev.filter(
          (item) => selectedAssetIds.includes(item.source_asset_id) && selectedAssetIds.includes(item.target_asset_id),
        ),
      );

      setSuccess("场景资产已保存");
      await fetchScenes(scenePage, scenePageSize);
      await fetchSceneDetail(selectedSceneId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存场景资产失败");
    } finally {
      setSaving(false);
    }
  };

  const saveSceneRelations = async () => {
    if (!selectedSceneId) return;

    const invalid = relationItems.some(
      (item) => !selectedAssetIds.includes(item.source_asset_id) || !selectedAssetIds.includes(item.target_asset_id),
    );
    if (invalid) {
      setError("存在关系使用了未绑定到当前场景的资产，请先修正");
      return;
    }

    setSaving(true);
    setError("");
    setSuccess("");
    try {
      await apiRequest<ApiSceneRelation[]>(`/digital-twin/scenes/${selectedSceneId}/relations`, {
        method: "PUT",
        body: JSON.stringify({ relations: relationItems }),
      });
      setSuccess("场景上下游关系已保存到图数据库");
      await fetchSceneDetail(selectedSceneId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存场景关系失败");
    } finally {
      setSaving(false);
    }
  };

  const removeScene = async (sceneId: string) => {
    if (!window.confirm(`确认删除场景 ${sceneId} 吗？`)) return;

    setSaving(true);
    setError("");
    setSuccess("");
    try {
      await apiRequest<{ status: string }>(`/digital-twin/scenes/${sceneId}`, { method: "DELETE" });
      setSuccess("场景已删除");
      if (showSceneDetail && selectedSceneId === sceneId) {
        setShowSceneDetail(false);
        setSelectedSceneId(null);
        setSceneDetail(null);
      }
      await fetchScenes(scenePage, scenePageSize);
    } catch (e) {
      setError(e instanceof Error ? e.message : "删除场景失败");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto bg-[var(--color-surface-raised)]/30 p-6 md:p-8">
      <header className="mb-6 flex flex-wrap items-center justify-end gap-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              if (showSceneDetail && selectedSceneId) {
                void fetchSceneDetail(selectedSceneId);
                return;
              }
              void fetchScenes();
            }}
            className="btn-secondary"
          >
            <RefreshCw size={14} /> 刷新
          </button>
          <button
            type="button"
            onClick={() => setShowCreateScene((v) => !v)}
            className="btn-primary"
          >
            <Plus size={14} /> 新建场景
          </button>
        </div>
      </header>

      {(error || success) && (
        <div className="mb-4 space-y-2">
          {error && <p className="rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
          {success && <p className="rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-sm text-emerald-600">{success}</p>}
        </div>
      )}

      {showCreateScene && (
        <section className="card mb-5 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-sm">
          <h3 className="mb-3 font-bold text-[var(--color-text)]">新建场景</h3>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <input
              value={createSceneForm.id}
              onChange={(e) => setCreateSceneForm((prev) => ({ ...prev, id: e.target.value }))}
              placeholder="场景 ID（如 factory-main）"
              className="h-10 rounded-xl border border-[var(--color-border)] px-3 outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
            />
            <input
              value={createSceneForm.name}
              onChange={(e) => setCreateSceneForm((prev) => ({ ...prev, name: e.target.value }))}
              placeholder="场景名称"
              className="h-10 rounded-xl border border-[var(--color-border)] px-3 outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => void createScene()}
                disabled={saving}
                className="btn-primary"
              >
                {saving ? <Loader2 size={14} className="animate-spin" /> : "创建"}
              </button>
              <button
                type="button"
                onClick={() => setShowCreateScene(false)}
                className="btn-secondary"
              >
                取消
              </button>
            </div>
          </div>
          <textarea
            value={createSceneForm.description}
            onChange={(e) => setCreateSceneForm((prev) => ({ ...prev, description: e.target.value }))}
            placeholder="场景描述（可选）"
            rows={3}
            className="mt-3 w-full rounded-xl border border-[var(--color-border)] px-3 py-2 outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
          />
        </section>
      )}

      {!showSceneDetail ? (
        <section className="card rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-sm">
          <div className="mb-3 flex flex-wrap items-center justify-end gap-2">
            <div className="relative">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={sceneKeyword}
                onChange={(e) => setSceneKeyword(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    setScenePage(1);
                    void fetchScenes(1, scenePageSize);
                  }
                }}
                placeholder="输入关键字后回车"
                className="h-9 w-56 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] pl-8 pr-3 text-xs outline-none focus:border-blue-300"
              />
            </div>
            <button
              type="button"
              onClick={() => {
                setScenePage(1);
                void fetchScenes(1, scenePageSize);
              }}
              className="btn-secondary"
            >
              查询
            </button>
          </div>
          <div className="max-h-[620px] overflow-y-auto rounded-xl border border-[var(--color-border)]">
            {loading && scenes.length === 0 ? (
              <div className="px-3 py-4 text-sm text-[var(--color-text-weak)]">
                <span className="inline-flex items-center gap-2">
                  <Loader2 size={14} className="animate-spin text-blue-600" /> 加载场景中...
                </span>
              </div>
            ) : scenes.length === 0 ? (
              <p className="bg-[var(--color-surface-raised)] p-3 text-sm text-[var(--color-text-weak)]">暂无场景，请先创建。</p>
            ) : (
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="bg-[var(--color-surface-raised)]">
                    <th className="table-header">场景名称</th>
                    <th className="table-header">场景ID</th>
                    <th className="table-header">资产数</th>
                    <th className="table-header">更新时间</th>
                    <th className="table-header">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {scenes.map((scene) => (
                    <tr key={scene.id} className="transition hover:bg-[var(--color-surface-raised)]">
                      <td className="table-cell text-sm font-semibold text-[var(--color-text)]">{scene.name}</td>
                      <td className="table-cell font-mono text-xs text-[var(--color-text-weak)]">{scene.id}</td>
                      <td className="table-cell text-sm text-[var(--color-text)]">{scene.asset_count}</td>
                      <td className="table-cell text-xs text-[var(--color-text-weak)]">{new Date(scene.updated_at).toLocaleDateString()}</td>
                      <td className="table-cell">
                        <button
                          type="button"
                          onClick={() => void openSceneDetail(scene.id)}
                          className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-xs text-[var(--color-text)] transition hover:bg-[var(--color-surface-raised)]"
                        >
                          详情
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          <PaginationControls
            page={scenePage}
            pageSize={scenePageSize}
            total={sceneTotal}
            onPageChange={(nextPage) => setScenePage(nextPage)}
            onPageSizeChange={(nextSize) => {
              setScenePageSize(nextSize);
              setScenePage(1);
            }}
          />
        </section>
      ) : (
        <section className="space-y-5">
          <div>
            <button
              type="button"
              onClick={() => {
                setShowSceneDetail(false);
                setSelectedSceneId(null);
                setSceneDetail(null);
              }}
              className="inline-flex items-center gap-1 text-sm text-[var(--color-text-weak)] transition hover:text-[var(--color-text)]"
            >
              <ArrowLeft size={14} /> 返回场景列表
            </button>
          </div>
          {!sceneDetail ? (
            <div className="card rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-8 text-sm text-[var(--color-text-weak)] shadow-sm">场景详情加载中...</div>
          ) : (
            <>
              <div className="card rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-sm">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="font-bold text-[var(--color-text)]">场景信息</h3>
                  <button
                    type="button"
                    onClick={() => void removeScene(sceneDetail.scene_id)}
                    className="btn-danger"
                  >
                    <Trash2 size={14} /> 删除场景
                  </button>
                </div>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <input
                    value={editSceneForm.name}
                    onChange={(e) => setEditSceneForm((prev) => ({ ...prev, name: e.target.value }))}
                    placeholder="场景名称"
                    className="h-10 rounded-xl border border-[var(--color-border)] px-3 outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
                  />
                  <div className="inline-flex h-10 items-center rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-raised)] px-3 font-mono text-sm text-[var(--color-text-weak)]">
                    {sceneDetail.scene_id}
                  </div>
                </div>
                <textarea
                  value={editSceneForm.description}
                  onChange={(e) => setEditSceneForm((prev) => ({ ...prev, description: e.target.value }))}
                  rows={3}
                  className="mt-3 w-full rounded-xl border border-[var(--color-border)] px-3 py-2 outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
                  placeholder="场景描述"
                />
                <button
                  type="button"
                  onClick={() => void saveSceneMeta()}
                  disabled={saving}
                  className="btn-primary mt-3"
                >
                  {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} 保存场景信息
                </button>
              </div>

              <div className="card rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-sm">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="font-bold text-[var(--color-text)]">资产选择（场景隔离）</h3>
                  <button
                    type="button"
                    onClick={() => void saveSceneAssets()}
                    disabled={saving}
                    className="btn-primary"
                  >
                    {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} 保存资产
                  </button>
                </div>
                <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                  {allAssets.map((asset) => {
                    const checked = selectedAssetIds.includes(asset.id);
                    return (
                      <label key={asset.id} className="flex items-center gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-raised)] px-3 py-2 text-sm">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedAssetIds((prev) => Array.from(new Set([...prev, asset.id])));
                            } else {
                              setSelectedAssetIds((prev) => prev.filter((id) => id !== asset.id));
                            }
                          }}
                        />
                        <span className="font-mono text-xs text-[var(--color-text-weak)]">{asset.id}</span>
                        <span className="font-semibold text-[var(--color-text)]">{asset.name}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="card rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-sm">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="font-bold text-[var(--color-text)]">上下游关系（图数据库）</h3>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setShowGraphModal(true)}
                      className="btn-secondary"
                    >
                      查看图结构
                    </button>
                    <button
                      type="button"
                      onClick={addRelation}
                      className="btn-secondary"
                    >
                      <Plus size={14} /> 新增关系
                    </button>
                    <button
                      type="button"
                      onClick={() => void saveSceneRelations()}
                      disabled={saving}
                      className="btn-primary"
                    >
                      {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} 保存关系
                    </button>
                  </div>
                </div>

                {selectedAssets.length < 2 ? (
                  <p className="rounded-xl bg-[var(--color-surface-raised)] p-3 text-sm text-[var(--color-text-weak)]">当前场景资产不足 2 个，无法配置上下游关系。</p>
                ) : relationItems.length === 0 ? (
                  <p className="rounded-xl bg-[var(--color-surface-raised)] p-3 text-sm text-[var(--color-text-weak)]">暂无关系，点击“新增关系”开始配置。</p>
                ) : (
                  <div className="space-y-2">
                    {relationItems.map((item, idx) => (
                      <div key={`${item.source_asset_id}-${item.target_asset_id}-${idx}`} className="grid grid-cols-1 gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-raised)] p-3 md:grid-cols-12">
                        <select
                          value={item.source_asset_id}
                          onChange={(e) =>
                            setRelationItems((prev) =>
                              prev.map((row, rowIdx) => (rowIdx === idx ? { ...row, source_asset_id: e.target.value } : row)),
                            )
                          }
                          className="h-10 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-2 text-sm outline-none md:col-span-4"
                        >
                          {selectedAssets.map((asset) => (
                            <option key={`src-${asset.id}`} value={asset.id}>
                              {asset.id} - {asset.name}
                            </option>
                          ))}
                        </select>
                        <select
                          value={item.relation_type}
                          onChange={(e) =>
                            setRelationItems((prev) =>
                              prev.map((row, rowIdx) => (rowIdx === idx ? { ...row, relation_type: e.target.value } : row)),
                            )
                          }
                          className="h-10 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-2 text-sm outline-none md:col-span-3"
                        >
                          <option value="upstream">{relationTypeLabel("upstream")}</option>
                          <option value="downstream">{relationTypeLabel("downstream")}</option>
                          <option value="depends_on">{relationTypeLabel("depends_on")}</option>
                          <option value="controls">{relationTypeLabel("controls")}</option>
                        </select>
                        <select
                          value={item.target_asset_id}
                          onChange={(e) =>
                            setRelationItems((prev) =>
                              prev.map((row, rowIdx) => (rowIdx === idx ? { ...row, target_asset_id: e.target.value } : row)),
                            )
                          }
                          className="h-10 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-2 text-sm outline-none md:col-span-4"
                        >
                          {selectedAssets.map((asset) => (
                            <option key={`dst-${asset.id}`} value={asset.id}>
                              {asset.id} - {asset.name}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={() => setRelationItems((prev) => prev.filter((_, rowIdx) => rowIdx !== idx))}
                          className="inline-flex h-10 items-center justify-center rounded-xl border border-red-200 bg-red-50 text-red-600 transition hover:bg-red-100 md:col-span-1"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </section>
      )}

      {showGraphModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
          <div className="card w-full max-w-4xl rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-2xl">
            <div className="flex items-center justify-between border-b border-[var(--color-border)] px-5 py-3">
              <div>
                <h3 className="font-bold text-[var(--color-text)]">场景上下游图结构</h3>
                <p className="text-xs text-[var(--color-text-weak)]">基于当前场景已选资产和关系配置渲染</p>
              </div>
              <button
                type="button"
                onClick={() => setShowGraphModal(false)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--color-border)] text-[var(--color-text-weak)] transition hover:bg-[var(--color-surface-raised)]"
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-4">
              {graphNodes.length === 0 ? (
                <p className="rounded-xl bg-[var(--color-surface-raised)] p-4 text-sm text-[var(--color-text-weak)]">当前场景还未选择资产。</p>
              ) : relationItems.length === 0 ? (
                <p className="rounded-xl bg-[var(--color-surface-raised)] p-4 text-sm text-[var(--color-text-weak)]">当前场景还没有配置上下游关系。</p>
              ) : (
                <div className="overflow-auto rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-raised)]">
                  <svg width={680} height={440} viewBox="0 0 680 440" className="block min-w-[680px]">
                    <defs>
                      <marker id="arrowHead" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                        <path d="M 0 0 L 10 5 L 0 10 z" fill="#2563eb" />
                      </marker>
                    </defs>

                    {relationItems.map((rel, idx) => {
                      const source = graphNodeMap[rel.source_asset_id];
                      const target = graphNodeMap[rel.target_asset_id];
                      if (!source || !target) return null;
                      const midX = (source.x + target.x) / 2;
                      const midY = (source.y + target.y) / 2;
                      return (
                        <g key={`${rel.source_asset_id}-${rel.target_asset_id}-${rel.relation_type}-${idx}`}>
                          <line
                            x1={source.x}
                            y1={source.y}
                            x2={target.x}
                            y2={target.y}
                            stroke="#2563eb"
                            strokeWidth={2}
                            markerEnd="url(#arrowHead)"
                          />
                          <rect x={midX - 34} y={midY - 10} width={68} height={20} rx={8} fill="#eff6ff" stroke="#bfdbfe" />
                          <text x={midX} y={midY + 4} textAnchor="middle" fontSize="10" fill="#1d4ed8">
                            {rel.relation_type}
                          </text>
                        </g>
                      );
                    })}

                    {graphNodes.map((node) => (
                      <g key={node.id}>
                        <circle cx={node.x} cy={node.y} r={28} fill="#ffffff" stroke="#0f172a" strokeWidth={2} />
                        <text x={node.x} y={node.y - 2} textAnchor="middle" fontSize="11" fontWeight={700} fill="#0f172a">
                          {node.id}
                        </text>
                        <text x={node.x} y={node.y + 12} textAnchor="middle" fontSize="10" fill="#475569">
                          {node.name.length > 6 ? `${node.name.slice(0, 6)}...` : node.name}
                        </text>
                      </g>
                    ))}
                  </svg>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
