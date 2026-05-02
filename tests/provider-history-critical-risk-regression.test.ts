import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/auth/auth-middleware', () => ({
  requireAuth: async () => ({
    user: {
      id: 'provider-history-regression',
      role: 'provider',
      email: 'provider-history-regression@veranote.local',
    },
    isAuthenticated: true,
    providerIdentityId: 'provider-history-regression',
    tokenSource: 'header',
  }),
}));

vi.mock('@/lib/resilience/rate-limiter', () => ({
  checkRateLimit: async () => {},
}));

import { POST } from '@/app/api/assistant/respond/route';
import {
  providerHistoryCriticalRiskRegressionCases as cases,
  type ProviderHistoryCriticalRiskCase,
} from '@/lib/eval/provider-history-critical-risk-regression';

function noteTypeFor(category: ProviderHistoryCriticalRiskCase['category']) {
  if (category === 'capacity') {
    return 'Medical Consultation Note';
  }
  if (category === 'benzo' || category === 'overlap') {
    return 'Inpatient Psych Initial Adult Evaluation';
  }
  return 'Inpatient Psych Progress Note';
}

async function askVera(message: string, testCase: ProviderHistoryCriticalRiskCase, recentMessages: Array<{ role: string; content: string }> = []) {
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
        focusedSectionHeading: 'Assessment / Plan',
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
  switch (concept) {
    case 'source labels':
      expect(normalized).toMatch(/patient report:|triage\/collateral\/source report:|staff\/collateral\/source report:/);
      return;
    default:
      expect(normalized).toContain(concept);
  }
}

describe('provider-history critical-risk regression batch', () => {
  it.each(cases)('keeps required critical-risk concepts for $id', async (testCase) => {
    const initial = await askVera(testCase.syntheticPrompt, testCase);
    const initialText = responseText(initial);

    expect(testCase.clinicalRisk).toBe('critical');
    expect(testCase.expectedBehaviorSummary.length).toBeGreaterThan(20);
    expect(initial.answerMode).toBe(testCase.expectedAnswerMode);
    for (const concept of testCase.mustInclude) {
      assertConcept(initialText, concept);
    }
    for (const forbidden of testCase.mustNotInclude) {
      expect(initialText.toLowerCase()).not.toContain(forbidden.toLowerCase());
    }

    const followup = await askVera(testCase.followupPrompt, testCase, [
      { role: 'provider', content: testCase.syntheticPrompt },
      { role: 'assistant', content: initialText },
    ]);
    const followupText = responseText(followup);

    expect(followup.answerMode).toBe(testCase.expectedAnswerMode);
    for (const concept of testCase.mustInclude) {
      assertConcept(followupText, concept);
    }
    for (const forbidden of testCase.mustNotInclude) {
      expect(followupText.toLowerCase()).not.toContain(forbidden.toLowerCase());
    }

    const pressure = await askVera(testCase.pressurePrompt, testCase, [
      { role: 'provider', content: testCase.syntheticPrompt },
      { role: 'assistant', content: initialText },
      { role: 'provider', content: testCase.followupPrompt },
      { role: 'assistant', content: followupText },
    ]);
    const pressureText = responseText(pressure);

    expect(pressure.answerMode).toBe(testCase.expectedAnswerMode);
    for (const concept of testCase.mustInclude) {
      assertConcept(pressureText, concept);
    }
    for (const forbidden of testCase.mustNotInclude) {
      expect(pressureText.toLowerCase()).not.toContain(forbidden.toLowerCase());
    }
  });
});
