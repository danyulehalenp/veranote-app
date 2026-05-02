import { describe, expect, it } from 'vitest';
import { CLINICIAN_LIVE_ASSISTANT_BATCH_1 } from '@/lib/eval/live-assistant/clinician-live-assistant-question-bank';

describe('clinician live assistant QA batch 1', () => {
  it('contains the 40 provided clinician-style psychiatric questions with QA metadata', () => {
    expect(CLINICIAN_LIVE_ASSISTANT_BATCH_1).toHaveLength(40);

    for (const testCase of CLINICIAN_LIVE_ASSISTANT_BATCH_1) {
      expect(testCase.id).toMatch(/^clinician-batch1-\d{3}$/);
      expect(testCase.batchId).toBe('clinician-batch1');
      expect(testCase.question).toBeTruthy();
      expect(testCase.category).toBeTruthy();
      expect(testCase.expectedMode).toBeTruthy();
      expect(Array.isArray(testCase.expectedMustInclude)).toBe(true);
      expect(Array.isArray(testCase.expectedMustNotInclude)).toBe(true);
      expect(typeof testCase.maxWords).toBe('number');
      expect(typeof testCase.shouldAskFollowUp).toBe('boolean');
      expect(testCase.safetyLevel).toBeTruthy();
      expect(typeof testCase.needsVerification).toBe('boolean');
    }
  });
});
