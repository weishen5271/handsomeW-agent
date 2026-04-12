import { Activity, Globe, Server, ShieldCheck } from "lucide-react";

function serviceStatusLabel(status: "Healthy" | "Warning"): string {
  return status === "Healthy" ? "正常" : "告警";
}

export default function SystemStatusPanel() {
  return (
    <div className="h-full overflow-y-auto bg-[var(--color-surface-raised)] p-6 md:p-8">
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <section className="card rounded-2xl p-6">
            <h3 className="mb-4 flex items-center gap-2 font-bold text-[var(--color-text)]">
              <Server size={20} className="text-primary" />
              核心服务运行状态
            </h3>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <ServiceStatusItem name="Graph-RAG 引擎" status="Healthy" uptime="99.98%" latency="145ms" />
              <ServiceStatusItem name="数字孪生同步服务" status="Healthy" uptime="99.95%" latency="42ms" />
              <ServiceStatusItem name="向量数据库" status="Healthy" uptime="100%" latency="12ms" />
              <ServiceStatusItem name="图数据库" status="Warning" uptime="98.2%" latency="450ms" />
            </div>
          </section>

          <section className="card rounded-2xl p-6">
            <h3 className="mb-4 flex items-center gap-2 font-bold text-[var(--color-text)]">
              <Activity size={20} className="text-primary" />
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
          <section className="card rounded-2xl p-6">
            <h3 className="mb-4 flex items-center gap-2 font-bold text-[var(--color-text)]">
              <ShieldCheck size={20} className="text-emerald-500" />
              安全与审计
            </h3>
            <div className="space-y-3 text-sm text-[var(--color-text-weak)]">
              <InfoRow label="数据加密状态" value="AES-256 已开启" />
              <InfoRow label="最近审计时间" value="10分钟前" />
              <InfoRow label="异常访问拦截" value="0 次 (24h)" />
            </div>
          </section>

          <section className="card rounded-2xl bg-[#181d26] p-6 text-white dark:bg-[#0f131a]">
            <div className="mb-4 flex items-center gap-2">
              <Globe size={18} className="text-[rgba(93,138,209,1)]" />
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
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-raised)] p-4">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-bold text-[var(--color-text)]">{name}</span>
        <span className="inline-flex items-center gap-2">
          <span className={`h-2 w-2 rounded-full ${status === "Healthy" ? "bg-emerald-500" : "bg-orange-500"}`} />
          <span className={`text-[11px] font-semibold ${status === "Healthy" ? "text-emerald-600 dark:text-emerald-400" : "text-orange-600 dark:text-orange-400"}`}>
            {serviceStatusLabel(status)}
          </span>
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div>
          <div className="text-[var(--color-text-weak)]">在线率</div>
          <div className="font-semibold text-[var(--color-text)]">{uptime}</div>
        </div>
        <div>
          <div className="text-[var(--color-text-weak)]">延迟</div>
          <div className="font-semibold text-[var(--color-text)]">{latency}</div>
        </div>
      </div>
    </div>
  );
}

function ResourceProgress({ label, value, color }: { label: string; value: number; color: "blue" | "indigo" | "violet" | "emerald" }) {
  const colors = {
    blue: "bg-primary",
    indigo: "bg-indigo-500",
    violet: "bg-violet-500",
    emerald: "bg-emerald-500",
  };

  return (
    <div>
      <div className="mb-1 flex justify-between text-xs font-semibold text-[var(--color-text-weak)]">
        <span>{label}</span>
        <span className="text-[var(--color-text)]">{value}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-[var(--color-surface-raised)]">
        <div className={`h-full rounded-full ${colors[color]}`} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-xl bg-[var(--color-surface-raised)] p-3">
      <span>{label}</span>
      <span className="font-bold text-[var(--color-text)]">{value}</span>
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
