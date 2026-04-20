import { redirect } from 'next/navigation';
import { AppShell } from '@/components/layout/app-shell';
import { AmbientCapabilityPanel } from '@/components/settings/ambient-capability-panel';
import { DictationCapabilityPanel } from '@/components/settings/dictation-capability-panel';
import { ProviderBetaOperationsPanel } from '@/components/settings/provider-beta-operations-panel';
import { ProviderSettingsPanel } from '@/components/settings/provider-settings-panel';
import { providerProfiles } from '@/lib/constants/provider-profiles';
import { getCareSettingForNoteType, getDefaultPresetCatalog, type CareSetting } from '@/lib/note/presets';
import { INTERNAL_MODE_ENABLED } from '@/lib/veranote/access-mode';

const psychRequiredSections = ['Date / Interval Update', 'Symptom Review', 'Medications / Changes / Side Effects', 'Mental Status / Observations', 'Safety / Risk', 'Assessment', 'Plan'];
const psychGuardrails = ['Do not invent symptoms, MSE findings, medication response, or plan items.', 'Prefer omission or flags over unsupported detail.', 'Preserve explicit dates, inpatient risk language, and direct provider wording when clinically useful.'];

const careSettingDescriptions: Record<CareSetting, string> = {
  Inpatient: 'Hospital-course, unit-context, discharge, and admission-oriented starter lanes.',
  Outpatient: 'Longitudinal med-management and outpatient evaluation starter lanes.',
  Telehealth: 'Remote follow-up starter lanes where chronic-risk nuance and limited objective data matter.',
  'Cross-setting': 'General or mixed templates that are not tightly bound to one psych setting.',
};

