'use client';

export function CombinedView({
  value,
}: {
  value: string;
}) {
  return (
    <div className="aurora-soft-panel grid gap-3 rounded-[24px] p-4 sm:p-5 text-sm text-ink">
      <div>
        <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Combined source preview</div>
        <p className="mt-2 text-sm leading-6 text-muted">
          This is the assembled source packet Atlas sees before draft generation.
        </p>
      </div>
      <div className="min-h-[240px] whitespace-pre-wrap rounded-[20px] border border-border bg-white px-4 py-4 text-[15px] leading-7 text-ink sm:min-h-[280px]">
        {value.trim() || 'No combined source yet. Add content in Clinician, Intake, Transcript, or Objective.'}
      </div>
    </div>
  );
}
