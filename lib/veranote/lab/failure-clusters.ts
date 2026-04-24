import { getSuggestedFixStrategy } from '@/lib/veranote/lab/fix-strategy';
import type {
  VeraLabAssignedLayer,
  VeraLabFailureCategory,
  VeraLabFailureCluster,
} from '@/lib/veranote/lab/types';

export function buildFailureClusters(items: Array<{
  run_id?: string | null;
  case_id: string;
  result_id: string;
  category: string;
  subtype: string;
  prompt: string;
  likely_root_cause: VeraLabAssignedLayer;
  assigned_layer: VeraLabAssignedLayer;
  failure_category: VeraLabFailureCategory | null;
}>) {
  const grouped = new Map<string, VeraLabFailureCluster>();

  for (const item of items) {
    const clusterKey = [
      item.category,
      item.subtype,
      item.failure_category || 'unclassified',
      item.assigned_layer,
    ].join(':');

    const existing = grouped.get(clusterKey);
    if (existing) {
      existing.case_ids.push(item.case_id);
      existing.result_ids.push(item.result_id);
      existing.count += 1;
      continue;
    }

    grouped.set(clusterKey, {
      cluster_key: clusterKey,
      likely_root_cause: item.likely_root_cause,
      assigned_layer: item.assigned_layer,
      failure_category: item.failure_category,
      case_ids: [item.case_id],
      result_ids: [item.result_id],
      count: 1,
      representative_prompt: item.prompt,
      recommended_shared_fix: getSuggestedFixStrategy(item.assigned_layer).recommended_change,
      representative_run_id: item.run_id || null,
      representative_case_id: item.case_id,
      search_query: item.subtype,
    });
  }

  return [...grouped.values()]
    .filter((cluster) => cluster.count > 1)
    .sort((a, b) => b.count - a.count || a.representative_prompt.localeCompare(b.representative_prompt));
}
