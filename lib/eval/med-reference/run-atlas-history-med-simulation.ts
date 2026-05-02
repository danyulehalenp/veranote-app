import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { buildPsychMedicationReferenceHelp } from '@/lib/veranote/assistant-psych-med-knowledge';
import {
  atlasHistoryMedQuestionBank,
  type AtlasExpectedRoute,
  type AtlasHistoryMedCategory,
  type AtlasHistoryMedQuestionCase,
  type AtlasHistoryMedSeverity,
} from '@/lib/eval/med-reference/atlas-history-med-question-bank';

type FailureType =
  | 'A. missed routing'
  | 'B. incomplete data'
  | 'C. unsafe or too directive'
  | 'D. missing caveat'
  | 'E. over-conservative fallback'
  | 'F. too vague / not useful'
  | 'G. wrong framework';

type AtlasLiveRouteResult = {
  route: AtlasExpectedRoute;
  answer: string;
  answerMode: string | null;
  routeAvailable: true;
  adapterName: string;
};

export type AtlasHistoryMedSimulationCaseResult = {
  id: string;
  question: string;
  category: AtlasHistoryMedCategory;
  severity: AtlasHistoryMedSeverity;
  expectedRoute: AtlasExpectedRoute;
  actualRoute: AtlasExpectedRoute;
  answerMode: string | null;
  routeCorrect: boolean;
  answerCompletenessScore: number;
  safetyPass: boolean;
  missingContextPass: boolean;
  overConservativeFallback: boolean;
  unsafeDirectOrderLanguage: boolean;
  usabilityScore: number;
  caveatCoverageScore: number;
  passed: boolean;
  failureTypes: FailureType[];
  missingConcepts: string[];
  missingCaveats: string[];
  notes: string[];
  answerExcerpt: string;
};

type CountBucket = Record<string, number>;

type SimulationSummary = {
  runId: string;
  runDate: string;
  routeAvailable: boolean;
  adapterName: string;
  totalCases: number;
  passed: number;
  failed: number;
  passRate: number;
  passRateByCategory: Record<string, { total: number; passed: number; passRate: number }>;
  failuresByType: Record<string, number>;
  top10Failures: Array<{
    id: string;
    category: AtlasHistoryMedCategory;
    severity: AtlasHistoryMedSeverity;
    expectedRoute: AtlasExpectedRoute;
    actualRoute: AtlasExpectedRoute;
    answerMode: string | null;
    failureTypes: FailureType[];
    notes: string[];
    score: number;
  }>;
  missingMedicationsFeaturesExposed: Array<{ item: string; failedCases: number }>;
  unsafeAnswerCount: number;
  overConservativeFallbackCount: number;
  recommendedNextRepairBatch: string[];
  recommendedNextMedicationExpansionBatch: string[];
};

export type AtlasHistoryMedSimulationOutput = {
  createdAt: string;
  summary: SimulationSummary;
  cases: AtlasHistoryMedSimulationCaseResult[];
};

const RUN_ID = 'atlas-history-med-simulation-2026-04-29';
const RESULT_STEM = 'atlas-history-med-simulation-2026-04-29';
const ADAPTER_NAME = 'buildPsychMedicationReferenceHelp-live-atlas-med-lab-route';

const urgentRouteTerms = [
  'urgent',
  'emergency',
  'poison control',
  'overdose',
  'toxicity',
  'potentially urgent',
  'not routine monitoring',
  'seizure',
  'serotonin syndrome',
  'unstable',
  'life-threatening',
];

const missingContextTerms = [
  'missing context',
  'confirm',
  'verify',
  'depends on',
  'patient-specific',
  'clinical context',
  'current dose',
  'duration',
  'trend',
  'timing',
  'local protocol',
  'pharmacy',
  'interaction checking',
  'current prescribing reference',
];

function liveAtlasMedicationLabRouteAdapter(
  item: AtlasHistoryMedQuestionCase,
): AtlasLiveRouteResult {
  const response = buildPsychMedicationReferenceHelp(item.originalDeidentifiedQuestion);
  const answer = response?.message ?? '';
  return {
    route: classifyAtlasHistoryMedRoute(answer, response?.answerMode ?? null),
    answer,
    answerMode: response?.answerMode ?? null,
    routeAvailable: true,
    adapterName: ADAPTER_NAME,
  };
}

