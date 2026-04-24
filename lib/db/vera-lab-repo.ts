import { getSupabaseAdminClient } from '@/lib/db/supabase-client';
import { buildFailureClusters } from '@/lib/veranote/lab/failure-clusters';
import type {
  VeraLabAssignedLayer,
  VeraLabDashboardSummary,
  VeraLabFailureCategory,
  VeraLabFixTaskStatus,
  VeraLabPriorityBand,
  VeraLabPriorityExplanation,
  VeraLabRepairTaskDraft,
  VeraLabRunDetail,
  VeraLabRunOptions,
  VeraLabSeverity,
  VeraLabSuggestedFixStrategy,
  VeraProviderQuestionCase,
} from '@/lib/veranote/lab/types';

function getClient() {
  const client = getSupabaseAdminClient();
  if (!client) {
    throw new Error('Supabase admin client is unavailable for Vera Lab.');
  }

  return client;
}

export async function createVeraTestRun(options: VeraLabRunOptions) {
  const supabase = getClient();
  const payload = {
    mode: options.mode,
    stage: options.stage,
    provider_profile_id: options.provider_profile_id || null,
    tester_version: options.tester_version,
    repair_version: options.repair_version,
    status: 'running',
  };

  const { data, error } = await supabase
    .from('vera_test_runs')
    .insert(payload)
    .select('*')
    .single();

  if (error) {
    throw error;
  }

  return data;
}

export async function updateVeraTestRunStatus(runId: string, status: string) {
  const supabase = getClient();
  const { error } = await supabase
    .from('vera_test_runs')
    .update({ status })
    .eq('id', runId);

  if (error) {
    throw error;
  }
}

export async function createVeraTestCase(runId: string, testCase: VeraProviderQuestionCase) {
  const supabase = getClient();
  const { data, error } = await supabase
    .from('vera_test_cases')
    .insert({
      run_id: runId,
      category: testCase.category,
      subtype: testCase.subtype,
      prompt: testCase.prompt,
      followup_prompt: testCase.followup_prompt || null,
      expected_answer_mode: testCase.expected_answer_mode,
      severity_if_wrong: testCase.severity_if_wrong,
    })
    .select('*')
    .single();

  if (error) {
    throw error;
  }

  return data;
}

export async function createVeraTestResult(input: {
  caseId: string;
  veraResponse: string;
  answerModeReturned: string | null;
  routeTaken: string | null;
  passed: boolean;
  failureCategory: VeraLabFailureCategory | null;
  likelyRootCause: VeraLabAssignedLayer;
  safetyScore: number;
  directnessScore: number;
  usefulnessScore: number;
  chartUsabilityScore: number;
  judgeNotes: string;
}) {
  const supabase = getClient();
  const { data, error } = await supabase
    .from('vera_test_results')
    .insert({
      case_id: input.caseId,
      vera_response: input.veraResponse,
      answer_mode_returned: input.answerModeReturned,
      route_taken: input.routeTaken,
      passed: input.passed,
      failure_category: input.failureCategory,
      likely_root_cause: input.likelyRootCause,
      safety_score: input.safetyScore,
      directness_score: input.directnessScore,
      usefulness_score: input.usefulnessScore,
      chart_usability_score: input.chartUsabilityScore,
      judge_notes: input.judgeNotes,
    })
    .select('*')
    .single();

  if (error) {
    throw error;
  }

  return data;
}

export async function createVeraFixTask(resultId: string, draft: VeraLabRepairTaskDraft) {
  const supabase = getClient();
  const { data, error } = await supabase
    .from('vera_fix_tasks')
    .insert({
      result_id: resultId,
      assigned_layer: draft.assigned_layer,
      patch_prompt: draft.patch_prompt,
      status: draft.status,
      patch_summary: null,
      priority_score: draft.priority_score,
      priority_band: draft.priority_band,
      priority_explanation: draft.priority_explanation,
      suggested_fix_strategy: draft.suggested_fix_strategy,
      regression_plan: draft.regression_plan,
      approval_required: draft.approval_required,
      improvement_summary: draft.improvement_summary,
      approved_by: null,
      approved_at: null,
      rejected_by: null,
      rejected_at: null,
    })
    .select('*')
    .single();

  if (error) {
    throw error;
  }

  return data;
}

