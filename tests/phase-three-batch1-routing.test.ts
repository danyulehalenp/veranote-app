import { describe, expect, it, vi } from 'vitest';
import { selectVeraProviderQuestionCases } from '@/lib/veranote/lab/question-bank';

vi.mock('@/lib/auth/auth-middleware', () => ({
  requireAuth: async () => ({
    user: {
      id: 'phase-three-batch1-provider',
      role: 'provider',
      email: 'phase-three-batch1@veranote.local',
    },
    isAuthenticated: true,
    providerIdentityId: 'phase-three-batch1-provider',
    tokenSource: 'header',
  }),
}));

vi.mock('@/lib/resilience/rate-limiter', () => ({
  checkRateLimit: async () => {},
}));

import { POST } from '@/app/api/assistant/respond/route';

type ThreadTurn = {
  role: 'provider' | 'assistant';
  content: string;
};

const phaseThreeBatchOneCategories = [
  'consult_liaison_medical_comorbidity',
  'violence_homicide_risk_nuance',
  'eating_disorder_medical_instability',
] as const;

const genericFallbackMarkers = [
  "i don't have a safe veranote answer for that yet.",
  "no, but i'll find out how i can learn how to.",
  'generic learning fallback',
  'keep this source-bound',
  'start with the highest-signal trust issue',
];

function includesPhrase(text: string, phrase: string) {
  return text.toLowerCase().includes(phrase.toLowerCase());
}

function flattenPayload(payload: any) {
  return [payload.message, ...(payload.suggestions || [])].filter(Boolean).join('\n');
}

describe('phase 3 batch 1 clinical routing', () => {
  it('supports the 9 new batch 1 families with the expected answer mode and pressure-turn persistence', async () => {
    const cases = selectVeraProviderQuestionCases(undefined, [...phaseThreeBatchOneCategories]);
    expect(cases).toHaveLength(9);

    for (const caseDefinition of cases) {
      const recentMessages: ThreadTurn[] = [];
      const scriptedTurns = [
        { label: 'initial', prompt: caseDefinition.prompt },
        ...(caseDefinition.followup_prompt ? [{ label: 'correction', prompt: caseDefinition.followup_prompt }] : []),
        ...(caseDefinition.turns || []).filter((turn) => turn.label !== 'correction').map((turn) => ({
          label: turn.label,
          prompt: turn.prompt,
          expected_answer_mode: turn.expected_answer_mode,
          must_include: turn.must_include,
          must_not_include: turn.must_not_include,
        })),
      ].filter((turn, index, arr) => arr.findIndex((item) => item.label === turn.label && item.prompt === turn.prompt) === index);

      for (const turn of scriptedTurns) {
        const response = await POST(new Request('http://localhost/api/assistant/respond?eval=true', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            stage: caseDefinition.stage || 'review',
            mode: caseDefinition.mode || 'workflow-help',
            message: turn.prompt,
            context: {
              providerAddressingName: 'Daniel Hale',
              noteType: 'Inpatient Psych Progress Note',
              providerProfileId: caseDefinition.provider_profile_id || undefined,
            },
            recentMessages,
          }),
        }));

        expect(response.status, `${caseDefinition.id} ${turn.label} returned unexpected status`).toBe(200);
        const payload = await response.json();
        const text = flattenPayload(payload);
        const expectedAnswerMode = turn.expected_answer_mode ?? caseDefinition.expected_answer_mode;
        const required = turn.label === 'initial' ? caseDefinition.must_include : (turn.must_include || []);
        const forbidden = turn.label === 'initial' ? caseDefinition.must_not_include : (turn.must_not_include || []);

        expect(payload.answerMode || payload.eval?.answerMode, `${caseDefinition.id} ${turn.label} answer mode`).toBe(expectedAnswerMode);

        for (const phrase of required) {
          expect(includesPhrase(text, phrase), `${caseDefinition.id} ${turn.label} missing phrase: ${phrase}`).toBe(true);
        }

        for (const phrase of forbidden) {
          expect(includesPhrase(text, phrase), `${caseDefinition.id} ${turn.label} included forbidden phrase: ${phrase}`).toBe(false);
        }

        for (const marker of genericFallbackMarkers) {
          expect(includesPhrase(text, marker), `${caseDefinition.id} ${turn.label} generic fallback marker: ${marker}`).toBe(false);
        }

        if (expectedAnswerMode === 'chart_ready_wording') {
          expect(text.startsWith('Chart-ready wording:'), `${caseDefinition.id} ${turn.label} should be chart-ready`).toBe(true);
        }

        if (expectedAnswerMode === 'warning_language') {
          expect(text.startsWith('Warning:'), `${caseDefinition.id} ${turn.label} should be warning language`).toBe(true);
        }

        if (expectedAnswerMode === 'clinical_explanation') {
          expect(text.startsWith('Clinical explanation:'), `${caseDefinition.id} ${turn.label} should be clinical explanation`).toBe(true);
        }

        if (expectedAnswerMode === 'workflow_guidance') {
          expect(text.startsWith('Workflow guidance:'), `${caseDefinition.id} ${turn.label} should be workflow guidance`).toBe(true);
        }

        recentMessages.push({ role: 'provider', content: turn.prompt });
        recentMessages.push({ role: 'assistant', content: payload.message || text });
      }
    }
  });
});
