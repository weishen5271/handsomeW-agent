import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Box, Cpu, Database, Loader2, Pencil, Plus, Search, Trash2 } from "lucide-react";

export type AssetStatus = "Normal" | "Warning" | "Critical";

export type DigitalAsset = {
  id: string;
  name: string;
  type: string;
  status: AssetStatus;
  location: string;
  health: number;
  modelFile: string;
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
  metadata: Record<string, unknown>;
};

type DigitalAssetsPanelProps = {
  apiBaseUrl: string;
  token: string;
  onOpenModelScene: (asset: DigitalAsset) => void;
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
    metadata: asset.metadata ?? {},
  };
}

export default function DigitalAssetsPanel({ apiBaseUrl, token, onOpenModelScene }: DigitalAssetsPanelProps) {
  const [assets, setAssets] = useState<DigitalAsset[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<AssetStatus | "all">("all");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createSaving, setCreateSaving] = useState(false);
  const [createForm, setCreateForm] = useState<AssetForm>(emptyForm);
  const [detailAssetId, setDetailAssetId] = useState<string | null>(null);
  const [detailSaving, setDetailSaving] = useState(false);
  const [detailForm, setDetailForm] = useState<AssetForm>(emptyForm);
  const [isDetailEditing, setIsDetailEditing] = useState(false);

  const detailAsset = useMemo(
    () => assets.find((asset) => asset.id === detailAssetId) ?? null,
    [assets, detailAssetId],
  );

  const fetchAssets = async () => {
    setLoading(true);
    setError("");
    try {
      const query = new URLSearchParams();
      if (search.trim()) query.set("keyword", search.trim());
      if (statusFilter !== "all") query.set("status", statusFilter);
      const queryText = query.toString();

      const response = await fetch(`${apiBaseUrl}/digital-twin/assets${queryText ? `?${queryText}` : ""}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        throw new Error("资产加载失败");
      }
      const data = (await response.json()) as ApiAsset[];
      setAssets(data.map(toUiAsset));
    } catch (e) {
      setError(e instanceof Error ? e.message : "资产加载失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchAssets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  const openCreate = () => {
    setCreateForm(emptyForm);
    setShowCreateModal(true);
  };

  const openDetail = (asset: DigitalAsset) => {
    setDetailAssetId(asset.id);
    setIsDetailEditing(false);
    setDetailForm({
      id: asset.id,
      name: asset.name,
      type: asset.type,
      status: asset.status,
      location: asset.location,
      health: asset.health,
      modelFile: asset.modelFile,
    });
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
      await fetchAssets();
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
      }
      await fetchAssets();
    } catch (e) {
      setError(e instanceof Error ? e.message : "删除失败");
    }
  };

  if (detailAssetId) {
    return (
      <div className="h-full overflow-y-auto bg-slate-50/30 p-6 md:p-8">
        <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <button
              type="button"
              onClick={() => setDetailAssetId(null)}
              className="mb-2 inline-flex items-center gap-1 text-sm text-slate-500 transition hover:text-slate-700"
            >
              <ArrowLeft size={14} /> 返回数字资产库
            </button>
            <h2 className="text-3xl font-bold tracking-tight text-slate-800">资产详情</h2>
            <p className="text-slate-500">在详情页编辑资产信息，新增资产请使用弹窗操作。</p>
          </div>
          {detailAsset && (
            <div className="flex items-center gap-2">
              {isDetailEditing ? (
                <>
                  <button
                    type="button"
                    onClick={() => void saveDetailAsset()}
                    disabled={detailSaving}
                    className="inline-flex h-10 items-center rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:bg-blue-300"
                  >
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
                    className="h-10 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                  >
                    取消
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => setIsDetailEditing(true)}
                  className="h-10 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  编辑
                </button>
              )}
              <button
                type="button"
                onClick={() => onOpenModelScene(detailAsset)}
                className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-700 transition hover:bg-blue-100"
              >
                模型漫游
              </button>
              <button
                type="button"
                onClick={() => void removeAsset(detailAsset.id)}
                className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-600 transition hover:bg-red-100"
              >
                删除资产
              </button>
            </div>
          )}
        </header>

        {error && <p className="mb-3 text-sm text-red-500">{error}</p>}

        {!detailAsset ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500 shadow-sm">资产不存在或已被删除。</div>
        ) : (
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
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

            <div className="mt-5 flex items-center gap-2">
              <button
                type="button"
                onClick={() => setDetailAssetId(null)}
                className="h-10 rounded-xl border border-slate-200 px-4 text-sm text-slate-700 transition hover:bg-slate-50"
              >
                返回列表
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto bg-slate-50/30 p-6 md:p-8">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-slate-800">数字资产库</h2>
          <p className="text-slate-500">接入 PostgreSQL / MongoDB / Neo4j 的统一资产管理视图（模型漫游仅在资产详情页开启）。</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void fetchAssets()}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-slate-700 transition hover:bg-slate-50"
          >
            <Database size={18} /> 同步资产
          </button>
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-white transition-colors hover:bg-blue-700"
          >
            <Plus size={18} /> 新增资产
          </button>
        </div>
      </header>

      <div className="mb-4 flex flex-wrap gap-3">
        <div className="relative min-w-[240px] flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input
            className="h-11 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-4 outline-none focus:border-blue-300"
            placeholder="搜索资产名称、ID 或位置..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void fetchAssets();
            }}
          />
        </div>
        <select
          className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-blue-300"
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
          onClick={() => void fetchAssets()}
          className="h-11 rounded-xl border border-slate-200 bg-white px-4 text-slate-700 transition hover:bg-slate-50"
        >
          查询
        </button>
      </div>

      {error && <p className="mb-3 text-sm text-red-500">{error}</p>}

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="bg-slate-50">
              <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-slate-400">资产信息</th>
              <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-slate-400">类型</th>
              <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-slate-400">位置</th>
              <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-slate-400">健康度</th>
              <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-slate-400">状态</th>
              <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-slate-400">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-sm text-slate-500">
                  <span className="inline-flex items-center gap-2">
                    <Loader2 size={14} className="animate-spin text-blue-600" /> 资产加载中...
                  </span>
                </td>
              </tr>
            ) : assets.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-sm text-slate-500">
                  暂无资产数据
                </td>
              </tr>
            ) : (
              assets.map((asset) => (
                <tr key={asset.id} className="hover:bg-slate-50/60">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <span className="rounded-lg bg-blue-50 p-2 text-blue-600">
                        {asset.type === "动力设备" ? <Cpu size={18} /> : <Box size={18} />}
                      </span>
                      <div>
                        <div className="text-sm font-bold text-slate-800">{asset.name}</div>
                        <div className="font-mono text-xs text-slate-400">{asset.id}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-600">{asset.type}</td>
                  <td className="px-4 py-3 text-sm text-slate-600">{asset.location}</td>
                  <td className="px-4 py-3">
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
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-lg px-2 py-1 text-[10px] font-bold uppercase ${
                        asset.status === "Normal"
                          ? "bg-emerald-50 text-emerald-600"
                          : asset.status === "Warning"
                            ? "bg-orange-50 text-orange-600"
                            : "bg-red-50 text-red-600"
                      }`}
                    >
                      {asset.status === "Normal" ? "正常" : asset.status === "Warning" ? "警告" : "危险"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => openDetail(asset)}
                        className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-700 transition hover:bg-slate-50"
                      >
                        <span className="inline-flex items-center gap-1">
                          <Pencil size={13} /> 详情
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => void removeAsset(asset.id)}
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
