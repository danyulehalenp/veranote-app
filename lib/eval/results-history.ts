import { fidelityCases } from '@/lib/eval/fidelity-cases';
import { founderWorkflowEvalCases } from '@/lib/eval/founder-workflow-cases';
import { encounterSupportEvalCases } from '@/lib/eval/encounter-support-cases';
import { outpatientPsychEvalCases } from '@/lib/eval/outpatient-psych-cases';
import { phaseTwoTrustEvalCases } from '@/lib/eval/phase-two-trust-cases';
import { getMismatchHints } from '@/lib/eval/mismatch-hints';
import { EVAL_SCORECARD_KEY } from '@/lib/constants/storage';
import type { FidelityCase } from '@/lib/eval/fidelity-cases';
import type { EvalRubricScores, EvalScorecard } from '@/types/eval';

export type EvalResultRecord = {
  id: string;
  title: string;
  specialty: string;
  noteType: string;
  riskFocus: string;
  scorecard: EvalScorecard;
};

export type EvalAggregateStats = {
  totalCases: number;
  passCount: number;
  needsRevisionCount: number;
  failCount: number;
  greenCount: number;
  yellowCount: number;
  redCount: number;
  averageRubricScore: number;
  missingExpectedTruthsCount: number;
  forbiddenAdditionsCount: number;
  missingExplicitDatesCount: number;
  criticalFailuresCount: number;
};

export type ProvisionalEvalTriage = {
  suggestedStoplight: EvalScorecard['stoplight'];
  suggestedOverallRating: EvalScorecard['overallRating'];
  suggestedCriticalFailures: string[];
  summaryLines: string[];
  mismatchCounts: {
    missingExpectedTruths: number;
    forbiddenAdditions: number;
    missingExplicitDates: number;
    highRiskWarnings: number;
  };
};

export const rubricCategoryLabels: Record<keyof EvalRubricScores, string> = {
  factGrounding: 'Fact grounding',
  medicationFidelity: 'Medication fidelity',
  negationFidelity: 'Negation fidelity',
  timelineFidelity: 'Timeline fidelity',
  attributionFidelity: 'Attribution fidelity',
  missingDataBehavior: 'Missing-data behavior',
  contradictionHandling: 'Contradiction handling',
  templateUsefulness: 'Template usefulness',
};

export function createDefaultRubricScores(): EvalRubricScores {
  return {
    factGrounding: 1,
    medicationFidelity: 1,
    negationFidelity: 1,
    timelineFidelity: 1,
    attributionFidelity: 1,
    missingDataBehavior: 1,
    contradictionHandling: 1,
    templateUsefulness: 1,
  };
}

export function createDefaultEvalScorecard(): EvalScorecard {
  return {
    stoplight: 'Yellow',
    overallRating: 'Needs revision',
    regressionRunLabel: '',
    rubricScores: createDefaultRubricScores(),
    criticalFailures: [],
    notes: '',
    failuresFound: '',
    unsupportedTextExample: '',
    recommendedFix: '',
    outputSnapshot: '',
    outputFlagsSnapshot: '',
  };
}

export function loadEvalResults(): EvalResultRecord[] {
  if (typeof window === 'undefined') {
    return [];
  }

  const allEvalCases = [...fidelityCases, ...founderWorkflowEvalCases, ...outpatientPsychEvalCases, ...encounterSupportEvalCases, ...phaseTwoTrustEvalCases];

  return allEvalCases
    .map((item) => {
      const raw = window.localStorage.getItem(`${EVAL_SCORECARD_KEY}:${item.id}`);
      if (!raw) {
        return null;
      }

      try {
        const parsed = JSON.parse(raw) as EvalScorecard;
        return {
          id: item.id,
          title: item.title,
          specialty: item.specialty,
          noteType: item.noteType,
          riskFocus: item.riskFocus,
          scorecard: {
            ...createDefaultEvalScorecard(),
            ...parsed,
            rubricScores: { ...createDefaultRubricScores(), ...(parsed.rubricScores || {}) },
            criticalFailures: Array.isArray(parsed.criticalFailures) ? parsed.criticalFailures : [],
          },
        };
      } catch {
        return null;
      }
    })
    .filter((item): item is EvalResultRecord => item !== null)
    .sort((a, b) => {
      const aTime = a.scorecard.reviewedAt ? new Date(a.scorecard.reviewedAt).getTime() : 0;
      const bTime = b.scorecard.reviewedAt ? new Date(b.scorecard.reviewedAt).getTime() : 0;
      return bTime - aTime;
    });
}