export async function replaceRegressionResults(fixTaskId: string, results: Array<{ prompt_variant: string; passed: boolean; notes: string }>) {
  const supabase = getClient();

  const { error: deleteError } = await supabase
    .from('vera_regression_results')
    .delete()
    .eq('fix_task_id', fixTaskId);

  if (deleteError) {
    throw deleteError;
  }

  if (!results.length) {
    return [];
  }

  const { data, error } = await supabase
    .from('vera_regression_results')
    .insert(results.map((item) => ({
      fix_task_id: fixTaskId,
      prompt_variant: item.prompt_variant,
      passed: item.passed,
      notes: item.notes,
    })))
    .select('*');

  if (error) {
    throw error;
  }

  return data || [];
}

export async function listSimilarFailures(category: string, subtype: string, excludeResultId?: string) {
  const supabase = getClient();
  let query = supabase
    .from('vera_test_results')
    .select('id, failure_category, judge_notes, vera_test_cases!inner(category, subtype, prompt)')
    .eq('passed', false)
    .eq('vera_test_cases.category', category)
    .eq('vera_test_cases.subtype', subtype)
    .order('id', { ascending: false })
    .limit(5);

  if (excludeResultId) {
    query = query.neq('id', excludeResultId);
  }

  const { data, error } = await query;

  if (error) {
    throw error;
  }

  return (data || []).map((item: any) => ({
    id: item.id as string,
    failure_category: item.failure_category as string | null,
    prompt: item.vera_test_cases.prompt as string,
    judge_notes: item.judge_notes as string | null,
  }));
}

export async function getVeraFixTaskById(fixTaskId: string) {
  const supabase = getClient();
  const { data, error } = await supabase
    .from('vera_fix_tasks')
    .select(`
      *,
      vera_test_results (
        id,
        vera_response,
        answer_mode_returned,
        route_taken,
        passed,
        failure_category,
        likely_root_cause,
        safety_score,
        directness_score,
        usefulness_score,
        chart_usability_score,
        judge_notes,
        vera_test_cases (
          id,
          category,
          subtype,
          prompt,
          followup_prompt,
          expected_answer_mode,
          severity_if_wrong
        )
      )
    `)
    .eq('id', fixTaskId)
    .single();

  if (error) {
    throw error;
  }

  return data;
}

