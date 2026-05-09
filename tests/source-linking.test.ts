import { describe, expect, it } from 'vitest';
import { buildSectionSentenceEvidenceMap } from '@/lib/note/source-linking';

describe('source linking', () => {
  it('maps draft sentences back to likely source blocks for clinician traceability', () => {
    const sentenceMap = buildSectionSentenceEvidenceMap([
      {
        anchor: 'hpi',
        heading: 'HPI',
        body: 'Patient reports poor sleep and depressed mood. Collateral reports suicidal texts last night.',
      },
    ], {
      intakeCollateral: 'Mother reports suicidal texts last night and concern for safety.',
      clinicianNotes: 'Patient reports poor sleep with depressed mood during interview.',
      patientTranscript: '',
      objectiveData: '',
    });

    expect(sentenceMap.hpi).toHaveLength(2);
    expect(sentenceMap.hpi[0]?.sentence).toMatch(/poor sleep|collateral/i);
    expect(sentenceMap.hpi[0]?.links[0]?.blockId).toMatch(/clinicianNotes|intakeCollateral/);
    expect(sentenceMap.hpi.flatMap((item) => item.links.map((link) => link.overlapTerms.join(' '))).join(' ')).toMatch(/sleep|suicidal|texts/);
  });
});
