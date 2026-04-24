import type { CptSupportAssessment } from '@/lib/veranote/defensibility/defensibility-types';

function hasMatch(text: string, patterns: RegExp[]) {
  return patterns.some((pattern) => pattern.test(text));
}

export function evaluateCptSupport(sourceText: string): CptSupportAssessment {
  const normalized = sourceText.toLowerCase();
  const psychotherapyContent = hasMatch(normalized, [/\b(psychotherapy|supportive therapy|cbt|dbt|motivational interviewing|processed|reframed|coping skills)\b/]);
  const medicationManagement = hasMatch(normalized, [/\b(medication|medications|refill|increase|decrease|continue|side effect|adherence|prescrib)\b/]);
  const timeDocumented = hasMatch(normalized, [/\b\d+\s*(min|mins|minute|minutes)\b/]);
  const complexityRisk = hasMatch(normalized, [/\b(suicid|homicid|psychosis|grave disability|crisis|unable to contract for safety)\b/]);

  const documentationElements: string[] = [];
  const timeHints: string[] = [];
  const riskComplexityIndicators: string[] = [];
  const cautions: string[] = [
    'Do not present CPT or billing family selection as definitive based on partial source alone.',
    'If required documentation is missing, highlight that gap instead of inventing it.',
  ];

  if (psychotherapyContent) {
    documentationElements.push('Distinct psychotherapy content is documented.');
  } else {
    documentationElements.push('Psychotherapy content is not clearly distinct yet.');
  }

  if (medicationManagement) {
    documentationElements.push('Medical / prescribing work appears documented.');
  }

  if (timeDocumented) {
    timeHints.push('Time-based documentation is present and can support family-specific review.');
  } else {
    timeHints.push('Time-based documentation is not clearly visible; avoid implying time-dependent billing support.');
  }

  if (complexityRisk) {
    riskComplexityIndicators.push('Risk-sensitive content may support higher documentation complexity if clearly described.');
  } else {
    riskComplexityIndicators.push('Complexity support may be thin without documented risk, instability, or treatment-decision detail.');
  }

  const summary = medicationManagement && psychotherapyContent
    ? 'The source may support a combined medical-management plus psychotherapy documentation review, but billing certainty should remain provisional.'
    : medicationManagement
      ? 'The source reads more like medical-management / E/M support than psychotherapy-only support.'
      : psychotherapyContent
        ? 'The source may support psychotherapy-family review if timing and distinct therapy content are adequately documented.'
        : 'Documentation is too thin to support confident CPT-family guidance.';

  return {
    summary,
    documentationElements,
    timeHints,
    riskComplexityIndicators,
    cautions,
  };
}
