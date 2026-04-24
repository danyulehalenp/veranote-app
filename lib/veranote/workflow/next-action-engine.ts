import { detectContradictions } from '@/lib/veranote/assistant-contradiction-detector';
import { parseMSEFromText } from '@/lib/veranote/assistant-mse-parser';
import { detectRiskSignals } from '@/lib/veranote/assistant-risk-detector';
import type { KnowledgeBundle } from '@/lib/veranote/knowledge/types';
import type { LongitudinalContextSummary, NextAction } from '@/lib/veranote/workflow/workflow-types';

function pushAction(actions: NextAction[], suggestion: string, rationale: string, confidence: NextAction['confidence']) {
  if (!actions.some((item) => item.suggestion === suggestion)) {
    actions.push({ suggestion, rationale, confidence });
  }
}

export function suggestNextActions(sourceText: string, knowledgeBundle: KnowledgeBundle, longitudinal?: LongitudinalContextSummary): NextAction[] {
  const actions: NextAction[] = [];
  const mse = parseMSEFromText(sourceText);
  const risk = detectRiskSignals(sourceText);
  const contradictions = detectContradictions(sourceText);
  const normalized = sourceText.toLowerCase();

  if (mse.missingDomains.length >= 4) {
    pushAction(
      actions,
      'Consider completing missing MSE domains before relying on the current formulation.',
      `Several core MSE domains remain undocumented: ${mse.missingDomains.slice(0, 3).join(', ')}.`,
      'moderate',
    );
  }

  if (!risk.suicide.length && /\b(suicid|self-harm|overdose|unsafe|safety)\b/i.test(normalized)) {
    pushAction(
      actions,
      'Consider clarifying current suicide and self-harm risk directly in the note.',
      'Risk-related language is present, but the current source does not cleanly establish the present risk profile.',
      'high',
    );
  }

  if (knowledgeBundle.emergingDrugConcepts.length === 0 && /\b(k2|spice|mojo|gas station|unknown drug|tianeptine|kratom|7-oh)\b/i.test(normalized)) {
    pushAction(
      actions,
      'Consider clarifying the substance exposure and any available toxicology limitations.',
      'Substance language is present but remains incomplete or alias-heavy.',
      'moderate',
    );
  }

  if (knowledgeBundle.diagnosisConcepts.length === 0 && /\b(diagnos|bipolar|psychosis|substance-induced|ptsd|adhd|depression)\b/i.test(normalized)) {
    pushAction(
      actions,
      'Consider keeping the differential open until the supporting features are clearer.',
      'Diagnostic language appears in the source, but structured support is limited in this pass.',
      'moderate',
    );
  }

  if (contradictions.contradictions.length) {
    pushAction(
      actions,
      'Consider flagging the contradiction explicitly rather than smoothing it over in the note.',
      contradictions.contradictions[0].detail,
      contradictions.severityLevel === 'high' ? 'high' : 'moderate',
    );
  }

  if (longitudinal?.riskTrends.length || longitudinal?.recurringIssues.length) {
    pushAction(
      actions,
      'Consider checking whether the current note should reference relevant prior trend patterns.',
      [...longitudinal.riskTrends, ...longitudinal.recurringIssues].slice(0, 2).join(' '),
      'low',
    );
  }

  if (!actions.length) {
    pushAction(
      actions,
      'May be appropriate to keep the next step source-bound and minimal until more detail is documented.',
      'The current source does not clearly support a more specific workflow suggestion.',
      'low',
    );
  }

  return actions.slice(0, 5);
}
