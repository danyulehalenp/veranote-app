import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/auth/auth-middleware', () => ({
  requireAuth: async () => ({
    user: {
      id: 'provider-history-core-note-regression',
      role: 'provider',
      email: 'provider-history-core-note-regression@veranote.local',
    },
    isAuthenticated: true,
    providerIdentityId: 'provider-history-core-note-regression',
    tokenSource: 'header',
  }),
}));

vi.mock('@/lib/resilience/rate-limiter', () => ({
  checkRateLimit: async () => {},
}));

import { POST } from '@/app/api/assistant/respond/route';
import {
  providerHistoryCoreNoteRegressionCases as cases,
  type ProviderHistoryCoreNoteCase,
} from '@/lib/eval/provider-history-core-note-regression';

function noteTypeFor(category: ProviderHistoryCoreNoteCase['category']) {
  if (category === 'hpi') {
    return 'Inpatient Psych Initial Adult Evaluation';
  }
  if (category === 'progress' || category === 'crisis') {
    return 'Inpatient Psych Progress Note';
  }
  return 'Inpatient Psych Discharge Summary';
}

async function askVera(
  message: string,
  testCase: ProviderHistoryCoreNoteCase,
  recentMessages: Array<{ role: string; content: string }> = [],
) {
  const response = await POST(new Request('http://localhost/api/assistant/respond?eval=true', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      stage: 'review',
      mode: 'workflow-help',
      message,
      context: {
        providerAddressingName: 'Test Provider',
        noteType: noteTypeFor(testCase.category),
        focusedSectionHeading: testCase.category === 'discharge' ? 'Hospital Course' : 'Assessment / Plan',
        currentDraftText: testCase.syntheticPrompt,
      },
      recentMessages,
    }),
  }));

  expect(response.status).toBe(200);
  return response.json();
}

function responseText(payload: Record<string, unknown>) {
  const message = typeof payload.message === 'string' ? payload.message : '';
  const suggestions = Array.isArray(payload.suggestions) ? payload.suggestions.join('\n') : '';
  return `${message}\n${suggestions}`;
}

function assertConcept(text: string, concept: string) {
  const normalized = text.toLowerCase();
  expect(normalized).toContain(concept.toLowerCase());
}

function assertNoForbidden(text: string, forbidden: string) {
  const normalized = text.toLowerCase();
  expect(normalized).not.toContain(forbidden.toLowerCase());
}

describe('provider-history core note-generation regression', () => {
  it.each(cases)('routes and answers core note workflow $id', async (testCase) => {
    const initial = await askVera(testCase.syntheticPrompt, testCase);
    const initialText = responseText(initial);

    expect(testCase.expectedBehaviorSummary.length).toBeGreaterThan(20);
    expect(initial.answerMode).toBe(testCase.expectedAnswerMode);
    expect(initial.builderFamily).toBe(testCase.expectedBuilderFamily);
    for (const concept of testCase.mustInclude) {
      assertConcept(initialText, concept);
    }
    for (const forbidden of testCase.mustNotInclude) {
      assertNoForbidden(initialText, forbidden);
    }

    const followup = await askVera(testCase.followupPrompt, testCase, [
      { role: 'provider', content: testCase.syntheticPrompt },
      { role: 'assistant', content: initialText },
    ]);
    const followupText = responseText(followup);

    expect(followup.answerMode).toBe(testCase.expectedAnswerMode);
    expect(followup.builderFamily).toBe(testCase.expectedBuilderFamily);
    for (const concept of testCase.mustInclude) {
      assertConcept(followupText, concept);
    }
    for (const forbidden of testCase.mustNotInclude) {
      assertNoForbidden(followupText, forbidden);
    }

    const pressure = await askVera(testCase.pressurePrompt, testCase, [
      { role: 'provider', content: testCase.syntheticPrompt },
      { role: 'assistant', content: initialText },
      { role: 'provider', content: testCase.followupPrompt },
      { role: 'assistant', content: followupText },
    ]);
    const pressureText = responseText(pressure);

    expect(pressure.answerMode).toBe(testCase.expectedAnswerMode);
    expect(pressure.builderFamily).toBe(testCase.expectedBuilderFamily);
    for (const concept of testCase.mustInclude) {
      assertConcept(pressureText, concept);
    }
    for (const forbidden of testCase.mustNotInclude) {
      assertNoForbidden(pressureText, forbidden);
    }
  });
});
