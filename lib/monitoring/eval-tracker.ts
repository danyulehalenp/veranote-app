import { recordEval } from '@/lib/monitoring/metrics-store';

const EVAL_WARNING_THRESHOLD = 0.8;

export function recordEvalResult(passed: number, failed: number) {
  recordEval({
    timestamp: new Date().toISOString(),
    passed,
    failed,
  });

  const total = passed + failed;
  if (!total) {
    return;
  }

  const passRate = passed / total;
  if (passRate < EVAL_WARNING_THRESHOLD) {
    console.warn('[veranote-monitoring]', {
      type: 'eval-drift-warning',
      passRate,
      passed,
      failed,
    });
  }
}
