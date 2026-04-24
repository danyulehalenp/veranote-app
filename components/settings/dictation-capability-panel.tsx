'use client';

import { DEFAULT_DICTATION_MODULE_CONFIG } from '@/lib/constants/dictation';
import { summarizeDictationModuleConfig } from '@/lib/dictation/config';

export function DictationCapabilityPanel() {
  const summaryLines = summarizeDictationModuleConfig(DEFAULT_DICTATION_MODULE_CONFIG);

  return (
    <div className="rounded-xl border border-cyan-200 bg-cyan-50 p-6 shadow-sm">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-cyan-950">Internal Dictation Capability Summary</h2>
          <p className="mt-1 text-sm text-cyan-900">
            This is a planning surface for the future dictation module. It shows the current scaffold posture inside the prototype, but it is not an active recording feature.
          </p>
        </div>
        <div className="rounded-full border border-cyan-200 bg-white px-3 py-1 text-xs font-medium text-cyan-950">
          Internal only
        </div>
      </div>

      <div className="mt-4 rounded-lg border border-cyan-200 bg-white p-4 text-sm text-cyan-900">
        Provider-controlled dictation is the first intended voice-input lane. Ambient/listening capture remains a separate later phase and is intentionally not exposed here as a live capability.
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-cyan-200 bg-white p-4 text-sm text-cyan-900">
          <div className="font-semibold text-cyan-950">Current scaffold posture</div>
          <ul className="mt-3 space-y-2">
            {summaryLines.map((line) => (
              <li key={line}>{line}</li>
            ))}
            <li>Provider-facing source-entry dictation shell now exists in the new-note workflow.</li>
            <li>Browser mic capture, backend session routes, audio chunk upload, queued transcript events, mock STT, review flags, and provenance insertion are wired for internal testing.</li>
          </ul>
        </div>

        <div className="rounded-lg border border-cyan-200 bg-white p-4 text-sm text-cyan-900">
          <div className="font-semibold text-cyan-950">Locked boundaries</div>
          <ul className="mt-3 space-y-2">
            <li>No browser Web Speech production path for PHI.</li>
            <li>No hidden recording or background capture.</li>
            <li>No raw audio retention by default.</li>
            <li>No auto-rewrite or silent clinical inference in dictation MVP.</li>
            <li>Manual accept remains the planned first commit mode.</li>
          </ul>
        </div>
      </div>

      <div className="mt-4 rounded-lg border border-cyan-200 bg-white p-4 text-sm text-cyan-900">
        <div className="font-semibold text-cyan-950">Current MVP shape</div>
        <div className="mt-2 flex flex-wrap gap-2">
          {['Browser mic', 'Audio chunk upload', 'Backend session bridge', 'Queued transcript events', 'Mock STT', 'Manual accept', 'Review flags', 'Provenance', 'Source insertion'].map((item) => (
            <span key={item} className="rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1 text-xs font-medium text-cyan-950">
              {item}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
