import { Bell, CheckCircle2, Clock, Info, ShieldAlert } from "lucide-react";

const alarms = [
  { id: "ALM-001", asset: "主电机 M-102", severity: "High", message: "检测到异常振动频率 (8.5mm/s)", time: "12分钟前", status: "Active" },
  { id: "ALM-002", asset: "液压单元 H-22", severity: "Critical", message: "液压油压力低于安全阈值 (15 bar)", time: "45分钟前", status: "Active" },
  { id: "ALM-003", asset: "网关 G-04", severity: "Low", message: "网络延迟超过 200ms", time: "1小时前", status: "Acknowledged" },
  { id: "ALM-004", asset: "输送带 C-201", severity: "Medium", message: "电机温度过高 (85°C)", time: "2小时前", status: "Resolved" },
];

export default function AlarmsPanel() {
  return (
    <div className="h-full overflow-y-auto bg-slate-50/30 p-6 md:p-8">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-slate-800">告警中心</h2>
          <p className="text-slate-500">实时监控全厂告警事件，支持快速响应与 RCA 分析。</p>
        </div>
        <div className="flex gap-2">
          <button className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-slate-600 hover:bg-slate-50">
            <CheckCircle2 size={16} /> 全部已读
          </button>
          <button className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-white hover:bg-blue-700">
            <Bell size={16} /> 订阅通知
          </button>
        </div>
      </header>

      <div className="space-y-3">
        {alarms.map((alarm) => (
          <article
            key={alarm.id}
            className={`flex items-center gap-4 rounded-2xl border bg-white p-4 shadow-sm ${
              alarm.severity === "Critical"
                ? "border-red-200"
                : alarm.severity === "High"
                  ? "border-orange-200"
                  : "border-slate-200"
            }`}
          >
            <div
              className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${
                alarm.severity === "Critical"
                  ? "bg-red-100 text-red-600"
                  : alarm.severity === "High"
                    ? "bg-orange-100 text-orange-600"
                    : "bg-blue-100 text-blue-600"
              }`}
            >
              {alarm.severity === "Critical" || alarm.severity === "High" ? <ShieldAlert size={20} /> : <Info size={20} />}
            </div>

            <div className="min-w-0 flex-1">
              <div className="mb-1 flex items-center gap-2">
                <span className="text-sm font-bold text-slate-800">{alarm.asset}</span>
                <span className="font-mono text-xs text-slate-400">{alarm.id}</span>
              </div>
              <p className="text-sm text-slate-600">{alarm.message}</p>
            </div>

            <div className="shrink-0 text-right">
              <div className="mb-1 inline-flex items-center gap-1 text-xs text-slate-400">
                <Clock size={12} /> {alarm.time}
              </div>
              <div
                className={`rounded-full px-3 py-1 text-xs font-bold ${
                  alarm.status === "Active"
                    ? "bg-red-50 text-red-600"
                    : alarm.status === "Acknowledged"
                      ? "bg-blue-50 text-blue-600"
                      : "bg-emerald-50 text-emerald-600"
                }`}
              >
                {alarm.status === "Active" ? "待处理" : alarm.status === "Acknowledged" ? "已确认" : "已解决"}
              </div>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
