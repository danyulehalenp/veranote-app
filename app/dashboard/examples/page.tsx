'use client';

'use client';

import { redirect } from 'next/navigation';
import { AppShell } from '@/components/layout/app-shell';
import { ExampleCard } from '@/components/examples/example-card';
import { exampleCards } from '@/lib/constants/mock-data';
import { isBetaSupportedNoteType } from '@/lib/constants/provider-beta';
import { useMemo, useState } from 'react';
import { INTERNAL_MODE_ENABLED } from '@/lib/veranote/access-mode';

export default function ExamplesPage() {
  if (!INTERNAL_MODE_ENABLED) {
    redirect('/');
  }

  const [selectedSpecialty, setSelectedSpecialty] = useState('All specialties');
  const [selectedNoteType, setSelectedNoteType] = useState('All note types');
  const [selectedSetting, setSelectedSetting] = useState('All settings');
  const [selectedBetaSupport, setSelectedBetaSupport] = useState('All examples');

  const noteTypeOptions = useMemo(() => {
    return ['All note types', ...Array.from(new Set(exampleCards.map((card) => card.noteType)))];
  }, []);

  const settingOptions = useMemo(() => {
    return ['All settings', ...Array.from(new Set(exampleCards.map((card) => card.careSetting).filter(Boolean)))];
  }, []);

  const filteredCards = useMemo(() => {
    return exampleCards.filter((card) => (
      (selectedSpecialty === 'All specialties' || card.specialty === selectedSpecialty) &&
      (selectedNoteType === 'All note types' || card.noteType === selectedNoteType) &&
      (selectedSetting === 'All settings' || card.careSetting === selectedSetting) &&
      (selectedBetaSupport === 'All examples' ||
        (selectedBetaSupport === 'Beta-supported only' && isBetaSupportedNoteType(card.noteType)) ||
        (selectedBetaSupport === 'Other examples' && !isBetaSupportedNoteType(card.noteType)))
    ));
  }, [selectedBetaSupport, selectedNoteType, selectedSetting, selectedSpecialty]);

  const outpatientCount = exampleCards.filter((card) => card.outpatientReady).length;
  const founderCount = exampleCards.filter((card) => card.founderWorkflow).length;
  const betaSupportedCount = exampleCards.filter((card) => isBetaSupportedNoteType(card.noteType)).length;

  return (
    <AppShell
      title="Example Gallery"
      subtitle="Load fake or de-identified examples to test the structured intake workflow, source-faithful generation, and review behavior."
    >
      <div className="aurora-soft-panel mb-6 rounded-[24px] border border-blue-200 px-4 py-3 text-sm text-blue-900">
        These examples are for demo/testing only. Use fake or de-identified content unless you are running in an approved compliant environment.
      </div>
      <div className="aurora-soft-panel mb-6 rounded-[24px] border border-emerald-200 px-4 py-3 text-sm text-emerald-900">
        Phase 3 beta is intentionally focused on supported psych-first workflows. Use the beta filter below to stay inside the first trusted-provider testing lane.
      </div>
      <div className="aurora-panel mb-6 grid gap-4 rounded-[28px] p-4 xl:grid-cols-4">
        <select value={selectedSpecialty} onChange={(event) => setSelectedSpecialty(event.target.value)} className="rounded-xl border border-border bg-white p-3">
          <option>All specialties</option>
          <option>Psychiatry</option>
          <option>Therapy</option>
          <option>General Medical</option>
        </select>
        <select value={selectedNoteType} onChange={(event) => setSelectedNoteType(event.target.value)} className="rounded-xl border border-border bg-white p-3">
          {noteTypeOptions.map((option) => (
            <option key={option}>{option}</option>
          ))}
        </select>
        <select value={selectedSetting} onChange={(event) => setSelectedSetting(event.target.value)} className="rounded-xl border border-border bg-white p-3">
          {settingOptions.map((option) => (
            <option key={option}>{option}</option>
          ))}
        </select>
        <select value={selectedBetaSupport} onChange={(event) => setSelectedBetaSupport(event.target.value)} className="rounded-xl border border-border bg-white p-3">
          <option>All examples</option>
          <option>Beta-supported only</option>
          <option>Other examples</option>
        </select>
      </div>
      <div className="mb-6 grid gap-4 md:grid-cols-4">
        <div className="aurora-soft-panel rounded-[24px] border border-violet-200 p-4 text-sm text-violet-950">
          <div className="text-xs font-semibold uppercase tracking-wide text-violet-700">Founder workflow examples</div>
          <div className="mt-2 text-lg font-semibold">{founderCount}</div>
          <div className="mt-1 text-sm text-violet-900">Best for testing the original inpatient-heavy founder patterns.</div>
        </div>
        <div className="aurora-soft-panel rounded-[24px] border border-cyan-200 p-4 text-sm text-cyan-950">
          <div className="text-xs font-semibold uppercase tracking-wide text-cyan-700">Outpatient-ready examples</div>
          <div className="mt-2 text-lg font-semibold">{outpatientCount}</div>
          <div className="mt-1 text-sm text-cyan-900">Use these to start from med-management, telehealth, and outpatient-intake patterns.</div>
        </div>
        <div className="aurora-soft-panel rounded-[24px] border border-emerald-200 p-4 text-sm text-emerald-950">
          <div className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Beta-supported examples</div>
          <div className="mt-2 text-lg font-semibold">{betaSupportedCount}</div>
          <div className="mt-1 text-sm text-emerald-900">Aligned with the first trusted-provider beta workflows and cohort plan.</div>
        </div>
        <div className="aurora-soft-panel rounded-[24px] border border-border p-4 text-sm text-ink">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted">Filtered examples</div>
          <div className="mt-2 text-lg font-semibold">{filteredCards.length}</div>
          <div className="mt-1 text-sm text-muted">Visible examples after specialty, note-type, and setting filters.</div>
        </div>
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        {filteredCards.map((card) => (
          <ExampleCard key={card.title} {...card} betaSupported={isBetaSupportedNoteType(card.noteType)} />
        ))}
      </div>
    </AppShell>
  );
}
