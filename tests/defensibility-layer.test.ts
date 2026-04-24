import { describe, expect, it } from 'vitest';
import { detectAuditRisk } from '@/lib/veranote/defensibility/audit-risk-detector';
import { evaluateCptSupport } from '@/lib/veranote/defensibility/cpt-support';
import { evaluateLevelOfCare } from '@/lib/veranote/defensibility/level-of-care-evaluator';
import { evaluateLOS } from '@/lib/veranote/defensibility/los-evaluator';
import { evaluateMedicalNecessity } from '@/lib/veranote/defensibility/medical-necessity-engine';

describe('defensibility layer', () => {
  it('finds strong medical-necessity signals without inventing missing ones', () => {
    const result = evaluateMedicalNecessity(
      'Patient has suicidal ideation with a plan to overdose, cannot contract for safety, has poor hygiene, and returned from the ED after failed outpatient stabilization.',
    );

    expect(result.signals.find((item) => item.category === 'risk')?.strength).toBe('strong');
    expect(result.signals.find((item) => item.category === 'treatment_failure')?.strength).not.toBe('missing');
    expect(result.missingElements).toContain('Need for supervised or 24-hour care is not clearly defended.');
  });

  it('suggests inpatient when risk and self-care failure are clearly documented', () => {
    const result = evaluateLevelOfCare(
      'Patient has a plan to overdose, is unsafe if discharged, has poor hygiene, and cannot care for self.',
    );

    expect(result.suggestedLevel).toBe('inpatient');
    expect(result.justification.join(' ')).toContain('Plan or intent language documented.');
  });

  it('builds conservative CPT support without assigning a code', () => {
    const result = evaluateCptSupport(
      '30 minutes of psychotherapy documented. Medication refill and dose adjustment reviewed. CBT and reframing were used.',
    );

    expect(result.summary).toContain('combined medical-management plus psychotherapy');
    expect(result.cautions.join(' ')).toContain('Do not present CPT');
  });

  it('returns LOS reasons, barriers, and missing discharge criteria', () => {
    const result = evaluateLOS(
      'Patient remains unsafe if discharged, is responding to internal stimuli, and has no safe discharge plan.',
    );

    expect(result.reasonsForContinuedStay.length).toBeGreaterThan(0);
    expect(result.barriersToDischarge.join(' ')).toContain('Safe discharge environment');
  });

  it('flags audit risk when contradictions or thin justification are present', () => {
    const result = detectAuditRisk(
      'Patient denies hallucinations but nursing notes responding to internal stimuli. Grave disability is mentioned but lower level of care failure is not documented.',
    );

    expect(result.some((item) => item.type === 'inconsistent_mse')).toBe(true);
    expect(result.some((item) => item.type === 'insufficient_justification')).toBe(true);
  });
});
