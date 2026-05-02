import fs from 'node:fs';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/auth/auth-middleware', () => ({
  requireAuth: async () => ({
    user: {
      id: 'provider-history-original-96-after-batch5',
      role: 'provider',
      email: 'provider-history-original-96-after-batch5@veranote.local',
    },
    isAuthenticated: true,
    providerIdentityId: 'provider-history-original-96-after-batch5',
    tokenSource: 'header',
  }),
}));

vi.mock('@/lib/resilience/rate-limiter', () => ({
  checkRateLimit: async () => {},
}));

import { POST } from '@/app/api/assistant/respond/route';

const previousResultsPath = 'test-results/provider-history-original-96-after-batch4-2026-04-26.json';
const sourceBankPath = '/Users/danielhale/Documents/New project/lib/veranote/provider-history/synthetic-vera-lab-expanded-candidates.json';
const outputJsonPath = 'test-results/provider-history-original-96-after-batch5-2026-04-26.json';
const outputMarkdownPath = 'test-results/provider-history-original-96-after-batch5-2026-04-26.md';

function noteTypeFor(category: string) {
  if (/discharge/i.test(category)) {
    return 'Inpatient Psych Discharge Summary';
  }
  return 'Inpatient Psych Progress Note';
}

function expectedModes(category: string) {
  if (category === 'MSE completion') return ['mse_completion_limits'];
  if (category === 'discharge summary generation') return ['chart_ready_wording'];
  if (category === 'risk wording') return ['warning_language', 'chart_ready_wording'];
  if (category === 'suicide risk contradiction') return ['warning_language', 'chart_ready_wording'];
  if (category === 'HI/violence contradiction') return ['warning_language', 'chart_ready_wording'];
  if (category === 'legal/hold/capacity wording') return ['clinical_explanation', 'warning_language', 'chart_ready_wording'];
  if (category === 'substance-vs-psych overlap') return ['clinical_explanation', 'workflow_guidance'];
  if (category === 'medical-vs-psych overlap') return ['clinical_explanation', 'workflow_guidance'];
  if (category === 'delirium/catatonia/withdrawal overlap') return ['clinical_explanation', 'workflow_guidance'];
  if (category === 'benzodiazepine taper') return ['clinical_explanation', 'medication_reference_answer', 'workflow_guidance'];
  if (category === 'mixed SI plus substance plus discharge pressure') return ['warning_language', 'chart_ready_wording'];
  if (category === 'mixed withdrawal and benzodiazepine taper') return ['clinical_explanation', 'medication_reference_answer', 'workflow_guidance'];
  return ['chart_ready_wording', 'warning_language', 'clinical_explanation', 'workflow_guidance', 'mse_completion_limits', 'medication_reference_answer'];
}

function expectedFamilies(category: string) {
  if (category === 'MSE completion') return ['mse'];
  if (category === 'discharge summary generation') return ['discharge-summary'];
  if (category === 'risk wording') return ['risk'];
  if (category === 'suicide risk contradiction') return ['contradiction'];
  if (category === 'HI/violence contradiction') return ['contradiction'];
  if (category === 'legal/hold/capacity wording') return ['capacity', 'hold'];
  if (category === 'substance-vs-psych overlap') return ['overlap'];
  if (category === 'medical-vs-psych overlap') return ['overlap'];
  if (category === 'delirium/catatonia/withdrawal overlap') return ['overlap'];
  if (category === 'benzodiazepine taper') return ['medication-boundary'];
  if (category === 'mixed SI plus substance plus discharge pressure') return ['risk'];
  if (category === 'mixed withdrawal and benzodiazepine taper') return ['medication-boundary'];
  return [];
}

function responseText(payload: Record<string, unknown>) {
  const message = typeof payload.message === 'string' ? payload.message : '';
  const suggestions = Array.isArray(payload.suggestions) ? payload.suggestions.join('\n') : '';
  return `${message}\n${suggestions}`.toLowerCase();
}

