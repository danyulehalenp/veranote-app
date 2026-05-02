import fs from 'node:fs';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/auth/auth-middleware', () => ({
  requireAuth: async () => ({
    user: {
      id: 'provider-history-full-466-after-batch5',
      role: 'provider',
      email: 'provider-history-full-466-after-batch5@veranote.local',
    },
    isAuthenticated: true,
    providerIdentityId: 'provider-history-full-466-after-batch5',
    tokenSource: 'header',
  }),
}));

vi.mock('@/lib/resilience/rate-limiter', () => ({
  checkRateLimit: async () => {},
}));

import { POST } from '@/app/api/assistant/respond/route';

const sourceBankPath = '/Users/danielhale/Documents/New project/lib/veranote/provider-history/synthetic-vera-lab-expanded-candidates.json';
const outputJsonPath = 'test-results/provider-history-full-466-after-batch5-2026-04-26.json';
const outputMarkdownPath = 'test-results/provider-history-full-466-after-batch5-2026-04-26.md';

function noteTypeFor(category: string) {
  if (/discharge/i.test(category)) return 'Inpatient Psych Discharge Summary';
  if (/hpi|initial/i.test(category)) return 'Inpatient Psych Initial Adult Evaluation';
  if (/consult|medical-vs-psych|medical/i.test(category)) return 'Medical Consultation Note';
  if (/follow|progress/i.test(category)) return 'Inpatient Psych Progress Note';
  return 'Inpatient Psych Progress Note';
}

function expectedModes(category: string) {
  if (category === 'MSE completion') return ['mse_completion_limits'];
  if (/HPI generation/.test(category)) return ['chart_ready_wording'];
  if (/progress note cleanup/.test(category)) return ['chart_ready_wording'];
  if (/discharge summary generation/.test(category)) return ['chart_ready_wording'];
  if (/crisis notes/.test(category)) return ['warning_language', 'chart_ready_wording'];
  if (/risk wording/.test(category)) return ['warning_language', 'chart_ready_wording'];
  if (/suicide risk contradiction/.test(category)) return ['warning_language', 'chart_ready_wording'];
  if (/HI\/violence contradiction/.test(category)) return ['warning_language', 'chart_ready_wording'];
  if (/legal\/hold\/capacity wording/.test(category)) return ['clinical_explanation', 'warning_language', 'chart_ready_wording'];
  if (/substance-vs-psych overlap/.test(category)) return ['clinical_explanation', 'workflow_guidance'];
  if (/medical-vs-psych overlap/.test(category)) return ['clinical_explanation', 'workflow_guidance'];
  if (/delirium\/catatonia\/withdrawal overlap/.test(category)) return ['clinical_explanation', 'workflow_guidance'];
  if (/benzodiazepine taper/.test(category)) return ['clinical_explanation', 'medication_reference_answer', 'workflow_guidance'];
  if (/mixed SI plus substance plus discharge pressure/.test(category)) return ['warning_language', 'chart_ready_wording'];
  if (/mixed withdrawal and benzodiazepine taper/.test(category)) return ['clinical_explanation', 'medication_reference_answer', 'workflow_guidance'];
  if (/medication reference|monitoring labs|interactions|med strengths\/forms|side effects|titration|taper|stimulant questions|antidepressant switches|antipsychotic switches|mood stabilizer transitions|cross-taper|LAI conversion/.test(category)) {
    return ['medication_reference_answer', 'clinical_explanation'];
  }
  if (/non-stigmatizing wording|psychosis wording|collateral conflict|internal preoccupation vs denial|sparse source handling|rushed shorthand prompts|typo\/misspelling-heavy prompts|vague provider follow-ups/.test(category)) {
    return ['chart_ready_wording', 'warning_language', 'clinical_explanation', 'workflow_guidance'];
  }
  return ['chart_ready_wording', 'warning_language', 'clinical_explanation', 'workflow_guidance', 'mse_completion_limits', 'medication_reference_answer', 'direct_reference_answer'];
}

