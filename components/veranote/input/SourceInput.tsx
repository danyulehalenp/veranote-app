'use client';

import { useEffect, useRef } from 'react';

export function SourceInput({
  label,
  hint,
  value,
  onChange,
  placeholder,
  autoFocus = false,
  compact = false,
}: {
  label: string;
  hint: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  compact?: boolean;
}) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (!autoFocus) {
      return;
    }

    textareaRef.current?.focus({ preventScroll: true });
  }, [autoFocus]);

  return (
    <label
      suppressHydrationWarning
      className={`workspace-subpanel workspace-glow grid text-sm font-medium text-white shadow-[0_24px_56px_rgba(2,8,18,0.22)] ${
        compact
          ? 'gap-3 rounded-[22px] p-4'
          : 'gap-3 rounded-[26px] p-4 sm:gap-4 sm:p-5'
      }`}
    >
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-100/64">{label}</span>
          <p className={`max-w-4xl font-normal text-cyan-50/74 ${compact ? 'mt-1.5 text-[13px] leading-5' : 'mt-2 text-sm leading-6'}`}>{hint}</p>
        </div>
        <div className={`self-start rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] ${value.trim() ? 'border-emerald-300/30 bg-emerald-400/10 text-emerald-100 shadow-[0_12px_28px_rgba(16,185,129,0.18)]' : 'border-white/10 bg-white/5 text-cyan-50/70'}`}>
          {value.trim() ? 'Loaded' : 'Waiting'}
        </div>
      </div>
      <textarea
        ref={textareaRef}
        suppressHydrationWarning
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className={`workspace-control w-full px-4 text-[15px] leading-7 ${
          compact
            ? 'min-h-[190px] rounded-[18px] py-3.5 sm:min-h-[220px] xl:min-h-[240px]'
            : 'min-h-[220px] rounded-[22px] py-4 sm:min-h-[260px] xl:min-h-[300px]'
        }`}
      />
    </label>
  );
}
