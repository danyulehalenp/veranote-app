import type { SourceSections } from '@/types/session';
import { SOURCE_LANE_ORDER, getSourceLaneContract, normalizeSourceLaneText } from '@/lib/note/source-lane-contract';

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
  const parts = SOURCE_LANE_ORDER.map((id) => {
    const value = normalizeSourceLaneText(sections, id);
    const contract = getSourceLaneContract(id);
    return value && contract ? `${contract.label}:\n${value}` : '';
  }).filter(Boolean);

  return parts.join('\n\n');
}

export function describePopulatedSourceSections(sections: SourceSections) {
  return SOURCE_LANE_ORDER.map((id) => {
    const value = normalizeSourceLaneText(sections, id);
    const contract = getSourceLaneContract(id);
    return value && contract ? contract.populatedLabel : '';
  }).filter(Boolean);
}
