import { useEffect, useState } from "react";
import { Copy, Database, Eye, Loader2, Trash2, Upload } from "lucide-react";
import PaginationControls from "./PaginationControls";

type ResourceItem = {
  id: string;
  name: string;
  original_file_name: string;
  object_key: string;
  url: string;
  file_size: number;
  content_type: string;
  created_at: string;
  updated_at: string;
};

type ResourceListResponse = {
  items: ResourceItem[];
  page: number;
  page_size: number;
  total: number;
};

type ResourceManagementPanelProps = {
  apiBaseUrl: string;
  token: string;
  onPreviewModel: (resource: { name: string; url: string; objectKey: string }) => void;
};

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

export default function ResourceManagementPanel({ apiBaseUrl, token, onPreviewModel }: ResourceManagementPanelProps) {
  const [items, setItems] = useState<ResourceItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [total, setTotal] = useState(0);
  const [previewingId, setPreviewingId] = useState<string>("");

  const fetchResources = async (targetPage = page, targetPageSize = pageSize) => {
    setLoading(true);
    setError("");
    try {
      const query = new URLSearchParams({
        page: String(targetPage),
        page_size: String(targetPageSize),
      });
      const response = await fetch(`${apiBaseUrl}/digital-twin/resources?${query.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        throw new Error("资源加载失败");
      }
      const data = (await response.json()) as ResourceListResponse;
      setItems(data.items);
      setTotal(data.total);
    } catch (e) {
      setError(e instanceof Error ? e.message : "资源加载失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchResources();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pageSize]);

  const uploadResource = async (file: File) => {
    setUploading(true);
    setError("");
    setSuccess("");
    try {
      const form = new FormData();
      form.append("file", file);
      const response = await fetch(`${apiBaseUrl}/digital-twin/resources/upload`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      if (!response.ok) {
        throw new Error(`上传失败 (${response.status})`);
      }
      setSuccess(`上传成功：${file.name}`);
      setPage(1);
      await fetchResources(1, pageSize);
    } catch (e) {
      setError(e instanceof Error ? e.message : "上传失败");
    } finally {
      setUploading(false);
    }
  };

  const removeResource = async (id: string) => {
    if (!window.confirm("确认删除该资源吗？")) return;
    setError("");
    try {
      const response = await fetch(`${apiBaseUrl}/digital-twin/resources/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        throw new Error("删除失败");
      }
      await fetchResources(page, pageSize);
    } catch (e) {
      setError(e instanceof Error ? e.message : "删除失败");
    }
  };

  const openPreview = async (item: ResourceItem) => {
    setPreviewingId(item.id);
    setError("");
    try {
      const response = await fetch(`${apiBaseUrl}/digital-twin/resources/${item.id}/preview-url`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        throw new Error("获取预览地址失败");
      }
      const data = (await response.json()) as { preview_url: string };
      onPreviewModel({
        name: item.name,
        url: data.preview_url || item.url,
        objectKey: item.object_key,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "预览失败");
    } finally {
      setPreviewingId("");
    }
  };

  return (
    <div className="h-full overflow-y-auto bg-slate-50/30 p-6 md:p-8">
      <header className="mb-6 flex flex-wrap items-center justify-end gap-2">
        <button type="button" onClick={() => void fetchResources()} className="btn-top-outline gap-2">
          <Database size={16} /> 刷新资源
        </button>
        <label className="btn-top-primary cursor-pointer gap-2">
          {uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
          上传模型
          <input
            type="file"
            accept=".glb,.gltf,.obj,.fbx"
            disabled={uploading}
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              void uploadResource(file);
              e.currentTarget.value = "";
            }}
          />
        </label>
      </header>

      {error && <p className="mb-3 text-sm text-red-500">{error}</p>}
      {success && <p className="mb-3 text-sm text-emerald-600">{success}</p>}

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="bg-slate-50">
              <th className="table-th">资源名</th>
              <th className="table-th">原始文件</th>
              <th className="table-th">大小</th>
              <th className="table-th">对象键</th>
              <th className="table-th">URL</th>
              <th className="table-th">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-sm text-slate-500">
                  <span className="inline-flex items-center gap-2">
                    <Loader2 size={14} className="animate-spin text-blue-600" /> 资源加载中...
                  </span>
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-sm text-slate-500">
                  暂无资源
                </td>
              </tr>
            ) : (
              items.map((item) => (
                <tr key={item.id}>
                  <td className="table-td text-sm font-semibold text-slate-700">{item.name}</td>
                  <td className="table-td text-xs text-slate-600">{item.original_file_name}</td>
                  <td className="table-td text-xs text-slate-600">{formatSize(item.file_size)}</td>
                  <td className="table-td max-w-[220px] truncate font-mono text-[11px] text-slate-600" title={item.object_key}>
                    {item.object_key}
                  </td>
                  <td className="table-td max-w-[220px] truncate font-mono text-[11px] text-slate-600" title={item.url}>
                    {item.url}
                  </td>
                  <td className="table-td">
                    <div className="flex items-center justify-center gap-2">
                      <button
                        type="button"
                        onClick={() => void openPreview(item)}
                        disabled={previewingId === item.id}
                        className="rounded-lg border border-blue-200 bg-blue-50 px-2 py-1.5 text-xs text-blue-700 transition hover:bg-blue-100"
                      >
                        {previewingId === item.id ? <Loader2 size={13} className="animate-spin" /> : <Eye size={13} />}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          void navigator.clipboard.writeText(item.url);
                          setSuccess(`已复制资源 URL：${item.original_file_name}`);
                        }}
                        className="btn-top-outline"
                      >
                        <Copy size={13} />
                      </button>
                      <button
                        type="button"
                        onClick={() => void removeResource(item.id)}
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
        onPageChange={(next) => setPage(next)}
        onPageSizeChange={(nextSize) => {
          setPageSize(nextSize);
          setPage(1);
        }}
      />
    </div>
  );
}
