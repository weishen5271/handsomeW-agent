import { Activity, Globe, Server, ShieldCheck } from "lucide-react";

export default function SystemStatusPanel() {
  return (
    <div className="h-full overflow-y-auto bg-slate-50/30 p-6 md:p-8">
      <header className="mb-6">
        <h2 className="text-3xl font-bold tracking-tight text-slate-800">系统状态</h2>
        <p className="text-slate-500">监控核心引擎、检索链路及数据同步状态。</p>
      </header>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="mb-4 flex items-center gap-2 font-bold text-slate-800">
              <Server size={20} className="text-blue-600" />
              核心服务运行状态
            </h3>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <ServiceStatusItem name="Graph-RAG 引擎" status="Healthy" uptime="99.98%" latency="145ms" />
              <ServiceStatusItem name="数字孪生同步服务" status="Healthy" uptime="99.95%" latency="42ms" />
              <ServiceStatusItem name="向量数据库" status="Healthy" uptime="100%" latency="12ms" />
              <ServiceStatusItem name="图数据库" status="Warning" uptime="98.2%" latency="450ms" />
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="mb-4 flex items-center gap-2 font-bold text-slate-800">
              <Activity size={20} className="text-blue-600" />
              实时资源占用
            </h3>
            <div className="space-y-4">
              <ResourceProgress label="CPU 负载" value={42} color="blue" />
              <ResourceProgress label="内存占用" value={68} color="indigo" />
              <ResourceProgress label="GPU 推理负载" value={85} color="violet" />
              <ResourceProgress label="存储空间" value={24} color="emerald" />
            </div>
          </section>
        </div>

        <div className="space-y-6">
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="mb-4 flex items-center gap-2 font-bold text-slate-800">
              <ShieldCheck size={20} className="text-emerald-500" />
              安全与审计
            </h3>
            <div className="space-y-3 text-sm text-slate-600">
              <InfoRow label="数据加密状态" value="AES-256 已开启" />
              <InfoRow label="最近审计时间" value="10分钟前" />
              <InfoRow label="异常访问拦截" value="0 次 (24h)" />
            </div>
          </section>

          <section className="rounded-2xl bg-slate-900 p-6 text-white shadow-xl">
            <div className="mb-4 flex items-center gap-2">
              <Globe size={18} className="text-blue-300" />
              <span className="font-bold">全球节点状态</span>
            </div>
            <div className="space-y-2 text-sm">
              <NodeRow name="华东节点 (上海)" status="在线" statusColor="text-emerald-400" />
              <NodeRow name="华南节点 (深圳)" status="在线" statusColor="text-emerald-400" />
              <NodeRow name="海外节点 (新加坡)" status="延迟" statusColor="text-orange-400" />
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function ServiceStatusItem({ name, status, uptime, latency }: { name: string; status: "Healthy" | "Warning"; uptime: string; latency: string }) {
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-bold text-slate-800">{name}</span>
        <span className={`h-2 w-2 rounded-full ${status === "Healthy" ? "bg-emerald-500" : "bg-orange-500"}`} />
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div>
          <div className="text-slate-400">在线率</div>
          <div className="font-semibold text-slate-700">{uptime}</div>
        </div>
        <div>
          <div className="text-slate-400">延迟</div>
          <div className="font-semibold text-slate-700">{latency}</div>
        </div>
      </div>
    </div>
  );
}

function ResourceProgress({ label, value, color }: { label: string; value: number; color: "blue" | "indigo" | "violet" | "emerald" }) {
  const colors = {
    blue: "bg-blue-500",
    indigo: "bg-indigo-500",
    violet: "bg-violet-500",
    emerald: "bg-emerald-500",
  };

  return (
    <div>
      <div className="mb-1 flex justify-between text-xs font-semibold text-slate-600">
        <span>{label}</span>
        <span className="text-slate-800">{value}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-slate-100">
        <div className={`h-full rounded-full ${colors[color]}`} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-xl bg-slate-50 p-3">
      <span>{label}</span>
      <span className="font-bold text-slate-800">{value}</span>
    </div>
  );
}

function NodeRow({ name, status, statusColor }: { name: string; status: string; statusColor: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-slate-300">{name}</span>
      <span className={`font-bold ${statusColor}`}>{status}</span>
    </div>
  );
}
