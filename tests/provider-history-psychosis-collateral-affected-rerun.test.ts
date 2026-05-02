import fs from 'node:fs';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/auth/auth-middleware', () => ({
  requireAuth: async () => ({
    user: {
      id: 'provider-history-psychosis-collateral-rerun',
      role: 'provider',
      email: 'provider-history-psychosis-collateral-rerun@veranote.local',
    },
    isAuthenticated: true,
    providerIdentityId: 'provider-history-psychosis-collateral-rerun',
    tokenSource: 'header',
  }),
}));

vi.mock('@/lib/resilience/rate-limiter', () => ({
  checkRateLimit: async () => {},
}));

import { POST } from '@/app/api/assistant/respond/route';

const sourceBankPath = '/Users/danielhale/Documents/New project/lib/veranote/provider-history/synthetic-vera-lab-expanded-candidates.json';
const outputJsonPath = 'test-results/provider-history-psychosis-collateral-affected-rerun-2026-04-26.json';
const targetCategories = new Set([
  'psychosis wording',
  'internal preoccupation vs denial',
  'collateral conflict',
  'mixed collateral conflict and capacity',
]);

type ProviderHistoryCase = {
  id: string;
  category: string;
  clinicalRisk: string;
  providerStyleTags: string[];
  syntheticPrompt: string;
  followupPrompt: string;
  pressurePrompt: string;
  expectedAnswerMode: string;
  mustInclude: string[];
  mustNotInclude: string[];
};

function expectedModes(category: string) {
  if (category === 'mixed collateral conflict and capacity') {
    return ['clinical_explanation', 'workflow_guidance', 'chart_ready_wording'];
  }
  return ['chart_ready_wording', 'warning_language', 'clinical_explanation', 'workflow_guidance'];
}

function expectedFamilies(category: string) {
  return category === 'mixed collateral conflict and capacity' ? ['capacity'] : ['contradiction'];
}

function noteTypeFor(category: string) {
  return category === 'mixed collateral conflict and capacity'
    ? 'Inpatient Psych Initial Adult Evaluation'
    : 'Inpatient Psych Progress Note';
}

async function askVera(message: string, testCase: ProviderHistoryCase, recentMessages: Array<{ role: string; content: string }> = []) {
  const response = await POST(new Request('http://localhost/api/assistant/respond?eval=true', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      stage: 'review',
      mode: 'workflow-help',
      message,
      context: {
        providerAddressingName: 'Test Provider',
        noteType: noteTypeFor(testCase.category),
        focusedSectionHeading: testCase.category === 'mixed collateral conflict and capacity' ? 'Assessment / Capacity' : 'Assessment / Plan',
        currentDraftText: testCase.syntheticPrompt,
      },
      recentMessages,
    }),
  }));

  expect(response.status).toBe(200);
  return response.json();
}

function responseText(payload: Record<string, unknown>) {
  const message = typeof payload.message === 'string' ? payload.message : '';
  const suggestions = Array.isArray(payload.suggestions) ? payload.suggestions.join('\n') : '';
  return `${message}\n${suggestions}`.toLowerCase();
}

function hasConcept(text: string, concept: string) {
  const patterns: Record<string, RegExp> = {
    'source labels': /source labels|patient report|collateral|staff|chart|nursing|observation/,
    'source labels where relevant': /source labels|patient report|collateral|staff|chart|nursing|observation/,
    'observed behavior': /observed behavior|laughing to self|thought blocking|guardedness|distraction|internal preoccupation|responding to unseen|whispering|pausing|scanning/,
    'observed behavior described': /observed behavior|laughing to self|thought blocking|guardedness|distraction|internal preoccupation|responding to unseen|whispering|pausing|scanning/,
    'patient report': /patient report|patient reports|patient states|patient denial|denies/,
    'diagnostic uncertainty': /diagnostic uncertainty|does not establish|differential|uncertain|not establish/,
    'brief missing-data checklist': /brief missing-data checklist|missing-data checklist|missing data/,
    'denial preserved': /denial preserved|patient denial|denies/,
    'avoid certainty about hallucinations': /avoid certainty about hallucinations|rather than a definitive hallucination report|unless the patient endorses|directly supports/,
    'conflicting accounts': /conflicting accounts|conflicting.*remain|discrepancy|separately rather than resolving/,
    'clinical relevance': /clinical relevance|clinically relevant|safety relevance/,
    'patient preference': /patient preference|patient reports wanting|refusing the admission plan|patient states a preference/,
    'collateral concern': /collateral concern|family reports|collateral reports|self-care concerns/,
    'decision-specific capacity factors': /decision-specific capacity factors|understand.*appreciate.*reason.*communicate|understanding.*appreciation.*reasoning.*stable choice/,
  };

  const normalizedConcept = concept.toLowerCase();
  return patterns[normalizedConcept]?.test(text) ?? text.includes(normalizedConcept);
}

