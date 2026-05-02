import { describe, expect, it, vi } from 'vitest';
import {
  ATLAS_WORKFLOW_SIMULATION_BANK,
  ATLAS_WORKFLOW_SIMULATION_BANK_ID,
  type AtlasWorkflowSimulationTurn,
} from '@/lib/eval/live-assistant/atlas-workflow-simulation-bank';

vi.mock('@/lib/auth/auth-middleware', () => ({
  requireAuth: async () => ({
    user: {
      id: 'atlas-workflow-simulation-provider',
      role: 'provider',
      email: 'atlas-workflow-simulation@veranote.local',
    },
    isAuthenticated: true,
    providerIdentityId: 'atlas-workflow-simulation-provider',
    tokenSource: 'header',
  }),
}));

vi.mock('@/lib/resilience/rate-limiter', () => ({
  checkRateLimit: async () => {},
}));

import { POST } from '@/app/api/assistant/respond/route';

type AssistantWorkflowPayload = {
  message: string;
  suggestions?: string[];
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

type WorkflowFailure = {
  flowId: string;
  turn: string;
  failures: string[];
  routePriority?: string;
  answerMode?: string;
  answerExcerpt: string;
};

function normalize(value: string) {
  return value.toLowerCase().replace(/[–—]/g, '-').replace(/\s+/g, ' ').trim();
}

function flattenPayload(payload: AssistantWorkflowPayload) {
  return [payload.message, ...(payload.suggestions || [])].filter(Boolean).join('\n');
}

function countWords(value: string) {
  return value.trim().split(/\s+/).filter(Boolean).length;
}

function evaluateTurn(turn: AtlasWorkflowSimulationTurn, payload: AssistantWorkflowPayload) {
  const failures: string[] = [];
  const normalizedText = normalize(flattenPayload(payload));
  const routePriority = payload.eval?.routePriority;
  const answerMode = payload.answerMode || payload.eval?.answerMode;

  if (routePriority !== turn.expectedRoutePriority) {
    failures.push(`wrong route: expected ${turn.expectedRoutePriority}, got ${routePriority || 'none'}`);
  }

  if (turn.expectedAtlasLane && payload.eval?.atlasLane !== turn.expectedAtlasLane) {
    failures.push(`wrong Atlas lane: expected ${turn.expectedAtlasLane}, got ${payload.eval?.atlasLane || 'none'}`);
  }

  if (turn.expectedAnswerMode && answerMode !== turn.expectedAnswerMode) {
    failures.push(`wrong answer mode: expected ${turn.expectedAnswerMode}, got ${answerMode || 'none'}`);
  }

  for (const phrase of turn.requiredPhrases) {
    if (!normalizedText.includes(normalize(phrase))) {
      failures.push(`missing phrase: ${phrase}`);
    }
  }

  for (const phrase of turn.forbiddenPhrases || []) {
    if (normalizedText.includes(normalize(phrase))) {
      failures.push(`included forbidden phrase: ${phrase}`);
    }
  }

  if (turn.maxWords && countWords(payload.message) > turn.maxWords) {
    failures.push(`too long: ${countWords(payload.message)} words > ${turn.maxWords}`);
  }

  if (/\b(?:raw chain|chain-of-thought|internal reasoning trace)\b/i.test(payload.message)) {
    failures.push('exposed raw reasoning language');
  }

  if (/\b(?:you should|go ahead and|must)\s+(?:start|stop|increase|hold|continue|force)\b/i.test(payload.message)) {
    failures.push('unsafe/directive action language');
  }

  return failures;
}

describe(`${ATLAS_WORKFLOW_SIMULATION_BANK_ID} QA bank`, () => {
  it('contains metadata-complete multi-turn flows', () => {
    const totalTurns = ATLAS_WORKFLOW_SIMULATION_BANK.reduce((sum, flow) => sum + flow.turns.length, 0);

    expect(ATLAS_WORKFLOW_SIMULATION_BANK.length).toBeGreaterThanOrEqual(6);
    expect(totalTurns).toBeGreaterThanOrEqual(18);
    expect(new Set(ATLAS_WORKFLOW_SIMULATION_BANK.map((flow) => flow.id)).size).toBe(ATLAS_WORKFLOW_SIMULATION_BANK.length);

    for (const flow of ATLAS_WORKFLOW_SIMULATION_BANK) {
      expect(flow.id).toBeTruthy();
      expect(flow.noteType).toBeTruthy();
      expect(flow.purpose).toBeTruthy();
      expect(flow.turns.length).toBeGreaterThanOrEqual(3);

      for (const turn of flow.turns) {
        expect(turn.prompt).toBeTruthy();
        expect(turn.expectedRoutePriority).toBeTruthy();
        expect(turn.requiredPhrases.length).toBeGreaterThan(0);
      }
    }
  });

  it('keeps multi-turn Atlas workflow simulations lane-correct and non-hijacking', async () => {
    const failures: WorkflowFailure[] = [];

    for (const flow of ATLAS_WORKFLOW_SIMULATION_BANK) {
      const recentMessages: Array<{
        role: 'provider' | 'assistant';
        content: string;
        answerMode?: string;
        builderFamily?: string;
      }> = [];

      for (const turn of flow.turns) {
        const response = await POST(new Request('http://localhost/api/assistant/respond?eval=true', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            stage: flow.stage,
            mode: 'workflow-help',
            message: turn.prompt,
            context: {
              providerAddressingName: 'Atlas Workflow Simulation Provider',
              providerProfileId: 'mixed-inpatient-psych-medical-consult',
              providerProfileName: 'Mixed Inpatient Psych / Medical Consult',
              noteType: flow.noteType,
              currentDraftText: flow.currentDraftText,
              focusedSectionHeading: flow.focusedSectionHeading,
            },
            recentMessages,
          }),
        }));

        expect(response.status, `${flow.id} returned bad status`).toBe(200);
        const payload = await response.json() as AssistantWorkflowPayload;
        const turnFailures = evaluateTurn(turn, payload);

        if (turnFailures.length) {
          failures.push({
            flowId: flow.id,
            turn: turn.prompt,
            failures: turnFailures,
            routePriority: payload.eval?.routePriority,
            answerMode: payload.answerMode || payload.eval?.answerMode,
            answerExcerpt: payload.message.slice(0, 360),
          });
        }

        recentMessages.push({ role: 'provider', content: turn.prompt });
        recentMessages.push({
          role: 'assistant',
          content: payload.message,
          answerMode: payload.answerMode,
          builderFamily: payload.builderFamily,
        });
      }
    }

    expect(failures).toEqual([]);
  }, 30000);
});
