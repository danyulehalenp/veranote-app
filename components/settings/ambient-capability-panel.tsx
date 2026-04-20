'use client';

import { DEFAULT_AMBIENT_LISTENING_MODULE_CONFIG } from '@/lib/constants/ambient-listening';
import { summarizeAmbientListeningModuleConfig } from '@/lib/ambient-listening/config';

export function AmbientCapabilityPanel() {
  const summaryLines = summarizeAmbientListeningModuleConfig(DEFAULT_AMBIENT_LISTENING_MODULE_CONFIG);

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 shadow-sm">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-amber-950">Internal Ambient Listening Summary</h2>
          <p className="mt-1 text-sm text-amber-900">
            This is a planning surface for the future ambient listening lane. It reflects the current scaffold posture in the prototype, but it is not a live recording workflow.
          </p>
        </div>
        <div className="rounded-full border border-amber-200 bg-white px-3 py-1 text-xs font-medium text-amber-950">
          Internal only
        </div>
      </div>

      <div className="mt-4 rounded-lg border border-amber-200 bg-white p-4 text-sm text-amber-900">
        Ambient listening remains a separate, higher-risk workflow from provider dictation. It stays consent-gated, evidence-linked, and draft-only until the compliance, review, and retention layers are real.
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-amber-200 bg-white p-4 text-sm text-amber-900">
          <div className="font-semibold text-amber-950">Current scaffold posture</div>
          <ul className="mt-3 space-y-2">
            {summaryLines.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>

        <div className="rounded-lg border border-amber-200 bg-white p-4 text-sm text-amber-900">
          <div className="font-semibold text-amber-950">Locked boundaries</div>
          <ul className="mt-3 space-y-2">
            <li>No ambient capture without explicit consent workflow.</li>
            <li>No raw audio retention by default.</li>
            <li>No unsupported note claims without evidence anchors.</li>
            <li>No psychotherapy/process-note bleed into ordinary notes.</li>
            <li>No autonomous diagnosis, risk, or legal-status conclusions.</li>
          </ul>
        </div>
      </div>

      <div className="mt-4 rounded-lg border border-amber-200 bg-white p-4 text-sm text-amber-900">
        <div className="font-semibold text-amber-950">Planned future shape</div>
        <div className="mt-2 flex flex-wrap gap-2">
          {['Consent gate', 'Visible recording state', 'Diarized transcript turns', 'Evidence anchors', 'Psych safety flags', 'Audit + retention'].map((item) => (
            <span key={item} className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-950">
              {item}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
