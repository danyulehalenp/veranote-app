import { describe, expect, it } from 'vitest';

import {
  phaseThreeBatchTwoRegressionConversations,
  phaseThreeBatchTwoRegressionTargets,
} from '@/lib/eval/phase-three-batch2-regression';
import { selectVeraProviderQuestionCases } from '@/lib/veranote/lab/question-bank';

const phaseThreeBatchTwoCategories = [
  'involuntary_medication_refusal',
  'discharge_ama_elopement_risk',
  'personality_disorder_language_caution',
] as const;

describe('phase 3 batch 2 regression suite', () => {
  it('contains the stable 9-conversation batch 2 baseline with explicit persistence expectations', () => {
    expect(phaseThreeBatchTwoRegressionConversations).toHaveLength(9);

    for (const conversation of phaseThreeBatchTwoRegressionConversations) {
      expect(conversation.requiredConcepts.length).toBeGreaterThan(0);
      expect(conversation.forbiddenUnsafeBehavior.length).toBeGreaterThan(0);
      expect(conversation.pressureTurnPersistenceExpectations.length).toBeGreaterThan(0);
      expect(conversation.turns).toHaveLength(3);
    }
  });

  it('pins the verified zero-drift batch 2 targets and maps them cleanly onto the active question bank', () => {
    const cases = selectVeraProviderQuestionCases(undefined, [...phaseThreeBatchTwoCategories]);
    expect(cases).toHaveLength(phaseThreeBatchTwoRegressionTargets.conversations);
    expect(phaseThreeBatchTwoRegressionTargets.passed).toBe(9);
    expect(phaseThreeBatchTwoRegressionTargets.failed).toBe(0);
    expect(phaseThreeBatchTwoRegressionTargets.passRate).toBe(1);
    expect(phaseThreeBatchTwoRegressionTargets.answerModeIssues).toBe(0);
    expect(phaseThreeBatchTwoRegressionTargets.routingIssues).toBe(0);
    expect(phaseThreeBatchTwoRegressionTargets.wordingIssues).toBe(0);
    expect(phaseThreeBatchTwoRegressionTargets.unsafeSimplificationIssues).toBe(0);
    expect(phaseThreeBatchTwoRegressionTargets.genericFallbackCount).toBe(0);
    expect(phaseThreeBatchTwoRegressionTargets.pressureTurnFailures).toBe(0);

    const caseMap = new Map(cases.map((item) => [item.id, item]));

    for (const conversation of phaseThreeBatchTwoRegressionConversations) {
      const matchedCase = caseMap.get(conversation.id);
      expect(matchedCase, `${conversation.id} should exist in the active question bank`).toBeTruthy();
      expect(matchedCase?.expected_answer_mode).toBe(conversation.expectedAnswerMode);
      expect(matchedCase?.prompt).toBe(conversation.initialPrompt);
      expect(matchedCase?.followup_prompt).toBe(conversation.correctionPrompt);
      expect(matchedCase?.pressure_prompt).toBe(conversation.pressurePrompt);
      expect(matchedCase?.must_include.length).toBeGreaterThan(0);
      expect(matchedCase?.must_not_include.length).toBeGreaterThan(0);

      for (const requiredConcept of conversation.requiredConcepts) {
        expect(requiredConcept.length).toBeGreaterThan(0);
      }

      for (const forbiddenBehavior of conversation.forbiddenUnsafeBehavior) {
        expect(forbiddenBehavior.length).toBeGreaterThan(0);
      }

      for (const expectation of conversation.pressureTurnPersistenceExpectations) {
        expect(expectation.length).toBeGreaterThan(0);
      }
    }
  });
});
