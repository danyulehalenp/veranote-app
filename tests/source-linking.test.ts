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

  it('does not let Provider Add-On instructions outrank true clinical source evidence', () => {
    const sentenceMap = buildSectionSentenceEvidenceMap([
      {
        anchor: 'plan',
        heading: 'Plan',
        body: 'Medication list conflict remains unresolved because the chart lists sertraline 100 mg while the patient reports taking 50 mg most days.',
      },
    ], {
      intakeCollateral: 'Chart medication list lists sertraline 100 mg daily.',
      clinicianNotes: 'Patient reports taking sertraline 50 mg most days and did not increase the dose.',
      patientTranscript: '',
      objectiveData: 'Provider Add-On: Do not say taking as prescribed. Preserve sertraline medication conflict.',
    });

    const topLinks = sentenceMap.plan?.[0]?.links.slice(0, 2).map((link) => link.blockId) || [];
    expect(topLinks.join(' ')).toMatch(/intakeCollateral|clinicianNotes/);
    expect(topLinks.join(' ')).not.toMatch(/objectiveData/);
  });
});
