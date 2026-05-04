import { describe, expect, it, vi } from 'vitest';
import type { AssistantThreadTurn } from '@/types/assistant';

vi.mock('@/lib/auth/auth-middleware', () => ({
  requireAuth: async () => ({
    user: {
      id: 'atlas-diagnostic-continuity-provider',
      role: 'provider',
      email: 'atlas-diagnostic-continuity@veranote.local',
    },
    isAuthenticated: true,
    providerIdentityId: 'atlas-diagnostic-continuity-provider',
    tokenSource: 'header',
  }),
}));

vi.mock('@/lib/resilience/rate-limiter', () => ({
  checkRateLimit: async () => {},
}));

import { POST } from '@/app/api/assistant/respond/route';

type AssistantRoutePayload = {
  message: string;
  answerMode?: string;
  eval?: {
    routePriority?: string;
    conversation?: {
      didRewrite?: boolean;
      followupIntent?: string;
      routeHint?: string;
      controlledRationale?: string[];
    };
  };
};

async function askDiagnosticThread(
  message: string,
  recentMessages: AssistantThreadTurn[] = [],
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
        noteType: 'Inpatient Psych Progress Note',
        outputDestination: 'WellSky',
        currentDraftText: '',
      },
      recentMessages,
    }),
  }));

  expect(response.status).toBe(200);
  return response.json() as Promise<AssistantRoutePayload>;
}

function expectDiagnosticReferenceAnswer(payload: AssistantRoutePayload) {
  expect(payload.answerMode).toBe('direct_reference_answer');
  expect(payload.message).not.toContain('I do not have a confident medication match');
  expect(payload.message).not.toContain("I don't have a safe Veranote answer");
  expect(payload.message).not.toContain('Get the source in cleanly');
  expect(payload.message).not.toContain('WellSky output');
}

