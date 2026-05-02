import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/auth/auth-middleware', () => ({
  requireAuth: async () => ({
    user: {
      id: 'atlas-simple-facts-provider',
      role: 'provider',
      email: 'atlas-simple-facts@veranote.local',
    },
    isAuthenticated: true,
    providerIdentityId: 'atlas-simple-facts-provider',
    tokenSource: 'header',
  }),
}));

vi.mock('@/lib/resilience/rate-limiter', () => ({
  checkRateLimit: async () => {},
}));

import { POST } from '@/app/api/assistant/respond/route';
import { answerStructuredMedicationFactQuestion } from '@/lib/veranote/med-reference/facts';

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

function expectNoUnsafeDirective(message: string) {
  expect(message).not.toMatch(/\bincrease\s+(?:the\s+)?(?:dose|medication|lithium|depakote|valproate|haldol)\b/i);
  expect(message).not.toMatch(/\bhold\s+(?:the\s+)?(?:dose|medication|lithium|depakote|valproate|clozapine|haldol)\b/i);
  expect(message).not.toMatch(/\bcontinue\s+(?:the\s+)?(?:dose|medication|lithium|depakote|valproate|clozapine|haldol)\b/i);
  expect(message).not.toMatch(/\bstop\s+(?:the\s+)?(?:dose|medication|lithium|depakote|valproate|clozapine|haldol)\b/i);
  expect(message).not.toMatch(/\bpharmacy can fill\b/i);
  expect(message).not.toMatch(/\bsafe to combine\b/i);
}

describe('structured simple medication facts lane', () => {
  it('stores source-backed medication facts separately from generic profiles', () => {
    const fluoxetine = answerStructuredMedicationFactQuestion('What is the half-life of fluoxetine?');
    const clozapine = answerStructuredMedicationFactQuestion('How often should clozapine ANC levels be monitored after the first year?');

    expect(fluoxetine?.text).toContain('norfluoxetine');
    expect(fluoxetine?.sourceRefs.some((source) => source.url.includes('dailymed.nlm.nih.gov'))).toBe(true);
    expect(clozapine?.text).toContain('monthly');
  });

  it.each([
    ['What is the starting dose for quetiapine in an elderly patient?', ['quetiapine', 'elderly', 'start low', 'orthostasis']],
    ['How often should clozapine ANC levels be monitored after the first year?', ['clozapine', 'ANC', 'monthly']],
    ['What is the half-life of fluoxetine?', ['fluoxetine', 'half-life', 'norfluoxetine']],
    ['What is the maximum daily dose of duloxetine for GAD?', ['duloxetine', '120 mg/day', 'GAD']],
    ['Does gabapentin require renal dosing adjustment?', ['gabapentin', 'renal dose adjustment']],
    ['What is the therapeutic serum concentration for nortriptyline?', ['nortriptyline', '50-150 ng/mL']],
    ['What is the maximum dose of citalopram for patients over age 60?', ['citalopram', '20 mg/day', '60']],
    ['What is the half-life of alprazolam?', ['alprazolam', 'half-life']],
    ['What is the recommended starting dose for atomoxetine in a 40kg child?', ['atomoxetine', '40 kg', '0.5 mg/kg/day']],
    ['What is the maximum daily dose of prazosin for PTSD-related nightmares?', ['prazosin', 'PTSD', 'blood pressure']],
    ['What is the washout period required when switching from phenelzine to an SSRI?', ['phenelzine', 'SSRI', '14-day washout']],
    ['What is the initial dosing for vilazodone?', ['vilazodone', '10 mg', 'food']],
    ['Does lurasidone need to be taken with food?', ['lurasidone', 'food', '350 calories']],
    ['What is the minimum caloric intake required for ziprasidone absorption?', ['ziprasidone', '500 calories']],
    ['What is the duration of action for diazepam?', ['Diazepam', 'long-acting', 'active metabolites']],
    ['What is the starting dose of aripiprazole for pediatric irritability in autism?', ['aripiprazole', 'autism', '2 mg/day']],
    ['What is the maximum dose of bupropion XL?', ['Bupropion XL', '450 mg/day', 'seizure']],
    ['What is the half-life of methadone?', ['Methadone', 'half-life', 'variable']],
    ['Is there a maximum dose for lorazepam in status epilepticus?', ['Lorazepam', 'status epilepticus', 'protocol', '4 mg']],
    ['What is the starting dose for guanfacine ER in ADHD?', ['Guanfacine ER', '1 mg', 'ADHD']],
  ])('answers %s directly without falling into a generic profile', async (question, expectedParts) => {
    const payload = await ask(question);
    const normalizedMessage = payload.message.toLowerCase();

    expect(payload.answerMode).toBe('medication_reference_answer');
    for (const part of expectedParts) {
      expect(normalizedMessage).toContain(part.toLowerCase());
    }
    expect(payload.message).not.toContain('Common uses include');
    expect(payload.message).not.toContain('Common psychiatric uses include');
    expect(payload.message).not.toContain('Meds recognized:');
    expect(payload.message).not.toContain('Oral-to-LAI framework');
    expectNoUnsafeDirective(payload.message);
  });

  it.each([
    ['What are the target serum levels for carbamazepine?', ['carbamazepine', '4-12 mcg/mL']],
    ['What is the maximum dose of buspirone per day?', ['Buspirone', '60 mg/day']],
    ['What is the half-life of buprenorphine?', ['Buprenorphine', 'half-life', '31-35 hours']],
    ['What is the maximum dose of mirtazapine?', ['Mirtazapine', '45 mg/day']],
    ['Does desvenlafaxine require hepatic adjustment?', ['Desvenlafaxine', 'hepatic', '50 mg/day']],
    ['What is the starting dose for brexpiprazole in MDD?', ['brexpiprazole', 'MDD', '0.5 mg']],
  ])('covers additional Batch 1 factual references: %s', async (question, expectedParts) => {
    const payload = await ask(question);
    const normalizedMessage = payload.message.toLowerCase();

    expect(payload.answerMode).toBe('medication_reference_answer');
    for (const part of expectedParts) {
      expect(normalizedMessage).toContain(part.toLowerCase());
    }
    expect(payload.message).not.toContain('I do not have a confident medication match');
    expectNoUnsafeDirective(payload.message);
  });
});
