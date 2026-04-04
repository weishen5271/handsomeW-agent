import { useEffect, useMemo, useState } from "react";

type PaginationControlsProps = {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  pageSizeOptions?: number[];
};

function clampPage(page: number, totalPages: number): number {
  if (page < 1) return 1;
  if (page > totalPages) return totalPages;
  return page;
}

export default function PaginationControls({
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [10, 20, 50],
}: PaginationControlsProps) {
  const totalPages = useMemo(() => {
    const value = Math.ceil(total / pageSize);
    return value > 0 ? value : 1;
  }, [total, pageSize]);
  const [jumpValue, setJumpValue] = useState(String(page));

  useEffect(() => {
    setJumpValue(String(page));
  }, [page]);

  const applyJump = () => {
    const target = Number(jumpValue);
    if (!Number.isFinite(target)) {
      setJumpValue(String(page));
      return;
    }
    onPageChange(clampPage(Math.trunc(target), totalPages));
  };

  return (
    <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-600">
      <div>共 {total} 条</div>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="h-8 rounded-md border border-slate-200 bg-white px-2 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          上一页
        </button>
        <span>
          第 {page}/{totalPages} 页
        </span>
        <button
          type="button"
          className="h-8 rounded-md border border-slate-200 bg-white px-2 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
        >
          下一页
        </button>
        <span>跳转</span>
        <input
          value={jumpValue}
          onChange={(e) => setJumpValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") applyJump();
          }}
          className="h-8 w-16 rounded-md border border-slate-200 px-2 outline-none focus:border-blue-300"
          inputMode="numeric"
        />
        <button
          type="button"
          className="h-8 rounded-md border border-slate-200 bg-white px-2 transition hover:bg-slate-50"
          onClick={applyJump}
        >
          确认
        </button>
        <select
          className="h-8 rounded-md border border-slate-200 bg-white px-2 outline-none focus:border-blue-300"
          value={pageSize}
          onChange={(e) => onPageSizeChange(Number(e.target.value))}
        >
          {pageSizeOptions.map((option) => (
            <option key={option} value={option}>
              {option} / 页
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
