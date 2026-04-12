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
    <div className="h-full overflow-y-auto bg-[var(--color-surface-raised)] p-6 md:p-8">
      <div className="mb-4 flex justify-end">
        <div className="hidden items-center gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2 text-sm font-medium text-[var(--color-text-weak)] md:flex">
          <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
          实时同步已激活
        </div>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={Activity} label="活动资产" value="1,284" trend="+12" color="blue" />
        <StatCard icon={AlertCircle} label="关键告警" value="3" trend="-2" color="red" />
        <StatCard icon={CheckCircle2} label="RCA 成功率" value="94.2%" trend="+1.4%" color="emerald" />
        <StatCard icon={Clock} label="平均处理时长" value="24m" trend="-8m" color="orange" />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <section className="card rounded-2xl p-6 xl:col-span-2">
          <h3 className="mb-5 flex items-center gap-2 font-bold text-[var(--color-text)]">
            <TrendingUp size={20} className="text-primary" />
            振动遥测趋势 (2 号线)
          </h3>
          <div className="space-y-3">
            {trendData.map((item) => (
              <div key={item.time}>
                <div className="mb-1 flex items-center justify-between text-xs font-semibold text-[var(--color-text-weak)]">
                  <span>{item.time}</span>
                  <span>{item.value}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-[var(--color-surface-raised)]">
                  <div className="h-full rounded-full bg-primary" style={{ width: `${item.value}%` }} />
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="card rounded-2xl p-6">
          <h3 className="mb-5 flex items-center gap-2 font-bold text-[var(--color-text)]">
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
  const colorStyles = {
    blue: { bg: "bg-[rgba(27,97,201,0.1)]", text: "text-primary" },
    red: { bg: "bg-red-50 dark:bg-red-900/30", text: "text-red-600 dark:text-red-400" },
    emerald: { bg: "bg-emerald-50 dark:bg-emerald-900/30", text: "text-emerald-600 dark:text-emerald-400" },
    orange: { bg: "bg-orange-50 dark:bg-orange-900/30", text: "text-orange-600 dark:text-orange-400" },
  };

  return (
    <div className="card rounded-2xl p-5">
      <div className="mb-3 flex items-start justify-between">
        <span className={`rounded-xl p-3 ${colorStyles[color].bg} ${colorStyles[color].text}`}>
          <Icon size={20} />
        </span>
        <span className={`rounded-md px-2 py-0.5 text-xs font-bold ${trend.startsWith("+") ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400" : "bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-400"}`}>
          {trend}
        </span>
      </div>
      <div className="text-2xl font-bold text-[var(--color-text)]">{value}</div>
      <div className="text-sm font-medium text-[var(--color-text-weak)]">{label}</div>
    </div>
  );
}

function InsightItem({ title, desc, time, severity }: { title: string; desc: string; time: string; severity: "high" | "medium" | "low" }) {
  const severityColor = {
    high: "bg-red-500",
    medium: "bg-orange-500",
    low: "bg-primary",
  };

  return (
    <div className="flex gap-3">
      <div className={`h-12 w-1 shrink-0 rounded-full ${severityColor[severity]}`} />
      <div>
        <div className="mb-1 flex items-center gap-2">
          <span className="text-sm font-bold text-[var(--color-text)]">{title}</span>
          <span className="text-[10px] font-medium text-[var(--color-text-weak)]">{time}</span>
        </div>
        <p className="text-xs leading-relaxed text-[var(--color-text-weak)]">{desc}</p>
      </div>
    </div>
  );
}
