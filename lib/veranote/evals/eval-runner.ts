import { POST } from '@/app/api/assistant/respond/route';
import { veraEvalCases } from '@/lib/veranote/evals/eval-cases';
import { buildEvalSummary, formatEvalReport } from '@/lib/veranote/evals/eval-reporter';
import { evalRuleRegistry } from '@/lib/veranote/evals/eval-rules';
import type { EvalCase, EvalResult } from '@/lib/veranote/evals/eval-types';
import { pathToFileURL } from 'node:url';

function buildEvalRequest(input: string) {
  return new Request('http://localhost/api/assistant/respond?eval=true', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      stage: 'compose',
      mode: 'workflow-help',
      message: input,
      context: {
        providerAddressingName: 'Daniel Hale',
        noteType: 'Inpatient Psych Progress Note',
      },
    }),
  });
}

function flattenOutput(payload: any) {
  return [payload.message, ...(payload.suggestions || [])].filter(Boolean).join('\n');
}

function checkForbiddenPatterns(output: string, patterns: string[]) {
  return patterns
    .filter((pattern) => output.toLowerCase().includes(pattern.toLowerCase()))
    .map((pattern) => `Forbidden pattern found: ${pattern}`);
}

function checkExpectedPatterns(output: string, patterns: string[] = []) {
  return patterns
    .filter((pattern) => !output.toLowerCase().includes(pattern.toLowerCase()))
    .map((pattern) => `Expected pattern missing: ${pattern}`);
}

export async function runEvalCase(evalCase: EvalCase): Promise<EvalResult> {
  const response = await POST(buildEvalRequest(evalCase.input));
  const payload = await response.json();
  const output = flattenOutput(payload);
  const ruleOutcomes = evalCase.expectedChecks.map((ruleName) => evalRuleRegistry[ruleName](output, evalCase.input));
  const failures = [
    ...ruleOutcomes.filter((outcome) => !outcome.passed).map((outcome) => outcome.explanation),
    ...checkExpectedPatterns(output, evalCase.expectedPatterns),
    ...checkForbiddenPatterns(output, evalCase.forbiddenPatterns),
  ];

  return {
    caseId: evalCase.id,
    passed: failures.length === 0,
    failures,
    warnings: payload.eval?.warnings || [],
    output,
    ruleOutcomes,
    metadata: evalCase.metadata,
  };
}

export async function runAllEvals() {
  const results: EvalResult[] = [];

  for (const evalCase of veraEvalCases) {
    const result = await runEvalCase(evalCase);
    results.push(result);
  }

  return buildEvalSummary(results);
}

async function main() {
  const summary = await runAllEvals();
  const report = formatEvalReport(summary);
  console.log(report);

  if (summary.totalFailed > 0) {
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main();
}
