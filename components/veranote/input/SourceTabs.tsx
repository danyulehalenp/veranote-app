'use client';

export type SourceTabKey = 'all' | 'clinicianNotes' | 'intakeCollateral' | 'patientTranscript' | 'objectiveData';

const TABS: Array<{ key: SourceTabKey; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'clinicianNotes', label: 'Clinician' },
  { key: 'intakeCollateral', label: 'Intake' },
  { key: 'patientTranscript', label: 'Transcript' },
  { key: 'objectiveData', label: 'Objective' },
];

export function SourceTabs({
  activeTab,
  onChange,
}: {
  activeTab: SourceTabKey;
  onChange: (tab: SourceTabKey) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {TABS.map((tab) => (
        <button
          key={tab.key}
          type="button"
          onClick={() => onChange(tab.key)}
          className={`rounded-xl border px-4 py-2 text-sm font-medium transition ${
            activeTab === tab.key
              ? 'border-sky-200 bg-sky-100 text-sky-950 shadow-[0_10px_24px_rgba(13,54,84,0.18)]'
              : 'aurora-secondary-button border-border text-slate-700'
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
