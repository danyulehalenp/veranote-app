import { detectContradictions } from '@/lib/veranote/assistant-contradiction-detector';
import { parseMSEFromText } from '@/lib/veranote/assistant-mse-parser';
import { evaluateLevelOfCare } from '@/lib/veranote/defensibility/level-of-care-evaluator';
import { evaluateMedicalNecessity } from '@/lib/veranote/defensibility/medical-necessity-engine';
import type { AuditRiskFlag } from '@/lib/veranote/defensibility/defensibility-types';

export function detectAuditRisk(sourceText: string): AuditRiskFlag[] {
  const mse = parseMSEFromText(sourceText);
  const contradictions = detectContradictions(sourceText);
  const necessity = evaluateMedicalNecessity(sourceText);
  const loc = evaluateLevelOfCare(sourceText);
  const normalized = sourceText.toLowerCase();
  const flags: AuditRiskFlag[] = [];

  if (!/\b(suicid|homicid|self-harm|unable to contract for safety|grave disability|unsafe if discharged)\b/.test(normalized)) {
    flags.push({
      type: 'missing_risk_documentation',
      severity: 'moderate',
      message: 'Risk documentation is thin; the note may need clearer current safety language or an explicit insufficient-data statement.',
    });
  }

  if (contradictions.contradictions.length || mse.ambiguousSections.length) {
    flags.push({
      type: 'inconsistent_mse',
      severity: contradictions.severityLevel === 'high' ? 'high' : 'moderate',
      message: 'MSE or source contradictions are present and should be flagged instead of silently resolved.',
    });
  }

  if (/\b(bipolar|major depressive disorder|schizophrenia|substance use disorder|ptsd|adhd)\b/.test(normalized)
    && !/\b(rule out|rule-out|differential|history of|possible|unclear|based on available information)\b/.test(normalized)) {
    flags.push({
      type: 'unsupported_diagnosis',
      severity: 'moderate',
      message: 'Firm diagnosis wording may outrun the support documented in the source.',
    });
  }

  if (loc.suggestedLevel !== 'outpatient' && necessity.missingElements.length) {
    flags.push({
      type: 'insufficient_justification',
      severity: 'high',
      message: `Level-of-care support may be vulnerable because documentation is missing around ${necessity.missingElements[0]?.toLowerCase()}.`,
    });
  }

  if (/\bgrave disability\b/.test(normalized) && !/\b(not eating|poor hygiene|cannot care for self|unable to state address|wandering|unable to bathe|unable to obtain shelter)\b/.test(normalized)) {
    flags.push({
      type: 'insufficient_justification',
      severity: 'moderate',
      message: 'Grave-disability wording appears without enough concrete self-care or basic-needs support.',
    });
  }

  return flags;
}
