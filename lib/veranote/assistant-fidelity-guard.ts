import type { ContradictionAnalysis } from '@/lib/veranote/assistant-contradiction-detector';
import type { MseAnalysis } from '@/lib/veranote/assistant-mse-parser';
import type { RiskAnalysis } from '@/lib/veranote/assistant-risk-detector';
import type { AssistantResponsePayload } from '@/types/assistant';

type FidelityGuardInput = {
  output: AssistantResponsePayload;
  source: string;
  mseAnalysis: MseAnalysis;
  riskAnalysis: RiskAnalysis;
  contradictions: ContradictionAnalysis;
};

function softenCertainty(text: string) {
  return text
    .replace(/\bis consistent with\b/gi, 'may be consistent with')
    .replace(/\bclearly shows\b/gi, 'may show based on available information')
    .replace(/\bdefinitely\b/gi, 'likely based on available information')
    .replace(/\bindicates\b/gi, 'may indicate')
    .replace(/\bconfirms\b/gi, 'does not by itself confirm');
}

function blockUnsupportedNormals(text: string, unsupportedWarnings: string[]) {
  let next = text;

  if (unsupportedWarnings.some((warning) => /Mood is not directly described/i.test(warning))) {
    next = next.replace(/\b(euthymic|stable mood|normal mood)\b/gi, 'mood not fully described in the available information');
  }

  if (unsupportedWarnings.some((warning) => /Affect is not described/i.test(warning))) {
    next = next.replace(/\b(full affect|appropriate affect|reactive affect)\b/gi, 'affect not fully described in the available information');
  }

  if (unsupportedWarnings.some((warning) => /Thought process is not described/i.test(warning))) {
    next = next.replace(/\b(linear|goal directed|organized thought process)\b/gi, 'thought process not fully described in the available information');
  }

  if (unsupportedWarnings.some((warning) => /Perception is not fully described/i.test(warning))) {
    next = next.replace(/\b(denies AH\/VH|no hallucinations)\b/gi, 'perceptual symptoms were not fully described in the available information');
  }

  if (unsupportedWarnings.some((warning) => /Cognition is not described/i.test(warning))) {
    next = next.replace(/\b(alert and oriented|oriented x3|intact memory)\b/gi, 'cognitive status was not fully described in the available information');
  }

  return next;
}

function enforceRiskRestraint(text: string, riskAnalysis: RiskAnalysis, source: string) {
  let next = text;
  const hasSuicideSupport = riskAnalysis.suicide.length > 0;
  const hasViolenceSupport = riskAnalysis.violence.length > 0;
  const hasHighSuicideConcern = riskAnalysis.suicide.some((signal) => signal.subtype === 'plan' || signal.subtype === 'intent' || signal.subtype === 'active_ideation');

  if (!hasSuicideSupport && !/\b(si|suicid|self-harm|overdose)\b/i.test(source)) {
    next = next.replace(/\b(low suicide risk|denies suicidal ideation|no suicide risk)\b/gi, 'insufficient data to conclude suicide risk status');
  }

  if (hasHighSuicideConcern) {
    next = next.replace(/\b(low suicide risk|minimal suicide risk|no suicide risk)\b/gi, 'suicide risk cannot be minimized based on the available information');
  }

  if (!hasViolenceSupport && !/\b(hi|homicid|violent|threat)\b/i.test(source)) {
    next = next.replace(/\b(no homicidal ideation|no violence risk)\b/gi, 'insufficient data to conclude violence risk status');
  }

  return next;
}

function ensureAvailableInformationLanguage(text: string) {
  if (!/\bbased on available information\b/i.test(text) && /\b(diagnos|assessment|formulation|risk)\b/i.test(text)) {
    return `${text} This remains based on available information.`;
  }

  return text;
}

export function enforceFidelity(input: FidelityGuardInput): AssistantResponsePayload {
  const suppressClinicalGapSuggestions = input.output.answerMode === 'medication_reference_answer'
    || input.output.answerMode === 'general_health_reference'
    || input.output.answerMode === 'direct_reference_answer';
  const guardedMessage = ensureAvailableInformationLanguage(
    enforceRiskRestraint(
      blockUnsupportedNormals(
        softenCertainty(input.output.message),
        input.mseAnalysis.unsupportedNormals,
      ),
      input.riskAnalysis,
      input.source,
    ),
  );

  const guardedSuggestions = (input.output.suggestions || []).map((suggestion) => {
    return ensureAvailableInformationLanguage(
      enforceRiskRestraint(
        blockUnsupportedNormals(
          softenCertainty(suggestion),
          input.mseAnalysis.unsupportedNormals,
        ),
        input.riskAnalysis,
        input.source,
      ),
    );
  });

  const contradictionSuggestions = input.contradictions.contradictions.length
    ? [`Contradiction flagged: ${input.contradictions.contradictions[0]?.detail}`]
    : [];
  const mseSuggestions = !suppressClinicalGapSuggestions && input.mseAnalysis.missingDomains.length
    ? ['MSE is incomplete based on available information; do not auto-complete missing domains.']
    : [];
  const riskSuggestions = !suppressClinicalGapSuggestions
    && (!input.riskAnalysis.suicide.length && !input.riskAnalysis.violence.length && !input.riskAnalysis.graveDisability.length)
    ? ['Risk data is limited in the source, so Atlas should state insufficient data rather than no risk.']
    : [];

  return {
    ...input.output,
    message: guardedMessage,
    suggestions: [...guardedSuggestions, ...contradictionSuggestions, ...mseSuggestions, ...riskSuggestions],
  };
}
