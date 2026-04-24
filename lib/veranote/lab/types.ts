import type { AssistantMode, AssistantStage } from '@/types/assistant';

export type VeraLabCategory =
  | 'medication_basics'
  | 'documentation_wording'
  | 'mse_completion_limits'
  | 'risk_contradiction'
  | 'substance_unknown_ingestion'
  | 'practical_utility'
  | 'discharge_planning_realistic'
  | 'capacity_and_consent'
  | 'collateral_vs_patient_conflict'
  | 'malingering_or_inconsistency'
  | 'legal_hold_language'
  | 'substance_intoxication_vs_withdrawal'
  | 'medical_vs_psych_overlap'
  | 'vague_or_fragmented_source'
  | 'provider_time_pressure'
  | 'ambiguous_followup_prompts'
  | 'consult_liaison_medical_comorbidity'
  | 'violence_homicide_risk_nuance'
  | 'eating_disorder_medical_instability'
  | 'involuntary_medication_refusal'
  | 'discharge_ama_elopement_risk'
  | 'personality_disorder_language_caution'
  | 'acute_inpatient_hpi_generation'
  | 'progress_note_refinement'
  | 'discharge_summary_generation'
  | 'messy_risk_wording'
  | 'messy_hpi_generation'
  | 'messy_progress_note_cleanup'
  | 'messy_mse_completion'
  | 'messy_discharge_wording'
  | 'messy_medication_plan_wording'
  | 'messy_substance_vs_psych'
  | 'messy_collateral_integration'
  | 'messy_medical_psych_overlap'
  | 'messy_direct_reference_question';

export type VeraLabSeverity = 'low' | 'medium' | 'high' | 'critical';

export type VeraLabFailureCategory =
  | 'routing_failure'
  | 'answer_mode_failure'
  | 'knowledge_failure'
  | 'wording_failure'
  | 'ui_workflow_issue'
  | 'fallback_generic_issue';

export type VeraLabAssignedLayer =
  | 'routing'
  | 'answer-mode'
  | 'knowledge-layer'
  | 'wording'
  | 'ui-workflow';

export type VeraLabPriorityBand = 'low' | 'medium' | 'high' | 'urgent';

export type VeraLabFixTaskStatus =
  | 'proposed'
  | 'approved'
  | 'applied'
  | 'regressed'
  | 'rejected';

export type VeraLabSuggestedFixStrategy = {
  layer: VeraLabAssignedLayer;
  why_this_layer: string;
  recommended_change: string;
  do_not_change: string;
  validation_approach: string;
};

export type VeraLabPriorityExplanation = {
  total_score: number;
  band: VeraLabPriorityBand;
  factors: {
    severity: number;
    frequency: number;
    regression_risk: number;
    layer_weight: number;
    failure_category: number;
  };
  rationale: string[];
};

export type VeraLabImprovementPlan = {
  summary: string;
  priority_score: number;
  priority_band: VeraLabPriorityBand;
  priority_explanation: VeraLabPriorityExplanation;
  assigned_layer: VeraLabAssignedLayer;
  suggested_fix_strategy: VeraLabSuggestedFixStrategy;
  proposed_patch_prompt: string;
  regression_plan: string;
  approval_required: true;
};

export type VeraLabTurnLabel = 'initial' | 'correction' | 'pressure';

export type VeraProviderQuestionTurn = {
  label: VeraLabTurnLabel;
  prompt: string;
  expected_answer_mode?: string | null;
  expected_route?: string | null;
  must_include?: string[];
  must_not_include?: string[];
};

export type VeraProviderQuestionCase = {
  id: string;
  category: VeraLabCategory;
  subtype: string;
  prompt: string;
  followup_prompt?: string | null;
  pressure_prompt?: string | null;
  expected_answer_mode: string | null;
  must_include: string[];
  must_not_include: string[];
  severity_if_wrong: VeraLabSeverity;
  stage?: AssistantStage;
  mode?: AssistantMode;
  expected_route?: string | null;
  provider_profile_id?: string | null;
  turns?: VeraProviderQuestionTurn[];
};

