import { describe, expect, it } from 'vitest';
import { betaCohortSlots, getBetaWorkflowsForNoteType, isBetaSupportedNoteType, supportedBetaWorkflows } from '@/lib/constants/provider-beta';
import { betaFeedbackEntrySchema, summarizeBetaFeedbackReadiness } from '@/lib/beta/feedback';

describe('provider beta config', () => {
  it('keeps the expected supported beta workflow count', () => {
    expect(supportedBetaWorkflows.length).toBe(7);
  });

  it('recognizes beta-supported note types', () => {
    expect(isBetaSupportedNoteType('Outpatient Psych Follow-Up')).toBe(true);
    expect(isBetaSupportedNoteType('Therapy Progress Note')).toBe(false);
  });

  it('maps note types back to workflow definitions', () => {
    const workflows = getBetaWorkflowsForNoteType('Psychiatric Crisis Note');
    expect(workflows.map((workflow) => workflow.id)).toContain('crisis-note');
  });

  it('keeps the intended first-wave cohort size', () => {
    expect(betaCohortSlots.length).toBe(5);
  });

  it('validates structured beta feedback entries', () => {
    const parsed = betaFeedbackEntrySchema.parse({
      providerRole: 'Psych NP',
      careSetting: 'Outpatient',
      noteType: 'Outpatient Psych Follow-Up',
      sourceInputShape: 'mixed source',
      usefulness: 4,
      trust: 4,
      reviewBurden: 3,
      likelihoodOfReuse: 4,
      strongestPositiveSignal: 'Draft stayed close to source.',
      strongestConcern: 'Needed clearer medication caution.',
      issueCategories: ['medication truth', 'workflow friction'],
    });

    expect(parsed.trust).toBe(4);
  });

  it('summarizes beta readiness counts consistently', () => {
    expect(summarizeBetaFeedbackReadiness()).toEqual({
      supportedWorkflowCount: 7,
      cohortSlotCount: 5,
      feedbackCategoryCount: 10,
      outreachStatusCount: 8,
    });
  });
});
