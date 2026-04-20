import { buildSourceInputFromSections } from '@/lib/ai/source-sections';
import type { SourceSections } from '@/types/session';

export type FounderWorkflowStarter = {
  id: string;
  title: string;
  noteType: string;
  template: string;
  outputStyle: string;
  format: string;
  summary: string;
  reviewFocus: string;
  sections: SourceSections;
};

export const founderWorkflowStarters: FounderWorkflowStarter[] = [
  {
    id: 'psych-discharge',
    title: 'Inpatient Psych Discharge',
    noteType: 'Inpatient Psych Discharge Summary',
    template: 'Default Inpatient Psych Discharge Summary',
    outputStyle: 'Polished',
    format: 'Labeled Sections',
    summary: 'For hospitalization timelines, partial improvement, discharge meds, and follow-up planning.',
    reviewFocus: 'Keep admission symptoms, hospital course, recent events, and current discharge status separate.',
    sections: {
      clinicianNotes: 'Discharge-day bullets, hospital course summary, improvement status, discharge planning.',
      intakeCollateral: 'Collateral or nursing notes that still matter for discharge context.',
      patientTranscript: 'Direct patient statements about readiness, symptoms, or denial of prior issues.',
      objectiveData: 'Discharge meds, PRNs used during stay, relevant labs, vitals, follow-up appointments.',
    },
  },
  {
    id: 'acute-psych-admission',
    title: 'Acute Psych Admission / HPI',
    noteType: 'Inpatient Psych Initial Adult Evaluation',
    template: 'Default Inpatient Psych Initial Adult Evaluation',
    outputStyle: 'Standard',
    format: 'Labeled Sections',
    summary: 'For messy admissions, fragmented chronology, collateral conflict, and early risk framing.',
    reviewFocus: 'Protect uncertainty and keep conflicting sources visible instead of smoothing them into one story.',
    sections: {
      clinicianNotes: 'Initial impression, presenting concern, timeline fragments, provisional assessment.',
      intakeCollateral: 'ED notes, nursing intake, family report, police or EMS context.',
      patientTranscript: 'Interview excerpts, quoted denials, symptom report, chronology in patient words.',
      objectiveData: 'Vitals, tox/labs, med list, prior diagnoses, structured risk findings.',
    },
  },
  {
    id: 'psych-progress',
    title: 'Psych Progress Note',
    noteType: 'Inpatient Psych Progress Note',
    template: 'Default Inpatient Psych Progress Note',
    outputStyle: 'Standard',
    format: 'Labeled Sections',
    summary: 'For day-to-day inpatient follow-up, response to treatment, and med/lab-sensitive progress.',
    reviewFocus: 'Do not overstate improvement or erase unresolved symptoms just because the note is cleaner.',
    sections: {
      clinicianNotes: 'Today’s progress bullets, assessment, plan, med adjustments, response to treatment.',
      intakeCollateral: 'Nursing or staff observations from the shift that belong in today’s picture.',
      patientTranscript: 'Patient’s reported sleep, mood, side effects, goals, and quoted statements.',
      objectiveData: 'PRNs, vitals, labs, MAR snippets, med adherence, objective findings.',
    },
  },
  {
    id: 'meds-labs-review',
    title: 'Meds / Labs / DX Review',
    noteType: 'Inpatient Psych Progress Note',
    template: 'Default Inpatient Psych Progress Note',
    outputStyle: 'Concise',
    format: 'Paragraph Style',
    summary: 'For medication questions, diagnosis framing, and lab-sensitive assessment support.',
    reviewFocus: 'Keep exact med names, doses, labs, and uncertainty literal. Do not invent a regimen or diagnosis certainty.',
    sections: {
      clinicianNotes: 'Question to solve, med concerns, diagnostic uncertainty, next-step reasoning.',
      intakeCollateral: 'Relevant outside records or collateral affecting med or diagnosis interpretation.',
      patientTranscript: 'Side effects, adherence, symptom response, patient-reported concerns.',
      objectiveData: 'Current meds, recent changes, labs, EKG, vitals, objective chart data.',
    },
  },
];

export function buildFounderWorkflowSourceInput(starter: FounderWorkflowStarter) {
  return buildSourceInputFromSections(starter.sections);
}
