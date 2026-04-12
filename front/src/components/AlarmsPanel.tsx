import { useMemo, useState } from "react";
import { ArrowLeft, Bell, CheckCircle2, Clock, Info, ShieldAlert } from "lucide-react";
import PaginationControls from "./PaginationControls";

const alarms = [
  { id: "ALM-001", asset: "主电机 M-102", severity: "High", message: "检测到异常振动频率 (8.5mm/s)", time: "12分钟前", status: "Active" },
  { id: "ALM-002", asset: "液压单元 H-22", severity: "Critical", message: "液压油压力低于安全阈值 (15 bar)", time: "45分钟前", status: "Active" },
  { id: "ALM-003", asset: "网关 G-04", severity: "Low", message: "网络延迟超过 200ms", time: "1小时前", status: "Acknowledged" },
  { id: "ALM-004", asset: "输送带 C-201", severity: "Medium", message: "电机温度过高 (85°C)", time: "2小时前", status: "Resolved" },
];

function alarmSeverityLabel(severity: string): string {
  if (severity === "Critical") return "严重";
  if (severity === "High") return "高";
  if (severity === "Medium") return "中";
  if (severity === "Low") return "低";
  return severity;
}

function alarmStatusLabel(status: string): string {
  if (status === "Active") return "待处理";
  if (status === "Acknowledged") return "已确认";
  if (status === "Resolved") return "已解决";
  return status;
}

export default function AlarmsPanel() {
  const [selectedAlarmId, setSelectedAlarmId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const selectedAlarm = useMemo(
    () => alarms.find((alarm) => alarm.id === selectedAlarmId) ?? null,
    [selectedAlarmId],
  );
  const pagedAlarms = useMemo(() => {
    const start = (page - 1) * pageSize;
    return alarms.slice(start, start + pageSize);
  }, [page, pageSize]);

  if (selectedAlarm) {
    return (
      <div className="h-full overflow-y-auto bg-[var(--color-surface-raised)] p-6 md:p-8">
        <div className="mb-4">
          <button
            type="button"
            onClick={() => setSelectedAlarmId(null)}
            className="inline-flex items-center gap-1 text-sm text-[var(--color-text-weak)] transition hover:text-[var(--color-text)]"
          >
            <ArrowLeft size={14} /> 返回告警列表
          </button>
        </div>
        <div className="card rounded-2xl p-5">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <p className="text-lg font-bold text-[var(--color-text)]">{selectedAlarm.asset}</p>
              <p className="font-mono text-xs text-[var(--color-text-weak)]">{selectedAlarm.id}</p>
            </div>
            <span
              className={`rounded-full px-3 py-1 text-xs font-bold ${
                selectedAlarm.status === "Active"
                  ? "bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-400"
                  : selectedAlarm.status === "Acknowledged"
                    ? "bg-[rgba(27,97,201,0.1)] text-primary"
                    : "bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400"
              }`}
            >
              {alarmStatusLabel(selectedAlarm.status)}
            </span>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="rounded-xl bg-[var(--color-surface-raised)] p-3 text-sm">
              <p className="text-xs text-[var(--color-text-weak)]">告警级别</p>
              <p className="mt-1 font-semibold text-[var(--color-text)]">{alarmSeverityLabel(selectedAlarm.severity)}</p>
            </div>
            <div className="rounded-xl bg-[var(--color-surface-raised)] p-3 text-sm">
              <p className="text-xs text-[var(--color-text-weak)]">触发时间</p>
              <p className="mt-1 font-semibold text-[var(--color-text)]">{selectedAlarm.time}</p>
            </div>
            <div className="rounded-xl bg-[var(--color-surface-raised)] p-3 text-sm md:col-span-2">
              <p className="text-xs text-[var(--color-text-weak)]">告警内容</p>
              <p className="mt-1 text-[var(--color-text)]">{selectedAlarm.message}</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto bg-[var(--color-surface-raised)] p-6 md:p-8">
      <header className="mb-6 flex items-center justify-end">
        <div className="flex gap-2">
          <button className="btn-secondary gap-2">
            <CheckCircle2 size={16} /> 全部已读
          </button>
          <button className="btn-primary gap-2">
            <Bell size={16} /> 订阅通知
          </button>
        </div>
      </header>

      <div className="card overflow-hidden">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="bg-[var(--color-surface-raised)]">
              <th className="table-header">告警ID</th>
              <th className="table-header">资产</th>
              <th className="table-header">级别</th>
              <th className="table-header">时间</th>
              <th className="table-header">状态</th>
              <th className="table-header">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--color-border)]">
            {pagedAlarms.map((alarm) => (
              <tr key={alarm.id} className="cursor-pointer transition hover:bg-[var(--color-surface-raised)]" onClick={() => setSelectedAlarmId(alarm.id)}>
                <td className="table-cell font-mono text-xs text-[var(--color-text-weak)]">{alarm.id}</td>
                <td className="table-cell">
                  <div className="inline-flex items-center justify-center gap-2 text-sm font-semibold text-[var(--color-text)]">
                    {alarm.severity === "Critical" || alarm.severity === "High" ? (
                      <ShieldAlert size={14} className="text-orange-500" />
                    ) : (
                      <Info size={14} className="text-primary" />
                    )}
                    {alarm.asset}
                  </div>
                </td>
                <td className="table-cell text-sm text-[var(--color-text-weak)]">{alarmSeverityLabel(alarm.severity)}</td>
                <td className="table-cell">
                  <span className="inline-flex items-center gap-1 text-xs text-[var(--color-text-weak)]">
                    <Clock size={12} /> {alarm.time}
                  </span>
                </td>
                <td className="table-cell">
                  <span
                    className={`rounded-full px-2 py-1 text-xs font-bold ${
                      alarm.status === "Active"
                        ? "bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-400"
                        : alarm.status === "Acknowledged"
                          ? "bg-[rgba(27,97,201,0.1)] text-primary"
                          : "bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400"
                    }`}
                  >
                    {alarmStatusLabel(alarm.status)}
                  </span>
                </td>
                <td className="table-cell">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedAlarmId(alarm.id);
                    }}
                    className="btn-secondary rounded-md px-2 py-1 text-xs"
                  >
                    详情
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <PaginationControls
        page={page}
        pageSize={pageSize}
        total={alarms.length}
        onPageChange={(nextPage) => setPage(nextPage)}
        onPageSizeChange={(nextSize) => {
          setPageSize(nextSize);
          setPage(1);
        }}
      />
    </div>
  );
}
