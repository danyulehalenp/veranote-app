import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AppShell } from '@/components/layout/app-shell';
import { InternalSurfaceNotice } from '@/components/layout/internal-surface-notice';
import { ProviderSettingsPanel } from '@/components/settings/provider-settings-panel';
import { providerProfiles } from '@/lib/constants/provider-profiles';
import { getCareSettingForNoteType, getDefaultPresetCatalog, type CareSetting } from '@/lib/note/presets';
import { INTERNAL_MODE_ENABLED } from '@/lib/veranote/access-mode';

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
      subtitle="Provider-facing defaults only: profile behavior, starter lanes, output preferences, and psych-first template guidance. Internal planning now lives in the Internal Workbench."
      fullWidth
    >
      <div className="grid gap-6">
        <InternalSurfaceNotice body="Use this page to tune product defaults and profile behavior. Planning, beta operations, eval pressure, and voice roadmap controls are intentionally separated into the Internal Workbench." />
        <section className="aurora-panel rounded-[28px] p-6">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <div className="text-sm font-semibold uppercase tracking-[0.16em] text-cyan-100">Provider defaults cockpit</div>
              <h2 className="mt-1 text-2xl font-semibold text-white">Only controls that shape real note work belong here</h2>
              <p className="mt-2 max-w-3xl text-sm leading-7 text-cyan-50/84">
                This page answers one product question: what defaults should a provider start with before they write a note? Everything else is routed to internal operations so the settings story stays calm.
              </p>
            </div>
            <div className="flex flex-wrap gap-2 md:justify-end">
              <div className="aurora-pill rounded-full px-3 py-1 text-xs font-medium text-muted">
                Provider settings first
              </div>
              <Link
                href="/dashboard/internal#template-planning"
                className="aurora-secondary-button rounded-xl px-3 py-2 text-xs font-semibold"
              >
                Internal planning
              </Link>
            </div>
          </div>

          <div className="mt-5 grid gap-3 lg:grid-cols-3">
            <div className="aurora-soft-panel rounded-[20px] p-4">
              <div className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">1 Profile</div>
              <div className="mt-1 text-sm font-semibold text-ink">Choose provider defaults</div>
              <p className="mt-2 text-sm leading-6 text-muted">Sets the starting documentation style, note priorities, and review emphasis.</p>
            </div>
            <div className="aurora-soft-panel rounded-[20px] p-4">
              <div className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">2 Output</div>
              <div className="mt-1 text-sm font-semibold text-ink">Tune EHR/site behavior</div>
              <p className="mt-2 text-sm leading-6 text-muted">Controls destination, note focus, formatting, and reusable site presets.</p>
            </div>
            <div className="aurora-soft-panel rounded-[20px] p-4">
              <div className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">3 Templates</div>
              <div className="mt-1 text-sm font-semibold text-ink">Review starter lanes</div>
              <p className="mt-2 text-sm leading-6 text-muted">Shows the preset lanes providers should recognize by care setting.</p>
            </div>
          </div>
        </section>

        <ProviderSettingsPanel />

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
                <details key={setting} className="aurora-soft-panel rounded-[22px] p-4" open={setting === 'Outpatient'}>
                  <summary className="cursor-pointer list-none">
                    <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                      <div>
                        <div className="text-sm font-semibold text-ink">{setting} starter lane</div>
                        <p className="mt-1 text-sm text-muted">{careSettingDescriptions[setting]}</p>
                      </div>
                      <div className="aurora-pill rounded-full px-3 py-1 text-xs font-medium text-muted">
                        {presets.length} preset{presets.length === 1 ? '' : 's'}
                      </div>
                    </div>
                  </summary>
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
                </details>
              ))}
            </div>
        </section>

        <section className="aurora-panel rounded-[28px] p-6">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <div className="text-sm font-semibold uppercase tracking-[0.16em] text-cyan-100">Boundary</div>
              <h2 className="mt-1 text-lg font-semibold text-white">Internal planning is no longer embedded here</h2>
              <p className="mt-2 max-w-3xl text-sm leading-7 text-cyan-50/82">
                Beta operations, voice capability planning, roadmap pressure, and ambient workbench controls are still available, but they now live behind the Internal Workbench so providers do not confuse planning scaffolds with usable settings.
              </p>
            </div>
            <Link
              href="/dashboard/internal#template-planning"
              className="aurora-secondary-button inline-flex rounded-xl px-4 py-2 text-sm font-semibold"
            >
              Open Internal Workbench
            </Link>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