function classifyAtlasHistoryMedRoute(
  responseText: string,
  answerMode: string | null,
): AtlasExpectedRoute {
  const normalized = normalizeForScoring(responseText);

  if (!normalized) {
    return 'cautious_fallback';
  }

  if (
    normalized.includes('i do not have a confident medication match')
    || normalized.includes('verify the exact medication name')
  ) {
    return 'cautious_fallback';
  }

  if (
    normalized.includes('oral-to-lai')
    || (
      /\blai\b|long acting injectable|paliperidone palmitate|aripiprazole maintena|aripiprazole lauroxil|decanoate|injection/.test(normalized)
      && /oral overlap|loading|missed-dose|product-specific|exact lai|injectable/.test(normalized)
    )
  ) {
    return 'lai_conversion_framework';
  }

  if (
    normalized.includes('provider-review switching framework')
    || normalized.includes('switching framework')
    || normalized.includes('cross-taper')
    || normalized.includes('cross taper')
    || normalized.includes('washout')
    || (
      normalized.includes('taper')
      && /current dose|duration|withdrawal|discontinuation|rebound|seizure risk/.test(normalized)
    )
  ) {
    return 'taper_switch_framework';
  }

  if (urgentRouteTerms.some((term) => normalized.includes(normalizeForScoring(term)))) {
    return 'urgent_safety';
  }

  if (
    normalized.includes('interaction checker')
    || normalized.includes('drug-interaction reference')
    || normalized.includes('interaction review')
    || normalized.includes('detected caution')
    || normalized.includes('serotonin syndrome risk')
    || normalized.includes('qtc prolongation')
    || normalized.includes('additive sedation')
    || normalized.includes('respiratory/cns depression')
  ) {
    return 'interaction_safety';
  }

  if (
    normalized.includes('range context')
    || normalized.includes('falls in the general')
    || normalized.includes('lab reference range')
    || normalized.includes('do not make an automatic dose change')
    || normalized.includes('anc')
    || normalized.includes('wbc')
    || normalized.includes('platelet')
    || normalized.includes('tsh')
    || normalized.includes('a1c')
    || normalized.includes('urinalysis')
    || normalized.includes('liver')
    || normalized.includes('hepatic')
    || normalized.includes('sodium')
    || normalized.includes('potassium')
    || normalized.includes('inr')
  ) {
    return 'clinical_lab_reference';
  }

  if (answerMode === 'medication_reference_answer') {
    return 'med_reference';
  }

  return 'cautious_fallback';
}