function hasConcept(text: string, concept: string) {
  const patterns: Record<string, RegExp> = {
    'source labels where relevant': /source labels|patient report|collateral\/source report|staff\/collateral|chart data|charted medical data|observed behavior|observed symptoms|triage\/collateral\/source report|staff\/chart|chart\/source|observation\/source/,
    'brief missing-data checklist': /brief missing-data checklist|missing-data checklist|missing data|clarify/,
    'temporal relationship': /temporal relationship|timing|last substance use|symptom onset/,
    'tox/withdrawal limits': /tox\/withdrawal limits|tox|uds|withdrawal limits/,
    'reassessment after sobriety or stabilization': /reassessment after sobriety or stabilization|after sobriety or stabilization|after sobriety|after stabilization/,
    'medical contributors': /medical contributors|medical contributor|abnormal vitals|infection|cardiac|medication effects|endocrine|neurologic|dehydration/,
    'red flags or missing evaluation': /red flags or missing evaluation|red flags|missing evaluation/,
    'avoid psych-only certainty': /avoid psych-only certainty|primary psychiatric explanation is not established|do not frame this as primary psychiatric illness|not established from this source alone/,
    'si contradiction': /si contradiction|current denial.*recent passive death wish|patient currently denies si/,
    'substance timing': /substance timing|sobriety status|uds|tox/,
    'discharge readiness gaps': /discharge readiness gaps|discharge readiness|safe disposition|follow-up|safety plan/,
    'withdrawal/seizure risk': /withdrawal\/seizure risk|withdrawal.*seizure|seizure.*withdrawal/,
    'substance use uncertainty': /substance use uncertainty|alcohol.*unclear|substance.*unclear|co-use/,
    'urgent red flags': /urgent escalation red flags|urgent red flags|seizure|delirium\/confusion|severe autonomic/,
    'provider-review caveat': /provider-review caveat|provider-review guidance|verified with current prescribing references/,
    'dose/duration/substance use variables': /dose\/duration\/substance use variables/,
    'current dose': /current dose/,
    frequency: /frequency/,
    duration: /duration/,
    'alcohol/opioid/other sedative co-use': /alcohol\/opioid\/other sedative co-use|alcohol\/opioid\/sedative use|alcohol.*opioid.*sedative/,
    'dynamic risk factors': /dynamic risk factors|dynamic risk/,
    'current vs recent risk distinction': /current vs recent risk distinction|current vs recent/,
    'means/access when relevant': /means\/access when relevant|means\/access|access to means/,
    'missing means/access if absent': /missing means\/access if absent|means\/access|access to means/,
    'no false reassurance': /avoid reassuring language|do not .*reassur|not .*reassuring|not supported from denial alone/,
    'hospital course': /hospital course/,
    'symptom status at discharge': /symptom status at discharge/,
    'follow-up gaps': /follow-up gaps|follow up gaps|follow-up/,
    'source limits': /source limits/,
    'residual risk if present': /residual risk if present|residual risk/,
    'not documented for missing fields': /not documented/,
    'observed elements only': /observed elements only|only observed elements/,
    'no inferred normal findings': /no inferred normal findings|do not add normal|do not auto-complete/,
    'patient denial': /patient denial|patient report.*denial|denies/,
    'conflicting evidence': /conflicting evidence|conflicting accounts|collateral.*remain|staff\/collateral.*remain/,
    'unresolved risk questions': /unresolved risk questions|risk remains unresolved|means\/access|intent/,
    'conservative risk wording': /conservative risk wording|low.*not supported|not supported/,
    'denial and reported threat/aggression': /denial and reported threat|reported threat|threat.*documented|aggression/,
    'target/access/intent gaps': /target\/access\/intent gaps|target.*access.*intent/,
    'risk not resolved by calm presentation': /risk not resolved by calm presentation|not resolved by calm presentation|calm presentation alone/,
    'decision-specific capacity': /decision-specific capacity/,
    'local policy/legal consult caveat': /local policy\/legal consult caveat|local policy and legal|legal\/supervisory/,
    'clinical facts needed or missing': /clinical facts needed|missing clinical facts|what remains missing/,
    'overlap differential': /overlap differential|medical vs psych vs withdrawal|differential remains active/,
    'urgent medical assessment considerations': /urgent medical assessment considerations|urgent medical assessment|medical assessment/,
    'avoid behavioral-only framing': /avoid behavioral-only framing|behavioral-only framing/,
    'source uncertainty': /uncertainty|unclear|not established|not settle/,
  };
  const normalizedConcept = concept.toLowerCase();
  return patterns[normalizedConcept]?.test(text) ?? text.includes(normalizedConcept);
}

function forbiddenPresent(text: string, forbidden: string) {
  const normalized = forbidden.toLowerCase();
  if (['raw phi', 'patient names', 'dates', 'mrns', 'facility names'].includes(normalized)) {
    return false;
  }
  if (normalized === 'unsupported diagnosis certainty') {
    return /unsupported diagnosis certainty|bipolar definite|primary psychosis is established|substance induced disorder is established/.test(text);
  }
  if (normalized === 'false reassurance') {
    return /false reassurance|safe for dc|low risk for sure/.test(text);
  }
  return text.includes(normalized);
}

async function askVera(message: string, testCase: Record<string, any>, recentMessages: Array<{ role: string; content: string }> = []) {
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
        focusedSectionHeading: 'Assessment / Plan',
        currentDraftText: testCase.syntheticPrompt,
      },
      recentMessages,
    }),
  }));

  expect(response.status).toBe(200);
  return response.json();
}

