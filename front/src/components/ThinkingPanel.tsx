import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  Brain,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  XCircle,
  Loader2,
  Wrench,
  Clock,
} from "lucide-react";
import type { ThinkingStep } from "../types/app";

type ThinkingPanelProps = {
  steps: ThinkingStep[];
  loading: boolean;
};

/** Format duration in ms to a human-readable string */
function formatDuration(ms: number | undefined): string {
  if (ms === undefined) return "";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

/** Truncate long content for collapsed view */
function truncate(text: string, max = 120): string {
  if (text.length <= max) return text;
  return text.slice(0, max) + "…";
}

function StatusIcon({ status }: { status: string }) {
  if (status === "running")
    return <Loader2 size={14} className="animate-spin text-blue-500" />;
  if (status === "error")
    return <XCircle size={14} className="text-red-500" />;
  return <CheckCircle2 size={14} className="text-emerald-500" />;
}

type ToolStepRowProps = {
  step: ThinkingStep;
  result?: ThinkingStep;
};

function ToolStepRow({ step, result }: ToolStepRowProps) {
  const [expanded, setExpanded] = useState(false);
  const displayStatus = result?.status ?? step.status;
  const duration = result?.durationMs;

  return (
    <div className="border-l-2 border-slate-200 pl-3">
      <button
        type="button"
        className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition hover:bg-slate-50"
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? (
          <ChevronDown size={12} className="shrink-0 text-slate-400" />
        ) : (
          <ChevronRight size={12} className="shrink-0 text-slate-400" />
        )}
        <Wrench size={14} className="shrink-0 text-slate-500" />
        <span className="font-mono text-xs font-semibold text-slate-700">
          {step.toolName}
        </span>
        <StatusIcon status={displayStatus} />
        {duration !== undefined && (
          <span className="flex items-center gap-1 text-[11px] text-slate-400">
            <Clock size={10} />
            {formatDuration(duration)}
          </span>
        )}
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden"
          >
            <div className="ml-6 space-y-2 pb-2 pt-1">
              {step.arguments && Object.keys(step.arguments).length > 0 && (
                <div>
                  <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                    输入参数
                  </p>
                  <pre className="max-h-40 overflow-auto rounded-lg bg-slate-50 p-2 text-xs text-slate-600">
                    {JSON.stringify(step.arguments, null, 2)}
                  </pre>
                </div>
              )}
              {result?.content && (
                <div>
                  <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                    执行结果
                  </p>
                  <pre
                    className={`max-h-40 overflow-auto rounded-lg p-2 text-xs ${
                      result.isError
                        ? "bg-red-50 text-red-600"
                        : "bg-emerald-50 text-emerald-700"
                    }`}
                  >
                    {result.content}
                  </pre>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function ThinkingPanel({ steps, loading }: ThinkingPanelProps) {
  const [collapsed, setCollapsed] = useState(false);

  if (steps.length === 0 && !loading) return null;

  // Group steps by iteration
  const iterations = new Map<number, ThinkingStep[]>();
  for (const step of steps) {
    const group = iterations.get(step.iteration) ?? [];
    group.push(step);
    iterations.set(step.iteration, group);
  }

  // Build a map of tool_call_id -> tool_result for quick lookup
  const resultMap = new Map<string, ThinkingStep>();
  for (const step of steps) {
    if (step.type === "tool_result" && step.toolCallId) {
      resultMap.set(step.toolCallId, step);
    }
  }

  const totalTools = steps.filter((s) => s.type === "tool_call").length;
  const doneTools = steps.filter(
    (s) => s.type === "tool_result" && !s.isError,
  ).length;
  const errorTools = steps.filter(
    (s) => s.type === "tool_result" && s.isError,
  ).length;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-start gap-3"
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-violet-100 text-violet-600">
        <Brain size={16} />
      </div>

      <div className="max-w-[82%] min-w-[320px] rounded-2xl border border-slate-200 bg-white shadow-sm">
        {/* Header */}
        <button
          type="button"
          className="flex w-full items-center gap-2 px-4 py-3 text-left"
          onClick={() => setCollapsed(!collapsed)}
        >
          {collapsed ? (
            <ChevronRight size={14} className="text-slate-400" />
          ) : (
            <ChevronDown size={14} className="text-slate-400" />
          )}
          <span className="text-sm font-semibold text-slate-700">
            思考过程
          </span>
          {loading && (
            <Loader2 size={14} className="animate-spin text-blue-500" />
          )}
          <span className="ml-auto flex items-center gap-2 text-[11px] text-slate-400">
            {totalTools > 0 && (
              <>
                <span className="text-emerald-500">{doneTools} 完成</span>
                {errorTools > 0 && (
                  <span className="text-red-500">{errorTools} 失败</span>
                )}
                <span>/ {totalTools} 工具调用</span>
              </>
            )}
          </span>
        </button>

        {/* Body */}
        <AnimatePresence>
          {!collapsed && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="overflow-hidden"
            >
              <div className="space-y-3 border-t border-slate-100 px-4 py-3">
                {[...iterations.entries()].map(([iter, iterSteps]) => (
                  <div key={iter}>
                    <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                      迭代 {iter}
                    </p>
                    <div className="space-y-1">
                      {iterSteps
                        .filter((s) => s.type === "tool_call")
                        .map((toolStep) => (
                          <ToolStepRow
                            key={toolStep.id}
                            step={toolStep}
                            result={
                              toolStep.toolCallId
                                ? resultMap.get(toolStep.toolCallId)
                                : undefined
                            }
                          />
                        ))}
                    </div>
                  </div>
                ))}

                {loading && steps.length === 0 && (
                  <div className="flex items-center gap-2 py-1 text-sm text-slate-500">
                    <Loader2 size={14} className="animate-spin text-blue-500" />
                    正在分析问题...
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
