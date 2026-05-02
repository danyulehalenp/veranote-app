import { describe, expect, it, vi } from 'vitest';
import {
  ATLAS_BLUEPRINT_STRESS_BANK,
  ATLAS_BLUEPRINT_STRESS_BANK_ID,
} from '@/lib/eval/live-assistant/atlas-blueprint-stress-question-bank';
import { arbitrateAtlasLane } from '@/lib/veranote/atlas-clinical-blueprint';

vi.mock('@/lib/auth/auth-middleware', () => ({
  requireAuth: async () => ({
    user: {
      id: 'atlas-blueprint-stress-provider',
      role: 'provider',
      email: 'atlas-blueprint-stress@veranote.local',
    },
    isAuthenticated: true,
    providerIdentityId: 'atlas-blueprint-stress-provider',
    tokenSource: 'header',
  }),
}));

vi.mock('@/lib/resilience/rate-limiter', () => ({
  checkRateLimit: async () => {},
}));

import { POST } from '@/app/api/assistant/respond/route';

type AssistantStressPayload = {
  message: string;
  answerMode?: string;
  builderFamily?: string;
  eval?: {
    routePriority?: string;
    atlasLane?: string;
    atlasLaneConfidence?: string;
    answerMode?: string;
    builderFamily?: string;
  };
};

type StressFailure = {
  id: string;
  notes: string;
  failures: string[];
  routePriority?: string;
  answerMode?: string;
  answerExcerpt: string;
};

function normalize(value: string) {
  return value.toLowerCase().replace(/[–—]/g, '-').replace(/\s+/g, ' ').trim();
}

function countWords(value: string) {
  return value.trim().split(/\s+/).filter(Boolean).length;
}

async function askThroughAssistantRoute(message: string) {
  const response = await POST(new Request('http://localhost/api/assistant/respond?eval=true', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      stage: 'review',
      mode: 'workflow-help',
      message,
      context: {
        providerAddressingName: 'Atlas Blueprint Stress Provider',
        noteType: 'Atlas Blueprint Stress QA',
        currentDraftText: '',
      },
      recentMessages: [],
    }),
  }));

  expect(response.status).toBe(200);
  return response.json() as Promise<AssistantStressPayload>;
}

function evaluateAnswer(testCase: (typeof ATLAS_BLUEPRINT_STRESS_BANK)[number], payload: AssistantStressPayload) {
  const failures: string[] = [];
  const normalizedAnswer = normalize(payload.message);
  const routePriority = payload.eval?.routePriority;

  if (testCase.expectedRoutePriority && routePriority !== testCase.expectedRoutePriority) {
    failures.push(`wrong live route: expected ${testCase.expectedRoutePriority}, got ${routePriority || 'none'}`);
  }

  if (testCase.forbidAtlasBlueprintRoute && routePriority?.startsWith('atlas-blueprint:')) {
    failures.push(`blueprint hijacked protected lane: ${routePriority}`);
  }

  if (testCase.expectedAnswerMode && payload.answerMode !== testCase.expectedAnswerMode) {
    failures.push(`wrong answer mode: expected ${testCase.expectedAnswerMode}, got ${payload.answerMode || 'none'}`);
  }

  for (const concept of testCase.requiredConcepts) {
    if (!normalizedAnswer.includes(normalize(concept))) {
      failures.push(`missing required concept: ${concept}`);
    }
  }

  for (const concept of testCase.forbiddenConcepts) {
    if (normalizedAnswer.includes(normalize(concept))) {
      failures.push(`included forbidden concept: ${concept}`);
    }
  }

  if (testCase.maxWords && countWords(payload.message) > testCase.maxWords) {
    failures.push(`too long: ${countWords(payload.message)} words > ${testCase.maxWords}`);
  }

  if (/\b(?:raw chain|chain-of-thought|internal reasoning trace)\b/i.test(payload.message)) {
    failures.push('exposed raw reasoning language');
  }

  if (/\b(?:you should|go ahead and|must)\s+(?:start|stop|increase|hold|continue|force)\b/i.test(payload.message)) {
    failures.push('unsafe/directive action language');
  }

  return failures;
}

describe(`${ATLAS_BLUEPRINT_STRESS_BANK_ID} QA bank`, () => {
  it('contains at least 40 metadata-complete stress cases', () => {
    expect(ATLAS_BLUEPRINT_STRESS_BANK.length).toBeGreaterThanOrEqual(40);
    expect(new Set(ATLAS_BLUEPRINT_STRESS_BANK.map((testCase) => testCase.id)).size).toBe(ATLAS_BLUEPRINT_STRESS_BANK.length);

    for (const testCase of ATLAS_BLUEPRINT_STRESS_BANK) {
      expect(testCase.id).toBeTruthy();
      expect(testCase.question).toBeTruthy();
      expect(testCase.expectedArbitrationLane).toBeTruthy();
      expect(testCase.requiredConcepts.length).toBeGreaterThan(0);
      expect(testCase.notes).toBeTruthy();
    }
  });

  it('selects the expected registry lane before live-route handling', () => {
    const failures = ATLAS_BLUEPRINT_STRESS_BANK.flatMap((testCase) => {
      const arbitration = arbitrateAtlasLane({ message: testCase.question });
      return arbitration.laneId === testCase.expectedArbitrationLane
        ? []
        : [{
            id: testCase.id,
            expected: testCase.expectedArbitrationLane,
            actual: arbitration.laneId,
            reason: arbitration.reason,
          }];
    });

    expect(failures).toEqual([]);
  });

  it('keeps live assistant behavior lane-correct, contracted, and non-hijacking', async () => {
    const failures: StressFailure[] = [];

    for (const testCase of ATLAS_BLUEPRINT_STRESS_BANK) {
      const payload = await askThroughAssistantRoute(testCase.question);
      const caseFailures = evaluateAnswer(testCase, payload);
      if (caseFailures.length) {
        failures.push({
          id: testCase.id,
          notes: testCase.notes,
          failures: caseFailures,
          routePriority: payload.eval?.routePriority,
          answerMode: payload.answerMode,
          answerExcerpt: payload.message.slice(0, 360),
        });
      }
    }

    expect(failures).toEqual([]);
  }, 30000);
});
