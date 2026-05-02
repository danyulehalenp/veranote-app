import { describe, expect, it } from 'vitest';
import {
  LIVE_ASSISTANT_STAGED_QA_BANK,
  LIVE_ASSISTANT_STAGED_QA_BANKS,
} from '@/lib/eval/live-assistant/staged-live-assistant-question-bank';

describe('staged live assistant QA bank', () => {
  it('contains the provided 300 psychiatric provider questions plus diagnostic adversarial and route-boundary cases', () => {
    expect(LIVE_ASSISTANT_STAGED_QA_BANK).toHaveLength(410);
    expect(LIVE_ASSISTANT_STAGED_QA_BANKS['batch1-medication-reference']).toHaveLength(50);
    expect(LIVE_ASSISTANT_STAGED_QA_BANKS['batch2-fda-approvals-indications']).toHaveLength(50);
    expect(LIVE_ASSISTANT_STAGED_QA_BANKS['batch3-interactions-contraindications']).toHaveLength(50);
    expect(LIVE_ASSISTANT_STAGED_QA_BANKS['batch4-labs-monitoring']).toHaveLength(50);
    expect(LIVE_ASSISTANT_STAGED_QA_BANKS['batch5-emergency-toxicology-withdrawal']).toHaveLength(40);
    expect(LIVE_ASSISTANT_STAGED_QA_BANKS['batch6-diagnostic-general-concepts']).toHaveLength(60);
    expect(LIVE_ASSISTANT_STAGED_QA_BANKS['diagnostic-adversarial']).toHaveLength(50);
    expect(LIVE_ASSISTANT_STAGED_QA_BANKS['route-boundary-stress']).toHaveLength(60);
  });

  it('gives every staged case the required QA metadata', () => {
    for (const testCase of LIVE_ASSISTANT_STAGED_QA_BANK) {
      expect(testCase.id).toBeTruthy();
      expect(testCase.question).toBeTruthy();
      expect(testCase.category).toBeTruthy();
      expect(testCase.expectedLane).toBeTruthy();
      expect(testCase.expectedMode).toBeTruthy();
      expect(Array.isArray(testCase.expectedMustInclude)).toBe(true);
      expect(Array.isArray(testCase.expectedMustNotInclude)).toBe(true);
      expect(typeof testCase.maxWords).toBe('number');
      expect(typeof testCase.shouldAskFollowUp).toBe('boolean');
      expect(testCase.safetyLevel).toBeTruthy();
    }
  });
});