describe('assistant diagnostic conversation continuity', () => {
  it('keeps schizoaffective diagnostic reference questions and follow-ups in the same lane', async () => {
    const thread: AssistantThreadTurn[] = [];

    const comparisonQuestion = 'what is the difference between schizoaffective disorder and bipolar with psychosis?';
    const comparison = await askDiagnosticThread(comparisonQuestion, thread);
    expectDiagnosticReferenceAnswer(comparison);
    expect(comparison.message).toMatch(/psychosis.*outside mood episodes|outside mood episodes.*psychosis/i);
    expect(comparison.message).toMatch(/bipolar disorder with psychotic features|bipolar.*psychotic features|bipolar.*psychosis/i);

    thread.push({ role: 'provider', content: comparisonQuestion });
    thread.push({ role: 'assistant', content: comparison.message, answerMode: comparison.answerMode });

    const continuation = await askDiagnosticThread('yes proceed', thread);
    expectDiagnosticReferenceAnswer(continuation);
    expect(continuation.eval?.routePriority).toBe('atlas-conversation:diagnostic_reference');
    expect(continuation.eval?.conversation?.didRewrite).toBe(true);
    expect(continuation.eval?.conversation?.followupIntent).toBe('continue');
    expect(continuation.message).toMatch(/schizoaffective/i);
    expect(continuation.message).toMatch(/bipolar/i);
    expect(continuation.message).toMatch(/outside mood episodes|without prominent mood symptoms/i);
    expect(continuation.message).not.toMatch(/hidden scratchpad|chain-of-thought|step 1/i);

    const criteria = await askDiagnosticThread('what is schizoaffective disorder criteria?');
    expectDiagnosticReferenceAnswer(criteria);
    expect(criteria.message).toMatch(/psychosis/i);
    expect(criteria.message).toMatch(/mood/i);
    expect(criteria.message).toMatch(/DSM-oriented|not verbatim DSM|diagnostic references/i);

    const dsmQuestion = 'what is dsm criteria for schizoaffective disorder?';
    const dsmCriteria = await askDiagnosticThread(dsmQuestion);
    expectDiagnosticReferenceAnswer(dsmCriteria);
    expect(dsmCriteria.message).toMatch(/psychosis/i);
    expect(dsmCriteria.message).toMatch(/mood/i);
    expect(dsmCriteria.message).toMatch(/not verbatim DSM|DSM-oriented/i);

    const dsmThread: AssistantThreadTurn[] = [
      { role: 'provider', content: dsmQuestion },
      { role: 'assistant', content: dsmCriteria.message, answerMode: dsmCriteria.answerMode },
    ];
    const elaboration = await askDiagnosticThread('can you elaborate on this?', dsmThread);
    expectDiagnosticReferenceAnswer(elaboration);
    expect(elaboration.eval?.routePriority).toBe('atlas-conversation:diagnostic_reference');
    expect(elaboration.eval?.conversation?.didRewrite).toBe(true);
    expect(elaboration.eval?.conversation?.followupIntent).toBe('elaborate');
    expect(elaboration.message).toMatch(/schizoaffective/i);
    expect(elaboration.message).toMatch(/psychosis/i);
    expect(elaboration.message).toMatch(/mood/i);
    expect(elaboration.message).not.toMatch(/hidden scratchpad|chain-of-thought|step 1/i);
  });

  it('keeps medication interaction follow-ups conversational without exposing hidden reasoning', async () => {
    const question = 'can wellbutrin be taken with paxil?';
    const first = await askDiagnosticThread(question);

    expect(first.answerMode).toBe('medication_reference_answer');
    expect(first.message).toMatch(/bupropion|wellbutrin/i);
    expect(first.message).toMatch(/paxil|paroxetine|ssri/i);

    const thread: AssistantThreadTurn[] = [
      { role: 'provider', content: question },
      { role: 'assistant', content: first.message, answerMode: first.answerMode },
    ];
    const followup = await askDiagnosticThread('can you elaborate on this?', thread);

    expect(followup.answerMode).toBe('medication_reference_answer');
    expect(followup.eval?.routePriority).toBe('atlas-conversation:medication_reference');
    expect(followup.eval?.conversation?.didRewrite).toBe(true);
    expect(followup.eval?.conversation?.followupIntent).toBe('elaborate');
    expect(followup.message).toMatch(/bupropion|wellbutrin/i);
    expect(followup.message).toMatch(/paxil|paroxetine|ssri/i);
    expect(followup.message).not.toContain('Get the source in cleanly');
    expect(followup.message).not.toContain("I don't have a safe Veranote answer");
    expect(followup.message).not.toMatch(/hidden scratchpad|chain-of-thought|step 1/i);
  });

  it('switches topics when a new direct clinical question follows a prior thread', async () => {
    const medicationQuestion = 'can wellbutrin be taken with paxil?';
    const medication = await askDiagnosticThread(medicationQuestion);

    const medicationThread: AssistantThreadTurn[] = [
      { role: 'provider', content: medicationQuestion },
      { role: 'assistant', content: medication.message, answerMode: medication.answerMode },
    ];
    const diagnosticSwitch = await askDiagnosticThread('what is schizoaffective disorder criteria?', medicationThread);

    expectDiagnosticReferenceAnswer(diagnosticSwitch);
    expect(diagnosticSwitch.message).toMatch(/schizoaffective/i);
    expect(diagnosticSwitch.message).toMatch(/psychosis/i);
    expect(diagnosticSwitch.message).toMatch(/mood/i);
    expect(diagnosticSwitch.message).not.toMatch(/bupropion|wellbutrin|paxil|paroxetine/i);

    const diagnosticThread: AssistantThreadTurn[] = [
      { role: 'provider', content: 'what is dsm criteria for schizoaffective disorder?' },
      {
        role: 'assistant',
        content: 'Schizoaffective disorder is mainly a timeline diagnosis involving psychosis and mood episode evidence.',
        answerMode: 'direct_reference_answer',
      },
    ];
    const medicationSwitch = await askDiagnosticThread('what about wellbutrin and paxil together?', diagnosticThread);

    expect(medicationSwitch.answerMode).toBe('medication_reference_answer');
    expect(medicationSwitch.message).toMatch(/bupropion|wellbutrin/i);
    expect(medicationSwitch.message).toMatch(/paxil|paroxetine|ssri/i);
    expect(medicationSwitch.message).not.toContain("I don't have a safe Veranote answer");
  });
});