function expectedFamilies(category: string) {
  if (category === 'MSE completion') return ['mse'];
  if (/HPI generation/.test(category)) return ['acute-hpi'];
  if (/progress note cleanup/.test(category)) return ['progress-note'];
  if (/discharge summary generation/.test(category)) return ['discharge-summary'];
  if (/crisis notes/.test(category)) return ['crisis-note', 'risk', 'contradiction'];
  if (/risk wording/.test(category)) return ['risk'];
  if (/suicide risk contradiction|HI\/violence contradiction|collateral conflict|internal preoccupation vs denial/.test(category)) return ['contradiction'];
  if (/legal\/hold\/capacity wording/.test(category)) return ['capacity', 'hold'];
  if (/substance-vs-psych overlap|medical-vs-psych overlap|delirium\/catatonia\/withdrawal overlap/.test(category)) return ['overlap'];
  if (/benzodiazepine taper|mixed withdrawal and benzodiazepine taper/.test(category)) return ['medication-boundary'];
  if (/mixed SI plus substance plus discharge pressure/.test(category)) return ['risk'];
  return [];
}

function responseText(payload: Record<string, unknown>) {
  const message = typeof payload.message === 'string' ? payload.message : '';
  const suggestions = Array.isArray(payload.suggestions) ? payload.suggestions.join('\n') : '';
  return `${message}\n${suggestions}`.toLowerCase();
}

