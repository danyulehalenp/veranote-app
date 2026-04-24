import { describe, expect, it, vi } from 'vitest';
import { normalizeRepeatedRunOptions, runRepeatedVeraLabCycles } from '@/lib/veranote/lab/repeated-runner';
import type { VeraLabRunOptions } from '@/lib/veranote/lab/types';

function createBatchResult({
  runId,
  passed,
  failed,
  urgent = 0,
  high = 0,
  worstMissSeverity,
}: {
  runId: string;
  passed: number;
  failed: number;
  urgent?: number;
  high?: number;
  worstMissSeverity?: 'low' | 'medium' | 'high' | 'critical';
}) {
  return {
    run: { id: runId },
    casesExecuted: passed + failed,
    report: {
      runId,
      passFailByCategory: {
        practical_utility: { passed, failed },
      },
      repeatedFailurePatterns: failed
        ? [{ failure_category: 'routing_failure', count: failed, likely_root_cause: 'routing' as const }]
        : [],
      topPriorities: [],
      sharedFailureClusters: [],
      worstMisses: worstMissSeverity
        ? [{
            case_id: `case-${runId}`,
            category: 'practical_utility' as const,
            subtype: 'calendar',
            severity_if_wrong: worstMissSeverity,
            failure_category: 'routing_failure' as const,
            likely_root_cause: 'routing' as const,
            judge_notes: 'critical miss',
          }]
        : [],
    },
    fixTaskPriorityCounts: {
      urgent,
      high,
      medium: 0,
      low: 0,
    },
  };
}

function baseOptions(): VeraLabRunOptions {
  return {
    mode: 'workflow-help',
    stage: 'review',
    tester_version: 'vera-lab-v1',
    repair_version: 'repair-router-v1',
    provider_profile_id: null,
    pack_ids: [],
    categories: [],
  };
}

describe('runRepeatedVeraLabCycles', () => {
  it('completes the requested cycles', async () => {
    const executor = vi.fn()
      .mockResolvedValueOnce(createBatchResult({ runId: 'run-1', passed: 18, failed: 2, urgent: 1, high: 1 }))
      .mockResolvedValueOnce(createBatchResult({ runId: 'run-2', passed: 17, failed: 3, urgent: 0, high: 2 }))
      .mockResolvedValueOnce(createBatchResult({ runId: 'run-3', passed: 20, failed: 0 }));

    const result = await runRepeatedVeraLabCycles({
      ...baseOptions(),
      cycles: 3,
      casesPerCycle: 20,
      stopOnCriticalFailure: true,
    }, executor as any);

    expect(executor).toHaveBeenCalledTimes(3);
    expect(result.cyclesCompleted).toBe(3);
    expect(result.stoppedEarly).toBe(false);
    expect(result.totalCases).toBe(60);
    expect(result.totalPassed).toBe(55);
    expect(result.totalFailed).toBe(5);
    expect(result.urgentFixTaskCount).toBe(1);
    expect(result.highPriorityFixTaskCount).toBe(3);
    expect(result.runIds).toEqual(['run-1', 'run-2', 'run-3']);
  });

  it('stops early on critical failure', async () => {
    const executor = vi.fn()
      .mockResolvedValueOnce(createBatchResult({ runId: 'run-1', passed: 15, failed: 5, worstMissSeverity: 'critical' }))
      .mockResolvedValueOnce(createBatchResult({ runId: 'run-2', passed: 20, failed: 0 }));

    const result = await runRepeatedVeraLabCycles({
      ...baseOptions(),
      cycles: 4,
      casesPerCycle: 20,
      stopOnCriticalFailure: true,
    }, executor as any);

    expect(executor).toHaveBeenCalledTimes(1);
    expect(result.cyclesCompleted).toBe(1);
    expect(result.stoppedEarly).toBe(true);
    expect(result.stopReason).toContain('Critical failure encountered');
  });

  it('respects max limits', () => {
    const normalized = normalizeRepeatedRunOptions({
      ...baseOptions(),
      cycles: 99,
      casesPerCycle: 500,
      stopOnCriticalFailure: false,
    });

    expect(normalized.cycles).toBe(10);
    expect(normalized.casesPerCycle).toBe(50);
    expect(normalized.stopOnCriticalFailure).toBe(false);
  });

  it('aggregates pass fail correctly', async () => {
    const executor = vi.fn()
      .mockResolvedValueOnce(createBatchResult({ runId: 'run-1', passed: 10, failed: 10, high: 2 }))
      .mockResolvedValueOnce(createBatchResult({ runId: 'run-2', passed: 14, failed: 6, urgent: 1 }));

    const result = await runRepeatedVeraLabCycles({
      ...baseOptions(),
      cycles: 2,
      casesPerCycle: 20,
    }, executor as any);

    expect(result.totalCases).toBe(40);
    expect(result.totalPassed).toBe(24);
    expect(result.totalFailed).toBe(16);
    expect(result.passRate).toBe(0.6);
    expect(result.repeatedFailurePatterns[0]).toMatchObject({
      failure_category: 'routing_failure',
      count: 16,
      likely_root_cause: 'routing',
    });
  });
});