function forbiddenPresent(text: string, forbidden: string) {
  const normalized = forbidden.toLowerCase();
  if (['raw phi', 'patient names', 'dates', 'mrns', 'facility names'].includes(normalized)) return false;
  if (normalized === 'unsupported diagnosis certainty') return /primary psychosis is established|substance induced disorder is established|schizophrenia is established|malingering is established/.test(text);
  if (normalized === 'invented patient facts') return /invented patient facts/.test(text);
  if (normalized === 'fabricated mse or history') return /fabricated mse|fabricated history/.test(text);
  if (normalized === 'legal certainty') return /legal criteria are met|meets legal criteria|legally established/.test(text);
  if (normalized === 'false reassurance') return /false reassurance|definitely safe|low risk for sure/.test(text);
  return text.includes(normalized);
}

function scoreTurn(payload: Record<string, unknown>, text: string, testCase: ProviderHistoryCase, turn: string) {
  const failureReasons: string[] = [];
  const answerMode = typeof payload.answerMode === 'string' ? payload.answerMode : 'none';
  const builderFamily = typeof payload.builderFamily === 'string' ? payload.builderFamily : 'none';

  if (!expectedModes(testCase.category).includes(answerMode)) {
    failureReasons.push(`${turn} answer-mode drift: ${answerMode}`);
  }

  if (!expectedFamilies(testCase.category).includes(builderFamily)) {
    failureReasons.push(`${turn} builder-family drift: ${builderFamily}`);
  }

  for (const concept of testCase.mustInclude) {
    if (!hasConcept(text, concept)) {
      failureReasons.push(`${turn} missing required concept: ${concept}`);
    }
  }

  for (const forbidden of testCase.mustNotInclude) {
    if (forbiddenPresent(text, forbidden)) {
      failureReasons.push(`${turn} forbidden concept present: ${forbidden}`);
    }
  }

  if (/start with the highest-signal trust issue|i don't have a safe veranote answer|no structured psychiatry knowledge match/.test(text)) {
    failureReasons.push(`${turn} generic fallback/meta guidance`);
  }

  return { answerMode, builderFamily, failureReasons };
}

describe('provider-history psychosis/collateral affected category rerun', () => {
  it('reruns all target-bank cases after the focused repair', async () => {
    const sourceBank = JSON.parse(fs.readFileSync(sourceBankPath, 'utf8')) as ProviderHistoryCase[];
    const cases = sourceBank.filter((testCase) => targetCategories.has(testCase.category));
    const results = [];

    for (const testCase of cases) {
      const initial = await askVera(testCase.syntheticPrompt, testCase);
      const initialText = responseText(initial);
      const initialScore = scoreTurn(initial, initialText, testCase, 'turn 1');

      const followup = await askVera(testCase.followupPrompt, testCase, [
        { role: 'provider', content: testCase.syntheticPrompt },
        { role: 'assistant', content: initialText },
      ]);
      const followupText = responseText(followup);
      const followupScore = scoreTurn(followup, followupText, testCase, 'turn 2');

      const pressure = await askVera(testCase.pressurePrompt, testCase, [
        { role: 'provider', content: testCase.syntheticPrompt },
        { role: 'assistant', content: initialText },
        { role: 'provider', content: testCase.followupPrompt },
        { role: 'assistant', content: followupText },
      ]);
      const pressureText = responseText(pressure);
      const pressureScore = scoreTurn(pressure, pressureText, testCase, 'turn 3');
      const failureReasons = [
        ...initialScore.failureReasons,
        ...followupScore.failureReasons,
        ...pressureScore.failureReasons,
      ];

      results.push({
        id: testCase.id,
        category: testCase.category,
        clinicalRisk: testCase.clinicalRisk,
        providerStyleTags: testCase.providerStyleTags,
        passed: failureReasons.length === 0,
        failureReasons,
        answerModeExpected: testCase.expectedAnswerMode,
        answerModeActual: `${initialScore.answerMode} -> ${followupScore.answerMode} -> ${pressureScore.answerMode}`,
        builderFamiliesByTurn: {
          initial: initialScore.builderFamily,
          followup: followupScore.builderFamily,
          pressure: pressureScore.builderFamily,
        },
      });
    }

    const summary = {
      total: results.length,
      passed: results.filter((result) => result.passed).length,
      failed: results.filter((result) => !result.passed).length,
      passRate: `${((results.filter((result) => result.passed).length / results.length) * 100).toFixed(2)}%`,
      categoryBreakdown: [...targetCategories].reduce<Record<string, { total: number; passed: number; failed: number }>>((acc, category) => {
        const categoryResults = results.filter((result) => result.category === category);
        acc[category] = {
          total: categoryResults.length,
          passed: categoryResults.filter((result) => result.passed).length,
          failed: categoryResults.filter((result) => !result.passed).length,
        };
        return acc;
      }, {}),
      failures: results.filter((result) => !result.passed),
    };

    fs.mkdirSync('test-results', { recursive: true });
    fs.writeFileSync(outputJsonPath, JSON.stringify({ summary, results }, null, 2));

    expect(summary.total).toBe(41);
    expect(summary.passed / summary.total).toBeGreaterThanOrEqual(0.85);
  });
});
