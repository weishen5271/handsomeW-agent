import { Box, RotateCcw } from "lucide-react";
import type { DigitalAsset } from "./DigitalAssetsPanel";

type Scene3DPanelProps = {
  asset: DigitalAsset | null;
  onBackToAssets: () => void;
};

export default function Scene3DPanel({ asset, onBackToAssets }: Scene3DPanelProps) {
  if (!asset) {
    return (
      <section className="flex h-full items-center justify-center bg-slate-50/30 p-6">
        <div className="max-w-lg rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
          <h3 className="text-xl font-bold text-slate-800">三维场景</h3>
          <p className="mt-2 text-slate-500">请先在数字资产库中选择一个资产，再进入模型场景。</p>
          <button
            type="button"
            onClick={onBackToAssets}
            className="mt-5 inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-white transition hover:bg-blue-700"
          >
            返回数字资产
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="h-full overflow-y-auto bg-slate-50/30 p-6 md:p-8">
      <div className="mb-5 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-800">三维场景 - {asset.name}</h2>
          <p className="text-slate-500">
            当前模型文件：<span className="font-mono text-slate-700">{asset.modelFile}</span>
          </p>
        </div>
        <button
          type="button"
          onClick={onBackToAssets}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-slate-700 transition hover:bg-slate-50"
        >
          <RotateCcw size={16} /> 返回资产库
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[2fr_1fr]">
        <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-6 shadow-sm">
          <div className="relative flex min-h-[360px] items-center justify-center overflow-hidden rounded-xl border border-slate-700 bg-slate-950/40">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(148,163,184,0.15),transparent_55%)]" />
            <div className="h-44 w-44 animate-spin rounded-2xl border-2 border-cyan-300/60 bg-cyan-300/10" style={{ animationDuration: "8s" }} />
            <div className="absolute bottom-4 rounded-lg bg-slate-900/70 px-3 py-1 text-xs text-slate-200">
              预览对象：{asset.id}
            </div>
          </div>
          <p className="mt-3 text-xs text-slate-300">说明：当前为三维模型占位预览，已完成资产模型参数透传。</p>
        </div>

        <aside className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="mb-4 flex items-center gap-2 text-lg font-bold text-slate-800">
            <Box size={18} className="text-blue-600" /> 资产模型信息
          </h3>
          <dl className="space-y-3 text-sm">
            <div>
              <dt className="text-slate-400">资产名称</dt>
              <dd className="font-semibold text-slate-800">{asset.name}</dd>
            </div>
            <div>
              <dt className="text-slate-400">资产 ID</dt>
              <dd className="font-mono text-slate-700">{asset.id}</dd>
            </div>
            <div>
              <dt className="text-slate-400">部署位置</dt>
              <dd className="text-slate-700">{asset.location}</dd>
            </div>
            <div>
              <dt className="text-slate-400">模型文件</dt>
              <dd className="font-mono text-slate-700">{asset.modelFile}</dd>
            </div>
          </dl>
        </aside>
      </div>
    </section>
  );
}