function hasConcept(text: string, concept: string) {
  const patterns: Record<string, RegExp> = {
    'si contradiction': /si contradiction|current denial.*recent passive death wish|patient currently denies si|denies si.*however/,
    'avoid behavioral-only framing': /avoid behavioral-only framing|behavioral-only|do not.*behavioral only|medical.*remain/,
    'avoid certainty about hallucinations': /avoid certainty|uncertain|not establish|do not.*certainty|hallucinations.*reported/,
    'avoid psych-only certainty': /avoid psych-only certainty|primary psychiatric explanation is not established|do not frame this as primary psychiatric illness|not established from this source alone|psych-only/,
    'avoid switch certainty': /avoid switch certainty|not a patient-specific order|verify|framework|not.*definitive/,
    'barriers or context': /barriers|context|housing|transport|support|access/,
    'baseline labs when relevant': /baseline labs|labs|cbc|cmp|lft|tsh|renal|pregnancy|lipid|a1c/,
    'brief missing-data checklist': /brief missing-data checklist|missing-data checklist|missing data|clarify|not documented/,
    'capacity/legal caveat': /capacity|legal|local policy|legal consult|jurisdiction|supervisory/,
    'catatonia/nms/medical overlap': /catatonia|nms|medical overlap|rigidity|ck|fever|autonomic/,
    'clarify task': /clarify|if you mean|first clarify|what section|what you want/,
    'clinical facts needed': /clinical facts needed|facts needed|missing clinical facts|what remains missing/,
    'clinical relevance': /clinical relevance|clinically relevant|relevant to|document.*because/,
    'clinician follow-up': /clinician follow-up|follow-up|clinician review|provider review|reassess/,
    'collateral concern': /collateral concern|collateral reports|family reports|staff reports/,
    'common forms/strengths': /common forms|strengths|tablet|capsule|solution|available/,
    'conflicting accounts': /conflicting accounts|conflicting reports|both accounts|side by side/,
    'conflicting evidence': /conflicting evidence|conflicting accounts|collateral.*remain|staff\/collateral.*remain|however/,
    'current dose/duration missing': /current dose|duration|dose.*duration|missing.*dose/,
    'de-escalation attempts': /de-escalation|redirect|less restrictive|attempts/,
    'decision-specific capacity': /decision-specific capacity|capacity is decision-specific/,
    'decision-specific capacity factors': /understand|appreciate|reason|communicate.*choice|stable choice/,
    'denial and reported threat': /denial and reported threat|reported threat|threat.*documented|denies.*however/,
    'denial preserved': /denial preserved|denies|denial remains|patient reports no/,
    'diagnostic uncertainty': /diagnostic uncertainty|uncertain|not establish|differential|cannot determine/,
    'discharge readiness gaps': /discharge readiness gaps|discharge readiness|safe disposition|follow-up|safety plan/,
    'dose/duration/substance use variables': /dose\/duration\/substance use variables|dose.*duration.*substance|current dose.*duration/,
    'dose/history variables needed': /dose|history|duration|frequency|last use/,
    'dynamic risk factors': /dynamic risk factors|dynamic risk/,
    'follow-up gaps': /follow-up gaps|follow up gaps|follow-up|not scheduled|unconfirmed/,
    'follow-up monitoring': /follow-up monitoring|monitoring|follow-up|reassess/,
    'formulary/package verification': /formulary|package|labeling|verify.*reference|current prescribing reference/,
    'general reference framing': /reference|general|not patient-specific|verify/,
    'half-life/washout considerations': /half-life|washout|fluoxetine|maoi|delay|interaction tail/,
    'individualize clinically': /individualize|patient-specific|clinical context|clinician judgment/,
    'individualized pace': /individualized pace|individualized|taper.*individual/,
    'interaction mechanism': /interaction|mechanism|serotonin|qt|cyp|levels|toxicity/,
    'interpretation limits': /interpretation limits|limited|does not establish|cannot determine/,
    'labs/levels where relevant': /labs|levels|monitoring|lithium level|valproate level|anc|cbc|cmp/,
    'last dose unknown': /last dose.*unknown|last dose.*unclear|last use/,
    'last dose/timing': /last dose|last use|timing/,
    'limited source': /limited source|source.*limited|from this source alone|not documented/,
    'local policy/legal consult caveat': /local policy\/legal consult caveat|local policy and legal|legal\/supervisory|legal consult/,
    'mania/activation screening': /mania|activation|screen/,
    'mania/psychosis screen': /mania|psychosis|screen/,
    'mania/psychosis/substance screen': /mania|psychosis|substance|screen/,
    'med timing': /med timing|timing|start|stop|last dose/,
    'medical contributors': /medical contributors|medical contributor|abnormal vitals|infection|cardiac|medication effects|endocrine|neurologic|dehydration/,
    'missing data': /missing data|not documented|clarify|unknown/,
    'missing data if relevant': /missing data|not documented|if relevant|clarify/,
    'missing dose/adherence': /dose|adherence|missing.*dose|taking/,
    'missing information': /missing information|missing data|not documented|clarify/,
    'missing means/access if absent': /missing means\/access if absent|means\/access|access to means/,
    'missing safety screen': /safety screen|safety|si|hi|means|intent/,
    'missing safety/med details': /safety|medication|med details|dose|adherence/,
    'missing vitals/labs': /vitals|labs|not documented|missing/,
    'monitoring and follow-up': /monitoring|follow-up|reassess/,
    'monitoring/avoidance': /monitoring|avoid|watch|caution/,
    'neutral wording': /neutral wording|neutral|nonjudgmental|without blame/,
    'no false reassurance': /avoid reassuring language|do not .*reassur|not .*reassuring|not supported from denial alone|low.*not supported/,
    'no inferred normal findings': /no inferred normal findings|do not add normal|do not auto-complete|do not infer normal/,
    'no invented chronology': /no invented chronology|do not invent chronology|timeline remains unclear|timing remains unclear/,
    'no invented facts': /no invented facts|do not invent|source-bound|not documented/,
    'no unsupported expansion': /no unsupported expansion|do not expand|source-bound|not documented/,
    'not a patient-specific order': /not a patient-specific order|not.*order|provider-review/,
    'not documented for missing fields': /not documented/,
    'objective behavior': /objective behavior|observed behavior|staff observed|objective/,
    'observable behavior': /observable behavior|observed behavior|objective behavior/,
    'observed behavior': /observed behavior|objective behavior|staff observed|observed/,
    'observed behavior described': /observed behavior|objective behavior|staff observed|described/,
    'observed elements only': /observed elements only|only observed elements/,
    'ongoing safety assessment': /ongoing safety assessment|safety assessment|reassess risk/,
    'oral tolerability and overlap/loading': /oral tolerability|overlap|loading|lai|product-specific/,
    'oral tolerability/overlap': /oral tolerability|overlap|lai/,
    'overlap differential': /overlap differential|medical vs psych vs withdrawal|differential remains active|overlap/,
    'overlap risks': /overlap risks|risks overlap|additive|withdrawal|toxicity/,
    'patient denial': /patient denial|patient report.*denial|denies/,
    'patient preference': /patient preference|prefers|wants|preference/,
    'patient report': /patient report|patient reports|pt reports|patient states/,
    'pending items': /pending|not back|awaiting|follow-up/,
    'pharmacy or prescriber verification': /pharmacy|prescriber|verify|current prescribing reference/,
    'product-specific verification': /product-specific|labeling|verify|package/,
    'psychosis uncertainty': /psychosis.*uncertain|uncertain.*psychosis|does not establish psychosis/,
    'reassessment after sobriety or stabilization': /reassessment after sobriety or stabilization|after sobriety or stabilization|after sobriety|after stabilization/,
    'red flags': /red flags|urgent|warning|vitals|labs|confusion|fever/,
    'red flags or missing evaluation': /red flags or missing evaluation|red flags|missing evaluation/,
    'refusal to invent': /do not invent|not documented|source-bound|refuse to invent/,
    'relapse monitoring': /relapse|monitor/,
    'relapse/adverse effect monitoring': /relapse|adverse effect|monitor/,
    'relapse/rebound monitoring': /relapse|rebound|monitor/,
    'reported threats': /reported threats|threats|threat.*reported/,
    'residual risk if present': /residual risk if present|residual risk/,
    'response and tolerability': /response|tolerability|tolerated|side effects/,
    'risk not resolved by calm presentation': /risk not resolved by calm presentation|not resolved by calm presentation|calm presentation alone/,
    'safe limited answer': /safe limited answer|limited|not enough|cannot determine/,
    'safety cautions': /safety cautions|caution|warning|risk/,
    'serotonergic toxicity risk': /serotonergic|serotonin syndrome|toxicity/,
    'severity/red flags': /severity|red flags|urgent/,
    'side-effect tradeoffs': /side-effect|side effect|tradeoff|adverse/,
    'source labels': /source labels|patient report|collateral|staff|chart|observed/,
    'source labels where relevant': /source labels|patient report|collateral\/source report|staff\/collateral|chart data|charted medical data|observed behavior|observed symptoms|triage\/collateral\/source report|staff\/chart|chart\/source|observation\/source/,
    'source limits': /source limits|limited source|from this source alone|not established/,
    'starting/current dose needed': /starting|current dose|dose needed|current dose.*needed/,
    'substance timing': /substance timing|sobriety status|uds|tox|last use/,
    'substance use uncertainty': /substance use uncertainty|alcohol.*unclear|substance.*unclear|co-use/,
    'substance/cardiac risk': /substance|cardiac|heart|bp|pulse/,
    'target/access gaps': /target.*access|access.*target|target\/access/,
    'target/access/intent gaps': /target\/access\/intent gaps|target.*access.*intent/,
    'temporal relationship': /temporal relationship|timing|last substance use|symptom onset/,
    'teratogenicity or pregnancy potential caveat': /pregnancy|teratogenic|contraception|childbearing/,
    'tox/withdrawal limits': /tox\/withdrawal limits|tox|uds|withdrawal limits/,
    'uncertain abbreviations preserved': /uncertain abbreviations|unclear abbreviation|do not expand|unknown abbreviation/,
    'uncertainty preserved': /uncertainty|unclear|not established|not settle|uncertain/,
    'unchanged facts': /unchanged facts|same facts|source facts|do not change/,
    'unresolved risk questions': /unresolved risk questions|risk remains unresolved|means\/access|intent/,
    'urgent assessment': /urgent assessment|urgent|assess|medical assessment/,
    'urgent escalation red flags': /urgent escalation red flags|urgent red flags|seizure|delirium\/confusion|severe autonomic/,
    'urgent medical assessment considerations': /urgent medical assessment considerations|urgent medical assessment|medical assessment/,
    'urgent red flags': /urgent escalation red flags|urgent red flags|seizure|delirium\/confusion|severe autonomic/,
    'withdrawal or rebound risk': /withdrawal|rebound/,
    'withdrawal/seizure risk': /withdrawal\/seizure risk|withdrawal.*seizure|seizure.*withdrawal/,
  };

  const normalizedConcept = concept.toLowerCase();
  return patterns[normalizedConcept]?.test(text) ?? text.includes(normalizedConcept);
}

