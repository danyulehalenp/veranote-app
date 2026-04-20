import { extractMissingInfoFlags } from '@/lib/ai/source-analysis';
import type { GenerateNoteResult } from '@/lib/ai/response-schema';

function buildMockNote(sourceInput: string, noteType: string) {
  const trimmed = sourceInput.trim();
  const preview = trimmed.length > 500 ? `${trimmed.slice(0, 500)}...` : trimmed;

  if (noteType === 'Therapy Progress Note') {
    return `Session Focus / Themes:\n${preview}\n\nInterventions:\nOnly include interventions that were explicitly documented in the source input.\n\nPatient Response / Process:\nKeep this section limited to what the source actually supports.\n\nProgress / Barriers:\nUse the source wording closely and avoid overstating progress.\n\nSafety / Risk:\nInclude only what is explicitly supported by the source input.\n\nPlan / Next Steps:\nAdd next steps only if they were documented.`;
  }

  if (noteType === 'General Medical SOAP/HPI') {
    return `Chief Complaint:\nDraft from provided source input.\n\nHPI:\n${preview}\n\nSubjective / Relevant Associated Symptoms:\nKeep this section limited to symptoms explicitly documented in the source.\n\nObjective:\nInclude only documented objective findings.\n\nAssessment:\nKeep the assessment narrow and source-faithful.\n\nPlan:\nInclude only plan items present in the source.`;
  }

  return `Chief Concern / Interval Update:\n${preview}\n\nSymptom Review:\nKeep symptoms limited to what is explicitly supported by the source input.\n\nMedications / Adherence / Side Effects:\nDo not add medication benefit, adherence, or side-effect language unless documented.\n\nMental Status / Observations:\nDo not add normal MSE findings unless documented.\n\nSafety / Risk:\nInclude only documented safety content.\n\nAssessment:\nKeep the assessment brief and source-faithful.\n\nPlan:\nInclude only the documented plan and avoid generalized treatment filler.`;
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
