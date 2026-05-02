import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  ATLAS_CLINICAL_LAB_SIMULATION_BANK,
  runAtlasClinicalLabSimulationBank,
  type AtlasClinicalLabSimulationCategory,
  type AtlasClinicalLabSimulationResult,
} from '@/lib/eval/clinical-labs/atlas-clinical-lab-simulation-bank';

type CountBucket = Record<string, number>;

type AtlasClinicalLabSimulationSummary = {
  totalCases: number;
  passed: number;
  failed: number;
  passRate: number;
  failuresByCategory: CountBucket;
  failuresBySeverity: CountBucket;
  failuresByRootCause: CountBucket;
  unsafeAnswerCount: number;
  overConservativeCount: number;
  missingContextFailures: number;
  topGaps: string[];
  recommendedNextSpecialtyModule: string;
  topFailures: AtlasClinicalLabSimulationResult[];
};

const RESULT_STEM = 'atlas-clinical-lab-simulation-2026-04-29';

export async function runAndPersistAtlasClinicalLabSimulation() {
  const results = runAtlasClinicalLabSimulationBank();
  const summary = summarizeAtlasClinicalLabSimulation(results);
  const output = {
    createdAt: new Date().toISOString(),
    bankSize: ATLAS_CLINICAL_LAB_SIMULATION_BANK.length,
    summary,
    results,
  };

  const outputDir = path.join(process.cwd(), 'test-results');
  await mkdir(outputDir, { recursive: true });
  await writeFile(
    path.join(outputDir, `${RESULT_STEM}.json`),
    `${JSON.stringify(output, null, 2)}\n`,
    'utf8',
  );
  await writeFile(
    path.join(outputDir, `${RESULT_STEM}.md`),
    formatMarkdownReport(summary, results),
    'utf8',
  );

  return output;
}

export function summarizeAtlasClinicalLabSimulation(
  results: AtlasClinicalLabSimulationResult[],
): AtlasClinicalLabSimulationSummary {
  const failed = results.filter((result) => !result.passed);
  const failuresByCategory = countBy(failed, (result) => result.category);
  const failuresBySeverity = countBy(failed, (result) => result.severity);
  const failuresByRootCause = failed.reduce<CountBucket>((counts, result) => {
    for (const failureType of result.failureTypes) {
      counts[failureType] = (counts[failureType] ?? 0) + 1;
    }
    return counts;
  }, {});

  return {
    totalCases: results.length,
    passed: results.length - failed.length,
    failed: failed.length,
    passRate: Number((((results.length - failed.length) / results.length) * 100).toFixed(2)),
    failuresByCategory,
    failuresBySeverity,
    failuresByRootCause,
    unsafeAnswerCount: failed.filter((result) => result.failureTypes.includes('unsafe_direct_order')).length,
    overConservativeCount: failed.filter((result) => result.failureTypes.includes('over_conservative_fallback')).length,
    missingContextFailures: failed.filter((result) => result.failureTypes.includes('missing_context_prompt')).length,
    topGaps: rankTopGaps(failed),
    recommendedNextSpecialtyModule: recommendNextSpecialtyModule(failuresByCategory),
    topFailures: failed.slice(0, 10),
  };
}

function countBy<T>(items: T[], keyFor: (item: T) => string) {
  return items.reduce<CountBucket>((counts, item) => {
    const key = keyFor(item);
    counts[key] = (counts[key] ?? 0) + 1;
    return counts;
  }, {});
}

function rankTopGaps(failed: AtlasClinicalLabSimulationResult[]) {
  const gapCounts = new Map<string, number>();
  for (const result of failed) {
    for (const failureType of result.failureTypes) {
      gapCounts.set(failureType, (gapCounts.get(failureType) ?? 0) + 1);
    }
    for (const concept of result.missingConcepts) {
      gapCounts.set(`missing concept: ${concept}`, (gapCounts.get(`missing concept: ${concept}`) ?? 0) + 1);
    }
    for (const context of result.missingContextPrompts) {
      gapCounts.set(`missing context: ${context}`, (gapCounts.get(`missing context: ${context}`) ?? 0) + 1);
    }
  }

  return [...gapCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([label, count]) => `${label} (${count})`);
}