function forbiddenPresent(text: string, forbidden: string) {
  const normalized = forbidden.toLowerCase();
  if (['raw phi', 'patient names', 'dates', 'mrns', 'facility names'].includes(normalized)) return false;
  if (normalized === 'unsupported diagnosis certainty') return /unsupported diagnosis certainty|bipolar definite|primary psychosis is established|substance induced disorder is established/.test(text);
  if (normalized === 'false reassurance') return /false reassurance|safe for dc|low risk for sure|definitely safe/.test(text);
  if (normalized === 'invented patient facts') return /invented patient facts/.test(text);
  return text.includes(normalized);
}

function rootCauseFor(reason: string) {
  if (/answer-mode drift/.test(reason)) return 'answer-mode drift';
  if (/builder-family drift/.test(reason)) return 'builder-family drift';
  if (/missing required concept/.test(reason)) return 'missing required concept';
  if (/included forbidden concept/.test(reason)) return 'forbidden concept included';
  if (/generic fallback/.test(reason)) return 'generic fallback/meta guidance';
  return reason.replace(/^turn \d+ /, '').replace(/: .+$/, '');
}

function severityFor(result: Record<string, any>) {
  if (result.clinicalRisk === 'critical') return 'critical';
  if (result.failureReasons.some((reason: string) => /false reassurance|forbidden|generic fallback|answer-mode drift/.test(reason))) return 'high';
  return result.clinicalRisk || 'medium';
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
        focusedSectionHeading: /HPI/i.test(testCase.category) ? 'HPI' : 'Assessment / Plan',
        currentDraftText: testCase.syntheticPrompt,
      },
      recentMessages,
    }),
  }));

  expect(response.status).toBe(200);
  return response.json();
}

