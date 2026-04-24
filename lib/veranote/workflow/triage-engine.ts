import { detectContradictions } from '@/lib/veranote/assistant-contradiction-detector';
import { detectRiskSignals } from '@/lib/veranote/assistant-risk-detector';
import { evaluateMedicalNecessity } from '@/lib/veranote/defensibility/medical-necessity-engine';
import type { TriageSuggestion } from '@/lib/veranote/workflow/workflow-types';

export function suggestTriage(sourceText: string): TriageSuggestion {
  const risk = detectRiskSignals(sourceText);
  const contradictions = detectContradictions(sourceText);
  const necessity = evaluateMedicalNecessity(sourceText);

  const severeRisk = risk.suicide.some((signal) => signal.subtype === 'plan' || signal.subtype === 'intent' || signal.subtype === 'active_ideation')
    || /\b(unable to contract for safety|unsafe if discharged)\b/i.test(sourceText);
  const graveDisability = risk.graveDisability.length > 0
    || /\b(cannot care for self|not eating|poor hygiene|wandering|unable to state address)\b/i.test(sourceText);
  const moderateInstability = risk.suicide.some((signal) => signal.subtype === 'passive_ideation')
    || /\b(psychosis|responding to internal stimuli|internally preoccupied|agitated|manic|returned to ed|failed outpatient)\b/i.test(sourceText);

  if (contradictions.contradictions.length && !severeRisk && !graveDisability) {
    return {
      level: 'unclear',
      reasoning: [
        'Source contradictions reduce confidence in triage suggestions.',
        'It may be appropriate to clarify the conflicting risk or MSE details before making a stronger triage recommendation.',
      ],
      confidence: 'low',
    };
  }

  if (severeRisk || graveDisability) {
    return {
      level: 'emergency',
      reasoning: [
        'Documented high-acuity safety or self-care concerns may support emergency-level evaluation.',
        ...necessity.signals.flatMap((signal) => signal.evidence).slice(0, 2),
      ],
      confidence: severeRisk ? 'high' : 'moderate',
    };
  }

  if (moderateInstability) {
    return {
      level: 'urgent',
      reasoning: [
        'Documented instability may warrant urgent reassessment or closer follow-up.',
        ...(risk.suicide[0] ? [`Risk nuance: ${risk.suicide[0].documentationCaution}`] : []),
      ],
      confidence: 'moderate',
    };
  }

  if (!sourceText.trim() || necessity.missingElements.length >= 3) {
    return {
      level: 'unclear',
      reasoning: [
        'Available documentation is too thin to support a confident triage suggestion.',
        'It may be appropriate to clarify current risk, functional status, and immediate supports first.',
      ],
      confidence: 'low',
    };
  }

  return {
    level: 'routine',
    reasoning: [
      'No clear high-acuity signals were detected in the available source.',
      'This remains a conservative workflow suggestion rather than a definitive triage decision.',
    ],
    confidence: 'moderate',
  };
}
