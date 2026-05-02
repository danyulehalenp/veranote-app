import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/auth/auth-middleware', () => ({
  requireAuth: async () => ({
    user: {
      id: 'atlas-geriatric-reference-provider',
      role: 'provider',
      email: 'atlas-geriatric-reference@veranote.local',
    },
    isAuthenticated: true,
    providerIdentityId: 'atlas-geriatric-reference-provider',
    tokenSource: 'header',
  }),
}));

vi.mock('@/lib/resilience/rate-limiter', () => ({
  checkRateLimit: async () => {},
}));

import { POST } from '@/app/api/assistant/respond/route';

async function ask(message: string) {
  const response = await POST(new Request('http://localhost/api/assistant/respond?eval=true', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      stage: 'review',
      mode: 'workflow-help',
      message,
      context: {
        providerAddressingName: 'Test Provider',
        noteType: 'Medication Reference',
        currentDraftText: '',
      },
      recentMessages: [],
    }),
  }));

  expect(response.status).toBe(200);
  return response.json() as Promise<{ message: string; answerMode?: string }>;
}

function expectConciseGeriatricReference(message: string) {
  expect(message.split(/\s+/).filter(Boolean).length).toBeLessThanOrEqual(130);
  expect(message.toLowerCase()).toContain('older');
  expect(message.toLowerCase()).toContain('risk');
  expect(message).not.toContain('I do not have a confident medication match');
  expect(message).not.toContain('I don\'t have a safe Veranote answer');
  expect(message).not.toContain('Common psychiatric uses include');
  expect(message).not.toContain('Common uses include');
  expect(message).not.toMatch(/\bincrease\s+(?:the\s+)?(?:dose|medication)\b/i);
  expect(message).not.toMatch(/\bhold\s+(?:the\s+)?(?:dose|medication|lithium|clozapine)\b/i);
  expect(message).not.toMatch(/\bcontinue\s+(?:the\s+)?(?:dose|medication|lithium|clozapine)\b/i);
  expect(message).not.toMatch(/\bstop\s+(?:the\s+)?(?:dose|medication|lithium|clozapine)\b/i);
  expect(message).not.toMatch(/\bsafe to combine\b/i);
}

describe('narrow geriatric psychiatry reference lane', () => {
  it.each([
    ['What is the "Start low, go slow" rule for the elderly?', ['start low', 'older', 'risk']],
    ['Are benzodiazepines on the Beers Criteria?', ['benzodiazepines', 'older', 'risk']],
    ['What is the risk of antipsychotics in dementia-related psychosis?', ['antipsychotics', 'older', 'risk']],
    ['Can SSRIs cause SIADH in older adults?', ['SSRI', 'SIADH', 'older', 'risk']],
    ['What is the preferred antidepressant for a patient with post-stroke depression?', ['post-stroke depression', 'older', 'risk']],
    ['Is donepezil effective for mild cognitive impairment?', ['donepezil', 'mild cognitive impairment', 'older', 'risk']],
    ['Can memantine be combined with galantamine?', ['memantine', 'galantamine', 'older', 'risk']],
    ['What is the dose of lorazepam for an 85-year-old?', ['lorazepam', 'older', 'risk']],
    ['Does diphenhydramine cause confusion in the elderly?', ['diphenhydramine', 'older', 'risk']],
    ['Is mirtazapine used for appetite stimulation in geriatrics?', ['mirtazapine', 'older', 'risk']],
    ['What are the side effects of cholinesterase inhibitors?', ['cholinesterase inhibitors', 'older', 'risk']],
    ['Can lithium cause toxicity more easily in the elderly?', ['lithium', 'older', 'risk']],
    ['Is trazodone safe for sleep in patients with dementia?', ['trazodone', 'older', 'risk']],
    ['What is the risk of falls with quetiapine?', ['quetiapine', 'older', 'risk']],
    ['Can risperidone be used for aggression in Alzheimer\'s?', ['risperidone', 'older', 'risk']],
    ['Is ECT safe for patients over 80?', ['ECT', 'older', 'risk']],
    ['Does citalopram cause QTc issues in the elderly?', ['citalopram', 'older', 'risk']],
    ['What is the starting dose of rivastigmine?', ['rivastigmine', 'older', 'risk']],
    ['Can older adults develop lithium-induced nephropathy?', ['lithium', 'older', 'risk']],
    ['Is nortriptyline preferred over amitriptyline in geriatrics?', ['nortriptyline', 'amitriptyline', 'older', 'risk']],
  ])('answers geriatric reference question directly: %s', async (question, expectedParts) => {
    const payload = await ask(question);
    const normalized = payload.message.toLowerCase();

    expect(payload.answerMode).toBe('medication_reference_answer');
    for (const part of expectedParts) {
      expect(normalized).toContain(part.toLowerCase());
    }
    expectConciseGeriatricReference(payload.message);
  });
});
