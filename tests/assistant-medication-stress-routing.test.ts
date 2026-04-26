import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/auth/auth-middleware', () => ({
  requireAuth: async () => ({
    user: {
      id: 'med-routing-provider',
      role: 'provider',
      email: 'med-routing@veranote.local',
    },
    isAuthenticated: true,
    providerIdentityId: 'med-routing-provider',
    tokenSource: 'header',
  }),
}));

import { POST } from '@/app/api/assistant/respond/route';

const staleEatingDisorderContext = {
  providerAddressingName: 'Daniel Hale',
  noteType: 'Inpatient Psych Progress Note',
  currentDraftText: 'Eating disorder involving restriction remains concerning because intake is poor, orthostasis is documented, and bradycardia is still present.',
};

const staleEatingDisorderMessages = [
  {
    role: 'provider',
    content: 'Source says eating disorder involving restriction, poor intake, orthostasis, and bradycardia. Keep the medical risk explicit in the note.',
  },
  {
    role: 'assistant',
    content: 'Keep eating-disorder medical risk explicit and do not smooth away orthostasis or bradycardia.',
  },
] as const;

const DOSE_CAVEAT = 'Dosing depends on indication, patient factors, interactions, and current prescribing references.';
const INTERACTION_CAVEAT = 'This should be verified against a current drug-interaction reference.';
const STALE_TERMS = ['Eating disorder involving restriction', 'orthostasis', 'bradycardia'];

type CaseExpectation = {
  prompt: string;
  expectedMode?: string;
  includes: string[];
  excludes?: string[];
};

async function ask(prompt: string) {
  const response = await POST(new Request('http://localhost/api/assistant/respond', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      stage: 'review',
      mode: 'workflow-help',
      message: prompt,
      context: staleEatingDisorderContext,
      recentMessages: staleEatingDisorderMessages,
    }),
  }));

  return response.json();
}