export type VeraLabPackDefinition = {
  id: string;
  label: string;
  categories: VeraLabCategory[];
  cases: VeraProviderQuestionCase[];
};

export type VeraLabRunOptions = {
  mode: AssistantMode;
  stage: AssistantStage;
  provider_profile_id?: string | null;
  tester_version: string;
  repair_version: string;
  pack_ids?: string[];
  categories?: VeraLabCategory[];
  cases_limit?: number;
};

export type VeraLabRepeatedRunOptions = VeraLabRunOptions & {
  cycles?: number;
  casesPerCycle?: number;
  stopOnCriticalFailure?: boolean;
};

export type VeraLabInterrogationTurnResult = {
  label: VeraLabTurnLabel;
  prompt: string;
  response: string;
  answer_mode_returned: string | null;
  route_taken: string | null;
  failures: string[];
};

export type VeraLabJudgeScores = {
  safety_score: number;
  directness_score: number;
  usefulness_score: number;
  chart_usability_score: number;
};

export type VeraLabJudgedCaseResult = VeraLabJudgeScores & {
  passed: boolean;
  failure_category: VeraLabFailureCategory | null;
  judge_notes: string;
  likely_root_cause: VeraLabAssignedLayer;
  fallback_detected: boolean;
  cross_domain_drift_detected: boolean;
  answer_mode_returned: string | null;
  route_taken: string | null;
  vera_response: string;
  turns: VeraLabInterrogationTurnResult[];
};

export type VeraLabRepairTaskDraft = {
  assigned_layer: VeraLabAssignedLayer;
  patch_prompt: string;
  failure_category: VeraLabFailureCategory;
  expected_answer_shape: string;
  similar_failures: string[];
  priority_score: number;
  priority_band: VeraLabPriorityBand;
  priority_explanation: VeraLabPriorityExplanation;
  suggested_fix_strategy: VeraLabSuggestedFixStrategy;
  regression_plan: string;
  approval_required: true;
  improvement_summary: string;
  status: VeraLabFixTaskStatus;
};

export type VeraLabFailureCluster = {
  cluster_key: string;
  likely_root_cause: VeraLabAssignedLayer;
  assigned_layer: VeraLabAssignedLayer;
  failure_category: VeraLabFailureCategory | null;
  case_ids: string[];
  result_ids: string[];
  count: number;
  representative_prompt: string;
  recommended_shared_fix: string;
  representative_run_id?: string | null;
  representative_case_id?: string | null;
  search_query?: string | null;
};

export type VeraLabRegressionVariant = {
  prompt_variant: string;
  notes: string;
};

export type VeraLabDashboardSummary = {
  recentRuns: Array<{
    id: string;
    created_at: string;
    mode: string;
    stage: string;
    status: string;
    tester_version: string;
    repair_version: string;
    total_cases: number;
    passed_cases: number;
    failed_cases: number;
  }>;
  recentFailedCases: Array<{
    id: string;
    case_id: string;
    run_id: string;
    category: string;
    subtype: string;
    prompt: string;
    vera_response: string;
    failure_category: string | null;
    severity_if_wrong: string;
    judge_notes: string | null;
  }>;
  repeatedFailurePatterns: Array<{
    failure_category: string;
    count: number;
    likely_root_cause: VeraLabAssignedLayer;
  }>;
  repairQueue: Array<{
    id: string;
    result_id: string;
    assigned_layer: VeraLabAssignedLayer;
    status: VeraLabFixTaskStatus;
    patch_prompt: string;
    patch_summary: string | null;
    priority_score: number;
    priority_band: VeraLabPriorityBand;
    priority_explanation: VeraLabPriorityExplanation | null;
    suggested_fix_strategy: VeraLabSuggestedFixStrategy | null;
    regression_plan: string | null;
    approval_required: boolean;
    improvement_summary: string | null;
    approved_by: string | null;
    approved_at: string | null;
    rejected_by: string | null;
    rejected_at: string | null;
  }>;
  regressionResults: Array<{
    id: string;
    fix_task_id: string;
    prompt_variant: string;
    passed: boolean;
    notes: string | null;
  }>;
  topPriorities: Array<{
    id: string;
    run_id: string;
    case_id: string;
    category: string;
    subtype: string;
    severity_if_wrong: VeraLabSeverity;
    priority_score: number;
    priority_band: VeraLabPriorityBand;
    priority_explanation: VeraLabPriorityExplanation | null;
    assigned_layer: VeraLabAssignedLayer;
    failure_category: VeraLabFailureCategory | null;
    improvement_summary: string | null;
  }>;
  sharedFailureClusters: VeraLabFailureCluster[];
};

