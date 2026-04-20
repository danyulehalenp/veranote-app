import { describe, expect, it } from 'vitest';
import { phaseTwoTrustEvalCases } from '@/lib/eval/phase-two-trust-cases';
import { deriveProvisionalEvalTriage } from '@/lib/eval/results-history';

describe('phase 2 trust eval set', () => {
  it('contains the expected dedicated trust-regression cases', () => {
    expect(phaseTwoTrustEvalCases.map((item) => item.id)).toEqual(['39', '40', '41', '42']);
  });

  it('covers the intended trust surfaces', () => {
    const surfaces = phaseTwoTrustEvalCases.map((item) => item.productSurface);

    expect(surfaces).toContain('Objective conflict truth layer');
    expect(surfaces).toContain('Medication truth layer');
    expect(surfaces).toContain('Diagnosis caution layer');
    expect(surfaces).toContain('Risk wording layer');
  });

  it('pins each case to explicit review guidance and truth constraints', () => {
    for (const item of phaseTwoTrustEvalCases) {
      expect(item.rubricEmphasis?.length).toBeGreaterThan(0);
      expect(item.reviewPrompts?.length).toBeGreaterThan(0);
      expect(item.expectedTruths.length).toBeGreaterThan(0);
      expect(item.forbiddenAdditions.length).toBeGreaterThan(0);
      expect(item.knownAmbiguities.length).toBeGreaterThan(0);
      expect(item.nextBuildFocus).toBeTruthy();
    }
  });

  it('derives a conservative provisional triage for trust-case drift', () => {
    const selectedCase = phaseTwoTrustEvalCases.find((item) => item.id === '42');
    expect(selectedCase).toBeTruthy();

    const triage = deriveProvisionalEvalTriage({
      selectedCase: selectedCase!,
      outputSnapshot: `Assessment: Patient denies suicidal ideation and is fully stable for outpatient management. No safety concerns remain. Plan: continue current treatment.`,
      outputFlagsSnapshot: '',
    });

    expect(triage.suggestedStoplight).toBe('Red');
    expect(triage.suggestedOverallRating).toBe('Fail');
    expect(
      triage.suggestedCriticalFailures.some((item) =>
        item === 'Invented suicidal/homicidal ideation status' || item === 'Reversal of negation or uncertainty',
      ),
    ).toBe(true);
    expect(triage.summaryLines.length).toBeGreaterThan(0);
  });
});
