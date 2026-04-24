import { buildFailureClusters } from '@/lib/veranote/lab/failure-clusters';
import type { VeraLabJudgedCaseResult, VeraLabRunReport } from '@/lib/veranote/lab/types';

export function buildVeraLabRunReport(
  rows: Array<{
    case_id: string;
    category: string;
    subtype: string;
    severity_if_wrong: string;
    judged: VeraLabJudgedCaseResult;
    fixTask?: {
      priority_score: number;
      priority_band: VeraLabRunReport['topPriorities'][number]['priority_band'];
      priority_explanation?: VeraLabRunReport['topPriorities'][number]['priority_explanation'] | null;
      improvement_summary: string;
    } | null;
  }>,
): VeraLabRunReport {
  const passFailByCategory: VeraLabRunReport['passFailByCategory'] = {};

  for (const row of rows) {
    if (!passFailByCategory[row.category]) {
      passFailByCategory[row.category] = { passed: 0, failed: 0 };
    }

    if (row.judged.passed) {
      passFailByCategory[row.category].passed += 1;
    } else {
      passFailByCategory[row.category].failed += 1;
    }
  }

  const repeatedFailurePatterns = Object.entries(
    rows
      .filter((row) => !row.judged.passed && row.judged.failure_category)
      .reduce<Record<string, { count: number; likely_root_cause: VeraLabJudgedCaseResult['likely_root_cause'] }>>((acc, row) => {
        const key = `${row.judged.failure_category}:${row.judged.likely_root_cause}`;
        if (!acc[key]) {
          acc[key] = {
            count: 0,
            likely_root_cause: row.judged.likely_root_cause,
          };
        }
        acc[key].count += 1;
        return acc;
      }, {}),
  )
    .map(([key, value]) => ({
      failure_category: key.split(':')[0],
      count: value.count,
      likely_root_cause: value.likely_root_cause,
    }))
    .sort((a, b) => b.count - a.count);

  const severityOrder = {
    critical: 3,
    high: 2,
    medium: 1,
    low: 0,
  } as const;

  const worstMisses = rows
    .filter((row) => !row.judged.passed)
    .sort((a, b) => {
      const severityDelta = severityOrder[b.severity_if_wrong as keyof typeof severityOrder] - severityOrder[a.severity_if_wrong as keyof typeof severityOrder];
      if (severityDelta !== 0) {
        return severityDelta;
      }

      return a.judged.safety_score - b.judged.safety_score;
    })
    .slice(0, 8)
    .map((row) => ({
      case_id: row.case_id,
      category: row.category,
      subtype: row.subtype,
      severity_if_wrong: row.severity_if_wrong as any,
      failure_category: row.judged.failure_category,
      likely_root_cause: row.judged.likely_root_cause,
      judge_notes: row.judged.judge_notes,
    }));

  const topPriorities = rows
    .filter((row) => !row.judged.passed && row.fixTask)
    .sort((a, b) => (
      (b.fixTask?.priority_score || 0) - (a.fixTask?.priority_score || 0)
    ))
    .slice(0, 8)
    .map((row) => ({
      case_id: row.case_id,
      category: row.category,
      subtype: row.subtype,
      severity_if_wrong: row.severity_if_wrong as any,
      failure_category: row.judged.failure_category,
      likely_root_cause: row.judged.likely_root_cause,
      priority_score: row.fixTask?.priority_score || 0,
      priority_band: row.fixTask?.priority_band || 'low',
      priority_explanation: row.fixTask?.priority_explanation || null,
      improvement_summary: row.fixTask?.improvement_summary || row.judged.judge_notes,
    }));

  const sharedFailureClusters = buildFailureClusters(
    rows
      .filter((row) => !row.judged.passed && row.judged.failure_category)
      .map((row) => ({
        case_id: row.case_id,
        result_id: row.case_id,
        category: row.category,
        subtype: row.subtype,
        prompt: row.judged.turns[0]?.prompt || row.judged.vera_response,
        likely_root_cause: row.judged.likely_root_cause,
        assigned_layer: row.judged.likely_root_cause,
        failure_category: row.judged.failure_category,
      })),
  );

  return {
    runId: rows[0]?.case_id || crypto.randomUUID(),
    passFailByCategory,
    repeatedFailurePatterns,
    topPriorities,
    sharedFailureClusters,
    worstMisses,
  };
}

export function formatVeraLabRunReport(report: VeraLabRunReport) {
  const lines: string[] = [
    'Vera Lab Summary',
    '',
    'Pass / fail by category:',
  ];

  for (const [category, counts] of Object.entries(report.passFailByCategory)) {
    lines.push(`- ${category}: ${counts.passed} passed, ${counts.failed} failed`);
  }

  if (report.repeatedFailurePatterns.length) {
    lines.push('', 'Repeated failure patterns:');
    for (const pattern of report.repeatedFailurePatterns) {
      lines.push(`- ${pattern.failure_category}: ${pattern.count} (${pattern.likely_root_cause})`);
    }
  }

  if (report.worstMisses.length) {
    lines.push('', 'Worst misses:');
    for (const miss of report.worstMisses) {
      lines.push(`- ${miss.case_id} [${miss.severity_if_wrong}] ${miss.failure_category || 'unknown'} -> ${miss.likely_root_cause}`);
    }
  }

  if (report.topPriorities.length) {
    lines.push('', 'Top priorities:');
    for (const item of report.topPriorities) {
      lines.push(`- ${item.case_id} [${item.priority_band}] score=${item.priority_score} ${item.failure_category || 'unknown'} -> ${item.likely_root_cause}`);
    }
  }

  if (report.sharedFailureClusters.length) {
    lines.push('', 'Shared failure clusters:');
    for (const cluster of report.sharedFailureClusters) {
      lines.push(`- ${cluster.cluster_key}: ${cluster.count} cases -> ${cluster.recommended_shared_fix}`);
    }
  }

  return lines.join('\n');
}
