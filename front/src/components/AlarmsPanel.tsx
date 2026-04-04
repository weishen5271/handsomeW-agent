import { useMemo, useState } from "react";
import { ArrowLeft, Bell, CheckCircle2, Clock, Info, ShieldAlert } from "lucide-react";
import PaginationControls from "./PaginationControls";

const alarms = [
  { id: "ALM-001", asset: "主电机 M-102", severity: "High", message: "检测到异常振动频率 (8.5mm/s)", time: "12分钟前", status: "Active" },
  { id: "ALM-002", asset: "液压单元 H-22", severity: "Critical", message: "液压油压力低于安全阈值 (15 bar)", time: "45分钟前", status: "Active" },
  { id: "ALM-003", asset: "网关 G-04", severity: "Low", message: "网络延迟超过 200ms", time: "1小时前", status: "Acknowledged" },
  { id: "ALM-004", asset: "输送带 C-201", severity: "Medium", message: "电机温度过高 (85°C)", time: "2小时前", status: "Resolved" },
];

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
      <div className="h-full overflow-y-auto bg-slate-50/30 p-6 md:p-8">
        <div className="mb-4">
          <button
            type="button"
            onClick={() => setSelectedAlarmId(null)}
            className="inline-flex items-center gap-1 text-sm text-slate-500 transition hover:text-slate-700"
          >
            <ArrowLeft size={14} /> 返回告警列表
          </button>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <p className="text-lg font-bold text-slate-800">{selectedAlarm.asset}</p>
              <p className="font-mono text-xs text-slate-500">{selectedAlarm.id}</p>
            </div>
            <span
              className={`rounded-full px-3 py-1 text-xs font-bold ${
                selectedAlarm.status === "Active"
                  ? "bg-red-50 text-red-600"
                  : selectedAlarm.status === "Acknowledged"
                    ? "bg-blue-50 text-blue-600"
                    : "bg-emerald-50 text-emerald-600"
              }`}
            >
              {selectedAlarm.status === "Active" ? "待处理" : selectedAlarm.status === "Acknowledged" ? "已确认" : "已解决"}
            </span>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="rounded-xl bg-slate-50 p-3 text-sm">
              <p className="text-xs text-slate-500">告警级别</p>
              <p className="mt-1 font-semibold text-slate-700">{selectedAlarm.severity}</p>
            </div>
            <div className="rounded-xl bg-slate-50 p-3 text-sm">
              <p className="text-xs text-slate-500">触发时间</p>
              <p className="mt-1 font-semibold text-slate-700">{selectedAlarm.time}</p>
            </div>
            <div className="rounded-xl bg-slate-50 p-3 text-sm md:col-span-2">
              <p className="text-xs text-slate-500">告警内容</p>
              <p className="mt-1 text-slate-700">{selectedAlarm.message}</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto bg-slate-50/30 p-6 md:p-8">
      <header className="mb-6 flex items-center justify-end">
        <div className="flex gap-2">
          <button className="btn-top-outline gap-2">
            <CheckCircle2 size={16} /> 全部已读
          </button>
          <button className="btn-top-primary gap-2">
            <Bell size={16} /> 订阅通知
          </button>
        </div>
      </header>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="bg-slate-50">
              <th className="table-th">告警ID</th>
              <th className="table-th">资产</th>
              <th className="table-th">级别</th>
              <th className="table-th">时间</th>
              <th className="table-th">状态</th>
              <th className="table-th">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {pagedAlarms.map((alarm) => (
              <tr key={alarm.id} className="cursor-pointer hover:bg-slate-50/60" onClick={() => setSelectedAlarmId(alarm.id)}>
                <td className="table-td font-mono text-xs text-slate-500">{alarm.id}</td>
                <td className="table-td">
                  <div className="inline-flex items-center justify-center gap-2 text-sm font-semibold text-slate-700">
                    {alarm.severity === "Critical" || alarm.severity === "High" ? (
                      <ShieldAlert size={14} className="text-orange-500" />
                    ) : (
                      <Info size={14} className="text-blue-500" />
                    )}
                    {alarm.asset}
                  </div>
                </td>
                <td className="table-td text-sm text-slate-600">{alarm.severity}</td>
                <td className="table-td">
                  <span className="inline-flex items-center gap-1 text-xs text-slate-500">
                    <Clock size={12} /> {alarm.time}
                  </span>
                </td>
                <td className="table-td">
                  <span
                    className={`rounded-full px-2 py-1 text-xs font-bold ${
                      alarm.status === "Active"
                        ? "bg-red-50 text-red-600"
                        : alarm.status === "Acknowledged"
                          ? "bg-blue-50 text-blue-600"
                          : "bg-emerald-50 text-emerald-600"
                    }`}
                  >
                    {alarm.status === "Active" ? "待处理" : alarm.status === "Acknowledged" ? "已确认" : "已解决"}
                  </span>
                </td>
                <td className="table-td">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedAlarmId(alarm.id);
                    }}
                    className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 transition hover:bg-slate-50"
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
