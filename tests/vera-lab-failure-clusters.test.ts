import { describe, expect, it } from 'vitest';
import { buildFailureClusters } from '@/lib/veranote/lab/failure-clusters';

describe('buildFailureClusters', () => {
  it('groups repeated failures that share one likely defect', () => {
    const clusters = buildFailureClusters([
      {
        run_id: 'run-1',
        case_id: 'case-1',
        result_id: 'result-1',
        category: 'risk_contradiction',
        subtype: 'low-risk-wording',
        prompt: 'Can I say suicide risk is low here?',
        likely_root_cause: 'routing',
        assigned_layer: 'routing',
        failure_category: 'routing_failure',
      },
      {
        run_id: 'run-1',
        case_id: 'case-2',
        result_id: 'result-2',
        category: 'risk_contradiction',
        subtype: 'low-risk-wording',
        prompt: 'Would low violence-risk wording be okay here?',
        likely_root_cause: 'routing',
        assigned_layer: 'routing',
        failure_category: 'routing_failure',
      },
      {
        run_id: 'run-2',
        case_id: 'case-3',
        result_id: 'result-3',
        category: 'documentation_wording',
        subtype: 'discharge-wording',
        prompt: 'Can I say discharge is safe today?',
        likely_root_cause: 'wording',
        assigned_layer: 'wording',
        failure_category: 'wording_failure',
      },
    ]);

    expect(clusters).toHaveLength(1);
    expect(clusters[0].count).toBe(2);
    expect(clusters[0].case_ids).toEqual(['case-1', 'case-2']);
    expect(clusters[0].assigned_layer).toBe('routing');
    expect(clusters[0].recommended_shared_fix).toContain('route');
  });
});
