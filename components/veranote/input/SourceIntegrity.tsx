'use client';

export function SourceIntegrity({
  filledCount,
  totalCount,
  activeLabels,
}: {
  filledCount: number;
  totalCount: number;
  activeLabels: string[];
}) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3">
      <div className="rounded-[18px] border border-white/10 bg-white/5 px-3 py-2 text-xs font-medium text-cyan-50/76">
        Source coverage: {filledCount}/{totalCount} sections
      </div>
      <div className="rounded-[18px] border border-white/10 bg-white/5 px-3 py-2 text-xs font-medium text-cyan-50/76">
        Active source: {activeLabels.length ? activeLabels.join(' • ') : 'None yet'}
      </div>
    </div>
  );
}
