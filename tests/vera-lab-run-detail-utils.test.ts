import { describe, expect, it } from 'vitest';
import { getFilteredAndSortedRunItems, summarizeRunDetailSlice } from '@/lib/veranote/lab/run-detail-utils';
import type { VeraLabRunDetailItem } from '@/lib/veranote/lab/types';

function makeItem(overrides: Partial<VeraLabRunDetailItem> & { caseId: string }): VeraLabRunDetailItem {
  return {
    case: {
      id: overrides.caseId,
      category: 'risk_contradiction',
      subtype: 'default',
      severity_if_wrong: 'medium',
      prompt: 'Default prompt',
      followup_prompt: null,
      expected_answer_mode: 'chart_ready_wording',
      ...(overrides.case || {}),
    },
    result: overrides.result === undefined ? {
      id: `${overrides.caseId}-result`,
      vera_response: 'Default response',
      answer_mode_returned: 'chart_ready_wording',
      route_taken: 'clinical',
      passed: true,
      failure_category: null,
      likely_root_cause: 'routing',
      safety_score: 4,
      directness_score: 4,
      usefulness_score: 4,
      chart_usability_score: 4,
      judge_notes: 'Default notes',
    } : overrides.result,
    repair_task: overrides.repair_task || null,
    regression_results: overrides.regression_results || [],
  };
}

const baseFilters = {
  failedOnly: false,
  highSeverityOnly: false,
  routingFailuresOnly: false,
  answerModeFailuresOnly: false,
};

describe('getFilteredAndSortedRunItems', () => {
  it('filters by failed-only and search text together', () => {
    const items = [
      makeItem({
        caseId: 'passed-1',
        case: { prompt: 'Medication wording question' },
      }),
      makeItem({
        caseId: 'failed-1',
        case: { prompt: 'Risk contradiction wording question' },
        result: {
          id: 'failed-1-result',
          vera_response: 'Unsafe low risk wording',
          answer_mode_returned: 'chart_ready_wording',
          route_taken: 'clinical',
          passed: false,
          failure_category: 'routing_failure',
          likely_root_cause: 'routing',
          safety_score: 1,
          directness_score: 2,
          usefulness_score: 1,
          chart_usability_score: 1,
          judge_notes: 'Routing drift on contradiction wording',
        },
      }),
    ];

    const result = getFilteredAndSortedRunItems({
      items,
      filters: { ...baseFilters, failedOnly: true },
      searchQuery: 'contradiction',
      sort: 'stored',
    });

    expect(result).toHaveLength(1);
    expect(result[0].case.id).toBe('failed-1');
  });

  it('sorts failure-first ahead of passing cases', () => {
    const items = [
      makeItem({ caseId: 'passed-1', case: { severity_if_wrong: 'critical', prompt: 'Passed critical' } }),
      makeItem({
        caseId: 'failed-1',
        case: { severity_if_wrong: 'medium', prompt: 'Failed medium' },
        result: {
          id: 'failed-1-result',
          vera_response: 'Bad result',
          answer_mode_returned: 'chart_ready_wording',
          route_taken: 'clinical',
          passed: false,
          failure_category: 'answer_mode_failure',
          likely_root_cause: 'answer-mode',
          safety_score: 2,
          directness_score: 2,
          usefulness_score: 2,
          chart_usability_score: 2,
          judge_notes: 'Answer mode drift',
        },
      }),
    ];

    const result = getFilteredAndSortedRunItems({
      items,
      filters: baseFilters,
      searchQuery: '',
      sort: 'failure-first',
    });

    expect(result.map((item) => item.case.id)).toEqual(['failed-1', 'passed-1']);
  });

  it('sorts by severity descending when requested', () => {
    const items = [
      makeItem({ caseId: 'medium-1', case: { severity_if_wrong: 'medium', prompt: 'Medium case' } }),
      makeItem({ caseId: 'critical-1', case: { severity_if_wrong: 'critical', prompt: 'Critical case' } }),
      makeItem({ caseId: 'high-1', case: { severity_if_wrong: 'high', prompt: 'High case' } }),
    ];

    const result = getFilteredAndSortedRunItems({
      items,
      filters: baseFilters,
      searchQuery: '',
      sort: 'severity',
    });

    expect(result.map((item) => item.case.id)).toEqual(['critical-1', 'high-1', 'medium-1']);
  });

  it('sorts by category and subtype when category sort is selected', () => {
    const items = [
      makeItem({ caseId: 'risk-b', case: { category: 'risk_contradiction', subtype: 'b' } }),
      makeItem({ caseId: 'utility-a', case: { category: 'practical_utility', subtype: 'a' } }),
      makeItem({ caseId: 'risk-a', case: { category: 'risk_contradiction', subtype: 'a' } }),
    ];

    const result = getFilteredAndSortedRunItems({
      items,
      filters: baseFilters,
      searchQuery: '',
      sort: 'category',
    });

    expect(result.map((item) => item.case.id)).toEqual(['utility-a', 'risk-a', 'risk-b']);
  });
});

describe('summarizeRunDetailSlice', () => {
  it('counts visible results and failure categories for the current slice', () => {
    const items = [
      makeItem({
        caseId: 'routing-1',
        result: {
          id: 'routing-1-result',
          vera_response: 'Routing miss',
          answer_mode_returned: 'chart_ready_wording',
          route_taken: 'utility',
          passed: false,
          failure_category: 'routing_failure',
          likely_root_cause: 'routing',
          safety_score: 1,
          directness_score: 1,
          usefulness_score: 1,
          chart_usability_score: 1,
          judge_notes: 'Routed to utility',
        },
      }),
      makeItem({
        caseId: 'answer-mode-1',
        result: {
          id: 'answer-mode-1-result',
          vera_response: 'Wrong answer mode',
          answer_mode_returned: 'workflow_help',
          route_taken: 'clinical',
          passed: false,
          failure_category: 'answer_mode_failure',
          likely_root_cause: 'answer-mode',
          safety_score: 2,
          directness_score: 2,
          usefulness_score: 2,
          chart_usability_score: 2,
          judge_notes: 'Wrong mode',
        },
      }),
      makeItem({ caseId: 'passed-1' }),
      makeItem({ caseId: 'pending-1', result: null }),
    ];

    const summary = summarizeRunDetailSlice(items);

    expect(summary.totalVisible).toBe(4);
    expect(summary.failedVisible).toBe(2);
    expect(summary.passedVisible).toBe(1);
    expect(summary.pendingVisible).toBe(1);
    expect(summary.byFailureCategory).toEqual([
      { key: 'answer_mode_failure', label: 'answer mode failure', count: 1 },
      { key: 'routing_failure', label: 'routing failure', count: 1 },
    ]);
  });
});
