import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/auth/auth-middleware', () => ({
  requireAuth: async () => ({
    user: {
      id: 'provider-history-psychosis-collateral',
      role: 'provider',
      email: 'provider-history-psychosis-collateral@veranote.local',
    },
    isAuthenticated: true,
    providerIdentityId: 'provider-history-psychosis-collateral',
    tokenSource: 'header',
  }),
}));

vi.mock('@/lib/resilience/rate-limiter', () => ({
  checkRateLimit: async () => {},
}));

import { POST } from '@/app/api/assistant/respond/route';
import {
  providerHistoryPsychosisCollateralRegressionCases as cases,
  type ProviderHistoryPsychosisCollateralCase,
} from '@/lib/eval/provider-history-psychosis-collateral-regression';

function noteTypeFor(testCase: ProviderHistoryPsychosisCollateralCase) {
  if (testCase.category === 'mixed-collateral-capacity') {
    return 'Inpatient Psych Initial Adult Evaluation';
  }
  return 'Inpatient Psych Progress Note';
}

async function askVera(
  message: string,
  testCase: ProviderHistoryPsychosisCollateralCase,
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
        noteType: noteTypeFor(testCase),
        focusedSectionHeading: testCase.category === 'mixed-collateral-capacity' ? 'Assessment / Capacity' : 'Assessment / Plan',
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
      expect(normalized).toMatch(/source labels|patient report|collateral|staff|chart|nursing|observation/);
      return;
    case 'observed behavior':
    case 'observed behavior described':
      expect(normalized).toMatch(/observed behavior|laughing to self|thought blocking|guardedness|distraction|internal preoccupation|responding to unseen|whispering|pausing|scanning/);
      return;
    case 'patient report':
      expect(normalized).toMatch(/patient report|patient reports|patient states|patient denial|denies/);
      return;
    case 'diagnostic uncertainty':
      expect(normalized).toMatch(/diagnostic uncertainty|does not establish|differential|uncertain|not establish/);
      return;
    case 'substance/medical contributors':
      expect(normalized).toMatch(/substance-related|medical|mood-related|contributors|differential/);
      return;
    case 'brief missing-data checklist':
      expect(normalized).toMatch(/brief missing-data checklist|missing-data checklist|missing data/);
      return;
    case 'denial preserved':
      expect(normalized).toMatch(/denial preserved|patient denial|denies/);
      return;
    case 'avoid certainty about hallucinations':
      expect(normalized).toMatch(/avoid certainty about hallucinations|rather than a definitive hallucination report|unless the patient endorses|directly supports/);
      return;
    case 'conflicting accounts':
      expect(normalized).toMatch(/conflicting accounts|conflicting.*remain|discrepancy|separately rather than resolving/);
      return;
    case 'clinical relevance':
      expect(normalized).toMatch(/clinical relevance|clinically relevant|safety relevance/);
      return;
    case 'no unsupported resolution':
      expect(normalized).toMatch(/do not choose|do not resolve|without resolving|not choose|not resolve/);
      return;
    case 'patient preference':
      expect(normalized).toMatch(/patient preference|patient reports wanting|refusing the admission plan|patient states a preference/);
      return;
    case 'collateral concern':
      expect(normalized).toMatch(/collateral concern|family reports|collateral reports|self-care concerns/);
      return;
    case 'decision-specific capacity factors':
      expect(normalized).toMatch(/decision-specific capacity factors|understand.*appreciate.*reason.*communicate|understanding.*appreciation.*reasoning.*stable choice/);
      return;
    case 'local policy/legal caveat':
      expect(normalized).toMatch(/local policy|legal consult|legal process|legal authority/);
      return;
    default:
      expect(normalized).toContain(concept.toLowerCase());
  }
}

function assertNoForbidden(text: string, forbidden: string) {
  const normalized = text.toLowerCase();
  expect(normalized).not.toContain(forbidden.toLowerCase());
}

describe('provider-history psychosis/collateral regression', () => {
  it.each(cases)('keeps source labels and uncertainty for $id', async (testCase) => {
    const initial = await askVera(testCase.syntheticPrompt, testCase);
    const initialText = responseText(initial);

    expect(testCase.expectedBehaviorSummary.length).toBeGreaterThan(20);
    expect(testCase.expectedAnswerModes).toContain(initial.answerMode);
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

    expect(testCase.expectedAnswerModes).toContain(followup.answerMode);
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

    expect(testCase.expectedAnswerModes).toContain(pressure.answerMode);
    expect(pressure.builderFamily).toBe(testCase.expectedBuilderFamily);
    for (const concept of testCase.mustInclude) {
      assertConcept(pressureText, concept);
    }
    for (const forbidden of testCase.mustNotInclude) {
      assertNoForbidden(pressureText, forbidden);
    }
  });
});
