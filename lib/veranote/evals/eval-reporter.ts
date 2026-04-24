import type { EvalResult, EvalSummary } from '@/lib/veranote/evals/eval-types';

export function buildEvalSummary(results: EvalResult[]): EvalSummary {
  const totalCases = results.length;
  const totalPassed = results.filter((result) => result.passed).length;
  const totalFailed = totalCases - totalPassed;
  const failureBreakdownByCategory = results.reduce<EvalSummary['failureBreakdownByCategory']>((acc, result) => {
    if (!result.passed && result.metadata?.category) {
      acc[result.metadata.category] = (acc[result.metadata.category] || 0) + 1;
    }
    return acc;
  }, {});

  return {
    totalCases,
    totalPassed,
    totalFailed,
    failureBreakdownByCategory,
    results,
  };
}

export function formatEvalReport(summary: EvalSummary) {
  const lines: string[] = [
    'Vera Eval Report',
    `Passed: ${summary.totalPassed}/${summary.totalCases}`,
    `Failed: ${summary.totalFailed}/${summary.totalCases}`,
    '',
  ];

  if (summary.totalFailed) {
    lines.push('Failure breakdown by category:');
    Object.entries(summary.failureBreakdownByCategory).forEach(([category, count]) => {
      lines.push(`- ${category}: ${count}`);
    });
    lines.push('');
  }

  summary.results.forEach((result) => {
    lines.push(`${result.passed ? 'PASS' : 'FAIL'}: ${result.caseId}`);
    if (result.failures.length) {
      result.failures.forEach((failure) => lines.push(`- ${failure}`));
    }
    if (result.warnings.length) {
      result.warnings.forEach((warning) => lines.push(`- warning: ${warning}`));
    }
    lines.push('');
  });

  return lines.join('\n').trim();
}