export default function TemplatesPage() {
  if (!INTERNAL_MODE_ENABLED) {
    redirect('/');
  }

  const starterPresetGroups = (['Inpatient', 'Outpatient', 'Telehealth', 'Cross-setting'] as CareSetting[]).map((setting) => ({
    setting,
    presets: getDefaultPresetCatalog().filter((preset) => getCareSettingForNoteType(preset.noteType) === setting),
  }));

  return (
    <AppShell
      title="Templates and Profiles"
      subtitle="Control note structure, defaults, wording preferences, and output profile behavior. Week 3 is focused on tightening the psych-first wedge before pretending every specialty on earth is equally mature."
    >
      <div className="grid gap-6 lg:grid-cols-[240px_1fr]">
        <aside className="aurora-panel rounded-[24px] p-4">
          <div className="space-y-2 text-sm">
            {['Psychiatry Wedge Profiles', 'Therapy Progress Note', 'General Medical Note Types', 'Output / EHR Profile', 'Personal Preferences'].map((item) => (
              <div key={item} className="aurora-soft-panel rounded-[18px] px-3 py-2">{item}</div>
            ))}
          </div>
        </aside>
        <div className="grid gap-6">
          <ProviderSettingsPanel />

          <ProviderBetaOperationsPanel />

          <section className="aurora-panel rounded-[28px] p-6">
            <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
              <div>
                <h2 className="text-lg font-semibold">Voice capability planning</h2>
                <p className="mt-1 text-sm text-muted">
                  These are internal roadmap surfaces for Veranote&apos;s future voice lanes. They describe scaffold posture and safety boundaries without pretending the features are live.
                </p>
              </div>
              <div className="aurora-pill rounded-full px-3 py-1 text-xs font-medium text-muted">
                Internal only
              </div>
            </div>

            <div className="mt-5 grid gap-6 xl:grid-cols-2">
              <DictationCapabilityPanel />
              <AmbientCapabilityPanel />
            </div>
          </section>

          <section className="aurora-panel rounded-[28px] p-6">
            <h2 className="text-lg font-semibold">Psychiatry wedge profiles</h2>
            <p className="mt-1 text-sm text-muted">These founder-seeded profiles now map to real provider-profile defaults in the prototype. They should steer settings and workflow emphasis, not override trust guardrails.</p>

            <div className="mt-5 grid gap-4 lg:grid-cols-2">
              {providerProfiles.map((profile) => (
                <div key={profile.id} className="aurora-soft-panel rounded-[22px] p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="text-sm font-semibold text-ink">{profile.name}</div>
                    <span className="rounded-full border border-violet-200 bg-violet-50 px-2 py-1 text-[11px] font-medium uppercase tracking-wide text-violet-900">
                      {getCareSettingForNoteType(profile.defaults.noteTypePriority[0] || '')}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-muted">{profile.description}</p>
                  <div className="mt-3 text-xs font-semibold uppercase tracking-wide text-muted">Preferred output style</div>
                  <div className="mt-1 text-sm text-ink">{profile.defaults.preferredOutputStyle}</div>
                  <div className="mt-3 text-xs font-semibold uppercase tracking-wide text-muted">Default note lane</div>
                  <div className="mt-1 flex flex-wrap gap-2">
                    {profile.defaults.noteTypePriority.map((item) => (
                      <span key={item} className="aurora-pill rounded-full px-3 py-1 text-xs font-medium text-slate-700">
                        {item}
                      </span>
                    ))}
                  </div>
                  <div className="mt-3 text-xs font-semibold uppercase tracking-wide text-muted">Workflow focus</div>
                  <ul className="mt-2 space-y-1 text-sm text-muted">
                    {profile.workflowFocus.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>

          <section className="aurora-panel rounded-[28px] p-6">
            <h2 className="text-lg font-semibold">Starter templates by care setting</h2>
            <p className="mt-1 text-sm text-muted">These are the preset lanes providers should be able to recognize quickly: inpatient, outpatient, telehealth, or more general cross-setting templates.</p>

            <div className="mt-5 grid gap-5">
              {starterPresetGroups.map(({ setting, presets }) => (
                <div key={setting} className="aurora-soft-panel rounded-[22px] p-4">
                  <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                    <div>
                      <div className="text-sm font-semibold text-ink">{setting} starter lane</div>
                      <p className="mt-1 text-sm text-muted">{careSettingDescriptions[setting]}</p>
                    </div>
                    <div className="aurora-pill rounded-full px-3 py-1 text-xs font-medium text-muted">
                      {presets.length} preset{presets.length === 1 ? '' : 's'}
                    </div>
                  </div>
                  <div className="mt-4 grid gap-4 lg:grid-cols-2">
                    {presets.map((preset) => (
                      <div key={preset.id} className="aurora-soft-panel rounded-[20px] p-4">
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="text-sm font-semibold text-ink">{preset.name}</div>
                          <span className={`rounded-full px-2 py-1 text-[11px] font-medium uppercase tracking-wide ${
                            preset.locked ? 'bg-violet-100 text-violet-900' : 'bg-slate-100 text-slate-900'
                          }`}>
                            {preset.locked ? 'Locked starter' : 'Editable preset'}
                          </span>
                          {preset.isDefault ? (
                            <span className="rounded-full bg-emerald-100 px-2 py-1 text-[11px] font-medium uppercase tracking-wide text-emerald-900">
                              Default
                            </span>
                          ) : null}
                        </div>
                        <div className="mt-2 text-sm text-muted">{preset.noteType}</div>
                        <div className="mt-3 grid gap-2 text-xs text-slate-700">
                          <div><span className="font-semibold text-slate-900">Style:</span> {preset.outputStyle}</div>
                          <div><span className="font-semibold text-slate-900">Format:</span> {preset.format}</div>
                          <div><span className="font-semibold text-slate-900">Scope:</span> {preset.outputScope}</div>
                          <div><span className="font-semibold text-slate-900">Closer to source:</span> {preset.keepCloserToSource ? 'Yes' : 'No'}</div>
                        </div>
                        {preset.customInstructions?.trim() ? (
                          <div className="aurora-soft-panel mt-3 rounded-[16px] p-3 text-xs text-slate-700">
                            {preset.customInstructions.trim()}
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="aurora-panel rounded-[28px] p-6">
            <h2 className="text-lg font-semibold">Inpatient psych progress note defaults</h2>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <label className="grid gap-2 text-sm font-medium"><span>Template Name</span><input defaultValue="Psych Conservative Inpatient Note" className="rounded-lg border border-border p-3" /></label>
              <label className="grid gap-2 text-sm font-medium"><span>Default Output Style</span><select className="rounded-lg border border-border p-3"><option>Standard</option><option>Concise</option><option>Polished</option></select></label>
              <label className="grid gap-2 text-sm font-medium"><span>Default Format</span><select className="rounded-lg border border-border p-3"><option>Labeled Sections</option><option>Paragraph Style</option><option>Minimal Headings</option></select></label>
              <label className="grid gap-2 text-sm font-medium"><span>Priority Behavior</span><select className="rounded-lg border border-border p-3"><option>Closer to source</option><option>Balanced cleanup</option><option>Risk-emphasis when supported</option></select></label>
            </div>

            <div className="mt-6 grid gap-6 lg:grid-cols-2">
              <div>
                <h3 className="font-medium">Required sections</h3>
                <div className="mt-3 space-y-3 text-sm">
                  {psychRequiredSections.map((item) => (
                    <label key={item} className="flex items-start gap-3"><input type="checkbox" defaultChecked /> {item}</label>
                  ))}
                </div>
              </div>
              <div>
                <h3 className="font-medium">Psych-first guardrails</h3>
                <div className="mt-3 space-y-3 text-sm">
                  {psychGuardrails.map((item) => (
                    <div key={item} className="aurora-soft-panel rounded-[16px] p-3">{item}</div>
                  ))}
                </div>
              </div>
            </div>

            <label className="mt-6 grid gap-2 text-sm font-medium"><span>Footer / Disclaimer Text</span><textarea className="min-h-[120px] rounded-lg border border-border p-3" defaultValue="Draft note for clinician review. Preserve source-backed facts and verify flagged gaps before final use." /></label>
            <div className="mt-6 flex gap-3">
              <button className="aurora-primary-button rounded-xl px-5 py-3 font-medium">Save Template</button>
              <button className="aurora-secondary-button rounded-xl px-5 py-3 font-medium">Reset Changes</button>
            </div>
          </section>
        </div>
      </div>
    </AppShell>
  );
}
