import type { SourceSections } from '@/types/session';

export const EMPTY_SOURCE_SECTIONS: SourceSections = {
  clinicianNotes: '',
  intakeCollateral: '',
  patientTranscript: '',
  objectiveData: '',
};

export function normalizeSourceSections(input?: Partial<SourceSections> | null): SourceSections {
  return {
    clinicianNotes: typeof input?.clinicianNotes === 'string' ? input.clinicianNotes : '',
    intakeCollateral: typeof input?.intakeCollateral === 'string' ? input.intakeCollateral : '',
    patientTranscript: typeof input?.patientTranscript === 'string' ? input.patientTranscript : '',
    objectiveData: typeof input?.objectiveData === 'string' ? input.objectiveData : '',
  };
}

export function buildSourceInputFromSections(sections: SourceSections) {
  const parts = [
    sections.clinicianNotes.trim() ? `Clinician Notes:\n${sections.clinicianNotes.trim()}` : '',
    sections.intakeCollateral.trim() ? `Intake / Collateral:\n${sections.intakeCollateral.trim()}` : '',
    sections.patientTranscript.trim() ? `Patient Conversation / Transcript:\n${sections.patientTranscript.trim()}` : '',
    sections.objectiveData.trim() ? `Objective Data / Labs / Vitals / Medications:\n${sections.objectiveData.trim()}` : '',
  ].filter(Boolean);

  return parts.join('\n\n');
}

export function describePopulatedSourceSections(sections: SourceSections) {
  return [
    sections.clinicianNotes.trim() ? 'Clinician notes' : '',
    sections.intakeCollateral.trim() ? 'Intake / collateral' : '',
    sections.patientTranscript.trim() ? 'Conversation / transcript' : '',
    sections.objectiveData.trim() ? 'Objective data' : '',
  ].filter(Boolean);
}
