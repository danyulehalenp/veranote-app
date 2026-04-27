'use client';

import { useEffect, useState } from 'react';
import { DEFAULT_DICTATION_MODULE_CONFIG } from '@/lib/constants/dictation';
import { summarizeDictationModuleConfig } from '@/lib/dictation/config';

export function DictationCapabilityPanel() {
  const summaryLines = summarizeDictationModuleConfig(DEFAULT_DICTATION_MODULE_CONFIG);
  const [providerStatuses, setProviderStatuses] = useState<Array<{
    providerId: string;
    providerLabel: string;
    adapterId: string;
    available: boolean;
    engineLabel: string;
    reason: string;
  }>>([]);
  const [defaultSelection, setDefaultSelection] = useState<{
    activeProviderLabel: string;
    engineLabel: string;
    fallbackApplied: boolean;
    fallbackReason?: string;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const response = await fetch('/api/dictation/providers', { cache: 'no-store' });
        const payload = await response.json() as {
          providers?: Array<{
            providerId: string;
            providerLabel: string;
            adapterId: string;
            available: boolean;
            engineLabel: string;
            reason: string;
          }>;
          defaultSelection?: {
            activeProviderLabel: string;
            engineLabel: string;
            fallbackApplied: boolean;
            fallbackReason?: string;
          };
        };

        if (cancelled || !response.ok) {
          return;
        }

        setProviderStatuses(Array.isArray(payload.providers) ? payload.providers : []);
        setDefaultSelection(payload.defaultSelection || null);
      } catch {
        // Keep the panel useful even if provider status cannot be fetched.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="rounded-xl border border-cyan-200 bg-cyan-50 p-6 shadow-sm">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-cyan-950">Internal Dictation Capability Summary</h2>
          <p className="mt-1 text-sm text-cyan-900">
            This is an internal status surface for the evolving dictation module. It shows the current prototype runtime posture, provider availability, and guarded boundaries for internal testing.
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
          {['Browser mic', 'Audio chunk upload', 'Backend session bridge', 'Provider picker', 'Provider status', 'Queued transcript events', 'Mock STT', 'Manual accept', 'Review flags', 'Provenance', 'Source insertion', 'Command scaffold', 'EHR workflow scaffold'].map((item) => (
            <span key={item} className="rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1 text-xs font-medium text-cyan-950">
              {item}
            </span>
          ))}
        </div>
      </div>

      <div className="mt-4 rounded-lg border border-cyan-200 bg-white p-4 text-sm text-cyan-900">
        <div className="font-semibold text-cyan-950">Live provider status</div>
        {defaultSelection ? (
          <div className="mt-2 text-sm text-cyan-900">
            Default runtime path: <span className="font-medium text-cyan-950">{defaultSelection.activeProviderLabel} • {defaultSelection.engineLabel}</span>
            {defaultSelection.fallbackApplied && defaultSelection.fallbackReason ? ` (${defaultSelection.fallbackReason})` : ''}
          </div>
        ) : null}
        <div className="mt-3 grid gap-3 lg:grid-cols-2">
          {providerStatuses.length ? providerStatuses.map((provider) => (
            <div key={provider.providerId} className="rounded-lg border border-cyan-200 bg-cyan-50/60 p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="font-medium text-cyan-950">{provider.providerLabel}</div>
                <span className="rounded-full border border-cyan-200 bg-white px-2.5 py-1 text-[11px] font-medium text-cyan-950">
                  {provider.available ? 'available' : 'unavailable'}
                </span>
              </div>
              <div className="mt-1 text-xs text-cyan-900">Adapter: {provider.adapterId} • Engine: {provider.engineLabel}</div>
              <div className="mt-2 text-xs text-cyan-900">{provider.reason}</div>
            </div>
          )) : (
            <div className="rounded-lg border border-cyan-200 bg-cyan-50/60 p-3 text-sm text-cyan-900">
              Provider status will appear once the runtime availability check completes.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
