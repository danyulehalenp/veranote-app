'use client';

export function SourceInput({
  label,
  hint,
  value,
  onChange,
  placeholder,
  autoFocus = false,
}: {
  label: string;
  hint: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  return (
    <label className="workspace-subpanel workspace-glow grid gap-3 rounded-[26px] p-4 sm:gap-4 sm:p-5 text-sm font-medium text-white shadow-[0_24px_56px_rgba(2,8,18,0.22)]">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-100/64">{label}</span>
          <p className="mt-2 max-w-4xl text-sm font-normal leading-6 text-cyan-50/74">{hint}</p>
        </div>
        <div className={`self-start rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] ${value.trim() ? 'border-emerald-300/30 bg-emerald-400/10 text-emerald-100 shadow-[0_12px_28px_rgba(16,185,129,0.18)]' : 'border-white/10 bg-white/5 text-cyan-50/70'}`}>
          {value.trim() ? 'Loaded' : 'Waiting'}
        </div>
      </div>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        className="workspace-control min-h-[220px] w-full rounded-[22px] px-4 py-4 text-[15px] leading-7 sm:min-h-[260px] xl:min-h-[300px]"
      />
    </label>
  );
}
