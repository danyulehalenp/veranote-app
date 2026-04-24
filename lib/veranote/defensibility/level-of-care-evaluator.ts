import { evaluateMedicalNecessity } from '@/lib/veranote/defensibility/medical-necessity-engine';
import type { LevelOfCareAssessment } from '@/lib/veranote/defensibility/defensibility-types';

export function evaluateLevelOfCare(sourceText: string): LevelOfCareAssessment {
  const necessity = evaluateMedicalNecessity(sourceText);
  const justification = necessity.signals.flatMap((signal) => signal.evidence);
  const missingJustification = [...necessity.missingElements];
  const normalized = sourceText.toLowerCase();

  const strongRisk = necessity.signals.some((signal) => signal.category === 'risk' && signal.strength === 'strong');
  const strongFunctional = necessity.signals.some((signal) => signal.category === 'functional_impairment' && signal.strength === 'strong');
  const strongSafety = necessity.signals.some((signal) => signal.category === 'safety' && signal.strength !== 'missing');
  const moderateInstability = necessity.signals.some((signal) => signal.strength === 'moderate');

  if (strongRisk || strongFunctional || (strongSafety && /\b(psychosis|grave disability|unsafe if discharged|unable to contract for safety)\b/.test(normalized))) {
    return {
      suggestedLevel: 'inpatient',
      justification,
      missingJustification,
    };
  }

  if (moderateInstability && /\b(php|partial hospitalization|iop|intensive outpatient|recent worsening|unstable)\b/.test(normalized)) {
    return {
      suggestedLevel: /\b(php|partial hospitalization)\b/.test(normalized) ? 'php' : 'iop',
      justification,
      missingJustification,
    };
  }

  if (moderateInstability) {
    return {
      suggestedLevel: 'unclear',
      justification,
      missingJustification: [...missingJustification, 'Level-of-care boundary is not fully supported by documented risk, impairment, or failed lower-level care.'],
    };
  }

  return {
    suggestedLevel: 'outpatient',
    justification: justification.length ? justification : ['No clear high-acuity inpatient anchors were detected in the current source.'],
    missingJustification,
  };
}
