import type { BetaCohortSlot, BetaIssueCategory, BetaOutreachStatus, BetaWorkflowDefinition } from '@/types/provider-beta';

export const supportedBetaWorkflows: BetaWorkflowDefinition[] = [
  {
    id: 'inpatient-progress',
    label: 'Inpatient psych progress note',
    noteTypes: ['Inpatient Psych Progress Note'],
    careSettings: ['Inpatient'],
    priority: 'Primary',
    reviewFocus: ['risk wording', 'medication truth', 'unit-context chronology'],
  },
  {
    id: 'inpatient-discharge',
    label: 'Inpatient discharge-oriented note',
    noteTypes: ['Inpatient Psych Discharge Summary'],
    careSettings: ['Inpatient'],
    priority: 'Primary',
    reviewFocus: ['disposition truth', 'follow-up continuity', 'medication changes'],
  },
  {
    id: 'outpatient-follow-up',
    label: 'Outpatient psych follow-up / med-management note',
    noteTypes: ['Outpatient Psych Follow-Up'],
    careSettings: ['Outpatient'],
    priority: 'Primary',
    reviewFocus: ['longitudinal fit', 'medication truth', 'partial-response wording'],
  },
  {
    id: 'outpatient-evaluation',
    label: 'Outpatient psychiatric evaluation',
    noteTypes: ['Outpatient Psychiatric Evaluation'],
    careSettings: ['Outpatient'],
    priority: 'Primary',
    reviewFocus: ['diagnostic uncertainty', 'timeframe logic', 'differential preservation'],
  },
  {
    id: 'telehealth-follow-up',
    label: 'Telehealth psych follow-up',
    noteTypes: ['Outpatient Psych Telehealth Follow-Up'],
    careSettings: ['Telehealth'],
    priority: 'Primary',
    reviewFocus: ['remote-observation limits', 'risk nuance', 'telehealth wording fit'],
  },
  {
    id: 'meds-labs-dx-review',
    label: 'Meds / labs / diagnosis review-heavy note',
    noteTypes: ['Outpatient Psych Follow-Up', 'Outpatient Psychiatric Evaluation', 'Inpatient Psych Progress Note'],
    careSettings: ['Outpatient', 'Inpatient'],
    priority: 'Secondary',
    reviewFocus: ['objective conflict', 'medication truth', 'diagnosis caution'],
  },
  {
    id: 'crisis-note',
    label: 'Psychiatric crisis note',
    noteTypes: ['Psychiatric Crisis Note'],
    careSettings: ['Outpatient', 'Inpatient', 'Telehealth'],
    priority: 'Secondary',
    reviewFocus: ['passive-vs-acute risk', 'intervention timing', 'disposition boundaries'],
  },
];

export const betaCohortSlots: BetaCohortSlot[] = [
  {
    id: 'beta-01',
    label: 'Beta 01 — Inpatient Psych Anchor',
    targetRole: 'Inpatient-heavy psych NP, PA, or psychiatrist',
    primaryWorkflowIds: ['inpatient-progress'],
    secondaryWorkflowIds: ['inpatient-discharge'],
    biggestRisk: 'Draft sounds too polished when chronology or unit context is thin.',
  },
  {
    id: 'beta-02',
    label: 'Beta 02 — Outpatient Follow-Up / Med-Management Anchor',
    targetRole: 'Outpatient psychiatrist or psych NP',
    primaryWorkflowIds: ['outpatient-follow-up'],
    secondaryWorkflowIds: ['meds-labs-dx-review'],
    biggestRisk: 'Founder inpatient defaults still leak into outpatient note style.',
  },
  {
    id: 'beta-03',
    label: 'Beta 03 — Telehealth Psych Anchor',
    targetRole: 'Psych clinician with substantial telehealth follow-up work',
    primaryWorkflowIds: ['telehealth-follow-up'],
    secondaryWorkflowIds: ['outpatient-follow-up'],
    biggestRisk: 'Draft implies observational certainty that telehealth does not support.',
  },
  {
    id: 'beta-04',
    label: 'Beta 04 — New-Eval / Diagnostic-Caution Anchor',
    targetRole: 'Outpatient psych clinician doing frequent new evaluations',
    primaryWorkflowIds: ['outpatient-evaluation'],
    secondaryWorkflowIds: ['meds-labs-dx-review'],
    biggestRisk: 'Symptoms get upgraded into firmer diagnoses than source warrants.',
  },
  {
    id: 'beta-05',
    label: 'Beta 05 — Crisis / High-Scrutiny Reviewer',
    targetRole: 'Detail-oriented clinician likely to notice trust drift quickly',
    primaryWorkflowIds: ['crisis-note'],
    secondaryWorkflowIds: ['inpatient-progress', 'telehealth-follow-up'],
    biggestRisk: 'Warnings feel noisy without improving confidence enough.',
  },
];

export const betaIssueCategories: BetaIssueCategory[] = [
  'trust / hallucination',
  'medication truth',
  'objective / lab conflict',
  'risk wording',
  'diagnosis overstatement',
  'missing nuance',
  'structure / formatting',
  'workflow friction',
  'speed / convenience',
  'customization gap',
];

export const betaOutreachStatuses: BetaOutreachStatus[] = [
  'target',
  'contacted',
  'interested',
  'scheduled',
  'active',
  'paused',
  'completed',
  'declined',
];

export function isBetaSupportedNoteType(noteType: string) {
  return supportedBetaWorkflows.some((workflow) => workflow.noteTypes.includes(noteType));
}

export function getBetaWorkflowsForNoteType(noteType: string) {
  return supportedBetaWorkflows.filter((workflow) => workflow.noteTypes.includes(noteType));
}

export function getBetaWorkflowById(id: string) {
  return supportedBetaWorkflows.find((workflow) => workflow.id === id);
}
