import { evaluateLOS } from '@/lib/veranote/defensibility/los-evaluator';
import type { DischargeStatus } from '@/lib/veranote/workflow/workflow-types';

function hasMatch(text: string, patterns: RegExp[]) {
  return patterns.some((pattern) => pattern.test(text));
}

export function evaluateDischarge(sourceText: string): DischargeStatus {
  const los = evaluateLOS(sourceText);
  const normalized = sourceText.toLowerCase();
  const supportingFactors = [...los.stabilityIndicators];
  const barriers = [...los.reasonsForContinuedStay, ...los.barriersToDischarge];

  if (hasMatch(normalized, [/\b(denies si|denies hi|calm|cooperative|improved sleep|eating better|future oriented)\b/])) {
    supportingFactors.push('Some stabilization language is documented in the source.');
  }
  if (hasMatch(normalized, [/\b(follow up arranged|outpatient follow-up|safety plan reviewed|family available|safe discharge plan)\b/])) {
    supportingFactors.push('Follow-up or discharge-support language appears to be documented.');
  }
  if (hasMatch(normalized, [/\b(refusing meds|medication nonadherence|off meds|psychosis|unable to contract for safety|unsafe if discharged)\b/])) {
    barriers.push('Persistent high-acuity or treatment-engagement barriers remain documented.');
  }

  if (barriers.some((item) => /safety risk|perception disturbance|grave-disability|high-acuity|unsafe/i.test(item))) {
    return {
      readiness: 'not_ready',
      supportingFactors,
      barriers,
    };
  }

  if (supportingFactors.length >= 2 && barriers.length === 0) {
    return {
      readiness: 'ready',
      supportingFactors,
      barriers,
    };
  }

  if (supportingFactors.length && barriers.length) {
    return {
      readiness: 'possibly_ready',
      supportingFactors,
      barriers,
    };
  }

  return {
    readiness: 'unclear',
    supportingFactors,
    barriers: barriers.length ? barriers : ['Discharge readiness is not clearly documented in the available source.'],
  };
}
