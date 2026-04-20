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
    <div className="flex flex-wrap items-center gap-3">
      <div className="rounded-[18px] bg-paper px-3 py-2 text-xs font-medium text-muted">
        Source integrity: {filledCount}/{totalCount} filled
      </div>
      <div className="rounded-[18px] bg-paper px-3 py-2 text-xs font-medium text-muted">
        Active source sections: {activeLabels.length ? activeLabels.join(' • ') : 'None yet'}
      </div>
    </div>
  );
}
