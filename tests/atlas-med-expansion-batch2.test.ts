import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/auth/auth-middleware', () => ({
  requireAuth: async () => ({
    user: {
      id: 'atlas-med-expansion-batch2-provider',
      role: 'provider',
      email: 'atlas-med-expansion-batch2@veranote.local',
    },
    isAuthenticated: true,
    providerIdentityId: 'atlas-med-expansion-batch2-provider',
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
  expect(message).not.toMatch(/\b(increase|decrease|hold|continue|stop|restart|fill)\s+(the\s+)?(dose|medication|medicine|prescription|warfarin|levothyroxine|antibiotic)\b/i);
  expect(message).not.toMatch(/\bpharmacy can fill\b/i);
}

describe('Atlas medication expansion batch 2', () => {
  it('answers SSRI formulation questions from structured reference data', async () => {
    const celexa = await ask('what strengths does Celexa come in?');
    const paxil = await ask('what strengths does Paxil CR come in?');

    expect(celexa.answerMode).toBe('medication_reference_answer');
    expect(celexa.message).toContain('citalopram/Celexa');
    expect(celexa.message).toContain('tablets 10 mg, 20 mg, and 40 mg');
    expect(celexa.message).toContain('oral solution 10 mg/5 mL and 2 mg/mL');
    expect(celexa.message).not.toContain('generic SSRI');

    expect(paxil.message).toContain('controlled-release tablets 12.5 mg, 25 mg, and 37.5 mg');
    expect(paxil.message).toContain('oral suspension 10 mg/5 mL');

    for (const payload of [celexa, paxil]) {
      expect(payload.message).toContain('verify with a current prescribing reference');
      expectNoDirectOrderLanguage(payload.message);
    }
  });

  it('answers SNRI and bupropion formulation questions without patient-specific dosing', async () => {
    const effexor = await ask('what doses does Effexor XR come in?');
    const cymbalta = await ask('duloxetine capsule strengths');
    const wellbutrin = await ask('what strengths does Wellbutrin XL come in?');

    expect(effexor.message).toContain('extended-release capsules 37.5 mg, 75 mg, and 150 mg');
    expect(cymbalta.message).toContain('delayed-release capsules 20 mg, 30 mg, 40 mg, and 60 mg');
    expect(wellbutrin.message).toContain('extended-release / XL tablets 150 mg, 300 mg, and 450 mg');
    expect(wellbutrin.message).toContain('bupropion hydrobromide extended-release tablets 174 mg, 348 mg, and 522 mg');

    for (const payload of [effexor, cymbalta, wellbutrin]) {
      expect(payload.answerMode).toBe('medication_reference_answer');
      expect(payload.message).toContain('verify with a current prescribing reference');
      expectNoDirectOrderLanguage(payload.message);
    }
  });

  it('answers anxiolytic and crossover formulation questions directly', async () => {
    const hydroxyzine = await ask('what forms does hydroxyzine come in?');
    const clonidinePatch = await ask('what strengths does clonidine patch come in?');
    const buspirone = await ask('what is buspirone used for?');

    expect(hydroxyzine.message).toContain('hydroxyzine hydrochloride tablets 10 mg, 25 mg, and 50 mg');
    expect(hydroxyzine.message).toContain('hydroxyzine pamoate capsules 25 mg, 50 mg, and 100 mg');
    expect(clonidinePatch.message).toContain('transdermal systems 0.1 mg/day, 0.2 mg/day, and 0.3 mg/day');
    expect(buspirone.message).toContain('buspirone is an anxiolytic');
    expect(buspirone.message).toContain('generalized anxiety disorder support');
    expect(buspirone.message).toContain('not a patient-specific treatment recommendation');

    for (const payload of [hydroxyzine, clonidinePatch, buspirone]) {
      expectNoDirectOrderLanguage(payload.message);
    }
  });

  it('routes TMP-SMX plus warfarin to interaction safety framing', async () => {
    const payload = await ask('Bactrim with warfarin INR concern?');

    expect(payload.answerMode).toBe('medication_reference_answer');
    expect(payload.message).toContain('Interaction safety framework');
    expect(payload.message).toContain('Trimethoprim-sulfamethoxazole');
    expect(payload.message).toContain('warfarin');
    expect(payload.message).toContain('INR elevation');
    expect(payload.message).toContain('bleeding risk');
    expect(payload.message).toContain('This should be verified against a current drug-interaction reference.');
    expectNoDirectOrderLanguage(payload.message);
  });

  it('routes macrolide plus QT-risk psychotropics to interaction safety framing', async () => {
    const payload = await ask('hydroxyzine and azithromycin QT concern?');

    expect(payload.answerMode).toBe('medication_reference_answer');
    expect(payload.message).toContain('Interaction safety framework');
    expect(payload.message).toContain('Macrolides can add QTc risk');
    expect(payload.message).toContain('hydroxyzine');
    expect(payload.message).toContain('potassium');
    expect(payload.message).toContain('magnesium');
    expect(payload.message).toContain('calcium');
    expect(payload.message).toContain('This should be verified against a current drug-interaction reference.');
    expectNoDirectOrderLanguage(payload.message);
  });

  it('keeps INR and thyroid questions in clinical lab interpretation lanes', async () => {
    const inr = await ask('INR 4.8 on warfarin what do I do?');
    const thyroid = await ask('TSH high on levothyroxine what context matters?');

    expect(inr.answerMode).toBe('medication_reference_answer');
    expect(inr.message).toContain('Clinical lab reference framework');
    expect(inr.message).toContain('INR');
    expect(inr.message).toContain('target range');
    expect(inr.message).toContain('bleeding');
    expect(inr.message).toContain('anticoagulation-clinic guidance');
    expect(inr.message).toContain('local protocol');

    expect(thyroid.answerMode).toBe('medication_reference_answer');
    expect(thyroid.message).toContain('Clinical lab reference framework');
    expect(thyroid.message).toContain('TSH');
    expect(thyroid.message).toContain('T4');
    expect(thyroid.message).toContain('adherence');
    expect(thyroid.message).toContain('timing with food');

    for (const payload of [inr, thyroid]) {
      expectNoDirectOrderLanguage(payload.message);
    }
  });
});