export type VeraLabRunReport = {
  runId: string;
  passFailByCategory: Record<string, { passed: number; failed: number }>;
  repeatedFailurePatterns: Array<{
    failure_category: string;
    count: number;
    likely_root_cause: VeraLabAssignedLayer;
  }>;
  topPriorities: Array<{
    case_id: string;
    category: string;
    subtype: string;
    severity_if_wrong: VeraLabSeverity;
    failure_category: VeraLabFailureCategory | null;
    likely_root_cause: VeraLabAssignedLayer;
    priority_score: number;
    priority_band: VeraLabPriorityBand;
    priority_explanation: VeraLabPriorityExplanation | null;
    improvement_summary: string;
  }>;
  sharedFailureClusters: VeraLabFailureCluster[];
  worstMisses: Array<{
    case_id: string;
    category: string;
    subtype: string;
    severity_if_wrong: VeraLabSeverity;
    failure_category: VeraLabFailureCategory | null;
    likely_root_cause: VeraLabAssignedLayer;
    judge_notes: string;
  }>;
};

export type VeraLabRepeatedRunSummary = {
  cyclesRequested: number;
  cyclesCompleted: number;
  stoppedEarly: boolean;
  stopReason: string | null;
  totalCases: number;
  totalPassed: number;
  totalFailed: number;
  passRate: number;
  urgentFixTaskCount: number;
  highPriorityFixTaskCount: number;
  repeatedFailurePatterns: Array<{
    failure_category: string;
    count: number;
    likely_root_cause: VeraLabAssignedLayer;
  }>;
  runIds: string[];
};

export type VeraLabRunDetailItem = {
  case: {
    id: string;
    category: VeraLabCategory;
    subtype: string;
    severity_if_wrong: VeraLabSeverity;
    prompt: string;
    followup_prompt: string | null;
    expected_answer_mode: string | null;
  };
  result: null | {
    id: string;
    vera_response: string;
    answer_mode_returned: string | null;
    route_taken: string | null;
    passed: boolean;
    failure_category: VeraLabFailureCategory | null;
    likely_root_cause: VeraLabAssignedLayer;
    safety_score: number;
    directness_score: number;
    usefulness_score: number;
    chart_usability_score: number;
    judge_notes: string | null;
  };
  repair_task: null | {
    id: string;
    assigned_layer: VeraLabAssignedLayer;
    patch_prompt: string;
    status: VeraLabFixTaskStatus;
    patch_summary: string | null;
    priority_score: number;
    priority_band: VeraLabPriorityBand;
    priority_explanation: VeraLabPriorityExplanation | null;
    suggested_fix_strategy: VeraLabSuggestedFixStrategy | null;
    regression_plan: string | null;
    approval_required: boolean;
    improvement_summary: string | null;
    approved_by: string | null;
    approved_at: string | null;
    rejected_by: string | null;
    rejected_at: string | null;
  };
  regression_results: Array<{
    id: string;
    prompt_variant: string;
    passed: boolean;
    notes: string | null;
  }>;
};

export type VeraLabRunDetail = {
  run: {
    id: string;
    created_at: string;
    mode: string;
    stage: string;
    provider_profile_id: string | null;
    tester_version: string;
    repair_version: string;
    status: string;
  };
  items: VeraLabRunDetailItem[];
};

export type VeraLabRunDetailSort =
  | 'stored'
  | 'failure-first'
  | 'severity'
  | 'category';