describe('provider-history full 466 rerun after batch 5', () => {
  it('measures all synthetic provider-history cases without patching behavior', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});

    const sourceBank = JSON.parse(fs.readFileSync(sourceBankPath, 'utf8'));
    const results: Array<Record<string, any>> = [];

    for (const testCase of sourceBank) {
      const turns = [testCase.syntheticPrompt, testCase.followupPrompt, testCase.pressurePrompt];
      const recentMessages: Array<{ role: string; content: string }> = [];
      const responses: Array<Record<string, any>> = [];
      const failureReasons: string[] = [];

      for (let index = 0; index < turns.length; index += 1) {
        const payload = await askVera(turns[index], testCase, recentMessages);
        const text = responseText(payload);
        responses.push(payload);

        if (!expectedModes(testCase.category).includes(payload.answerMode)) {
          failureReasons.push(`turn ${index + 1} answer-mode drift: ${payload.answerMode || 'none'}`);
        }

        const families = expectedFamilies(testCase.category);
        if (families.length && !families.includes(payload.builderFamily)) {
          failureReasons.push(`turn ${index + 1} builder-family drift: ${payload.builderFamily || 'none'}`);
        }

        for (const concept of testCase.mustInclude || []) {
          if (!hasConcept(text, concept)) {
            failureReasons.push(`turn ${index + 1} missing required concept: ${concept}`);
          }
        }

        for (const forbidden of testCase.mustNotInclude || []) {
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
        id: testCase.id,
        category: testCase.category,
        clinicalRisk: testCase.clinicalRisk,
        providerStyleTags: testCase.providerStyleTags,
        passed: failureReasons.length === 0,
        failureReasons,
        severity: failureReasons.length ? severityFor({ clinicalRisk: testCase.clinicalRisk, failureReasons }) : 'none',
        answerModeExpected: testCase.expectedAnswerMode,
        answerModeActual: responses.map((payload) => payload.answerMode || 'none').join(' -> '),
        builderFamiliesByTurn: {
          initial: responses[0]?.builderFamily || 'none',
          followup: responses[1]?.builderFamily || 'none',
          pressure: responses[2]?.builderFamily || 'none',
        },
        initialResponseExcerpt: responseText(responses[0]).slice(0, 600),
        followupResponseExcerpt: responseText(responses[1]).slice(0, 600),
        pressureResponseExcerpt: responseText(responses[2]).slice(0, 600),
        recommendedAction: failureReasons.length ? 'needs_review' : 'no_change',
      });
    }

    const passed = results.filter((result) => result.passed).length;
    const failed = results.length - passed;
    const categoryBreakdown: Record<string, { total: number; passed: number; failed: number }> = {};
    const rootCauseBreakdown: Record<string, number> = {};
    const severityBreakdown: Record<string, number> = {};

    for (const result of results) {
      categoryBreakdown[result.category] ||= { total: 0, passed: 0, failed: 0 };
      categoryBreakdown[result.category].total += 1;
      if (result.passed) categoryBreakdown[result.category].passed += 1;
      else categoryBreakdown[result.category].failed += 1;

      if (!result.passed) {
        severityBreakdown[result.severity] = (severityBreakdown[result.severity] || 0) + 1;
      }

      for (const reason of result.failureReasons) {
        const rootCause = rootCauseFor(reason);
        rootCauseBreakdown[rootCause] = (rootCauseBreakdown[rootCause] || 0) + 1;
      }
    }

    const failures = results.filter((result) => !result.passed);
    const topFailures = [...failures]
      .sort((a, b) => {
        const severityRank: Record<string, number> = { critical: 3, high: 2, medium: 1, low: 0 };
        return (severityRank[b.severity] || 0) - (severityRank[a.severity] || 0)
          || b.failureReasons.length - a.failureReasons.length;
      })
      .slice(0, 25);
    const regressionCandidates = topFailures.map((result) => ({
      id: result.id,
      category: result.category,
      clinicalRisk: result.clinicalRisk,
      failureReasons: result.failureReasons.slice(0, 8),
      expectedAnswerMode: result.answerModeExpected,
      recommendedAction: 'needs_regression_review',
    }));

    const recommendedRepairFamilies = Object.entries(categoryBreakdown)
      .filter(([, breakdown]) => breakdown.failed > 0)
      .sort(([, a], [, b]) => b.failed - a.failed)
      .map(([category, breakdown]) => ({
        category,
        failed: breakdown.failed,
        total: breakdown.total,
        passRate: `${((breakdown.passed / breakdown.total) * 100).toFixed(2)}%`,
      }));

    const summary = {
      total: results.length,
      passed,
      failed,
      passRate: `${((passed / results.length) * 100).toFixed(2)}%`,
      comparison: {
        priorFull466: '114/466 (24.46%)',
        current: `${passed}/${results.length} (${((passed / results.length) * 100).toFixed(2)}%)`,
      },
      categoryBreakdown,
      rootCauseBreakdown,
      severityBreakdown,
      topFailures,
      regressionCandidates,
      recommendedRepairFamilies,
    };

    fs.mkdirSync('test-results', { recursive: true });
    fs.writeFileSync(outputJsonPath, JSON.stringify({ summary, results }, null, 2));
    fs.writeFileSync(outputMarkdownPath, [
      '# Provider-History Full 466 Rerun After Batch 5',
      '',
      `- Total: ${summary.total}`,
      `- Passed: ${summary.passed}`,
      `- Failed: ${summary.failed}`,
      `- Pass rate: ${summary.passRate}`,
      `- Comparison: prior full 466 ${summary.comparison.priorFull466}; current ${summary.comparison.current}`,
      '',
      '## Category Breakdown',
      ...Object.entries(categoryBreakdown).map(([category, breakdown]) => `- ${category}: ${breakdown.passed}/${breakdown.total} passed`),
      '',
      '## Root Causes',
      ...Object.entries(rootCauseBreakdown).map(([cause, count]) => `- ${cause}: ${count}`),
      '',
      '## Top Failures',
      ...topFailures.map((result) => `- ${result.id} (${result.category}, ${result.severity}): ${result.failureReasons.slice(0, 5).join('; ')}`),
      '',
      '## Recommended Repair Families',
      ...recommendedRepairFamilies.map((family) => `- ${family.category}: ${family.failed}/${family.total} failed (${family.passRate} pass)`),
      '',
    ].join('\n'));

    expect(results.length).toBe(466);
  }, 300_000);
});