export async function getVeraLabRunDetail(runId: string): Promise<VeraLabRunDetail | null> {
  const supabase = getClient();

  const { data: run, error: runError } = await supabase
    .from('vera_test_runs')
    .select('*')
    .eq('id', runId)
    .maybeSingle();

  if (runError) {
    throw runError;
  }

  if (!run) {
    return null;
  }

  const { data: caseRows, error: caseError } = await supabase
    .from('vera_test_cases')
    .select('*')
    .eq('run_id', runId)
    .order('id', { ascending: true });

  if (caseError) {
    throw caseError;
  }

  const cases = caseRows || [];
  const caseIds = cases.map((item: any) => item.id as string);

  let resultRows: any[] = [];
  if (caseIds.length) {
    const { data, error } = await supabase
      .from('vera_test_results')
      .select('*')
      .in('case_id', caseIds)
      .order('id', { ascending: true });

    if (error) {
      throw error;
    }

    resultRows = data || [];
  }

  const resultByCaseId = Object.fromEntries(
    resultRows.map((item: any) => [item.case_id as string, item]),
  ) as Record<string, any>;

  const resultIds = resultRows.map((item: any) => item.id as string);
  let fixTaskRows: any[] = [];
  if (resultIds.length) {
    const { data, error } = await supabase
      .from('vera_fix_tasks')
      .select('*')
      .in('result_id', resultIds)
      .order('id', { ascending: true });

    if (error) {
      throw error;
    }

    fixTaskRows = data || [];
  }

  const fixTaskByResultId = Object.fromEntries(
    fixTaskRows.map((item: any) => [item.result_id as string, item]),
  ) as Record<string, any>;

  const fixTaskIds = fixTaskRows.map((item: any) => item.id as string);
  let regressionRows: any[] = [];
  if (fixTaskIds.length) {
    const { data, error } = await supabase
      .from('vera_regression_results')
      .select('*')
      .in('fix_task_id', fixTaskIds)
      .order('id', { ascending: true });

    if (error) {
      throw error;
    }

    regressionRows = data || [];
  }

  const regressionsByFixTaskId = regressionRows.reduce<Record<string, any[]>>((acc, item: any) => {
    const key = item.fix_task_id as string;
    if (!acc[key]) {
      acc[key] = [];
    }
    acc[key].push(item);
    return acc;
  }, {});

  return {
    run: {
      id: run.id as string,
      created_at: run.created_at as string,
      mode: run.mode as string,
      stage: run.stage as string,
      provider_profile_id: (run.provider_profile_id as string | null) || null,
      tester_version: run.tester_version as string,
      repair_version: run.repair_version as string,
      status: run.status as string,
    },
    items: cases.map((caseRow: any) => {
      const result = resultByCaseId[caseRow.id as string] || null;
      const repairTask = result ? fixTaskByResultId[result.id as string] || null : null;
      const regressionResults = repairTask ? regressionsByFixTaskId[repairTask.id as string] || [] : [];

      return {
        case: {
          id: caseRow.id as string,
          category: caseRow.category,
          subtype: caseRow.subtype,
          severity_if_wrong: caseRow.severity_if_wrong,
          prompt: caseRow.prompt,
          followup_prompt: caseRow.followup_prompt || null,
          expected_answer_mode: caseRow.expected_answer_mode || null,
        },
        result: result ? {
          id: result.id as string,
          vera_response: result.vera_response as string,
          answer_mode_returned: (result.answer_mode_returned as string | null) || null,
          route_taken: (result.route_taken as string | null) || null,
          passed: Boolean(result.passed),
          failure_category: (result.failure_category as VeraLabFailureCategory | null) || null,
          likely_root_cause: (result.likely_root_cause || 'routing') as VeraLabAssignedLayer,
          safety_score: Number(result.safety_score || 0),
          directness_score: Number(result.directness_score || 0),
          usefulness_score: Number(result.usefulness_score || 0),
          chart_usability_score: Number(result.chart_usability_score || 0),
          judge_notes: (result.judge_notes as string | null) || null,
        } : null,
        repair_task: repairTask ? {
          id: repairTask.id as string,
          assigned_layer: repairTask.assigned_layer as VeraLabAssignedLayer,
          patch_prompt: repairTask.patch_prompt as string,
          status: repairTask.status as VeraLabFixTaskStatus,
          patch_summary: (repairTask.patch_summary as string | null) || null,
          priority_score: Number(repairTask.priority_score || 0),
          priority_band: (repairTask.priority_band || 'low') as VeraLabPriorityBand,
          priority_explanation: (repairTask.priority_explanation as VeraLabPriorityExplanation | null) || null,
          suggested_fix_strategy: (repairTask.suggested_fix_strategy as VeraLabSuggestedFixStrategy | null) || null,
          regression_plan: (repairTask.regression_plan as string | null) || null,
          approval_required: repairTask.approval_required !== false,
          improvement_summary: (repairTask.improvement_summary as string | null) || null,
          approved_by: (repairTask.approved_by as string | null) || null,
          approved_at: (repairTask.approved_at as string | null) || null,
          rejected_by: (repairTask.rejected_by as string | null) || null,
          rejected_at: (repairTask.rejected_at as string | null) || null,
        } : null,
        regression_results: regressionResults.map((item: any) => ({
          id: item.id as string,
          prompt_variant: item.prompt_variant as string,
          passed: Boolean(item.passed),
          notes: (item.notes as string | null) || null,
        })),
      };
    }),
  };
}

export async function updateVeraFixTaskStatus(fixTaskId: string, status: VeraLabFixTaskStatus, patchSummary?: string | null) {
  const supabase = getClient();
  const { error } = await supabase
    .from('vera_fix_tasks')
    .update({
      status,
      ...(patchSummary !== undefined ? { patch_summary: patchSummary } : {}),
    })
    .eq('id', fixTaskId);

  if (error) {
    throw error;
  }
}

export function buildFixTaskReviewAuditUpdate(input: {
  status: 'approved' | 'rejected';
  actor: string;
  timestamp?: string;
}) {
  const timestamp = input.timestamp || new Date().toISOString();
  return input.status === 'approved'
    ? {
        status: input.status,
        approved_by: input.actor,
        approved_at: timestamp,
      }
    : {
        status: input.status,
        rejected_by: input.actor,
        rejected_at: timestamp,
      };
}

export async function reviewVeraFixTask(fixTaskId: string, input: {
  status: 'approved' | 'rejected';
  actor: string;
}) {
  const supabase = getClient();
  const updatePayload = buildFixTaskReviewAuditUpdate(input);

  const { data, error } = await supabase
    .from('vera_fix_tasks')
    .update(updatePayload)
    .eq('id', fixTaskId)
    .select('*')
    .single();

  if (error) {
    throw error;
  }

  return data;
}

