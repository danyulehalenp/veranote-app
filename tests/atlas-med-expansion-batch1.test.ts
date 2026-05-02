import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/auth/auth-middleware', () => ({
  requireAuth: async () => ({
    user: {
      id: 'atlas-med-expansion-provider',
      role: 'provider',
      email: 'atlas-med-expansion@veranote.local',
    },
    isAuthenticated: true,
    providerIdentityId: 'atlas-med-expansion-provider',
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
  return response.json();
}

function expectNoDirectOrderLanguage(message: string) {
  expect(message).not.toMatch(/\byou should\b/i);
  expect(message).not.toMatch(/\b(increase|hold|continue|stop|fill)\s+(the\s+)?(dose|medication|medicine|prescription|injection|clozapine|methadone|buprenorphine)\b/i);
  expect(message).not.toMatch(/\bpharmacy can fill\b/i);
}

describe('Atlas medication expansion batch 1', () => {
  it('answers LAI antipsychotic strength questions from structured reference data', async () => {
    const sustenna = await ask('what strengths does Invega Sustenna come in?');
    const maintena = await ask('what strengths does Abilify Maintena come in?');
    const risperidoneLai = await ask('what strengths does risperidone LAI come in?');

    expect(sustenna.answerMode).toBe('medication_reference_answer');
    expect(sustenna.message).toContain('39 mg, 78 mg, 117 mg, 156 mg, and 234 mg');
    expect(sustenna.message).not.toContain('Oral-to-LAI framework');

    expect(maintena.message).toContain('300 mg and 400 mg');
    expect(maintena.message).not.toContain('Oral-to-LAI framework');

    expect(risperidoneLai.message).toContain('Risperdal Consta microsphere kit 12.5 mg, 25 mg, 37.5 mg, and 50 mg');
    expect(risperidoneLai.message).toContain('Perseris extended-release injectable kit 90 mg and 120 mg');
    expect(risperidoneLai.message).toContain('Uzedy extended-release prefilled syringes 50 mg, 75 mg, 100 mg, 125 mg, 150 mg, 200 mg, and 250 mg');

    for (const payload of [sustenna, maintena, risperidoneLai]) {
      expect(payload.message).toContain('verify with a current prescribing reference');
      expectNoDirectOrderLanguage(payload.message);
    }
  });

  it('keeps LAI initiation and missed-dose questions in framework mode', async () => {
    const missed = await ask('Abilify Maintena missed dose restart?');
    const overlap = await ask('Risperdal Consta oral overlap?');

    expect(missed.answerMode).toBe('medication_reference_answer');
    expect(missed.message).toContain('Oral-to-LAI framework');
    expect(missed.message).toContain('product-specific');
    expect(missed.message).toContain('missed-dose');
    expect(missed.message).toContain('last injection date');

    expect(overlap.message).toContain('Oral-to-LAI framework');
    expect(overlap.message).toContain('Oral overlap requirements differ by formulation');
    expect(overlap.message).toContain('product-specific labeling');

    for (const payload of [missed, overlap]) {
      expect(payload.message).toContain('current prescribing references');
      expectNoDirectOrderLanguage(payload.message);
    }
  });

  it('answers LAI adolescent approval questions directly instead of using transition framework', async () => {
    const payload = await ask('are any long acting injection antipsychotics approved for adolescents?');

    expect(payload.answerMode).toBe('medication_reference_answer');
    expect(payload.message).toContain('No. There are no broadly FDA-approved long-acting injectable antipsychotics for patients under 18');
    expect(payload.message).toContain('most LAI approvals are adult-focused');
    expect(payload.message).toContain('product-specific labeling');
    expect(payload.message).not.toContain('Oral-to-LAI framework');
    expect(payload.message).not.toContain('oral dose');
    expect(payload.message).not.toContain('overlap');
    expect(payload.message).not.toContain('last injection date');
    expect(payload.message.split(/\s+/).length).toBeLessThanOrEqual(100);
    expectNoDirectOrderLanguage(payload.message);
  });

  it('surfaces clozapine monitoring depth without a directive ANC order', async () => {
    const payload = await ask('clozapine monitoring schedule and BEN?');

    expect(payload.answerMode).toBe('medication_reference_answer');
    expect(payload.message).toContain('ANC monitoring');
    expect(payload.message).toContain('BEN');
    expect(payload.message).toContain('current labeling');
    expect(payload.message).toContain('local protocol');
    expect(payload.message).toContain('myocarditis');
    expect(payload.message).toContain('constipation');
    expect(payload.message).toContain('ileus');
    expect(payload.message).toContain('infection symptoms');
    expectNoDirectOrderLanguage(payload.message);
  });

  it('flags opioid antagonist conflicts with buprenorphine or methadone', async () => {
    const naltrexone = await ask('can naltrexone be given with buprenorphine?');
    const lybalvi = await ask('Lybalvi with methadone concern?');

    for (const payload of [naltrexone, lybalvi]) {
      expect(payload.answerMode).toBe('medication_reference_answer');
      expect(payload.message).toContain('opioid antagonist');
      expect(payload.message).toContain('precipitated opioid withdrawal');
      expect(payload.message).toContain('opioid blockade');
      expect(payload.message).toContain('This should be verified against a current drug-interaction reference.');
      expectNoDirectOrderLanguage(payload.message);
    }
  });

  it('supports substance and withdrawal safety frameworks without fixed dosing advice', async () => {
    const gabapentin = await ask('gabapentin withdrawal with alcohol withdrawal overlap?');
    const kratom = await ask('kratom withdrawal buprenorphine?');
    const alcohol = await ask('alcohol withdrawal benzo protocol?');

    expect(gabapentin.message).toContain('Gabapentin withdrawal');
    expect(gabapentin.message).toContain('seizure risk');
    expect(gabapentin.message).toContain('Alcohol withdrawal overlap');

    expect(kratom.message).toContain('Kratom withdrawal');
    expect(kratom.message).toContain('opioid-like withdrawal');
    expect(kratom.message).toContain('specialist-supervised');

    expect(alcohol.message).toContain('Alcohol withdrawal treatment depends on CIWA or symptom-triggered protocol');
    expect(alcohol.message).toContain('local protocol');
    expect(alcohol.message).toContain('do not give a rigid detox order');

    for (const payload of [gabapentin, kratom, alcohol]) {
      expect(payload.answerMode).toBe('medication_reference_answer');
      expectNoDirectOrderLanguage(payload.message);
    }
  });

  it('answers substance-medication formulations directly when that is the question', async () => {
    const suboxone = await ask('what strengths does Suboxone film come in?');
    const methadone = await ask('what strengths does methadone come in?');
    const naltrexone = await ask('what forms does naltrexone come in?');

    expect(suboxone.message).toContain('2 mg/0.5 mg, 4 mg/1 mg, 8 mg/2 mg, and 12 mg/3 mg');
    expect(suboxone.message).not.toContain('Interaction safety framework');

    expect(methadone.message).toContain('tablets 5 mg and 10 mg');
    expect(methadone.message).toContain('oral concentrate 10 mg/mL');
    expect(methadone.message).not.toContain('Interaction safety framework');

    expect(naltrexone.message).toContain('tablets 50 mg');
    expect(naltrexone.message).toContain('extended-release injectable suspension 380 mg');

    for (const payload of [suboxone, methadone, naltrexone]) {
      expect(payload.message).toContain('verify with a current prescribing reference');
      expectNoDirectOrderLanguage(payload.message);
    }
  });
});
