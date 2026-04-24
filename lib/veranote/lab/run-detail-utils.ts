import type { VeraLabRunDetailItem, VeraLabRunDetailSort } from '@/lib/veranote/lab/types';

export type VeraLabRunDetailFilters = {
  failedOnly: boolean;
  highSeverityOnly: boolean;
  routingFailuresOnly: boolean;
  answerModeFailuresOnly: boolean;
};

export type VeraLabRunDetailSliceSummary = {
  totalVisible: number;
  failedVisible: number;
  passedVisible: number;
  pendingVisible: number;
  byFailureCategory: Array<{
    key: string;
    label: string;
    count: number;
  }>;
};

const severityRank: Record<string, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
};

function matchesStructuredFilters(item: VeraLabRunDetailItem, filters: VeraLabRunDetailFilters) {
  const failedOnly = !filters.failedOnly || item.result?.passed === false;
  const highSeverityOnly = !filters.highSeverityOnly || item.case.severity_if_wrong === 'high' || item.case.severity_if_wrong === 'critical';
  const routingFailuresOnly = !filters.routingFailuresOnly || item.result?.failure_category === 'routing_failure';
  const answerModeFailuresOnly = !filters.answerModeFailuresOnly || item.result?.failure_category === 'answer_mode_failure';
  return failedOnly && highSeverityOnly && routingFailuresOnly && answerModeFailuresOnly;
}

function matchesSearch(item: VeraLabRunDetailItem, normalizedSearchQuery: string) {
  if (!normalizedSearchQuery) {
    return true;
  }

  const haystack = [
    item.case.category,
    item.case.subtype,
    item.case.severity_if_wrong,
    item.case.prompt,
    item.case.followup_prompt || '',
    item.case.expected_answer_mode || '',
    item.result?.vera_response || '',
    item.result?.failure_category || '',
    item.result?.likely_root_cause || '',
    item.result?.judge_notes || '',
    item.repair_task?.assigned_layer || '',
    item.repair_task?.patch_prompt || '',
    item.repair_task?.patch_summary || '',
    ...item.regression_results.map((regression) => `${regression.prompt_variant} ${regression.notes || ''}`),
  ].join(' ').toLowerCase();

  return haystack.includes(normalizedSearchQuery);
}

function compareFailurePriority(a: VeraLabRunDetailItem, b: VeraLabRunDetailItem) {
  const aFailed = a.result?.passed === false ? 1 : 0;
  const bFailed = b.result?.passed === false ? 1 : 0;
  if (aFailed !== bFailed) {
    return bFailed - aFailed;
  }
  return 0;
}

function compareSeverity(a: VeraLabRunDetailItem, b: VeraLabRunDetailItem) {
  const aSeverity = severityRank[a.case.severity_if_wrong] || 0;
  const bSeverity = severityRank[b.case.severity_if_wrong] || 0;
  if (aSeverity !== bSeverity) {
    return bSeverity - aSeverity;
  }
  return 0;
}

export function getFilteredAndSortedRunItems({
  items,
  filters,
  searchQuery,
  sort,
}: {
  items: VeraLabRunDetailItem[];
  filters: VeraLabRunDetailFilters;
  searchQuery: string;
  sort: VeraLabRunDetailSort;
}) {
  const normalizedSearchQuery = searchQuery.trim().toLowerCase();

  const filtered = items.filter((item) => (
    matchesStructuredFilters(item, filters) && matchesSearch(item, normalizedSearchQuery)
  ));

  const indexed = filtered.map((item, index) => ({ item, index }));

  indexed.sort((left, right) => {
    const a = left.item;
    const b = right.item;

    if (sort === 'failure-first') {
      return (
        compareFailurePriority(a, b)
        || compareSeverity(a, b)
        || left.index - right.index
      );
    }

    if (sort === 'severity') {
      return (
        compareSeverity(a, b)
        || compareFailurePriority(a, b)
        || left.index - right.index
      );
    }

    if (sort === 'category') {
      return (
        a.case.category.localeCompare(b.case.category)
        || a.case.subtype.localeCompare(b.case.subtype)
        || compareFailurePriority(a, b)
        || left.index - right.index
      );
    }

    return left.index - right.index;
  });

  return indexed.map((entry) => entry.item);
}

export function summarizeRunDetailSlice(items: VeraLabRunDetailItem[]): VeraLabRunDetailSliceSummary {
  const totalVisible = items.length;
  const failedVisible = items.filter((item) => item.result?.passed === false).length;
  const passedVisible = items.filter((item) => item.result?.passed === true).length;
  const pendingVisible = items.filter((item) => !item.result).length;

  const failureCounts = items.reduce<Record<string, number>>((acc, item) => {
    if (item.result?.passed !== false) {
      return acc;
    }

    const key = item.result.failure_category || 'unclassified';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  const byFailureCategory = Object.entries(failureCounts)
    .map(([key, count]) => ({
      key,
      label: key.replace(/_/g, ' '),
      count,
    }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));

  return {
    totalVisible,
    failedVisible,
    passedVisible,
    pendingVisible,
    byFailureCategory,
  };
}
