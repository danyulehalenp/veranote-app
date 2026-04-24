import type { MedicalNecessityAssessment, MedicalNecessitySignal } from '@/lib/veranote/defensibility/defensibility-types';

function hasMatch(text: string, patterns: RegExp[]) {
  return patterns.some((pattern) => pattern.test(text));
}

function collectEvidence(text: string, label: string, patterns: RegExp[]) {
  return hasMatch(text, patterns) ? [label] : [];
}

function signalStrength(evidence: string[], fallback: MedicalNecessitySignal['strength'] = 'missing'): MedicalNecessitySignal['strength'] {
  if (evidence.length >= 2) {
    return 'strong';
  }
  if (evidence.length === 1) {
    return fallback === 'missing' ? 'moderate' : fallback;
  }
  return 'missing';
}

export function evaluateMedicalNecessity(sourceText: string): MedicalNecessityAssessment {
  const normalized = sourceText.toLowerCase();

  const riskEvidence = [
    ...collectEvidence(normalized, 'Suicidal ideation or self-harm language documented.', [/\b(suicid(?:e|al)|self-harm|self harm|wish i would not wake up|better off dead)\b/]),
    ...collectEvidence(normalized, 'Homicidal or violent-risk language documented.', [/\b(homicid(?:e|al)|violent thoughts|threatened to hurt|assaultive|combative)\b/]),
    ...collectEvidence(normalized, 'Plan or intent language documented.', [/\b(plan to overdose|has a plan|intent to die|unable to contract for safety)\b/]),
  ];

  const functionalEvidence = [
    ...collectEvidence(normalized, 'Self-care failure documented.', [/\b(not eating|poor hygiene|not showering|unable to bathe|cannot care for self)\b/]),
    ...collectEvidence(normalized, 'Unsafe disorganization or wandering documented.', [/\b(wandering|unable to state address|unsafe if discharged|cannot maintain safety at home)\b/]),
  ];

  const severityEvidence = [
    ...collectEvidence(normalized, 'Severe psychosis or internal-preoccupation concern documented.', [/\b(psychosis|responding to internal stimuli|internally preoccupied|hallucinat|paranoid)\b/]),
    ...collectEvidence(normalized, 'Marked agitation, mania, or decompensation documented.', [/\b(agitated|pressured|flight of ideas|manic|decompensat|grave disability)\b/]),
  ];

  const treatmentFailureEvidence = [
    ...collectEvidence(normalized, 'Recent outpatient, PHP, or IOP failure documented.', [/\b((outpatient|php|iop|crisis stabilization|safety plan).*(failed|returned|worsening|not enough|did not stabilize)|(failed|returned|worsening|not enough|did not stabilize).*(outpatient|php|iop|crisis stabilization|safety plan))\b/]),
    ...collectEvidence(normalized, 'Recent ED visit, admission, or law-enforcement escalation documented.', [/\b(ed visit|emergency department|law enforcement|police|prior admission|returned to ed)\b/]),
  ];

  const safetyEvidence = [
    ...collectEvidence(normalized, 'Need for monitoring or supervised setting documented.', [/\b(24-hour|24 hour|close observation|q15|constant observation|structured environment)\b/]),
    ...collectEvidence(normalized, 'Lower level of care may be insufficient based on documented facts.', [/\b(cannot be managed outpatient|less restrictive .* insufficient|unsafe if discharged)\b/]),
  ];

  const signals: MedicalNecessitySignal[] = [
    { category: 'risk', evidence: riskEvidence, strength: signalStrength(riskEvidence) },
    { category: 'functional_impairment', evidence: functionalEvidence, strength: signalStrength(functionalEvidence) },
    { category: 'symptom_severity', evidence: severityEvidence, strength: signalStrength(severityEvidence) },
    { category: 'treatment_failure', evidence: treatmentFailureEvidence, strength: signalStrength(treatmentFailureEvidence) },
    { category: 'safety', evidence: safetyEvidence, strength: signalStrength(safetyEvidence) },
  ];

  const missingElements: string[] = [];

  if (signals.find((item) => item.category === 'risk')?.strength === 'missing') {
    missingElements.push('Insufficient documentation of current suicide, homicide, or dangerousness severity.');
  }
  if (signals.find((item) => item.category === 'functional_impairment')?.strength === 'missing') {
    missingElements.push('Concrete ADL or functional-impairment examples are not clearly documented.');
  }
  if (signals.find((item) => item.category === 'treatment_failure')?.strength === 'missing') {
    missingElements.push('Failure of lower level of care is not clearly documented.');
  }
  if (signals.find((item) => item.category === 'safety')?.strength === 'missing') {
    missingElements.push('Need for supervised or 24-hour care is not clearly defended.');
  }

  return {
    signals,
    missingElements,
  };
}
