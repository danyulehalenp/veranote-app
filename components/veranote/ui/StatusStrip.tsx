'use client';

export type StatusStripItem = {
  id: string;
  label: string;
  value: string;
};

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
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[#D8FBFF]/60">{item.label}:</span>
            <span className="text-[#EEF8FF]">{item.value}</span>
          </div>
          {index < items.length - 1 ? (
            <span className="text-[#D8FBFF]/35">•</span>
          ) : null}
        </div>
      ))}
    </div>
  );
}
