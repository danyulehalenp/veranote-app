import { describe, expect, it, vi } from 'vitest';
import { LIVE_ASSISTANT_CONVERSATION_BANK } from '@/lib/eval/live-assistant/live-assistant-conversation-bank';
import {
  evaluateLiveAssistantConversation,
  summarizeLiveAssistantConversationResults,
  type LiveAssistantConversationTurnInput,
} from '@/lib/eval/live-assistant/evaluate-live-assistant-conversation';
import type { AssistantThreadTurn } from '@/types/assistant';

vi.mock('@/lib/auth/auth-middleware', () => ({
  requireAuth: async () => ({
    user: {
      id: 'live-assistant-conversation-route-provider',
      role: 'provider',
      email: 'live-assistant-conversation-route@veranote.local',
    },
    isAuthenticated: true,
    providerIdentityId: 'live-assistant-conversation-route-provider',
    tokenSource: 'header',
  }),
}));

vi.mock('@/lib/resilience/rate-limiter', () => ({
  checkRateLimit: async () => {},
}));

import { POST } from '@/app/api/assistant/respond/route';

type AssistantRoutePayload = {
  message?: string;
  answerMode?: string;
  builderFamily?: AssistantThreadTurn['builderFamily'];
  eval?: {
    routePriority?: string;
    conversation?: {
      didRewrite?: boolean;
    };
  };
};

async function askConversationRoute(message: string, recentMessages: AssistantThreadTurn[]) {
  const response = await POST(new Request('http://localhost/api/assistant/respond?eval=true', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: 'Bearer veranote-provider-token',
    },
    body: JSON.stringify({
      stage: 'review',
      mode: 'workflow-help',
      message,
      context: {
        providerAddressingName: 'Live Conversation QA Provider',
        noteType: 'Inpatient Psych Progress Note',
        outputDestination: 'WellSky',
        currentDraftText: '',
      },
      recentMessages,
    }),
  }));

  expect(response.status).toBe(200);
  return response.json() as Promise<AssistantRoutePayload>;
}

describe('live assistant conversation route QA', () => {
  it('keeps multi-turn Atlas scenarios lane-correct and conversationally continuous', async () => {
    const scenarioResults = [];

    for (const scenario of LIVE_ASSISTANT_CONVERSATION_BANK) {
      const recentMessages: AssistantThreadTurn[] = [];
      const turnInputs: LiveAssistantConversationTurnInput[] = [];

      for (const turn of scenario.turns) {
        const payload = await askConversationRoute(turn.prompt, recentMessages);
        const answer = payload.message || '';

        turnInputs.push({
          prompt: turn.prompt,
          answer,
          answerMode: payload.answerMode,
          routePriority: payload.eval?.routePriority,
          conversationDidRewrite: payload.eval?.conversation?.didRewrite,
        });

        recentMessages.push({ role: 'provider', content: turn.prompt });
        recentMessages.push({
          role: 'assistant',
          content: answer,
          answerMode: payload.answerMode,
          builderFamily: payload.builderFamily,
        });
      }

      scenarioResults.push(evaluateLiveAssistantConversation(scenario, turnInputs));
    }

    const summary = summarizeLiveAssistantConversationResults(scenarioResults);
    expect(summary.failures, JSON.stringify(summary.failures, null, 2)).toEqual([]);
    expect(summary.failedScenarios).toBe(0);
    expect(summary.failedTurns).toBe(0);
  }, 30000);
});