export async function getVeraLabDashboardSummary(): Promise<VeraLabDashboardSummary> {
  const supabase = getClient();

  const [
    { data: recentRuns, error: recentRunsError },
    { data: recentFailedCases, error: recentFailedCasesError },
    { data: repeatedPatternsRows, error: repeatedPatternsError },
    { data: repairQueue, error: repairQueueError },
    { data: regressionResults, error: regressionResultsError },
    { data: priorityRows, error: priorityRowsError },
    { data: clusterRows, error: clusterRowsError },
  ] = await Promise.all([
    supabase
      .from('vera_test_runs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(8),
    supabase
      .from('vera_test_results')
      .select(`
        id,
        vera_response,
        failure_category,
        judge_notes,
        vera_test_cases!inner(
          id,
          run_id,
          category,
          subtype,
          prompt,
          severity_if_wrong
        )
      `)
      .eq('passed', false)
      .order('id', { ascending: false })
      .limit(12),
    supabase
      .from('vera_test_results')
      .select('failure_category, likely_root_cause')
      .eq('passed', false),
    supabase
      .from('vera_fix_tasks')
      .select('*')
      .order('priority_score', { ascending: false })
      .limit(12),
    supabase
      .from('vera_regression_results')
      .select('*')
      .order('id', { ascending: false })
      .limit(20),
    supabase
      .from('vera_fix_tasks')
      .select(`
        *,
        vera_test_results!inner(
          failure_category,
          likely_root_cause,
          vera_test_cases!inner(
            id,
            run_id,
            category,
            subtype,
            prompt,
            severity_if_wrong
          )
        )
      `)
      .order('priority_score', { ascending: false })
      .limit(12),
    supabase
      .from('vera_fix_tasks')
      .select(`
        id,
        assigned_layer,
        suggested_fix_strategy,
        vera_test_results!inner(
          id,
          failure_category,
          likely_root_cause,
          vera_test_cases!inner(
            id,
            run_id,
            category,
            subtype,
            prompt
          )
        )
      `)
      .order('id', { ascending: false })
      .limit(80),
  ]);

  if (recentRunsError || recentFailedCasesError || repeatedPatternsError || repairQueueError || regressionResultsError || priorityRowsError || clusterRowsError) {
    throw recentRunsError || recentFailedCasesError || repeatedPatternsError || repairQueueError || regressionResultsError || priorityRowsError || clusterRowsError;
  }

  const recentRunRows = recentRuns || [];
  const runIds = recentRunRows.map((item: any) => item.id as string);
  const caseCountsByRun: Record<string, { total_cases: number; passed_cases: number; failed_cases: number }> = {};

  if (runIds.length) {
    const { data: caseRows, error: caseRowsError } = await supabase
      .from('vera_test_cases')
      .select('id, run_id, vera_test_results!left(passed)')
      .in('run_id', runIds);

    if (caseRowsError) {
      throw caseRowsError;
    }

    for (const row of caseRows || []) {
      const runId = row.run_id as string;
      if (!caseCountsByRun[runId]) {
        caseCountsByRun[runId] = {
          total_cases: 0,
          passed_cases: 0,
          failed_cases: 0,
        };
      }

      caseCountsByRun[runId].total_cases += 1;
      const resultRow = Array.isArray((row as any).vera_test_results)
        ? (row as any).vera_test_results[0]
        : (row as any).vera_test_results;

      if (resultRow?.passed === true) {
        caseCountsByRun[runId].passed_cases += 1;
      } else if (resultRow?.passed === false) {
        caseCountsByRun[runId].failed_cases += 1;
      }
    }
  }

  const repeatedFailurePatterns = Object.entries(
    (repeatedPatternsRows || []).reduce<Record<string, { count: number; likely_root_cause: VeraLabAssignedLayer }>>((acc, row: any) => {
      const failureCategory = (row.failure_category || 'routing_failure') as string;
      const key = `${failureCategory}:${row.likely_root_cause || 'routing'}`;
      if (!acc[key]) {
        acc[key] = {
          count: 0,
          likely_root_cause: (row.likely_root_cause || 'routing') as VeraLabAssignedLayer,
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
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  const priorityFixRows = priorityRows || [];
  const topPriorities = priorityFixRows.map((row: any) => ({
    id: row.id as string,
    run_id: row.vera_test_results.vera_test_cases.run_id as string,
    case_id: row.vera_test_results.vera_test_cases.id as string,
    category: row.vera_test_results.vera_test_cases.category as string,
    subtype: row.vera_test_results.vera_test_cases.subtype as string,
    severity_if_wrong: row.vera_test_results.vera_test_cases.severity_if_wrong as VeraLabSeverity,
    priority_score: Number(row.priority_score || 0),
    priority_band: (row.priority_band || 'low') as VeraLabPriorityBand,
    priority_explanation: (row.priority_explanation as VeraLabPriorityExplanation | null) || null,
    assigned_layer: row.assigned_layer as VeraLabAssignedLayer,
    failure_category: (row.vera_test_results.failure_category as VeraLabFailureCategory | null) || null,
    improvement_summary: (row.improvement_summary as string | null) || null,
  }));

  const sharedFailureClusters = buildFailureClusters(
    (clusterRows || []).map((row: any) => ({
      run_id: row.vera_test_results.vera_test_cases.run_id as string,
      case_id: row.vera_test_results.vera_test_cases.id as string,
      result_id: row.vera_test_results.id as string,
      category: row.vera_test_results.vera_test_cases.category as string,
      subtype: row.vera_test_results.vera_test_cases.subtype as string,
      prompt: row.vera_test_results.vera_test_cases.prompt as string,
      likely_root_cause: (row.vera_test_results.likely_root_cause || row.assigned_layer || 'routing') as VeraLabAssignedLayer,
      assigned_layer: (row.assigned_layer || row.vera_test_results.likely_root_cause || 'routing') as VeraLabAssignedLayer,
      failure_category: (row.vera_test_results.failure_category as VeraLabFailureCategory | null) || null,
    })),
  ).slice(0, 8);

  return {
    recentRuns: recentRunRows.map((row: any) => ({
      id: row.id as string,
      created_at: row.created_at as string,
      mode: row.mode as string,
      stage: row.stage as string,
      status: row.status as string,
      tester_version: row.tester_version as string,
      repair_version: row.repair_version as string,
      total_cases: caseCountsByRun[row.id as string]?.total_cases || 0,
      passed_cases: caseCountsByRun[row.id as string]?.passed_cases || 0,
      failed_cases: caseCountsByRun[row.id as string]?.failed_cases || 0,
    })),
    recentFailedCases: (recentFailedCases || []).map((row: any) => ({
      id: row.id as string,
      case_id: row.vera_test_cases.id as string,
      run_id: row.vera_test_cases.run_id as string,
      category: row.vera_test_cases.category as string,
      subtype: row.vera_test_cases.subtype as string,
      prompt: row.vera_test_cases.prompt as string,
      vera_response: row.vera_response as string,
      failure_category: row.failure_category as string | null,
      severity_if_wrong: row.vera_test_cases.severity_if_wrong as string,
      judge_notes: row.judge_notes as string | null,
    })),
    repeatedFailurePatterns,
    repairQueue: (repairQueue || []).map((row: any) => ({
      id: row.id as string,
      result_id: row.result_id as string,
      assigned_layer: row.assigned_layer as VeraLabAssignedLayer,
      status: row.status as VeraLabFixTaskStatus,
      patch_prompt: row.patch_prompt as string,
      patch_summary: row.patch_summary as string | null,
      priority_score: Number(row.priority_score || 0),
      priority_band: (row.priority_band || 'low') as VeraLabPriorityBand,
      priority_explanation: (row.priority_explanation as VeraLabPriorityExplanation | null) || null,
      suggested_fix_strategy: (row.suggested_fix_strategy as VeraLabSuggestedFixStrategy | null) || null,
      regression_plan: (row.regression_plan as string | null) || null,
      approval_required: row.approval_required !== false,
      improvement_summary: (row.improvement_summary as string | null) || null,
      approved_by: (row.approved_by as string | null) || null,
      approved_at: (row.approved_at as string | null) || null,
      rejected_by: (row.rejected_by as string | null) || null,
      rejected_at: (row.rejected_at as string | null) || null,
    })),
    regressionResults: (regressionResults || []).map((row: any) => ({
      id: row.id as string,
      fix_task_id: row.fix_task_id as string,
      prompt_variant: row.prompt_variant as string,
      passed: Boolean(row.passed),
      notes: row.notes as string | null,
    })),
    topPriorities,
    sharedFailureClusters,
  };
}
