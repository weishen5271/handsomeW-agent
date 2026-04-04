import { useMemo, useState } from "react";
import { Box, RotateCcw } from "lucide-react";
import type { DigitalAsset } from "./DigitalAssetsPanel";

type Scene3DPanelProps = {
  apiBaseUrl: string;
  token: string;
  asset: DigitalAsset | null;
  onBackToAssets: () => void;
};

const FIXED_MODEL = {
  name: "factory-demo.glb",
  version: "v0.1",
  source: "/static/models/factory-demo.glb",
  note: "当前为固定演示模型，暂不支持上传或替换。",
};

export default function Scene3DPanel({ apiBaseUrl: _apiBaseUrl, token: _token, asset, onBackToAssets }: Scene3DPanelProps) {
  const [zoom, setZoom] = useState(1);
  const [rotateY, setRotateY] = useState(22);
  const [tiltX, setTiltX] = useState(18);

  const modelStyle = useMemo(
    () => ({
      transform: `scale(${zoom}) rotateX(${tiltX}deg) rotateY(${rotateY}deg)`,
    }),
    [zoom, rotateY, tiltX],
  );

  if (!asset) {
    return (
      <section className="flex h-full items-center justify-center bg-slate-50/30 p-6">
        <div className="max-w-lg rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
          <h3 className="text-xl font-bold text-slate-800">模型漫游</h3>
          <p className="mt-2 text-slate-500">请先进入资产详情页，再开启当前数字资产的模型漫游。</p>
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
        <div className="space-y-1 text-sm text-slate-600">
          <p>
            当前资产：<span className="font-semibold text-slate-800">{asset.name}</span>
          </p>
          <p>
            模型文件：<span className="font-mono text-slate-700">{FIXED_MODEL.name}</span>
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
        <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-4 shadow-sm">
          <div className="relative h-[440px] overflow-hidden rounded-xl border border-slate-700 bg-[radial-gradient(circle_at_50%_30%,rgba(59,130,246,0.38),rgba(15,23,42,0.9))]">
            <div className="absolute inset-0 flex items-center justify-center [perspective:1200px]">
              <div className="relative h-52 w-52 transition-transform duration-200" style={modelStyle}>
                <div className="absolute inset-0 rounded-2xl border border-blue-200/30 bg-blue-300/20 shadow-[0_0_80px_rgba(59,130,246,0.35)] backdrop-blur-sm" />
                <div className="absolute inset-3 rounded-xl border border-white/25 bg-gradient-to-br from-sky-200/40 to-indigo-400/25" />
                <div className="absolute -bottom-8 left-1/2 h-6 w-40 -translate-x-1/2 rounded-full bg-slate-950/70 blur-md" />
              </div>
            </div>
          </div>
          <p className="mt-3 text-xs text-slate-300">操作：拖动滑条调整缩放和观察角度（当前为固定模型演示）。</p>
        </div>

        <aside className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="mb-4 flex items-center gap-2 text-lg font-bold text-slate-800">
            <Box size={18} className="text-blue-600" /> 演示模型信息
          </h3>

          <div className="space-y-4 text-sm">
            <dl className="space-y-2">
              <div>
                <dt className="text-slate-400">模型名称</dt>
                <dd className="font-semibold text-slate-800">{FIXED_MODEL.name}</dd>
              </div>
              <div>
                <dt className="text-slate-400">版本</dt>
                <dd className="text-slate-700">{FIXED_MODEL.version}</dd>
              </div>
              <div>
                <dt className="text-slate-400">模型来源</dt>
                <dd className="font-mono text-slate-700">{FIXED_MODEL.source}</dd>
              </div>
              <div>
                <dt className="text-slate-400">说明</dt>
                <dd className="text-slate-700">{FIXED_MODEL.note}</dd>
              </div>
            </dl>

            <div className="space-y-2">
              <label className="block space-y-1">
                <span className="text-xs text-slate-500">缩放</span>
                <input
                  type="range"
                  min={0.6}
                  max={1.8}
                  step={0.1}
                  value={zoom}
                  onChange={(e) => setZoom(Number(e.target.value))}
                  className="w-full"
                />
              </label>

              <label className="block space-y-1">
                <span className="text-xs text-slate-500">左右旋转</span>
                <input
                  type="range"
                  min={-55}
                  max={55}
                  step={1}
                  value={rotateY}
                  onChange={(e) => setRotateY(Number(e.target.value))}
                  className="w-full"
                />
              </label>

              <label className="block space-y-1">
                <span className="text-xs text-slate-500">俯仰角</span>
                <input
                  type="range"
                  min={-20}
                  max={35}
                  step={1}
                  value={tiltX}
                  onChange={(e) => setTiltX(Number(e.target.value))}
                  className="w-full"
                />
              </label>
            </div>
          </div>
        </aside>
      </div>
    </section>
  );
}