function recommendNextSpecialtyModule(failuresByCategory: CountBucket) {
  const criticalWeightedCategories = new Set<AtlasClinicalLabSimulationCategory>([
    'toxicology_urgent',
    'electrolytes_renal',
    'cardiac_qtc',
    'hepatic_dili',
  ]);
  const ranked = (Object.entries(failuresByCategory) as Array<[AtlasClinicalLabSimulationCategory, number]>)
    .sort((a, b) => {
      const weightedA = a[1] + (criticalWeightedCategories.has(a[0]) ? 3 : 0);
      const weightedB = b[1] + (criticalWeightedCategories.has(b[0]) ? 3 : 0);
      return weightedB - weightedA;
    });
  const top = ranked[0]?.[0];

  switch (top) {
    case 'toxicology_urgent':
      return 'Toxicology/urgent medication-lab overlay';
    case 'electrolytes_renal':
      return 'General medicine electrolyte/renal overlay';
    case 'hepatic_dili':
      return 'Hepatic/DILI overlay';
    case 'hematology':
      return 'Hematology overlay';
    case 'cardiometabolic':
      return 'Cardiometabolic overlay';
    case 'cardiac_qtc':
      return 'Cardiac/QTc overlay';
    case 'psychiatry_medication_levels':
      return 'Psychiatry medication-level overlay refinement';
    default:
      return 'General medicine lab triage overlay';
  }
}

function formatMarkdownReport(
  summary: AtlasClinicalLabSimulationSummary,
  results: AtlasClinicalLabSimulationResult[],
) {
  const failed = results.filter((result) => !result.passed);
  const lines = [
    '# Atlas Clinical Lab Interpretation Simulation',
    '',
    `Generated: ${new Date().toISOString()}`,
    '',
    '## Summary',
    '',
    `- Total cases: ${summary.totalCases}`,
    `- Passed: ${summary.passed}`,
    `- Failed: ${summary.failed}`,
    `- Pass rate: ${summary.passRate}%`,
    `- Unsafe answer count: ${summary.unsafeAnswerCount}`,
    `- Over-conservative fallback count: ${summary.overConservativeCount}`,
    `- Missing-context failures: ${summary.missingContextFailures}`,
    `- Recommended next specialty module: ${summary.recommendedNextSpecialtyModule}`,
    '',
    '## Failures By Category',
    '',
    ...formatBucket(summary.failuresByCategory),
    '',
    '## Failures By Root Cause',
    '',
    ...formatBucket(summary.failuresByRootCause),
    '',
    '## Top 10 Gaps',
    '',
    ...summary.topGaps.map((gap) => `- ${gap}`),
    '',
    '## Top 10 Failures',
    '',
    ...failed.slice(0, 10).flatMap((result) => [
      `### ${result.id}: ${result.category} / ${result.severity}`,
      '',
      `Question: ${result.userQuestion}`,
      '',
      `Route: expected ${result.expectedRoute}, got ${result.routeUsed}`,
      '',
      `Failure types: ${result.failureTypes.join(', ') || 'none'}`,
      '',
      `Missing concepts: ${result.missingConcepts.join(', ') || 'none'}`,
      '',
      `Missing context: ${result.missingContextPrompts.join(', ') || 'none'}`,
      '',
      `Response excerpt: ${result.responseExcerpt || '[no routed response]'}`,
      '',
    ]),
  ];

  return `${lines.join('\n')}\n`;
}

function formatBucket(bucket: CountBucket) {
  const entries = Object.entries(bucket).sort((a, b) => b[1] - a[1]);
  return entries.length ? entries.map(([label, count]) => `- ${label}: ${count}`) : ['- none'];
}

if (require.main === module) {
  runAndPersistAtlasClinicalLabSimulation()
    .then(({ summary }) => {
      console.log(JSON.stringify(summary, null, 2));
    })
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}
