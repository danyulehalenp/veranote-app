import { POST } from '@/app/api/assistant/respond/route';
import { buildRegressionVariants, buildRepairTaskDraft } from '@/lib/veranote/lab/failure-router';
import { judgeVeraProviderQuestionCase } from '@/lib/veranote/lab/judge';
import { buildVeraLabRunReport } from '@/lib/veranote/lab/reporting';
import { selectVeraProviderQuestionCases } from '@/lib/veranote/lab/question-bank';
import {
  createVeraFixTask,
  createVeraTestCase,
  createVeraTestResult,
  createVeraTestRun,
  listSimilarFailures,
  replaceRegressionResults,
  updateVeraFixTaskStatus,
  updateVeraTestRunStatus,
} from '@/lib/db/vera-lab-repo';
import type {
  VeraLabInterrogationTurnResult,
  VeraLabPriorityExplanation,
  VeraLabRunOptions,
  VeraProviderQuestionCase,
} from '@/lib/veranote/lab/types';

type ThreadTurn = {
  role: 'provider' | 'assistant';
  content: string;
};

function buildRequest(caseDefinition: VeraProviderQuestionCase, prompt: string, stage: string, mode: string, recentMessages: ThreadTurn[]) {
  return new Request('http://localhost/api/assistant/respond?eval=true', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      stage,
      mode,
      message: prompt,
      context: {
        providerAddressingName: 'Daniel Hale',
        noteType: 'Inpatient Psych Progress Note',
        providerProfileId: caseDefinition.provider_profile_id || undefined,
      },
      recentMessages,
    }),
  });
}

function flattenPayload(payload: any) {
  return [payload.message, ...(payload.suggestions || [])].filter(Boolean).join('\n');
}

async function interrogateSingleCase(caseDefinition: VeraProviderQuestionCase, defaults: VeraLabRunOptions) {
  const stage = caseDefinition.stage || defaults.stage;
  const mode = caseDefinition.mode || defaults.mode;
  const recentMessages: ThreadTurn[] = [];
  const turns: VeraLabInterrogationTurnResult[] = [];

  const scriptedTurns = [
    { label: 'initial' as const, prompt: caseDefinition.prompt },
    ...(caseDefinition.followup_prompt ? [{ label: 'correction' as const, prompt: caseDefinition.followup_prompt }] : []),
    ...(caseDefinition.turns || []),
  ];

  for (const turn of scriptedTurns) {
    const response = await POST(buildRequest(caseDefinition, turn.prompt, stage, mode, recentMessages));
    const payload = await response.json();
    const flattened = flattenPayload(payload);

    turns.push({
      label: turn.label,
      prompt: turn.prompt,
      response: flattened,
      answer_mode_returned: payload.answerMode || payload.eval?.answerMode || null,
      route_taken: payload.eval?.routePriority || null,
      failures: [],
    });

    recentMessages.push({ role: 'provider', content: turn.prompt });
    recentMessages.push({ role: 'assistant', content: payload.message || flattened });
  }

  return judgeVeraProviderQuestionCase(caseDefinition, turns);
}

async function runRegressionGate(
  fixTaskId: string,
  caseDefinition: VeraProviderQuestionCase,
  defaults: VeraLabRunOptions,
  previousPassingPrompts: string[],
) {
  const repo = await import('@/lib/db/vera-lab-repo');
  const currentTask = await repo.getVeraFixTaskById(fixTaskId);
  const variants = buildRegressionVariants(caseDefinition, previousPassingPrompts);
  const stage = caseDefinition.stage || defaults.stage;
  const mode = caseDefinition.mode || defaults.mode;
  const results = [];

  for (const variant of variants) {
    const response = await POST(buildRequest(caseDefinition, variant.prompt_variant, stage, mode, []));
    const payload = await response.json();
    const output = flattenPayload(payload);
    const passed = !caseDefinition.must_not_include.some((item) => output.toLowerCase().includes(item.toLowerCase()))
      && caseDefinition.must_include.some((item) => output.toLowerCase().includes(item.toLowerCase()));

    results.push({
      prompt_variant: variant.prompt_variant,
      passed,
      notes: `${variant.notes}. route=${payload.eval?.routePriority || 'none'} answerMode=${payload.answerMode || payload.eval?.answerMode || 'none'}`,
    });
  }

  await replaceRegressionResults(fixTaskId, results);
  const allPassed = results.every((item) => item.passed);
  const nextStatus = allPassed
    ? currentTask.status
    : currentTask.status === 'approved' || currentTask.status === 'applied'
      ? 'regressed'
      : currentTask.status;
  await updateVeraFixTaskStatus(fixTaskId, nextStatus);
  return results;
}

