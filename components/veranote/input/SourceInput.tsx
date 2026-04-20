'use client';

export function SourceInput({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="aurora-soft-panel grid gap-3 rounded-[22px] p-4 text-sm font-medium text-ink">
      <span className="text-[12px] font-semibold uppercase tracking-[0.14em] text-slate-500">{label}</span>
      <span className="text-xs font-normal leading-6 text-muted">{hint}</span>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="min-h-[240px] rounded-[18px] border border-border p-4"
      />
    </label>
  );
}
