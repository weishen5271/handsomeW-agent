import { Activity, AlertCircle, CheckCircle2, Clock, TrendingUp, Zap } from "lucide-react";

const trendData = [
  { time: "08:00", value: 22 },
  { time: "09:00", value: 28 },
  { time: "10:00", value: 64 },
  { time: "11:00", value: 94 },
  { time: "12:00", value: 51 },
  { time: "13:00", value: 38 },
];

export default function DashboardPanel() {
  return (
    <div className="h-full overflow-y-auto bg-slate-50/30 p-6 md:p-8">
      <header className="mb-6 flex items-end justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-slate-800">系统概览</h2>
          <p className="text-slate-500">实时数字孪生监控与 RCA 状态。</p>
        </div>
        <div className="hidden items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 shadow-sm md:flex">
          <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
          实时同步已激活
        </div>
      </header>

      <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={Activity} label="活动资产" value="1,284" trend="+12" color="blue" />
        <StatCard icon={AlertCircle} label="关键告警" value="3" trend="-2" color="red" />
        <StatCard icon={CheckCircle2} label="RCA 成功率" value="94.2%" trend="+1.4%" color="emerald" />
        <StatCard icon={Clock} label="平均处理时长" value="24m" trend="-8m" color="orange" />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm xl:col-span-2">
          <h3 className="mb-5 flex items-center gap-2 font-bold text-slate-800">
            <TrendingUp size={20} className="text-blue-600" />
            振动遥测趋势 (2 号线)
          </h3>
          <div className="space-y-3">
            {trendData.map((item) => (
              <div key={item.time}>
                <div className="mb-1 flex items-center justify-between text-xs font-semibold text-slate-500">
                  <span>{item.time}</span>
                  <span>{item.value}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full rounded-full bg-blue-500" style={{ width: `${item.value}%` }} />
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="mb-5 flex items-center gap-2 font-bold text-slate-800">
            <Zap size={20} className="text-orange-500" />
            最近 RCA 洞察
          </h3>
          <div className="space-y-4">
            <InsightItem title="检测到轴承磨损" desc="电机 M-102 显示出早期故障迹象。" time="12分钟前" severity="high" />
            <InsightItem title="网络延迟" desc="网关 G-04 报告 200ms 延迟。" time="45分钟前" severity="low" />
            <InsightItem title="油位过低" desc="液压单元 H-22 需要加油。" time="2小时前" severity="medium" />
          </div>
        </section>
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, trend, color }: { icon: typeof Activity; label: string; value: string; trend: string; color: "blue" | "red" | "emerald" | "orange" }) {
  const colors = {
    blue: "bg-blue-50 text-blue-600",
    red: "bg-red-50 text-red-600",
    emerald: "bg-emerald-50 text-emerald-600",
    orange: "bg-orange-50 text-orange-600",
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-3 flex items-start justify-between">
        <span className={`rounded-xl p-3 ${colors[color]}`}>
          <Icon size={20} />
        </span>
        <span className={`rounded-md px-2 py-0.5 text-xs font-bold ${trend.startsWith("+") ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-600"}`}>
          {trend}
        </span>
      </div>
      <div className="text-2xl font-bold text-slate-800">{value}</div>
      <div className="text-sm font-medium text-slate-500">{label}</div>
    </div>
  );
}

function InsightItem({ title, desc, time, severity }: { title: string; desc: string; time: string; severity: "high" | "medium" | "low" }) {
  const severityColor = {
    high: "bg-red-500",
    medium: "bg-orange-500",
    low: "bg-blue-500",
  };

  return (
    <div className="flex gap-3">
      <div className={`h-12 w-1 shrink-0 rounded-full ${severityColor[severity]}`} />
      <div>
        <div className="mb-1 flex items-center gap-2">
          <span className="text-sm font-bold text-slate-800">{title}</span>
          <span className="text-[10px] font-medium text-slate-400">{time}</span>
        </div>
        <p className="text-xs leading-relaxed text-slate-500">{desc}</p>
      </div>
    </div>
  );
}
