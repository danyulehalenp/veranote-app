import { extractMissingInfoFlags } from '@/lib/ai/source-analysis';
import type { GenerateNoteResult } from '@/lib/ai/response-schema';

function stripProviderInstructionLane(sourceInput: string) {
  return sourceInput
    .replace(/\n?\s*Provider Add-On:\s*[\s\S]*$/i, '')
    .replace(/\n?\s*Nonclinical QA marker:[^\n]*/gi, '')
    .trim();
}

function normalizeFallbackClinicalText(value: string) {
  return value
    .replace(/\bsertrline\b/gi, 'sertraline')
    .replace(/\bdepresion\b/gi, 'depression')
    .replace(/\banxity\b/gi, 'anxiety')
    .replace(/\bnausia\b/gi, 'nausea')
    .replace(/\bdosess\b/gi, 'doses')
    .replace(/\bdenys\s+si\s*\/?\s*hi\b/gi, 'denies SI/HI')
    .replace(/\bno current si\s*\/?\s*hi\b/gi, 'no current SI/HI')
    .replace(/\bLamictle\b/g, 'Lamictal');
}

function buildFallbackSourceClarifiers(sourceText: string) {
  const normalized = normalizeFallbackClinicalText(sourceText);
  const clarifiers: string[] = [];

  if (/\b(?:denies|denied|no current)\s+SI\/HI\b/i.test(normalized)) {
    clarifiers.push('Safety / Risk Source Detail:\nPatient denies SI/HI in the available source.');
  }

  if (
    /\bbipolar\b/i.test(normalized)
    && /\b(?:prior diagnoses?|historical|referral|previous provider|not sure|denies current decreased need)\b/i.test(normalized)
  ) {
    clarifiers.push('Diagnostic Uncertainty:\nBipolar disorder is documented as historical/reported from referral material and is not confirmed by this source alone.');
  }

  if (/\bquetiapine\b/i.test(normalized) && /\b(?:stopped|sedation)\b/i.test(normalized)) {
    clarifiers.push('Medication History:\nQuetiapine was reportedly stopped due to sedation.');
  }

  if (/\b(?:Lamictal|lamotrigine)\b/i.test(normalized) && /\b(?:rash|allerg|reconciliation|restart)\b/i.test(normalized)) {
    clarifiers.push('Medication Reconciliation / Allergy Uncertainty:\nLamotrigine/Lamictal appears in prior or allergy history; restart is described only as a patient request, and rash severity/reconciliation remains uncertain from the source.');
  }

  return clarifiers.length ? `\n\n${clarifiers.join('\n\n')}` : '';
}

function buildMockNote(sourceInput: string, noteType: string) {
  const trimmed = normalizeFallbackClinicalText(stripProviderInstructionLane(sourceInput) || sourceInput.trim());
  const preview = trimmed.length > 500 ? `${trimmed.slice(0, 500)}...` : trimmed;
  const clarifiers = buildFallbackSourceClarifiers(trimmed);

  if (noteType === 'Therapy Progress Note') {
    return `Session Focus / Themes:\n${preview}${clarifiers}\n\nInterventions:\nInterventions are limited to what is explicitly documented in the source input.\n\nPatient Response / Process:\nThis section remains limited to what the source supports.\n\nProgress / Barriers:\nSource wording is preserved closely and progress is not overstated.\n\nSafety / Risk:\nSafety content is limited to what is explicitly supported by the source input.\n\nPlan / Next Steps:\nNext steps are limited to what was documented.`;
  }

  if (noteType === 'General Medical SOAP/HPI') {
    return `Chief Complaint:\nDraft from provided source input.\n\nHPI:\n${preview}${clarifiers}\n\nSubjective / Relevant Associated Symptoms:\nSymptoms are limited to what is explicitly documented in the source.\n\nObjective:\nObjective findings are limited to what was documented.\n\nAssessment:\nAssessment remains narrow and source-faithful.\n\nPlan:\nPlan items are limited to what is present in the source.`;
  }

  return `Chief Concern / Interval Update:\n${preview}${clarifiers}\n\nSymptom Review:\nSymptoms are limited to what is explicitly supported by the source input.\n\nMedications / Adherence / Side Effects:\nMedication benefit, adherence, and side-effect language are documented only when supported above.\n\nMental Status / Observations:\nMental status findings remain limited to documented observations and reports.\n\nSafety / Risk:\nSafety content is limited to documented source material.\n\nAssessment:\nAssessment remains brief and source-faithful.\n\nPlan:\nPlan content is limited to documented next steps and source-supported follow-up needs.`;
}

export function generateMockNote(sourceInput: string, noteType: string, flagMissingInfo = true): GenerateNoteResult {
  const flags = flagMissingInfo
    ? [
        'Review missing details before final use.',
        'Fallback response used because live model generation is not configured.',
        ...extractMissingInfoFlags(sourceInput, noteType),
      ]
    : [];

  return {
    note: buildMockNote(sourceInput, noteType),
    flags: Array.from(new Set(flags)),
  };
}