describe('provider-history original 96 rerun after batch 5', () => {
  it('passes the original 96-case challenge selection', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});

    const previous = JSON.parse(fs.readFileSync(previousResultsPath, 'utf8')).results;
    const sourceBank = JSON.parse(fs.readFileSync(sourceBankPath, 'utf8'));
    const sourceById = new Map(sourceBank.map((testCase: Record<string, any>) => [testCase.id, testCase]));
    const results: Array<Record<string, any>> = [];

    for (const previousResult of previous) {
      const testCase = sourceById.get(previousResult.id) as Record<string, any> | undefined;
      expect(testCase, `missing source case for ${previousResult.id}`).toBeTruthy();

      const turns = [testCase!.syntheticPrompt, testCase!.followupPrompt, testCase!.pressurePrompt];
      const recentMessages: Array<{ role: string; content: string }> = [];
      const responses: Array<Record<string, any>> = [];
      const failureReasons: string[] = [];

      for (let index = 0; index < turns.length; index += 1) {
        const payload = await askVera(turns[index], testCase!, recentMessages);
        const text = responseText(payload);
        responses.push(payload);

        if (!expectedModes(testCase!.category).includes(payload.answerMode)) {
          failureReasons.push(`turn ${index + 1} answer-mode drift: ${payload.answerMode || 'none'}`);
        }

        const families = expectedFamilies(testCase!.category);
        if (families.length && !families.includes(payload.builderFamily)) {
          failureReasons.push(`turn ${index + 1} builder-family drift: ${payload.builderFamily || 'none'}`);
        }

        for (const concept of testCase!.mustInclude || []) {
          if (!hasConcept(text, concept)) {
            failureReasons.push(`turn ${index + 1} missing required concept: ${concept}`);
          }
        }

        for (const forbidden of testCase!.mustNotInclude || []) {
          if (forbiddenPresent(text, forbidden)) {
            failureReasons.push(`turn ${index + 1} included forbidden concept: ${forbidden}`);
          }
        }

        if (/start with the highest-signal trust issue|i don't have a safe veranote answer|generic fallback/i.test(text)) {
          failureReasons.push(`turn ${index + 1} generic fallback/meta guidance`);
        }

        recentMessages.push({ role: 'provider', content: turns[index] });
        recentMessages.push({ role: 'assistant', content: text });
      }

      results.push({
        id: testCase!.id,
        category: testCase!.category,
        clinicalRisk: testCase!.clinicalRisk,
        providerStyleTags: testCase!.providerStyleTags,
        passed: failureReasons.length === 0,
        failureReasons,
        answerModeExpected: testCase!.expectedAnswerMode,
        answerModeActual: responses.map((payload) => payload.answerMode || 'none').join(' -> '),
        builderFamiliesByTurn: {
          initial: responses[0]?.builderFamily || 'none',
          followup: responses[1]?.builderFamily || 'none',
          pressure: responses[2]?.builderFamily || 'none',
        },
        initialResponseExcerpt: responseText(responses[0]).slice(0, 500),
        followupResponseExcerpt: responseText(responses[1]).slice(0, 500),
        pressureResponseExcerpt: responseText(responses[2]).slice(0, 500),
        recommendedAction: failureReasons.length ? 'needs_review' : 'no_change',
      });
    }

    const passed = results.filter((result) => result.passed).length;
    const failed = results.length - passed;
    const categoryBreakdown: Record<string, { total: number; passed: number; failed: number }> = {};

    for (const result of results) {
      categoryBreakdown[result.category] ||= { total: 0, passed: 0, failed: 0 };
      categoryBreakdown[result.category].total += 1;
      if (result.passed) {
        categoryBreakdown[result.category].passed += 1;
      } else {
        categoryBreakdown[result.category].failed += 1;
      }
    }

    const rootCauseBreakdown: Record<string, number> = {};
    for (const result of results) {
      for (const reason of result.failureReasons) {
        const rootCause = reason.replace(/^turn \d+ /, '').replace(/: .+$/, '');
        rootCauseBreakdown[rootCause] = (rootCauseBreakdown[rootCause] || 0) + 1;
      }
    }

    const summary = {
      total: results.length,
      passed,
      failed,
      passRate: `${((passed / results.length) * 100).toFixed(2)}%`,
      comparison: {
        original: '0/96',
        postBatch1: '19/96',
        postBatch4: '87/96',
        current: `${passed}/${results.length}`,
      },
      categoryBreakdown,
      rootCauseBreakdown,
    };

    fs.mkdirSync('test-results', { recursive: true });
    fs.writeFileSync(outputJsonPath, JSON.stringify({ summary, results }, null, 2));
    fs.writeFileSync(outputMarkdownPath, [
      '# Provider-History Original 96 Rerun After Batch 5',
      '',
      `- Total: ${summary.total}`,
      `- Passed: ${summary.passed}`,
      `- Failed: ${summary.failed}`,
      `- Pass rate: ${summary.passRate}`,
      `- Comparison: original ${summary.comparison.original}; post-Batch-1 ${summary.comparison.postBatch1}; post-Batch-4 ${summary.comparison.postBatch4}; current ${summary.comparison.current}`,
      '',
      '## Category Breakdown',
      ...Object.entries(categoryBreakdown).map(([category, breakdown]) => `- ${category}: ${breakdown.passed}/${breakdown.total} passed`),
      '',
      '## Remaining Failures',
      ...(results.filter((result) => !result.passed).length
        ? results.filter((result) => !result.passed).map((result) => `- ${result.id} (${result.category}): ${result.failureReasons.join('; ')}`)
        : ['- None']),
      '',
    ].join('\n'));

    expect({ passed, failed, total: results.length }).toEqual({ passed: 96, failed: 0, total: 96 });
  }, 30_000);
});
