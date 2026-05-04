import { describe, expect, it } from 'vitest';
import { detectAuditRisk } from '@/lib/veranote/defensibility/audit-risk-detector';
import { evaluateCptSupport, evaluatePostNoteCptRecommendations } from '@/lib/veranote/defensibility/cpt-support';
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

  it('recommends post-note CPT candidate families without final billing assignment', () => {
    const result = evaluatePostNoteCptRecommendations({
      noteType: 'Outpatient Psych Follow-up',
      completedNoteText: [
        'Interval update: anxiety worsened. Medication adherence, side effects, and dose adjustment reviewed.',
        '20 minutes of psychotherapy documented using CBT reframing and coping skills.',
        'Plan reviewed and follow-up scheduled.',
      ].join(' '),
      encounterSupport: {
        totalMinutes: '35',
        psychotherapyMinutes: '20',
      },
    });

    expect(result.summary).toContain('possible CPT-support candidate');
    expect(result.candidates.some((candidate) => candidate.family === 'Office / outpatient E/M family')).toBe(true);
    expect(result.candidates.some((candidate) => candidate.family === 'Psychotherapy add-on with E/M family')).toBe(true);
    expect(result.guardrails.join(' ')).toContain('not definitive billing recommendations');
    expect(JSON.stringify(result)).not.toMatch(/bill this code|guaranteed|meets criteria for/i);
  });

  it('keeps thin medication follow-up from becoming psychotherapy add-on support', () => {
    const result = evaluatePostNoteCptRecommendations({
      noteType: 'Outpatient Psych Follow-up',
      completedNoteText: 'Mood stable. Medications reviewed. Continue sertraline 100 mg. Follow up in 4 weeks.',
    });

    expect(result.candidates.some((candidate) => candidate.family === 'Office / outpatient E/M family')).toBe(true);
    expect(result.candidates.some((candidate) => candidate.family === 'Psychotherapy add-on with E/M family')).toBe(false);
    expect(result.missingGlobalElements.join(' ')).toContain('No clear time signal');
  });

  it('handles misspelled psychotherapy wording while still requiring time support', () => {
    const result = evaluatePostNoteCptRecommendations({
      noteType: 'Therapy Follow-up',
      completedNoteText: 'Psycotherpay visit focused on coping skills and reframing grief triggers. No minutes listed.',
    });

    const therapyCandidate = result.candidates.find((candidate) => candidate.family === 'Psychotherapy-only family');

    expect(therapyCandidate?.strength).toBe('possible-review');
    expect(therapyCandidate?.missingElements.join(' ')).toContain('Psychotherapy minutes');
    expect(JSON.stringify(result)).toContain('not definitive');
  });

  it('does not imply crisis psychotherapy from risk language without crisis timing', () => {
    const result = evaluatePostNoteCptRecommendations({
      noteType: 'Psychiatric Crisis Note',
      completedNoteText: 'Patient endorsed suicidal ideation. Safety plan discussed and follow-up arranged.',
    });

    const crisisCandidate = result.candidates.find((candidate) => candidate.family === 'Psychotherapy for crisis family');

    expect(crisisCandidate?.strength).toBe('insufficient-support');
    expect(crisisCandidate?.missingElements.join(' ')).toContain('Crisis psychotherapy timing');
    expect(crisisCandidate?.cautions.join(' ')).toContain('Urgency or risk language alone');
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
