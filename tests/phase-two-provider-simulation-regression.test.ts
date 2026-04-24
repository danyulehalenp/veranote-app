import { describe, expect, it, vi } from 'vitest';
import {
  phaseTwoProviderSimulationRegressionConversations,
  phaseTwoProviderSimulationRegressionTargets,
} from '@/lib/eval/phase-two-provider-simulation-regression';
import type { AssistantThreadTurn } from '@/types/assistant';

vi.mock('@/lib/auth/auth-middleware', () => ({
  requireAuth: async () => ({
    user: {
      id: 'phase-two-regression-provider',
      role: 'provider',
      email: 'phase-two-regression@veranote.local',
    },
    isAuthenticated: true,
    providerIdentityId: 'phase-two-regression-provider',
    tokenSource: 'header',
  }),
}));

vi.mock('@/lib/resilience/rate-limiter', () => ({
  checkRateLimit: async () => {},
}));

import { POST } from '@/app/api/assistant/respond/route';

type ConversationIssue =
  | 'generic fallback'
  | 'answer mode issue'
  | 'routing issue'
  | 'unsafe simplification';

const globalGenericFallbackMarkers = [
  'keep this source-bound',
  'ask for the exact wording',
  'preserve the dangerous contradiction',
  "i don't have a safe veranote answer for that yet.",
  "no, but i'll find out how i can learn how to.",
  'start with the highest-signal trust issue',
];

function includesPhrase(text: string, phrase: string) {
  return text.toLowerCase().includes(phrase.toLowerCase());
}

describe('phase 2 provider simulation regression suite', () => {
  it('contains the stable 13-conversation baseline with explicit persistence expectations', () => {
    expect(phaseTwoProviderSimulationRegressionConversations).toHaveLength(13);
    expect(phaseTwoProviderSimulationRegressionConversations.map((item) => item.id)).toEqual([
      'discharge-home-plan-gap',
      'capacity-dialysis-refusal',
      'collateral-overdose-conflict',
      'malingering-housing-pressure',
      'legal-hold-threshold-uncertain',
      'legal-hold-supported-dangerousness',
      'alcohol-withdrawal-vs-psychosis',
      'medical-psych-delirium',
      'fragmented-source-cleanup',
      'sparse-mse-autocomplete',
      'time-pressure-low-risk-shortcut',
      'ambiguous-followup-referent',
      'stimulant-restart-boundary',
    ]);

    for (const conversation of phaseTwoProviderSimulationRegressionConversations) {
      expect(conversation.requiredConcepts.length).toBeGreaterThan(0);
      expect(conversation.forbiddenUnsafeBehavior.length).toBeGreaterThan(0);
      expect(conversation.pressureTurnPersistenceExpectations.length).toBeGreaterThan(0);
      expect(conversation.turns).toHaveLength(3);
    }
  });

  it('pins the now-passing 13 messy provider conversations as a zero-drift regression baseline', async () => {
    let passed = 0;
    let failed = 0;
    const aggregateIssues: Record<ConversationIssue, number> = {
      'generic fallback': 0,
      'answer mode issue': 0,
      'routing issue': 0,
      'unsafe simplification': 0,
    };

    for (const conversation of phaseTwoProviderSimulationRegressionConversations) {
      const recentMessages: AssistantThreadTurn[] = [];
      const issues = new Set<ConversationIssue>();

      for (const turn of conversation.turns) {
        const response = await POST(
          new Request('http://localhost/api/assistant/respond?eval=true', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              stage: 'review',
              mode: 'workflow-help',
              message: turn.prompt,
              recentMessages,
              context: {
                providerAddressingName: 'Daniel Hale',
                providerProfileId: 'mixed-inpatient-psych-medical-consult',
                noteType: 'Inpatient Psych Progress Note',
              },
            }),
          }),
        );

        expect(response.status).toBe(200);

        const payload = await response.json();
        const message = String(payload.message || '');

        if (payload.answerMode !== conversation.expectedAnswerMode) {
          issues.add('answer mode issue');
        }

        if (payload.eval?.routePriority !== 'clinical-task') {
          issues.add('routing issue');
        }

        if (globalGenericFallbackMarkers.some((marker) => includesPhrase(message, marker))) {
          issues.add('generic fallback');
        }

        for (const requiredPhrase of turn.requiredPhrases) {
          expect(includesPhrase(message, requiredPhrase)).toBe(true);
        }

        for (const forbiddenPhrase of turn.forbiddenPhrases || []) {
          expect(includesPhrase(message, forbiddenPhrase)).toBe(false);
        }

        recentMessages.push({ role: 'provider', content: turn.prompt });
        recentMessages.push({
          role: 'assistant',
          content: message,
          answerMode: payload.answerMode,
          builderFamily: payload.builderFamily,
        });
      }

      for (const issue of issues) {
        aggregateIssues[issue] += 1;
      }

      if (issues.size === 0) {
        passed += 1;
      } else {
        failed += 1;
      }
    }

    expect(passed).toBe(phaseTwoProviderSimulationRegressionTargets.passed);
    expect(failed).toBe(phaseTwoProviderSimulationRegressionTargets.failed);
    expect(aggregateIssues['generic fallback']).toBe(
      phaseTwoProviderSimulationRegressionTargets.genericFallbackCount,
    );
    expect(aggregateIssues['answer mode issue']).toBe(
      phaseTwoProviderSimulationRegressionTargets.answerModeIssues,
    );
    expect(aggregateIssues['routing issue']).toBe(phaseTwoProviderSimulationRegressionTargets.routingIssues);
    expect(aggregateIssues['unsafe simplification']).toBe(
      phaseTwoProviderSimulationRegressionTargets.unsafeSimplificationIssues,
    );
  }, 30000);
});
