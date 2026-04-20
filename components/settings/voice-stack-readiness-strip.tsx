'use client';

import Link from 'next/link';
import { DEFAULT_AMBIENT_LISTENING_MODULE_CONFIG } from '@/lib/constants/ambient-listening';
import { DEFAULT_DICTATION_MODULE_CONFIG } from '@/lib/constants/dictation';
import { summarizeAmbientListeningModuleConfig } from '@/lib/ambient-listening/config';
import { summarizeDictationModuleConfig } from '@/lib/dictation/config';

const roadmapChips = [
  'Internal only',
  'Dictation scaffolded',
  'Ambient scaffolded',
  'Provider dictation first',
  'Ambient is consent-gated',
];

export function VoiceStackReadinessStrip() {
  const dictationSummary = summarizeDictationModuleConfig(DEFAULT_DICTATION_MODULE_CONFIG);
  const ambientSummary = summarizeAmbientListeningModuleConfig(DEFAULT_AMBIENT_LISTENING_MODULE_CONFIG);

  return (
    <section className="mt-8 rounded-xl border border-cyan-200 bg-cyan-50 p-5 shadow-sm">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="text-sm font-semibold text-cyan-950">Voice stack readiness</div>
          <p className="mt-1 max-w-3xl text-sm text-cyan-900">
            Veranote now has internal scaffolds for both future voice lanes. Provider dictation remains the earlier, lower-risk lane; ambient listening remains the later, higher-trust workflow with consent, evidence, and retention gates.
          </p>
        </div>

        <Link
          href="/dashboard/templates"
          className="rounded-full border border-cyan-200 bg-white px-3 py-1 text-xs font-medium text-cyan-950 transition hover:bg-cyan-100"
        >
          Open voice planning
        </Link>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {roadmapChips.map((chip) => (
          <span key={chip} className="rounded-full border border-cyan-200 bg-white px-3 py-1 text-xs font-medium text-cyan-950">
            {chip}
          </span>
        ))}
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <div className="rounded-lg border border-cyan-200 bg-white p-4">
          <div className="text-sm font-semibold text-cyan-950">Provider dictation lane</div>
          <div className="mt-3 grid gap-3 md:grid-cols-3">
            {dictationSummary.slice(0, 3).map((line) => (
              <div key={line} className="rounded-lg border border-cyan-100 bg-cyan-50 p-3 text-sm text-cyan-900">
                {line}
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-cyan-200 bg-white p-4">
          <div className="text-sm font-semibold text-cyan-950">Ambient listening lane</div>
          <div className="mt-3 grid gap-3 md:grid-cols-3">
            {ambientSummary.slice(0, 3).map((line) => (
              <div key={line} className="rounded-lg border border-cyan-100 bg-cyan-50 p-3 text-sm text-cyan-900">
                {line}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
