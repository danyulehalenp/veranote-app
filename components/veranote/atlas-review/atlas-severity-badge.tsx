'use client';

import type { AtlasReviewSeverity } from '@/lib/veranote/atlas-review';

function getSeverityClasses(severity: AtlasReviewSeverity) {
  switch (severity) {
    case 'urgent':
      return 'border-rose-300/32 bg-rose-500/16 text-rose-50';
    case 'caution':
      return 'border-orange-300/28 bg-orange-500/14 text-orange-50';
    case 'review':
      return 'border-amber-300/28 bg-amber-400/14 text-amber-50';
    case 'info':
    default:
      return 'border-sky-300/22 bg-sky-400/12 text-sky-50';
  }
}

export function AtlasSeverityBadge({ severity }: { severity: AtlasReviewSeverity }) {
  return (
    <span className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] ${getSeverityClasses(severity)}`}>
      {severity}
    </span>
  );
}
