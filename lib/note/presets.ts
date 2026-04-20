import { planSections, type NoteSectionKey, type OutputScope } from '@/lib/note/section-profiles';

export type NotePreset = {
  id: string;
  name: string;
  noteType: string;
  outputScope: OutputScope;
  requestedSections: NoteSectionKey[];
  outputStyle: string;
  format: string;
  keepCloserToSource: boolean;
  flagMissingInfo: boolean;
  customInstructions?: string;
  isDefault?: boolean;
  locked?: boolean;
};

export type CareSetting = 'Inpatient' | 'Outpatient' | 'Telehealth' | 'Cross-setting';

export const NOTE_PRESETS_STORAGE_KEY = 'clinical-documentation-transformer:note-presets';

export function getCareSettingForNoteType(noteType: string): CareSetting {
  const lowered = noteType.toLowerCase();

  if (lowered.includes('telehealth')) {
    return 'Telehealth';
  }

  if (lowered.includes('outpatient') || lowered.includes('crisis')) {
    return 'Outpatient';
  }

  if (
    lowered.includes('inpatient')
    || lowered.includes('discharge')
    || lowered.includes('admission')
    || lowered.includes('day two')
  ) {
    return 'Inpatient';
  }

  return 'Cross-setting';
}

export function buildDefaultPresetForNoteType(noteType: string): NotePreset {
  const sectionPlan = planSections({ noteType, requestedScope: 'full-note' });

  return {
    id: `preset-${noteType.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
    name: `${noteType} Default`,
    noteType,
    outputScope: sectionPlan.scope,
    requestedSections: sectionPlan.sections,
    outputStyle: 'Standard',
    format: 'Labeled Sections',
    keepCloserToSource: true,
    flagMissingInfo: true,
    customInstructions: '',
    isDefault: true,
    locked: true,
  };
}

export function getDefaultPresetCatalog(): NotePreset[] {
  return [
    buildDefaultPresetForNoteType('Inpatient Psych Progress Note'),
    buildDefaultPresetForNoteType('Inpatient Psych Initial Adult Evaluation'),
    buildDefaultPresetForNoteType('Inpatient Psych Initial Adolescent Evaluation'),
    buildDefaultPresetForNoteType('Inpatient Psych Day Two Note'),
    buildDefaultPresetForNoteType('Inpatient Psych Discharge Summary'),
    buildDefaultPresetForNoteType('Psychiatric Crisis Note'),
    buildDefaultPresetForNoteType('Outpatient Psych Follow-Up'),
    buildDefaultPresetForNoteType('Outpatient Psych Telehealth Follow-Up'),
    buildDefaultPresetForNoteType('Outpatient Psychiatric Evaluation'),
    buildDefaultPresetForNoteType('Therapy Progress Note'),
    buildDefaultPresetForNoteType('General Medical SOAP/HPI'),
    buildDefaultPresetForNoteType('Psych Admission Medical H&P'),
    buildDefaultPresetForNoteType('Medical Consultation Note'),
    {
      ...buildDefaultPresetForNoteType('Inpatient Psych Initial Adult Evaluation'),
      id: 'preset-founder-acute-admission',
      name: 'Founder Starter - Acute Admission Frame',
      outputStyle: 'Standard',
      format: 'Labeled Sections',
      customInstructions: 'Use this when the input is messy and admission-level. Keep chronology explicit, preserve collateral conflict, and avoid smoothing uncertainty into one clean story.',
      isDefault: false,
      locked: true,
    },
    {
      ...buildDefaultPresetForNoteType('Inpatient Psych Progress Note'),
      id: 'preset-founder-progress-literal',
      name: 'Founder Starter - Daily Progress Literal',
      outputStyle: 'Standard',
      format: 'Labeled Sections',
      customInstructions: 'Use this for daily psych follow-up. Keep unresolved symptoms visible, stay literal about sleep, mood, side effects, PRNs, and do not overstate improvement.',
      isDefault: false,
      locked: true,
    },
    {
      ...buildDefaultPresetForNoteType('Inpatient Psych Discharge Summary'),
      id: 'preset-founder-discharge-continuity',
      name: 'Founder Starter - Discharge Continuity',
      outputStyle: 'Polished',
      format: 'Labeled Sections',
      customInstructions: 'Use this for psych discharge drafting. Keep admission symptoms, hospital course, recent events, and current discharge status separate. Do not invent a discharge regimen if the packet is thin.',
      isDefault: false,
      locked: true,
    },
    {
      ...buildDefaultPresetForNoteType('Inpatient Psych Progress Note'),
      id: 'preset-founder-meds-labs-review',
      name: 'Founder Starter - Meds / Labs Review',
      outputStyle: 'Concise',
      format: 'Paragraph Style',
      customInstructions: 'Use this when the core task is medication, labs, or diagnosis framing. Keep exact med names, doses, labs, and uncertainty literal. Formatting is secondary to fidelity.',
      isDefault: false,
      locked: true,
    },
    {
      ...buildDefaultPresetForNoteType('Outpatient Psych Follow-Up'),
      id: 'preset-outpatient-follow-up-longitudinal',
      name: 'Outpatient Follow-Up - Longitudinal',
      outputStyle: 'Standard',
      format: 'Labeled Sections',
      customInstructions: 'Use this for outpatient psych follow-up when the note needs medication response, functioning, adherence, side effects, and safety nuance without forcing inpatient chronology.',
      isDefault: false,
      locked: true,
    },
  ];
}

export function mergePresetCatalog(saved: NotePreset[] | null | undefined): NotePreset[] {
  const defaults = getDefaultPresetCatalog();
  const savedItems = Array.isArray(saved) ? saved : [];
  const byId = new Map<string, NotePreset>();

  for (const preset of defaults) {
    byId.set(preset.id, preset);
  }

  for (const preset of savedItems) {
    if (!preset?.id) continue;
    byId.set(preset.id, preset);
  }

  return Array.from(byId.values());
}

export function findPresetForNoteType(presets: NotePreset[], noteType: string) {
  return presets.find((preset) => preset.noteType === noteType && preset.isDefault) ?? presets.find((preset) => preset.noteType === noteType) ?? null;
}
