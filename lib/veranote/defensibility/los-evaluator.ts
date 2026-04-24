import type { LosAssessment } from '@/lib/veranote/defensibility/defensibility-types';

function hasMatch(text: string, patterns: RegExp[]) {
  return patterns.some((pattern) => pattern.test(text));
}

export function evaluateLOS(sourceText: string): LosAssessment {
  const normalized = sourceText.toLowerCase();
  const reasonsForContinuedStay: string[] = [];
  const barriersToDischarge: string[] = [];
  const stabilityIndicators: string[] = [];
  const missingDischargeCriteria: string[] = [];

  if (hasMatch(normalized, [/\b(suicid|homicid|unable to contract for safety|unsafe if discharged)\b/])) {
    reasonsForContinuedStay.push('Ongoing safety risk remains documented.');
  }
  if (hasMatch(normalized, [/\b(psychosis|responding to internal stimuli|internally preoccupied|severely disorganized)\b/])) {
    reasonsForContinuedStay.push('Severe thought-content or perception disturbance remains documented.');
  }
  if (hasMatch(normalized, [/\b(not eating|poor hygiene|cannot care for self|unable to state address|wandering)\b/])) {
    reasonsForContinuedStay.push('Functional impairment or grave-disability concerns remain documented.');
  }

  if (hasMatch(normalized, [/\b(no safe discharge plan|cannot maintain safety at home|no shelter|unsafe environment)\b/])) {
    barriersToDischarge.push('Safe discharge environment is not clearly established.');
  }
  if (hasMatch(normalized, [/\b(refusing meds|medication nonadherence|off meds)\b/])) {
    barriersToDischarge.push('Medication adherence or treatment engagement remains unstable.');
  }

  if (hasMatch(normalized, [/\b(denies si|denies hi|calm|cooperative|improved sleep|eating better)\b/])) {
    stabilityIndicators.push('Some stabilization language is present, but it should remain source-bound.');
  }

  if (!hasMatch(normalized, [/\b(discharge|disposition|safe discharge|outpatient follow-up|follow up)\b/])) {
    missingDischargeCriteria.push('Discharge criteria or disposition readiness are not clearly documented.');
  }
  if (!stabilityIndicators.length) {
    missingDischargeCriteria.push('Stability indicators are not clearly documented yet.');
  }

  return {
    reasonsForContinuedStay,
    barriersToDischarge,
    stabilityIndicators,
    missingDischargeCriteria,
  };
}