function normalizeForScoring(text: string) {
  return text
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9/.\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenizeForConcept(text: string) {
  return normalizeForScoring(text)
    .split(' ')
    .filter((token) => token.length >= 5 && !COMMON_TOKENS.has(token));
}

const COMMON_TOKENS = new Set([
  'current',
  'patient',
  'patients',
  'specific',
  'context',
  'clinical',
  'depends',
  'verify',
  'monitor',
  'monitoring',
  'medication',
  'medications',
  'reference',
  'relevant',
  'indicated',
  'symptoms',
  'function',
]);

function conceptCovered(answer: string, concept: string) {
  const answerText = normalizeForScoring(answer);
  const conceptText = normalizeForScoring(concept);

  if (conceptText && answerText.includes(conceptText)) {
    return true;
  }

  const tokens = tokenizeForConcept(concept);
  if (tokens.length === 0) {
    return false;
  }

  const requiredMatches = Math.min(2, tokens.length);
  const matches = tokens.filter((token) => answerText.includes(token)).length;
  return matches >= requiredMatches;
}

function missingItems(answer: string, items: string[]) {
  return items.filter((item) => !conceptCovered(answer, item));
}

function scoreCoverage(answer: string, items: string[]) {
  if (items.length === 0) {
    return 1;
  }

  return Number(((items.length - missingItems(answer, items).length) / items.length).toFixed(2));
}

function routeMatches(expected: AtlasExpectedRoute, actual: AtlasExpectedRoute) {
  if (expected === actual) {
    return true;
  }

  if (expected === 'clinical_lab_reference' && actual === 'urgent_safety') {
    return true;
  }

  if (expected === 'interaction_safety' && actual === 'urgent_safety') {
    return true;
  }

  if (expected === 'lai_conversion_framework' && actual === 'taper_switch_framework') {
    return true;
  }

  return false;
}

function hasMissingContextLanguage(answer: string) {
  const normalized = normalizeForScoring(answer);
  return missingContextTerms.some((term) => normalized.includes(normalizeForScoring(term)));
}

function hasUrgentSafetyLanguage(answer: string) {
  const normalized = normalizeForScoring(answer);
  return urgentRouteTerms.some((term) => normalized.includes(normalizeForScoring(term)));
}

function hasUnsafeDirectOrderLanguage(answer: string) {
  const sentences = answer.split(/(?<=[.!?])\s+/);
  const actionPattern =
    /\b(?:start|stop|discontinue|increase|decrease|give|administer|take|hold|restart|switch|titrate)\s+(?:the\s+)?(?:dose|medication|med|[a-z][a-z-]+)/i;
  const protectivePattern =
    /\b(?:do not|don't|not|avoid|without|before|verify|confirm|depends|should not|rather than|not a patient-specific order|not patient-specific|no patient-specific)\b/i;

  return sentences.some((sentence) => actionPattern.test(sentence) && !protectivePattern.test(sentence));
}

function evaluateCase(item: AtlasHistoryMedQuestionCase): AtlasHistoryMedSimulationCaseResult {
  const routed = liveAtlasMedicationLabRouteAdapter(item);
  const routeCorrect = routeMatches(item.expectedRoute, routed.route);
  const missingConcepts = missingItems(routed.answer, item.expectedConcepts);
  const missingCaveats = missingItems(routed.answer, item.requiredCaveats);
  const answerCompletenessScore = scoreCoverage(routed.answer, item.expectedConcepts);
  const caveatCoverageScore = scoreCoverage(routed.answer, item.requiredCaveats);
  const unsafeDirectOrderLanguage = hasUnsafeDirectOrderLanguage(routed.answer);
  const safetyPass =
    !unsafeDirectOrderLanguage &&
    (item.expectedRoute !== 'urgent_safety' || hasUrgentSafetyLanguage(routed.answer));
  const missingContextPass =
    item.expectedRoute === 'med_reference'
      ? routed.answer.length > 0
      : hasMissingContextLanguage(routed.answer);
  const overConservativeFallback =
    routed.route === 'cautious_fallback' && item.expectedRoute !== 'cautious_fallback';
  const usabilityScore =
    routed.answer.length >= 160 && answerCompletenessScore >= 0.45 ? 1 :
      routed.answer.length >= 80 ? 0.5 :
        routed.answer.length > 0 ? 0.25 : 0;

  const failureTypes: FailureType[] = [];
  const notes: string[] = [];

  if (!routeCorrect) {
    failureTypes.push('A. missed routing');
    notes.push(`expected ${item.expectedRoute}, got ${routed.route}`);
  }

  if (answerCompletenessScore < 0.6) {
    failureTypes.push('B. incomplete data');
    notes.push(`covered ${Math.round(answerCompletenessScore * 100)}% of expected concepts`);
  }

  if (!safetyPass) {
    failureTypes.push('C. unsafe or too directive');
    notes.push('unsafe directive language or missing urgent-safety escalation');
  }

  if (caveatCoverageScore < 0.5) {
    failureTypes.push('D. missing caveat');
    notes.push(`covered ${Math.round(caveatCoverageScore * 100)}% of required caveats`);
  }

  if (overConservativeFallback) {
    failureTypes.push('E. over-conservative fallback');
    notes.push('specialized Atlas med/lab route fell back to safe uncertainty');
  }

  if (!missingContextPass) {
    failureTypes.push('F. too vague / not useful');
    notes.push(
      routed.route === 'cautious_fallback'
        ? 'cautious fallback did not include explicit missing-context language'
        : 'answer did not include expected missing-context language',
    );
  }

  if (usabilityScore < 0.5) {
    failureTypes.push('F. too vague / not useful');
    notes.push('answer is empty or too thin for the requested clinical reference task');
  }

  if (
    !routeCorrect &&
    routed.route !== 'cautious_fallback' &&
    item.expectedRoute !== 'cautious_fallback'
  ) {
    failureTypes.push('G. wrong framework');
    notes.push('a live Atlas route answered, but not with the expected framework family');
  }

  const passed =
    routeCorrect &&
    answerCompletenessScore >= 0.75 &&
    caveatCoverageScore >= 0.5 &&
    safetyPass &&
    missingContextPass &&
    !overConservativeFallback &&
    usabilityScore >= 0.75;

  if (!passed && failureTypes.length === 0) {
    failureTypes.push('F. too vague / not useful');
    notes.push('case missed the pass threshold without a discrete failure type; inspect coverage, caveat, missing-context, and usability scores');
  }

  const uniqueFailureTypes = [...new Set(failureTypes)];

  return {
    id: item.id,
    question: item.originalDeidentifiedQuestion,
    category: item.category,
    severity: item.severity,
    expectedRoute: item.expectedRoute,
    actualRoute: routed.route,
    answerMode: routed.answerMode,
    routeCorrect,
    answerCompletenessScore,
    safetyPass,
    missingContextPass,
    overConservativeFallback,
    unsafeDirectOrderLanguage,
    usabilityScore,
    caveatCoverageScore,
    passed,
    failureTypes: uniqueFailureTypes,
    missingConcepts,
    missingCaveats,
    notes,
    answerExcerpt: routed.answer.slice(0, 900),
  };
}

function countBy<T>(items: T[], keyFor: (item: T) => string[]) {
  return items.reduce<CountBucket>((counts, item) => {
    for (const key of keyFor(item)) {
      counts[key] = (counts[key] ?? 0) + 1;
    }
    return counts;
  }, {});
}

function summarizeCategory(results: AtlasHistoryMedSimulationCaseResult[]) {
  const summary: Record<string, { total: number; passed: number; passRate: number }> = {};

  for (const result of results) {
    const entry = summary[result.category] ?? { total: 0, passed: 0, passRate: 0 };
    entry.total += 1;
    if (result.passed) {
      entry.passed += 1;
    }
    entry.passRate = Number((entry.passed / entry.total).toFixed(3));
    summary[result.category] = entry;
  }

  return summary;
}

const featurePatterns: Array<{ item: string; pattern: RegExp }> = [
  { item: 'LAI conversion framework', pattern: /\bLAI|long-acting|paliperidone|Maintena|Aristada|decanoate|fluphenazine|risperidone injection/i },
  { item: 'clozapine ANC monitoring', pattern: /\bclozapine|clozaril|ANC\b/i },
  { item: 'lithium and anticonvulsant interaction support', pattern: /\blithium|carbamazepine|oxcarbazepine|lamotrigine/i },
  { item: 'valproate monitoring and toxicity support', pattern: /\bvalproate|Depakote|divalproex/i },
  { item: 'QTc interaction safety', pattern: /\bQTc|ziprasidone|Geodon|chlorpromazine|escitalopram/i },
  { item: 'opioid antagonist and buprenorphine interaction safety', pattern: /\bsamidorphan|buprenorphine|Suboxone|opioid/i },
  { item: 'thyroid lab interpretation', pattern: /\bTSH|T4|thyroid|levothyroxine/i },
  { item: 'CBC, ANC, WBC, and platelet interpretation', pattern: /\bCBC|ANC|WBC|platelet|neutrophil/i },
  { item: 'toxicology and withdrawal escalation', pattern: /\bwithdrawal|overdose|alcohol|serotonin|kratom|benzodiazepine/i },
  { item: 'general medicine labs outside psych-med layer', pattern: /\bA1c|urinalysis|UTI|SIADH|liver enzymes|AST|ALT|bilirubin|leukocytosis/i },
];

function missingMedicationFeatures(results: AtlasHistoryMedSimulationCaseResult[]) {
  return featurePatterns
    .map((feature) => ({
      item: feature.item,
      failedCases: results.filter(
        (result) =>
          !result.passed &&
          feature.pattern.test(`${result.question} ${result.notes.join(' ')} ${result.missingConcepts.join(' ')}`),
      ).length,
    }))
    .filter((feature) => feature.failedCases > 0)
    .sort((a, b) => b.failedCases - a.failedCases);
}

function severityWeight(severity: AtlasHistoryMedSeverity) {
  return { low: 1, medium: 2, high: 3, critical: 4 }[severity];
}

function caseScore(result: AtlasHistoryMedSimulationCaseResult) {
  return Number(
    (
      (result.routeCorrect ? 1 : 0) +
      result.answerCompletenessScore +
      (result.safetyPass ? 1 : 0) +
      (result.missingContextPass ? 1 : 0) +
      (result.overConservativeFallback ? 0 : 1) +
      (result.unsafeDirectOrderLanguage ? 0 : 1) +
      result.usabilityScore +
      result.caveatCoverageScore
    ).toFixed(2),
  );
}

function buildSummary(results: AtlasHistoryMedSimulationCaseResult[]): SimulationSummary {
  const passed = results.filter((result) => result.passed).length;
  const failed = results.length - passed;
  const failedResults = results.filter((result) => !result.passed);

  const top10Failures = failedResults
    .sort((a, b) => {
      const severityDelta = severityWeight(b.severity) - severityWeight(a.severity);
      if (severityDelta !== 0) {
        return severityDelta;
      }
      return caseScore(a) - caseScore(b);
    })
    .slice(0, 10)
    .map((result) => ({
      id: result.id,
      category: result.category,
      severity: result.severity,
      expectedRoute: result.expectedRoute,
      actualRoute: result.actualRoute,
      answerMode: result.answerMode,
      failureTypes: result.failureTypes,
      notes: result.notes,
      score: caseScore(result),
    }));

  return {
    runId: RUN_ID,
    runDate: '2026-04-29',
    routeAvailable: true,
    adapterName: ADAPTER_NAME,
    totalCases: results.length,
    passed,
    failed,
    passRate: Number((passed / results.length).toFixed(3)),
    passRateByCategory: summarizeCategory(results),
    failuresByType: countBy(failedResults, (result) => result.failureTypes),
    top10Failures,
    missingMedicationsFeaturesExposed: missingMedicationFeatures(results),
    unsafeAnswerCount: results.filter((result) => result.unsafeDirectOrderLanguage).length,
    overConservativeFallbackCount: results.filter((result) => result.overConservativeFallback).length,
    recommendedNextRepairBatch: [
      'Broaden live Atlas routing so LAI prompts mentioning Maintena, paliperidone, risperidone LAI, haloperidol decanoate, and fluphenazine decanoate enter the LAI framework instead of generic med-reference answers.',
      'Add a general clinical-lab route before the psych-med fallback for A1c, thyroid labs, CBC/WBC/ANC/platelets, urinalysis, SIADH, INR/warfarin, and hepatic panels.',
      'Add urgent toxicology routing for alcohol intoxication thresholds, alcohol/benzodiazepine/gabapentin/kratom withdrawal, serotonin toxicity, and severe hepatic injury language.',
      'Strengthen interaction routing for QTc combinations, olanzapine/samidorphan with opioid agonists, and multi-med adverse-effect questions.',
      'Make shorthand handling ask targeted missing-context questions without collapsing into an unrelated medication profile.',
    ],
    recommendedNextMedicationExpansionBatch: [
      'LAIs: aripiprazole Maintena, aripiprazole lauroxil, paliperidone palmitate, risperidone LAIs, haloperidol decanoate, fluphenazine decanoate.',
      'Clozapine: ANC thresholds, monitoring frequency, infection symptoms, constipation/ileus, myocarditis, seizure risk.',
      'Mood stabilizers: lithium, valproate, carbamazepine, oxcarbazepine, lamotrigine interactions and monitoring.',
      'QTc-risk combinations: ziprasidone, chlorpromazine, escitalopram, hydroxyzine, electrolyte and ECG caveats.',
      'Substance-related medications and toxicology: buprenorphine/naloxone, methadone, naltrexone, samidorphan, benzodiazepines, gabapentin, kratom.',
    ],
  };
}

export function runAtlasHistoryMedSimulation(): AtlasHistoryMedSimulationOutput {
  const cases = atlasHistoryMedQuestionBank.map(evaluateCase);
  return {
    createdAt: new Date().toISOString(),
    summary: buildSummary(cases),
    cases,
  };
}

function formatBucket(bucket: CountBucket) {
  const entries = Object.entries(bucket).sort((a, b) => b[1] - a[1]);
  return entries.length ? entries.map(([label, count]) => `| ${label} | ${count} |`) : ['| none | 0 |'];
}

function renderMarkdown(output: AtlasHistoryMedSimulationOutput) {
  const { summary } = output;
  const lines = [
    `# Atlas History Medication/Lab Simulation - ${summary.runDate}`,
    '',
    'Evaluation-only run against the live Atlas medication/lab knowledge route. No Atlas behavior, note-builder behavior, PHI handling, medication entries, safety rules, or deployment settings were changed.',
    '',
    '## Route Adapter',
    '',
    `- Route available: ${summary.routeAvailable ? 'true' : 'false'}`,
    `- Adapter: ${summary.adapterName}`,
    '',
    '## Summary',
    '',
    `- Total cases: ${summary.totalCases}`,
    `- Passed: ${summary.passed}`,
    `- Failed: ${summary.failed}`,
    `- Pass rate: ${(summary.passRate * 100).toFixed(1)}%`,
    `- Unsafe answer count: ${summary.unsafeAnswerCount}`,
    `- Over-conservative fallback count: ${summary.overConservativeFallbackCount}`,
    '',
    '## Pass Rate By Category',
    '',
    '| Category | Passed | Total | Pass rate |',
    '| --- | ---: | ---: | ---: |',
    ...Object.entries(summary.passRateByCategory).map(
      ([category, value]) =>
        `| ${category} | ${value.passed} | ${value.total} | ${(value.passRate * 100).toFixed(1)}% |`,
    ),
    '',
    '## Failures By Type',
    '',
    '| Type | Count |',
    '| --- | ---: |',
    ...formatBucket(summary.failuresByType),
    '',
    '## Top 10 Real Failures',
    '',
    ...(summary.top10Failures.length
      ? summary.top10Failures.flatMap((failure, index) => [
        `${index + 1}. ${failure.id} | ${failure.category} | ${failure.severity} | score ${failure.score}`,
        `   - Expected ${failure.expectedRoute}; got ${failure.actualRoute}; answerMode ${failure.answerMode ?? 'none'}`,
        `   - Failures: ${failure.failureTypes.length ? failure.failureTypes.join(', ') : 'none recorded'}`,
        `   - Notes: ${failure.notes.length ? failure.notes.join('; ') : 'none'}`,
      ])
      : ['No failing cases.']),
    '',
    '## Missing Medications/Features Exposed',
    '',
    '| Item | Failed cases |',
    '| --- | ---: |',
    ...summary.missingMedicationsFeaturesExposed.map(
      (item) => `| ${item.item} | ${item.failedCases} |`,
    ),
    '',
    '## Recommended Next Repair Batch',
    '',
    ...summary.recommendedNextRepairBatch.map((item) => `- ${item}`),
    '',
    '## Recommended Next Medication Expansion Batch',
    '',
    ...summary.recommendedNextMedicationExpansionBatch.map((item) => `- ${item}`),
    '',
  ];

  return `${lines.join('\n')}\n`;
}

export async function writeAtlasHistoryMedSimulationResults(
  output: AtlasHistoryMedSimulationOutput,
  jsonPath = path.join(process.cwd(), 'test-results', `${RESULT_STEM}.json`),
  markdownPath = path.join(process.cwd(), 'test-results', `${RESULT_STEM}.md`),
) {
  await mkdir(path.dirname(jsonPath), { recursive: true });
  await mkdir(path.dirname(markdownPath), { recursive: true });
  await writeFile(jsonPath, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
  await writeFile(markdownPath, renderMarkdown(output), 'utf8');
}

export async function runAndPersistAtlasHistoryMedSimulation() {
  const output = runAtlasHistoryMedSimulation();
  await writeAtlasHistoryMedSimulationResults(output);
  return output;
}

if (require.main === module) {
  runAndPersistAtlasHistoryMedSimulation()
    .then(({ summary }) => {
      console.log(JSON.stringify(summary, null, 2));
    })
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}
