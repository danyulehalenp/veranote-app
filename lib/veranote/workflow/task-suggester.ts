import { detectContradictions } from '@/lib/veranote/assistant-contradiction-detector';
import { parseMSEFromText } from '@/lib/veranote/assistant-mse-parser';
import { detectRiskSignals } from '@/lib/veranote/assistant-risk-detector';
import type { DischargeStatus, LongitudinalContextSummary, TriageSuggestion, WorkflowTask } from '@/lib/veranote/workflow/workflow-types';

type WorkflowTaskContext = {
  sourceText: string;
  triage: TriageSuggestion;
  discharge: DischargeStatus;
  longitudinal?: LongitudinalContextSummary;
};

function pushTask(tasks: WorkflowTask[], task: string, reason: string, priority: WorkflowTask['priority']) {
  if (!tasks.some((item) => item.task === task)) {
    tasks.push({ task, reason, priority });
  }
}

export function suggestTasks(context: WorkflowTaskContext): WorkflowTask[] {
  const tasks: WorkflowTask[] = [];
  const mse = parseMSEFromText(context.sourceText);
  const risk = detectRiskSignals(context.sourceText);
  const contradictions = detectContradictions(context.sourceText);
  const normalized = context.sourceText.toLowerCase();

  if (mse.missingDomains.length >= 4) {
    pushTask(
      tasks,
      'Complete missing MSE documentation',
      `Core domains still appear missing: ${mse.missingDomains.slice(0, 3).join(', ')}.`,
      'high',
    );
  }

  if (!risk.suicide.length && /\b(suicid|self-harm|overdose|safety)\b/i.test(normalized)) {
    pushTask(
      tasks,
      'Clarify current suicide-risk language',
      'Risk wording is present, but the current source does not cleanly separate denial, ideation, plan, and intent.',
      'high',
    );
  }

  if (contradictions.contradictions.length) {
    pushTask(
      tasks,
      'Reconcile or clearly document source contradictions',
      contradictions.contradictions[0].detail,
      'high',
    );
  }

  if (context.discharge.barriers.some((item) => /discharge environment|follow-up|support/i.test(item)) || /\b(no safe discharge plan|no shelter|family unavailable)\b/i.test(normalized)) {
    pushTask(
      tasks,
      'Clarify discharge supports and disposition plan',
      'Discharge readiness appears limited by support or environment gaps.',
      'medium',
    );
  }

  if (/\b(off meds|nonadherence|missed doses|refusing meds)\b/i.test(normalized)) {
    pushTask(
      tasks,
      'Confirm medication adherence and current regimen',
      'Treatment-engagement instability is documented and may affect both formulation and disposition planning.',
      'medium',
    );
  }

  if (context.longitudinal?.responseToTreatment.length || context.longitudinal?.riskTrends.length) {
    pushTask(
      tasks,
      'Review prior notes for trend confirmation',
      [...context.longitudinal.riskTrends, ...context.longitudinal.responseToTreatment].slice(0, 2).join(' '),
      context.triage.level === 'emergency' ? 'high' : 'low',
    );
  }

  if (!tasks.length) {
    pushTask(
      tasks,
      'Confirm whether any additional workflow clarification is needed',
      'The current source supports only a limited task list.',
      'low',
    );
  }

  return tasks.slice(0, 5);
}
