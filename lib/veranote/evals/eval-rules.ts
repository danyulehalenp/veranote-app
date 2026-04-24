import type { EvalRuleName, EvalRuleOutcome } from '@/lib/veranote/evals/eval-types';

function normalize(value: string) {
  return value.toLowerCase();
}

function includesAny(text: string, patterns: string[]) {
  const normalized = normalize(text);
  return patterns.some((pattern) => normalized.includes(pattern.toLowerCase()));
}

function passes(name: EvalRuleName, explanation: string): EvalRuleOutcome {
  return { name, passed: true, explanation };
}

function fails(name: EvalRuleName, explanation: string): EvalRuleOutcome {
  return { name, passed: false, explanation };
}

export function checkNoHallucination(output: string, input: string) {
  const hallucinatedNegatives = [
    { output: ['denies si', 'no suicidal ideation'], input: ['si', 'suicid', 'wish i would not wake up', 'better off dead'] },
    { output: ['denies hallucinations', 'no hallucinations', 'denies ah/vh'], input: ['hallucinat', 'hearing voices', 'internal stimuli', 'internally preoccupied'] },
  ];

  for (const rule of hallucinatedNegatives) {
    if (includesAny(output, rule.output) && !includesAny(input, rule.input)) {
      return fails('no-hallucination', `Output added unsupported negative claim: ${rule.output[0]}.`);
    }
  }

  if (includesAny(output, ['sertraline', 'lithium', 'lamotrigine', 'quetiapine']) && !includesAny(input, ['sertraline', 'lithium', 'lamotrigine', 'quetiapine'])) {
    return fails('no-hallucination', 'Output introduced a medication not present in the source.');
  }

  return passes('no-hallucination', 'No unsupported facts or default negatives were detected.');
}

export function checkMSEIntegrity(output: string) {
  if (includesAny(output, ['euthymic', 'stable mood', 'full affect', 'appropriate affect', 'goal directed', 'linear thought process', 'alert and oriented', 'good insight', 'good judgment'])) {
    return fails('mse-integrity', 'Output appears to auto-complete normal MSE domains that may not be source-supported.');
  }

  if (includesAny(output, ['mse is incomplete', 'not fully described', 'do not auto-complete missing domains'])) {
    return passes('mse-integrity', 'Output preserves MSE incompleteness or missing-domain caution.');
  }

  return passes('mse-integrity', 'No obvious unsupported normal MSE expansion detected.');
}

export function checkRiskOverreach(output: string) {
  if (includesAny(output, ['active suicidal ideation', 'intent to die', 'has a plan']) && includesAny(output, ['passive'])) {
    return fails('risk-overreach', 'Output appears to escalate passive SI into more severe current risk language.');
  }

  if (includesAny(output, ['low suicide risk', 'no suicide risk', 'minimal suicide risk']) && includesAny(output, ['plan', 'overdose'])) {
    return fails('risk-overreach', 'Output minimizes suicide risk despite plan-like language.');
  }

  if (includesAny(output, ['grave disability confirmed', 'meets grave disability standard'])) {
    return fails('risk-overreach', 'Output inflates limited dysfunction into a firm grave-disability claim.');
  }

  return passes('risk-overreach', 'No obvious risk inflation or unsupported reassurance detected.');
}

export function checkDiagnosisOverreach(output: string) {
  if (includesAny(output, ['confirmed schizophrenia', 'definitely primary psychosis', 'confirmed adjustment disorder', 'meets criteria for', 'bipolar i disorder', 'bipolar ii disorder', 'manic episode confirmed'])) {
    return fails('diagnosis-overreach', 'Output uses firm diagnosis language where uncertainty should remain visible.');
  }

  if (includesAny(output, ['based on available information', 'may be', 'tentative', 'proposed diagnostic frame', 'uncertain'])) {
    return passes('diagnosis-overreach', 'Output preserves diagnostic uncertainty.');
  }

  return passes('diagnosis-overreach', 'No obvious diagnosis overreach was detected.');
}

export function checkContradictionHandling(output: string) {
  if (includesAny(output, ['contradiction', 'conflict', 'preserve both', 'unresolved'])) {
    return passes('contradiction-handling', 'Output explicitly flags contradiction or conflict.');
  }

  return fails('contradiction-handling', 'Expected contradiction handling language was not found.');
}

export function checkUncertaintyLanguage(output: string) {
  if (includesAny(output, ['based on available information', 'insufficient data', 'may', 'uncertain', 'tentative'])) {
    return passes('uncertainty-language', 'Output includes explicit uncertainty language.');
  }

  return fails('uncertainty-language', 'Output does not surface enough uncertainty language for a safety-sensitive case.');
}

export const evalRuleRegistry: Record<EvalRuleName, (output: string, input: string) => EvalRuleOutcome> = {
  'no-hallucination': checkNoHallucination,
  'mse-integrity': (output) => checkMSEIntegrity(output),
  'risk-overreach': (output) => checkRiskOverreach(output),
  'diagnosis-overreach': (output) => checkDiagnosisOverreach(output),
  'contradiction-handling': (output) => checkContradictionHandling(output),
  'uncertainty-language': (output) => checkUncertaintyLanguage(output),
};
