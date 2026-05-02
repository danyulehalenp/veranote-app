import { describe, expect, it, vi } from 'vitest';
import { LIVE_ASSISTANT_QUESTION_BANK } from '@/lib/eval/live-assistant/live-assistant-question-bank';
import {
  evaluateLiveAssistantAnswer,
  summarizeLiveAssistantEvaluations,
} from '@/lib/eval/live-assistant/evaluate-live-assistant-answer';

vi.mock('@/lib/auth/auth-middleware', () => ({
  requireAuth: async () => ({
    user: {
      id: 'live-assistant-qa-provider',
      role: 'provider',
      email: 'live-assistant-qa@veranote.local',
    },
    isAuthenticated: true,
    providerIdentityId: 'live-assistant-qa-provider',
    tokenSource: 'header',
  }),
}));

vi.mock('@/lib/resilience/rate-limiter', () => ({
  checkRateLimit: async () => {},
}));

import { POST } from '@/app/api/assistant/respond/route';

async function askThroughAssistantRoute(message: string) {
  const response = await POST(new Request('http://localhost/api/assistant/respond?eval=true', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      stage: 'review',
      mode: 'workflow-help',
      message,
      context: {
        providerAddressingName: 'Live QA Provider',
        noteType: 'Medication Reference',
        currentDraftText: '',
      },
      recentMessages: [],
    }),
  }));

  expect(response.status).toBe(200);
  return response.json() as Promise<{ message: string; answerMode?: string }>;
}

describe('live assistant answer-quality bank through the assistant route', () => {
  it('keeps provider-facing medication/lab answers concise, direct, and safe', async () => {
    const results = [];

    for (const testCase of LIVE_ASSISTANT_QUESTION_BANK) {
      const payload = await askThroughAssistantRoute(testCase.question);
      results.push(evaluateLiveAssistantAnswer(testCase, payload.message));
    }

    const summary = summarizeLiveAssistantEvaluations(results);
    expect(summary.failures).toEqual([]);
    expect(summary.passed).toBe(LIVE_ASSISTANT_QUESTION_BANK.length);
  });
});
