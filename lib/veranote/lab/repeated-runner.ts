import type {
  VeraLabAssignedLayer,
  VeraLabRepeatedRunOptions,
  VeraLabRepeatedRunSummary,
} from '@/lib/veranote/lab/types';

const DEFAULT_CYCLES = 3;
const MAX_CYCLES = 10;
const DEFAULT_CASES_PER_CYCLE = 20;
const MAX_CASES_PER_CYCLE = 50;

type BatchExecutor = (options: VeraLabRepeatedRunOptions & { cases_limit?: number }) => Promise<{
  run: { id: string };
  casesExecuted: number;
  report: {
    passFailByCategory: Record<string, { passed: number; failed: number }>;
    repeatedFailurePatterns: Array<{
      failure_category: string;
      count: number;
      likely_root_cause: VeraLabAssignedLayer;
    }>;
    worstMisses: Array<{
      category: string;
      subtype: string;
      severity_if_wrong: 'low' | 'medium' | 'high' | 'critical';
    }>;
  };
  fixTaskPriorityCounts?: Record<'urgent' | 'high' | 'medium' | 'low', number>;
}>;

export function normalizeRepeatedRunOptions(options: VeraLabRepeatedRunOptions) {
  return {
    ...options,
    cycles: clampInteger(options.cycles, DEFAULT_CYCLES, 1, MAX_CYCLES),
    casesPerCycle: clampInteger(options.casesPerCycle, DEFAULT_CASES_PER_CYCLE, 1, MAX_CASES_PER_CYCLE),
    stopOnCriticalFailure: options.stopOnCriticalFailure ?? true,
  };
}

export async function runRepeatedVeraLabCycles(
  options: VeraLabRepeatedRunOptions,
  executor?: BatchExecutor,
): Promise<VeraLabRepeatedRunSummary> {
  const normalized = normalizeRepeatedRunOptions(options);
  const runBatch = executor || (await import('@/lib/veranote/lab/interrogator')).runVeraLabBatch;
  const repeatedFailureMap = new Map<string, { count: number; likely_root_cause: VeraLabAssignedLayer }>();
  const runIds: string[] = [];
  let cyclesCompleted = 0;
  let totalCases = 0;
  let totalPassed = 0;
  let totalFailed = 0;
  let urgentFixTaskCount = 0;
  let highPriorityFixTaskCount = 0;
  let stoppedEarly = false;
  let stopReason: string | null = null;

  for (let cycleIndex = 0; cycleIndex < normalized.cycles; cycleIndex += 1) {
    const result = await runBatch({
      ...normalized,
      cases_limit: normalized.casesPerCycle,
    });

    cyclesCompleted += 1;
    runIds.push(result.run.id);
    totalCases += result.casesExecuted;

    const cycleTotals = Object.values(result.report.passFailByCategory).reduce(
      (acc, counts) => {
        acc.passed += counts.passed;
        acc.failed += counts.failed;
        return acc;
      },
      { passed: 0, failed: 0 },
    );

    totalPassed += cycleTotals.passed;
    totalFailed += cycleTotals.failed;
    urgentFixTaskCount += result.fixTaskPriorityCounts?.urgent || 0;
    highPriorityFixTaskCount += result.fixTaskPriorityCounts?.high || 0;

    for (const pattern of result.report.repeatedFailurePatterns) {
      const key = `${pattern.failure_category}:${pattern.likely_root_cause}`;
      const current = repeatedFailureMap.get(key);

      repeatedFailureMap.set(key, {
        count: (current?.count || 0) + pattern.count,
        likely_root_cause: pattern.likely_root_cause,
      });
    }

    if (normalized.stopOnCriticalFailure) {
      const criticalMiss = result.report.worstMisses.find((miss) => miss.severity_if_wrong === 'critical');

      if (criticalMiss) {
        stoppedEarly = true;
        stopReason = `Critical failure encountered in cycle ${cycleIndex + 1}: ${criticalMiss.category} / ${criticalMiss.subtype}.`;
        break;
      }
    }
  }

  return {
    cyclesRequested: normalized.cycles,
    cyclesCompleted,
    stoppedEarly,
    stopReason,
    totalCases,
    totalPassed,
    totalFailed,
    passRate: totalCases > 0 ? Number((totalPassed / totalCases).toFixed(4)) : 0,
    urgentFixTaskCount,
    highPriorityFixTaskCount,
    repeatedFailurePatterns: Array.from(repeatedFailureMap.entries())
      .map(([key, value]) => ({
        failure_category: key.split(':')[0] || 'unknown',
        count: value.count,
        likely_root_cause: value.likely_root_cause,
      }))
      .sort((a, b) => b.count - a.count),
    runIds,
  };
}

function clampInteger(value: number | undefined, fallback: number, min: number, max: number) {
  if (!Number.isFinite(value)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, Math.trunc(value as number)));
}
