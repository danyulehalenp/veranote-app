import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/auth/auth-middleware', () => ({
  requireAuth: async () => ({
    user: {
      id: 'atlas-med-expansion-batch3-provider',
      role: 'provider',
      email: 'atlas-med-expansion-batch3@veranote.local',
    },
    isAuthenticated: true,
    providerIdentityId: 'atlas-med-expansion-batch3-provider',
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
  expect(message).not.toMatch(/\b(increase|decrease|hold|continue|stop|restart|fill)\s+(the\s+)?(dose|medication|medicine|prescription|warfarin|lithium|stimulant|hypnotic)\b/i);
  expect(message).not.toMatch(/\bpharmacy can fill\b/i);
}

describe('Atlas medication expansion batch 3', () => {
  it('routes lithium plus NSAID/renal-risk meds to interaction safety framing', async () => {
    const nsaid = await ask('lithium and ibuprofen concern?');
    const aceThiazide = await ask('lithium with lisinopril and HCTZ?');

    expect(nsaid.answerMode).toBe('medication_reference_answer');
    expect(nsaid.message).toContain('Interaction safety framework');
    expect(nsaid.message).toContain('NSAIDs');
    expect(nsaid.message).toContain('lithium exposure and toxicity risk');
    expect(nsaid.message).toContain('renal function');
    expect(nsaid.message).toContain('sodium and fluid status');
    expect(nsaid.message).toContain('This should be verified against a current drug-interaction reference.');

    expect(aceThiazide.message).toContain('ACE inhibitors');
    expect(aceThiazide.message).toContain('thiazide diuretics');
    expect(aceThiazide.message).toContain('dehydration');
    expect(aceThiazide.message).toContain('toxicity symptoms');

    for (const payload of [nsaid, aceThiazide]) {
      expectNoDirectOrderLanguage(payload.message);
    }
  });

  it('routes SSRI/SNRI plus antithrombotic meds to bleeding-risk framing', async () => {
    const aspirin = await ask('SSRI and aspirin bleeding risk?');
    const clopidogrelNsaid = await ask('sertraline with clopidogrel and naproxen?');

    expect(aspirin.answerMode).toBe('medication_reference_answer');
    expect(aspirin.message).toContain('SSRIs and SNRIs can add bleeding risk');
    expect(aspirin.message).toContain('GI bleed');
    expect(aspirin.message).toContain('bruising or bleeding symptoms');
    expect(aspirin.message).toContain('This should be verified against a current drug-interaction reference.');

    expect(clopidogrelNsaid.message).toContain('clopidogrel');
    expect(clopidogrelNsaid.message).toContain('NSAIDs');
    expect(clopidogrelNsaid.message).toContain('CBC/hemoglobin');

    for (const payload of [aspirin, clopidogrelNsaid]) {
      expectNoDirectOrderLanguage(payload.message);
      expect(payload.message).not.toMatch(/\bdefinitely safe\b/i);
    }
  });

  it('routes azole antifungal interaction questions to CYP/QTc/sedation framing', async () => {
    const quetiapine = await ask('fluconazole with quetiapine concern?');
    const alprazolam = await ask('alprazolam with ketoconazole safe?');

    expect(quetiapine.answerMode).toBe('medication_reference_answer');
    expect(quetiapine.message).toContain('Azole antifungals');
    expect(quetiapine.message).toContain('CYP');
    expect(quetiapine.message).toContain('QTc');
    expect(quetiapine.message).toContain('hepatic function');
    expect(quetiapine.message).toContain('This should be verified against a current drug-interaction reference.');

    expect(alprazolam.message).toContain('benzodiazepines');
    expect(alprazolam.message).toContain('sedation and respiratory/CNS depression');
    expect(alprazolam.message).not.toMatch(/\bsimply safe\b/i);

    for (const payload of [quetiapine, alprazolam]) {
      expectNoDirectOrderLanguage(payload.message);
    }
  });

  it('answers stimulant safety questions without routine restart framing', async () => {
    const mania = await ask('restart stimulant possible mania?');
    const psychosis = await ask('methylphenidate in psychosis what should I watch?');

    expect(mania.answerMode).toBe('medication_reference_answer');
    expect(mania.message).toContain('Stimulant/ADHD medication safety framing');
    expect(mania.message).toContain('mania');
    expect(mania.message).toContain('psychosis');
    expect(mania.message).toContain('substance use and diversion risk');
    expect(mania.message).toContain('blood pressure');
    expect(mania.message).toContain('heart rate');
    expect(mania.message).toContain('not a patient-specific order');

    expect(psychosis.message).toContain('current mood stability');
    expect(psychosis.message).toContain('psychosis or paranoia');
    expect(psychosis.message).toContain('cardiac history');

    for (const payload of [mania, psychosis]) {
      expectNoDirectOrderLanguage(payload.message);
      expect(payload.message).toContain('do not treat this as a routine restart');
    }
  });

  it('answers ADHD medication formulation questions from structured data', async () => {
    const vyvanse = await ask('what strengths does Vyvanse come in?');
    const intuniv = await ask('what strengths does Intuniv come in?');

    expect(vyvanse.answerMode).toBe('medication_reference_answer');
    expect(vyvanse.message).toContain('capsules 10 mg, 20 mg, 30 mg, 40 mg, 50 mg, 60 mg, and 70 mg');
    expect(vyvanse.message).toContain('chewable tablets 10 mg, 20 mg, 30 mg, 40 mg, 50 mg, and 60 mg');
    expect(intuniv.message).toContain('extended-release tablets 1 mg, 2 mg, 3 mg, and 4 mg');

    for (const payload of [vyvanse, intuniv]) {
      expect(payload.message).toContain('verify with a current prescribing reference');
      expectNoDirectOrderLanguage(payload.message);
    }
  });

  it('routes hypnotic plus CNS depressant questions to sedative safety framing', async () => {
    const ambienCombo = await ask('Ambien with lorazepam and alcohol safe?');
    const sleepApnea = await ask('zolpidem sleep apnea fall risk?');

    expect(ambienCombo.answerMode).toBe('medication_reference_answer');
    expect(ambienCombo.message).toContain('Sleep medications and sedative-hypnotics');
    expect(ambienCombo.message).toContain('additive CNS-depression');
    expect(ambienCombo.message).toContain('respiratory depression risk');
    expect(ambienCombo.message).toContain('complex sleep behaviors');
    expect(ambienCombo.message).toContain('This should be verified against a current drug-interaction reference.');

    expect(sleepApnea.message).toContain('Sleep-medication safety framing');
    expect(sleepApnea.message).toContain('sleep apnea');
    expect(sleepApnea.message).toContain('falls');

    for (const payload of [ambienCombo, sleepApnea]) {
      expectNoDirectOrderLanguage(payload.message);
      expect(payload.message).not.toMatch(/\bdefinitely safe\b/i);
    }
  });

  it('answers hypnotic formulation questions without interaction drift', async () => {
    const ambienCr = await ask('what strengths does Ambien CR come in?');
    const belsomra = await ask('Belsomra tablet strengths');

    expect(ambienCr.answerMode).toBe('medication_reference_answer');
    expect(ambienCr.message).toContain('extended-release tablets 6.25 mg and 12.5 mg');
    expect(belsomra.message).toContain('tablets 5 mg, 10 mg, 15 mg, and 20 mg');

    for (const payload of [ambienCr, belsomra]) {
      expect(payload.message).toContain('verify with a current prescribing reference');
      expectNoDirectOrderLanguage(payload.message);
    }
  });
});
