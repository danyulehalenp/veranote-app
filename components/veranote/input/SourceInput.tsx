'use client';

import { useEffect, useRef } from 'react';

export function SourceInput({
  id,
  label,
  hint,
  value,
  onChange,
  placeholder,
  autoFocus = false,
  compact = false,
  tone = 'default',
}: {
  id?: string;
  label: string;
  hint: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  compact?: boolean;
  tone?: 'default' | 'previsit' | 'live' | 'ambient' | 'addon';
}) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const lane = {
    default: {
      frame: 'border-l-cyan-300/28',
      label: 'text-cyan-100/64',
      badge: 'border-white/10 bg-white/5 text-cyan-50/70',
    },
    previsit: {
      frame: 'border-l-sky-300/70 bg-[linear-gradient(90deg,rgba(56,189,248,0.12),rgba(255,255,255,0.035)_28%,rgba(255,255,255,0.02))]',
      label: 'text-sky-100/82',
      badge: 'border-sky-200/24 bg-sky-300/10 text-sky-50',
    },
    live: {
      frame: 'border-l-teal-300/70 bg-[linear-gradient(90deg,rgba(45,212,191,0.12),rgba(255,255,255,0.035)_28%,rgba(255,255,255,0.02))]',
      label: 'text-teal-100/82',
      badge: 'border-teal-200/24 bg-teal-300/10 text-teal-50',
    },
    ambient: {
      frame: 'border-l-indigo-300/70 bg-[linear-gradient(90deg,rgba(129,140,248,0.13),rgba(255,255,255,0.035)_28%,rgba(255,255,255,0.02))]',
      label: 'text-indigo-100/82',
      badge: 'border-indigo-200/24 bg-indigo-300/10 text-indigo-50',
    },
    addon: {
      frame: 'border-l-amber-300/75 bg-[linear-gradient(90deg,rgba(251,191,36,0.12),rgba(255,255,255,0.035)_28%,rgba(255,255,255,0.02))]',
      label: 'text-amber-100/84',
      badge: 'border-amber-200/24 bg-amber-300/10 text-amber-50',
    },
  }[tone];

  useEffect(() => {
    if (!autoFocus) {
      return;
    }

    textareaRef.current?.focus({ preventScroll: true });
  }, [autoFocus]);

  return (
    <label
      id={id}
      suppressHydrationWarning
      className={`workspace-subpanel workspace-glow grid border-l-4 text-sm font-medium text-white shadow-[0_24px_56px_rgba(2,8,18,0.22)] ${lane.frame} ${
        compact
          ? 'gap-3 rounded-[22px] p-4'
          : 'gap-3 rounded-[26px] p-4 sm:gap-4 sm:p-5'
      }`}
    >
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <span className={`text-[11px] font-semibold uppercase tracking-[0.18em] ${lane.label}`}>{label}</span>
          <p className={`max-w-4xl font-normal text-cyan-50/74 ${compact ? 'mt-1.5 text-[13px] leading-5' : 'mt-2 text-sm leading-6'}`}>{hint}</p>
        </div>
        <div className={`self-start rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] ${value.trim() ? 'border-emerald-300/30 bg-emerald-400/10 text-emerald-100 shadow-[0_12px_28px_rgba(16,185,129,0.18)]' : lane.badge}`}>
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