export async function runVeraLabBatch(options: VeraLabRunOptions) {
  const run = await createVeraTestRun(options);
  const cases = selectVeraProviderQuestionCases(options.pack_ids, options.categories)
    .slice(0, options.cases_limit || Number.MAX_SAFE_INTEGER);
  const passingPromptsByCategory: Record<string, string[]> = {};
  const reportRows: Array<{
    case_id: string;
    category: string;
    subtype: string;
    severity_if_wrong: string;
    judged: Awaited<ReturnType<typeof interrogateSingleCase>>;
    fixTask: null | {
      priority_score: number;
      priority_band: 'low' | 'medium' | 'high' | 'urgent';
      priority_explanation: VeraLabPriorityExplanation;
      improvement_summary: string;
    };
  }> = [];

  try {
    for (const caseDefinition of cases) {
      const persistedCase = await createVeraTestCase(run.id, caseDefinition);
      const judged = await interrogateSingleCase(caseDefinition, options);

      const result = await createVeraTestResult({
        caseId: persistedCase.id,
        veraResponse: judged.vera_response,
        answerModeReturned: judged.answer_mode_returned,
        routeTaken: judged.route_taken,
        passed: judged.passed,
        failureCategory: judged.failure_category,
        likelyRootCause: judged.likely_root_cause,
        safetyScore: judged.safety_score,
        directnessScore: judged.directness_score,
        usefulnessScore: judged.usefulness_score,
        chartUsabilityScore: judged.chart_usability_score,
        judgeNotes: judged.judge_notes,
      });
      let reportFixTask: null | {
        priority_score: number;
        priority_band: 'low' | 'medium' | 'high' | 'urgent';
        priority_explanation: VeraLabPriorityExplanation;
        improvement_summary: string;
      } = null;

      if (judged.passed) {
        if (!passingPromptsByCategory[caseDefinition.category]) {
          passingPromptsByCategory[caseDefinition.category] = [];
        }
        passingPromptsByCategory[caseDefinition.category].push(caseDefinition.prompt);
      } else {
        const similarFailures = await listSimilarFailures(caseDefinition.category, caseDefinition.subtype, result.id);
        const fixTaskDraft = buildRepairTaskDraft(caseDefinition, judged, similarFailures, []);
        reportFixTask = {
          priority_score: fixTaskDraft.priority_score,
          priority_band: fixTaskDraft.priority_band,
          priority_explanation: fixTaskDraft.priority_explanation,
          improvement_summary: fixTaskDraft.improvement_summary,
        };
        const fixTask = await createVeraFixTask(result.id, fixTaskDraft);
        await runRegressionGate(
          fixTask.id,
          caseDefinition,
          options,
          passingPromptsByCategory[caseDefinition.category] || [],
        );
      }

      reportRows.push({
        case_id: persistedCase.id,
        category: caseDefinition.category,
        subtype: caseDefinition.subtype,
        severity_if_wrong: caseDefinition.severity_if_wrong,
        judged,
        fixTask: reportFixTask,
      });
    }

    await updateVeraTestRunStatus(run.id, 'completed');
  } catch (error) {
    await updateVeraTestRunStatus(run.id, 'failed');
    throw error;
  }

  const fixTaskPriorityCounts = reportRows.reduce<Record<'urgent' | 'high' | 'medium' | 'low', number>>((acc, row) => {
    if (!row.fixTask) {
      return acc;
    }

    acc[row.fixTask.priority_band] += 1;
    return acc;
  }, {
    urgent: 0,
    high: 0,
    medium: 0,
    low: 0,
  });

  return {
    run,
    casesExecuted: cases.length,
    report: buildVeraLabRunReport(reportRows),
    fixTaskPriorityCounts,
  };
}

export async function rerunVeraLabRegressionGate(fixTaskId: string, options: VeraLabRunOptions) {
  const repo = await import('@/lib/db/vera-lab-repo');
  const task = await repo.getVeraFixTaskById(fixTaskId);
  const caseRow = task.vera_test_results.vera_test_cases;
  const caseDefinition = selectVeraProviderQuestionCases().find((item) => item.prompt === caseRow.prompt) || {
    id: caseRow.id,
    category: caseRow.category,
    subtype: caseRow.subtype,
    prompt: caseRow.prompt,
    followup_prompt: caseRow.followup_prompt,
    expected_answer_mode: caseRow.expected_answer_mode,
    must_include: [],
    must_not_include: [],
    severity_if_wrong: caseRow.severity_if_wrong,
  } as VeraProviderQuestionCase;

  return runRegressionGate(fixTaskId, caseDefinition, options, []);
}