export function exportEvalResults(results: EvalResultRecord[]) {
  return JSON.stringify(
    results.map((item) => ({
      id: item.id,
      title: item.title,
      specialty: item.specialty,
      noteType: item.noteType,
      riskFocus: item.riskFocus,
      rubricTotal: getRubricTotal(item.scorecard),
      ...item.scorecard,
    })),
    null,
    2,
  );
}

function escapeCsv(value: string | number | boolean | undefined) {
  const stringValue = String(value ?? '');
  if (/[",\n]/.test(stringValue)) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }
  return stringValue;
}

export function exportEvalResultsCsv(results: EvalResultRecord[]) {
  const headers = [
    'id',
    'title',
    'specialty',
    'noteType',
    'riskFocus',
    'regressionRunLabel',
    'stoplight',
    'overallRating',
    'rubricTotal',
    'reviewedAt',
    ...Object.keys(rubricCategoryLabels),
    'criticalFailures',
    'failuresFound',
    'unsupportedTextExample',
    'recommendedFix',
    'notes',
    'outputFlagsSnapshot',
    'outputSnapshot',
  ];

  const rows = results.map((item) => [
    item.id,
    item.title,
    item.specialty,
    item.noteType,
    item.riskFocus,
    item.scorecard.regressionRunLabel,
    item.scorecard.stoplight,
    item.scorecard.overallRating,
    getRubricTotal(item.scorecard),
    item.scorecard.reviewedAt ?? '',
    ...Object.keys(rubricCategoryLabels).map((key) => item.scorecard.rubricScores[key as keyof EvalRubricScores]),
    item.scorecard.criticalFailures.join(' | '),
    item.scorecard.failuresFound,
    item.scorecard.unsupportedTextExample,
    item.scorecard.recommendedFix,
    item.scorecard.notes,
    item.scorecard.outputFlagsSnapshot,
    item.scorecard.outputSnapshot,
  ].map(escapeCsv).join(','));

  return [headers.join(','), ...rows].join('\n');
}

export function getRubricTotal(scorecard: EvalScorecard) {
  return (Object.values(scorecard.rubricScores || {}) as Array<0 | 1 | 2>).reduce<number>((total, value) => total + value, 0);
}

export function deriveProvisionalEvalTriage(input: {
  selectedCase: FidelityCase;
  outputSnapshot: string;
  outputFlagsSnapshot: string;
}): ProvisionalEvalTriage {
  const mismatchHints = getMismatchHints(input);
  const criticalFailures = new Set<string>();
  const forbiddenLower = mismatchHints.forbiddenAdditionsFound.map((item) => item.toLowerCase());
  const highRiskLower = mismatchHints.highRiskWarnings.map((item) => item.toLowerCase());
  const missingTruthLower = mismatchHints.missingExpectedTruths.map((item) => item.toLowerCase());

  if (forbiddenLower.some((item) => /medication|dose|regimen|refill|change/.test(item))) {
    criticalFailures.add('Invented medication, dose, or change');
  }
  if (forbiddenLower.some((item) => /plan|treatment|follow-up|follow up|disposition|hospitalization|discharge/.test(item))) {
    criticalFailures.add('Invented follow-up plan or treatment decision');
  }
  if (forbiddenLower.some((item) => /objective|vital|strep|fever|positive|exam|lab|blood pressure/.test(item))) {
    criticalFailures.add('Fabricated objective findings');
  }
  if (highRiskLower.some((item) => /conflicting sources|collapsing into one narrative|attribution/.test(item))) {
    criticalFailures.add('Incorrect attribution of collateral vs patient statements');
  }
  if (highRiskLower.some((item) => /global denial|flattened into simple si denial|erasing recent or conflicting risk detail/.test(item))
    || missingTruthLower.some((item) => /denies|no current|no current intent|no current plan|passive/.test(item))) {
    criticalFailures.add('Reversal of negation or uncertainty');
  }
  if (missingTruthLower.some((item) => /suicidal|homicidal|si|hi/.test(item))
    && highRiskLower.some((item) => /risk|si denial|passive death|recent risk/.test(item))) {
    criticalFailures.add('Invented suicidal/homicidal ideation status');
  }

  const severityScore =
    criticalFailures.size * 3
    + mismatchHints.forbiddenAdditionsFound.length * 2
    + mismatchHints.highRiskWarnings.length
    + mismatchHints.missingExpectedTruths.length
    + mismatchHints.missingExplicitDates.length;

  const suggestedStoplight: EvalScorecard['stoplight'] = criticalFailures.size > 0 || mismatchHints.forbiddenAdditionsFound.length > 0
    ? 'Red'
    : severityScore >= 3
      ? 'Yellow'
      : 'Green';

  const suggestedOverallRating: EvalScorecard['overallRating'] = criticalFailures.size > 0
    ? 'Fail'
    : severityScore >= 3
      ? 'Needs revision'
      : 'Pass';

  const summaryLines = [
    mismatchHints.missingExpectedTruths.length
      ? `${mismatchHints.missingExpectedTruths.length} expected truth item${mismatchHints.missingExpectedTruths.length === 1 ? '' : 's'} may be missing.`
      : 'No obvious expected-truth misses detected.',
    mismatchHints.forbiddenAdditionsFound.length
      ? `${mismatchHints.forbiddenAdditionsFound.length} forbidden addition cue${mismatchHints.forbiddenAdditionsFound.length === 1 ? '' : 's'} detected.`
      : 'No obvious forbidden-addition cue detected.',
    mismatchHints.highRiskWarnings.length
      ? `${mismatchHints.highRiskWarnings.length} high-risk drift cue${mismatchHints.highRiskWarnings.length === 1 ? '' : 's'} detected.`
      : 'No high-risk drift cue detected.',
    mismatchHints.missingExplicitDates.length
      ? `${mismatchHints.missingExplicitDates.length} explicit date or time anchor cue${mismatchHints.missingExplicitDates.length === 1 ? '' : 's'} may be missing.`
      : 'No obvious date-anchor loss detected.',
  ];

  return {
    suggestedStoplight,
    suggestedOverallRating,
    suggestedCriticalFailures: Array.from(criticalFailures),
    summaryLines,
    mismatchCounts: {
      missingExpectedTruths: mismatchHints.missingExpectedTruths.length,
      forbiddenAdditions: mismatchHints.forbiddenAdditionsFound.length,
      missingExplicitDates: mismatchHints.missingExplicitDates.length,
      highRiskWarnings: mismatchHints.highRiskWarnings.length,
    },
  };
}

export function calculateAggregateStats(results: EvalResultRecord[]): EvalAggregateStats {
  if (!results.length) {
    return {
      totalCases: 0,
      passCount: 0,
      needsRevisionCount: 0,
      failCount: 0,
      greenCount: 0,
      yellowCount: 0,
      redCount: 0,
      averageRubricScore: 0,
      missingExpectedTruthsCount: 0,
      forbiddenAdditionsCount: 0,
      missingExplicitDatesCount: 0,
      criticalFailuresCount: 0,
    };
  }

  let totalRubricScore = 0;
  let missingExpectedTruthsCount = 0;
  let forbiddenAdditionsCount = 0;
  let missingExplicitDatesCount = 0;
  let criticalFailuresCount = 0;

  for (const result of results) {
    totalRubricScore += getRubricTotal(result.scorecard);
    criticalFailuresCount += result.scorecard.criticalFailures.length;
    const selectedCase = [...fidelityCases, ...founderWorkflowEvalCases, ...outpatientPsychEvalCases, ...encounterSupportEvalCases, ...phaseTwoTrustEvalCases].find((item) => item.id === result.id);

    if (selectedCase) {
      const hints = getMismatchHints({
        selectedCase,
        outputSnapshot: result.scorecard.outputSnapshot,
        outputFlagsSnapshot: result.scorecard.outputFlagsSnapshot,
      });

      missingExpectedTruthsCount += hints.missingExpectedTruths.length;
      forbiddenAdditionsCount += hints.forbiddenAdditionsFound.length;
      missingExplicitDatesCount += hints.missingExplicitDates.length;
    }
  }

  return {
    totalCases: results.length,
    passCount: results.filter((item) => item.scorecard.overallRating === 'Pass').length,
    needsRevisionCount: results.filter((item) => item.scorecard.overallRating === 'Needs revision').length,
    failCount: results.filter((item) => item.scorecard.overallRating === 'Fail').length,
    greenCount: results.filter((item) => item.scorecard.stoplight === 'Green').length,
    yellowCount: results.filter((item) => item.scorecard.stoplight === 'Yellow').length,
    redCount: results.filter((item) => item.scorecard.stoplight === 'Red').length,
    averageRubricScore: Number((totalRubricScore / results.length).toFixed(1)),
    missingExpectedTruthsCount,
    forbiddenAdditionsCount,
    missingExplicitDatesCount,
    criticalFailuresCount,
  };
}
