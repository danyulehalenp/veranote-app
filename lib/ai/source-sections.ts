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
    sections.intakeCollateral.trim() ? `Pre-Visit Data:\n${sections.intakeCollateral.trim()}` : '',
    sections.clinicianNotes.trim() ? `Live Visit Notes:\n${sections.clinicianNotes.trim()}` : '',
    sections.patientTranscript.trim() ? `Ambient Transcript:\n${sections.patientTranscript.trim()}` : '',
    sections.objectiveData.trim() ? `Provider Add-On:\n${sections.objectiveData.trim()}` : '',
  ].filter(Boolean);

  return parts.join('\n\n');
}

export function describePopulatedSourceSections(sections: SourceSections) {
  return [
    sections.intakeCollateral.trim() ? 'Pre-visit data' : '',
    sections.clinicianNotes.trim() ? 'Live visit notes' : '',
    sections.patientTranscript.trim() ? 'Ambient transcript' : '',
    sections.objectiveData.trim() ? 'Provider add-on' : '',
  ].filter(Boolean);
}
