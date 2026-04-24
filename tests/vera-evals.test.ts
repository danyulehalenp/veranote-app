import { describe, expect, it } from 'vitest';
import { veraEvalCases } from '@/lib/veranote/evals/eval-cases';
import { buildEvalSummary, formatEvalReport } from '@/lib/veranote/evals/eval-reporter';
import { runEvalCase } from '@/lib/veranote/evals/eval-runner';

describe('vera eval system', () => {
  it('contains a broad starter regression set', () => {
    expect(veraEvalCases.length).toBeGreaterThanOrEqual(18);
    expect(new Set(veraEvalCases.map((item) => item.metadata?.category)).size).toBeGreaterThanOrEqual(6);
  });

  it('can run an eval case through the live Vera route', async () => {
    const result = await runEvalCase(veraEvalCases[0]!);
    expect(result.caseId).toBe('mse-missing-mood-no-inference');
    expect(typeof result.output).toBe('string');
    expect(result.ruleOutcomes.length).toBeGreaterThan(0);
  });

  it('builds a readable report summary', () => {
    const summary = buildEvalSummary([
      {
        caseId: 'case-1',
        passed: false,
        failures: ['Example failure'],
        warnings: [],
        output: 'Output',
        ruleOutcomes: [],
        metadata: { category: 'mse' },
      },
    ]);

    expect(formatEvalReport(summary)).toContain('FAIL: case-1');
    expect(formatEvalReport(summary)).toContain('mse: 1');
  });
});