describe('assistant medication stress routing', () => {
  const expectations: CaseExpectation[] = [
    {
      prompt: 'metabolic monitoring for antipsychotics',
      expectedMode: 'medication_reference_answer',
      includes: ['metabolic monitoring', 'weight', 'glucose', 'lipids'],
    },
    {
      prompt: 'lithium and ibuprofen?',
      expectedMode: 'medication_reference_answer',
      includes: ['lithium', 'toxicity risk', INTERACTION_CAVEAT],
    },
    {
      prompt: 'valproate and lamotrigine concern?',
      expectedMode: 'medication_reference_answer',
      includes: ['lamotrigine', 'rash', 'SJS', INTERACTION_CAVEAT],
    },
    {
      prompt: 'benzo and opioid risk?',
      expectedMode: 'medication_reference_answer',
      includes: ['respiratory suppression risk', INTERACTION_CAVEAT],
    },
    {
      prompt: 'citalopram and QT risk?',
      expectedMode: 'medication_reference_answer',
      includes: ['QT', 'EKG', INTERACTION_CAVEAT],
    },
    {
      prompt: 'SSRI and NSAID bleed risk?',
      expectedMode: 'medication_reference_answer',
      includes: ['bleeding', INTERACTION_CAVEAT],
    },
    {
      prompt: 'SSRI in elderly sodium risk?',
      expectedMode: 'medication_reference_answer',
      includes: ['older adults', 'hyponatremia', 'sodium'],
    },
    {
      prompt: 'stimulant in mania?',
      expectedMode: 'medication_reference_answer',
      includes: ['mania', 'psychosis', 'verify'],
    },
    {
      prompt: 'antidepressant in bipolar disorder?',
      expectedMode: 'medication_reference_answer',
      includes: ['bipolar', 'switch', 'mood-stabilizing coverage'],
    },
    {
      prompt: 'pregnancy question for lamotrigine',
      expectedMode: 'medication_reference_answer',
      includes: ['pregnancy', 'lamotrigine', 'current prescribing reference'],
    },
    {
      prompt: 'what dose of madeupzine',
      expectedMode: 'medication_reference_answer',
      includes: ['I do not have a confident medication match'],
    },
    {
      prompt: 'what labs depakot',
      expectedMode: 'medication_reference_answer',
      includes: ['divalproex', 'monitoring'],
    },
    {
      prompt: 'zoloft trazadone ok?',
      expectedMode: 'medication_reference_answer',
      includes: ['sertraline', 'trazodone', INTERACTION_CAVEAT],
    },
    {
      prompt: 'what med starts w d antidepressant?',
      expectedMode: 'medication_reference_answer',
      includes: ['duloxetine', 'desvenlafaxine', 'doxepin'],
    },
    {
      prompt: 'chart wording for patient stopped lithium because of tremor',
      expectedMode: 'chart_ready_wording',
      includes: ['Patient reports stopping lithium because of tremor'],
    },
    {
      prompt: 'how to document med nonadherence without sounding punitive',
      expectedMode: 'chart_ready_wording',
      includes: ['Medication nonadherence remains documented', 'avoid punitive'],
      excludes: ['I do not have a confident medication match'],
    },
  ];

  it('handles the 16 previously failed medication prompts safely on the live route', async () => {
    for (const testCase of expectations) {
      const payload = await ask(testCase.prompt);

      if (testCase.expectedMode) {
        expect(payload.answerMode, testCase.prompt).toBe(testCase.expectedMode);
      }

      for (const expected of testCase.includes) {
        expect(payload.message, `${testCase.prompt} -> ${expected}`).toContain(expected);
      }

      for (const excluded of testCase.excludes || []) {
        expect(payload.message, `${testCase.prompt} excludes ${excluded}`).not.toContain(excluded);
      }

      for (const staleTerm of STALE_TERMS) {
        expect(payload.message, `${testCase.prompt} should not reuse stale context`).not.toContain(staleTerm);
      }
    }
  });

  it('keeps dose caveats on typo-tolerant adult dose questions', async () => {
    const payload = await ask('trileptal start dose adult?');

    expect(payload.answerMode).toBe('medication_reference_answer');
    expect(payload.message).toContain(DOSE_CAVEAT);
  });

  it('routes lithium dosage-form questions through medication reference instead of fallback', async () => {
    const response = await ask('what forms does lithium come in?');

    expect(response.answerMode).toBe('medication_reference_answer');
    expect(response.message).toContain('capsule');
    expect(response.message).toContain('oral solution');
    expect(response.message).toContain('verify with a current prescribing reference');
    expect(response.message).not.toContain('Unable to process request');
  });

  it('keeps adjustment-style timing-uncertain eval prompts out of medication fallback and preserves uncertainty', async () => {
    const response = await POST(new Request('http://localhost/api/assistant/respond?eval=true', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        stage: 'compose',
        mode: 'workflow-help',
        message: 'Patient reports new stress after a breakup and has been anxious and tearful. Exact duration is not documented.',
        context: staleEatingDisorderContext,
      }),
    }));

    const payload = await response.json();
    const flattened = [payload.message, ...(payload.suggestions || [])].join(' ').toLowerCase();
    expect(payload.answerMode).not.toBe('medication_reference_answer');
    expect(flattened).toMatch(/not documented|uncertain|unclear|based on available information|may|tentative/);
    expect(flattened).not.toContain('i do not have a confident medication match');
  });

  it('keeps unknown gas-station drug prompts source-bound and uncertain instead of drifting into medication fallback or diagnosis noise', async () => {
    const response = await POST(new Request('http://localhost/api/assistant/respond?eval=true', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        stage: 'compose',
        mode: 'workflow-help',
        message: 'Patient used an unknown gas-station drug that made them confused and sweaty. Product name is unknown.',
        context: staleEatingDisorderContext,
      }),
    }));

    const payload = await response.json();
    const flattened = [payload.message, ...(payload.suggestions || [])].join(' ').toLowerCase();
    expect(payload.answerMode).not.toBe('medication_reference_answer');
    expect(flattened).toMatch(/unknown|uncertain|unclear|possible|based on available information/);
    expect(flattened).not.toContain('i do not have a confident medication match');
    expect(flattened).not.toContain('definitely tianeptine');
    expect(flattened).not.toContain('eating disorder involving restriction');
  });
});
