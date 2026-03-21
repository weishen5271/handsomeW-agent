import { Box, Cpu, Database, Filter, MoreVertical, Search } from "lucide-react";

const assets = [
  { id: "M-102", name: "主电机", type: "动力设备", status: "Warning", location: "2号生产线", health: 68 },
  { id: "C-201", name: "输送带控制器", type: "控制单元", status: "Normal", location: "2号生产线", health: 98 },
  { id: "S-05", name: "振动传感器", type: "传感器", status: "Normal", location: "1号生产线", health: 95 },
  { id: "H-22", name: "液压单元", type: "动力设备", status: "Critical", location: "3号生产线", health: 32 },
  { id: "G-04", name: "工业网关", type: "通信设备", status: "Normal", location: "全厂区", health: 88 },
];

export default function DigitalAssetsPanel() {
  return (
    <div className="h-full overflow-y-auto bg-slate-50/30 p-6 md:p-8">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-slate-800">数字资产库</h2>
          <p className="text-slate-500">管理全厂区数字孪生资产及健康状态。</p>
        </div>
        <button className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-white transition-colors hover:bg-blue-700">
          <Database size={18} /> 同步资产
        </button>
      </header>

      <div className="mb-6 flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input
            className="h-11 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-4 outline-none focus:border-blue-300"
            placeholder="搜索资产名称、ID 或位置..."
          />
        </div>
        <button className="inline-flex h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-slate-600 hover:bg-slate-50">
          <Filter size={18} /> 筛选
        </button>
      </div>

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
            {assets.map((asset) => (
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
                  <button className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600">
                    <MoreVertical size={16} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
