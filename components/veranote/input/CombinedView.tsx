'use client';

export function CombinedView({
  value,
}: {
  value: string;
}) {
  return (
    <div className="aurora-soft-panel grid gap-3 rounded-[22px] p-4 text-sm text-ink">
      <div>
        <div className="text-[12px] font-semibold uppercase tracking-[0.14em] text-slate-500">Combined source preview</div>
        <p className="mt-2 text-xs leading-6 text-muted">
          Combined source preview is assembled from the sections below before note generation. This keeps the intake workflow closer to real documentation inputs while still producing one reviewable draft.
        </p>
      </div>
      <div className="min-h-[240px] whitespace-pre-wrap rounded-[18px] border border-border bg-white p-4 text-sm text-ink">
        {value.trim() || 'No combined source yet. Add content in Clinician, Intake, Transcript, or Objective.'}
      </div>
    </div>
  );
}
