'use client';

export type StatusStripItem = {
  id: string;
  label: string;
  value: string;
  tone?: 'neutral' | 'info' | 'success' | 'warning' | 'danger';
};

function getStatusToneClasses(tone: StatusStripItem['tone']) {
  switch (tone) {
    case 'success':
      return 'border-emerald-200/30 bg-emerald-400/10 text-emerald-50';
    case 'warning':
      return 'border-amber-200/28 bg-amber-400/10 text-amber-50';
    case 'danger':
      return 'border-rose-200/28 bg-rose-400/10 text-rose-50';
    case 'info':
      return 'border-cyan-200/24 bg-cyan-400/10 text-cyan-50';
    case 'neutral':
    default:
      return 'border-white/10 bg-white/5 text-[#EEF8FF]';
  }
}

export function StatusStrip({
  items,
}: {
  items: StatusStripItem[];
}) {
  if (!items.length) {
    return null;
  }

  return (
    <div className="aurora-soft-panel flex flex-wrap items-center gap-x-3 gap-y-2 rounded-[20px] border border-border px-4 py-3 text-sm">
      {items.map((item, index) => (
        <div key={item.id} className="flex items-center gap-3">
          <div className={`flex flex-wrap items-center gap-1.5 rounded-full border px-3 py-1.5 ${getStatusToneClasses(item.tone)}`}>
            <span className="text-current/68">{item.label}:</span>
            <span className="text-current">{item.value}</span>
          </div>
          {index < items.length - 1 ? (
            <span className="text-[#D8FBFF]/35">•</span>
          ) : null}
        </div>
      ))}
    </div>
  );
}
