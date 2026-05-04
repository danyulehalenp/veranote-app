import { planSections, type NoteSectionKey, type OutputScope } from '@/lib/note/section-profiles';
import type { OutputDestination, OutputNoteFocus } from '@/lib/veranote/output-destinations';

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
  ehrDestination?: OutputDestination;
  ehrNoteFocus?: OutputNoteFocus;
  ehrCopyMode?: 'whole-note' | 'field-level' | 'hybrid';
  ehrWritebackStatus?: 'copy-paste-only' | 'future-connector-ready';
  siteLabel?: string;
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
      id: 'preset-psychiatry-follow-up-hpi-only',
      name: 'Psychiatry Follow-Up - HPI Only',
      noteType: 'Psychiatry follow-up',
      outputScope: 'hpi-only',
      requestedSections: ['intervalUpdate'],
      outputStyle: 'Concise',
      format: 'Paragraph Style',
      customInstructions: 'Only draft the interval update or HPI portion. Stay close to the source and do not invent a full assessment or plan.',
      isDefault: true,
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
    {
      ...buildDefaultPresetForNoteType('Inpatient Psych Progress Note'),
      id: 'preset-ehr-wellsky-inpatient-progress',
      name: 'EHR Starter - WellSky Inpatient Progress',
      outputStyle: 'Concise',
      format: 'Paragraph Style',
      customInstructions: 'Format for WellSky-safe copy/paste: flatter paragraphs, simple headings only when needed, source-close risk wording, and no invented MSE, discharge readiness, or medical stability.',
      ehrDestination: 'WellSky',
      ehrNoteFocus: 'inpatient-psych-follow-up',
      ehrCopyMode: 'hybrid',
      ehrWritebackStatus: 'copy-paste-only',
      siteLabel: 'Hospital / facility using WellSky',
      isDefault: false,
      locked: true,
    },
    {
      ...buildDefaultPresetForNoteType('Outpatient Psych Follow-Up'),
      id: 'preset-ehr-tebra-outpatient-followup',
      name: 'EHR Starter - Tebra/Kareo Outpatient Follow-Up',
      outputStyle: 'Standard',
      format: 'Labeled Sections',
      customInstructions: 'Format for Tebra/Kareo copy/paste: preserve Subjective/HPI, MSE/observations, Assessment, and Plan as separable sections. Keep med adherence, side effects, and safety nuance literal.',
      ehrDestination: 'Tebra/Kareo',
      ehrNoteFocus: 'outpatient-follow-up',
      ehrCopyMode: 'field-level',
      ehrWritebackStatus: 'copy-paste-only',
      siteLabel: 'Outpatient psychiatry clinic',
      isDefault: false,
      locked: true,
    },
    {
      ...buildDefaultPresetForNoteType('Outpatient Psychiatric Evaluation'),
      id: 'preset-ehr-therapynotes-outpatient-evaluation',
      name: 'EHR Starter - TherapyNotes Psych Intake',
      outputStyle: 'Standard',
      format: 'Labeled Sections',
      customInstructions: 'Format for TherapyNotes intake-style copy/paste: keep presenting problem, current mental status, risk assessment, biopsychosocial history, diagnosis framing, and plan separable without copying DSM criteria verbatim.',
      ehrDestination: 'TherapyNotes',
      ehrNoteFocus: 'outpatient-evaluation',
      ehrCopyMode: 'field-level',
      ehrWritebackStatus: 'copy-paste-only',
      siteLabel: 'Outpatient psychiatry / therapy site',
      isDefault: false,
      locked: true,
    },
    {
      ...buildDefaultPresetForNoteType('Therapy Progress Note'),
      id: 'preset-ehr-simplepractice-therapy-progress',
      name: 'EHR Starter - SimplePractice Therapy Progress',
      outputStyle: 'Concise',
      format: 'Paragraph Style',
      customInstructions: 'Format for SimplePractice therapy progress copy/paste: keep intervention, client response, risk update, homework/next step, and source limits clear. Do not add medication management language.',
      ehrDestination: 'SimplePractice',
      ehrNoteFocus: 'outpatient-follow-up',
      ehrCopyMode: 'hybrid',
      ehrWritebackStatus: 'copy-paste-only',
      siteLabel: 'Therapy practice',
      isDefault: false,
      locked: true,
    },
    {
      ...buildDefaultPresetForNoteType('Medication Assisted Treatment Follow-Up'),
      id: 'preset-ehr-valant-mat-followup',
      name: 'EHR Starter - Valant MAT Follow-Up',
      outputStyle: 'Standard',
      format: 'Labeled Sections',
      customInstructions: 'Format for Valant behavioral-health copy/paste: keep UDS, medication adherence, cravings, overdose/naloxone, risk, assessment, and plan separable. Do not invent dose changes or confirmed relapse from preliminary screens.',
      ehrDestination: 'Valant',
      ehrNoteFocus: 'outpatient-follow-up',
      ehrCopyMode: 'field-level',
      ehrWritebackStatus: 'copy-paste-only',
      siteLabel: 'Addiction / behavioral-health site',
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
  const normalizedNoteType = noteType.trim().toLowerCase();
  const matchedPreset =
    presets.find((preset) => preset.noteType.trim().toLowerCase() === normalizedNoteType && preset.isDefault)
    ?? presets.find((preset) => preset.noteType.trim().toLowerCase() === normalizedNoteType)
    ?? null;

  if (!matchedPreset) {
    return null;
  }

  return {
    ...matchedPreset,
    noteType: noteType.trim(),
  };
}
