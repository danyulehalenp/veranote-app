import { extractExplicitDates, normalizeText } from '@/lib/ai/source-analysis';
import type { FidelityCase } from '@/lib/eval/fidelity-cases';
import { getHighRiskWarnings } from '@/lib/eval/high-risk-warnings';

type MismatchHints = {
  missingExpectedTruths: string[];
  forbiddenAdditionsFound: string[];
  missingExplicitDates: string[];
  highRiskWarnings: string[];
};

const STOP_WORDS = new Set([
  'the', 'and', 'for', 'with', 'that', 'this', 'from', 'were', 'was', 'have', 'has', 'had', 'not', 'but', 'are', 'into', 'than', 'then', 'they', 'them', 'their', 'there', 'about', 'still', 'current', 'currently', 'today', 'yesterday', 'week', 'month', 'patient', 'reports', 'report', 'reported', 'reportedly', 'stated', 'states', 'says', 'said', 'noted', 'note', 'notes', 'more', 'less', 'some', 'most', 'only', 'just', 'very', 'also', 'while', 'during', 'over', 'after', 'before'
]);

const PHRASE_EQUIVALENTS: Record<string, string[]> = {
  si: ['suicidal ideation', 'suicidality', 'suicidal thoughts'],
  hi: ['homicidal ideation', 'homicidal thoughts'],
  ah: ['auditory hallucinations', 'hearing voices', 'voices'],
  vh: ['visual hallucinations'],
  denies: ['denied', 'no', 'without'],
  improved: ['better', 'decreased', 'reduced', 'lessened'],
  improvement: ['better', 'decrease', 'reduction'],
  worsened: ['worse', 'increased'],
  adherence: ['taking', 'missed doses', 'forgot doses', 'imperfect adherence'],
  refill: ['refill request', 'needs refill'],
  conflict: ['disagreement', 'conflicting', 'mismatch'],
  passive: ['death wish', 'would not wake up', 'wouldn t wake up', 'disappear'],
  calmer: ['less agitated', 'more calm'],
};

function tokenize(value: string) {
  return normalizeText(value)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

function meaningfulTokens(value: string) {
  return tokenize(value).filter((word) => word.length > 2 && !STOP_WORDS.has(word));
}

function outputIncludesAny(output: string, patterns: Array<string | RegExp>) {
  return patterns.some((pattern) => (typeof pattern === 'string' ? output.includes(pattern) : pattern.test(output)));
}

function phrasePresent(output: string, forbiddenRule: string) {
  const normalizedOutput = normalizeText(output).toLowerCase();
  const normalizedRule = forbiddenRule.toLowerCase();

  if (normalizedRule.includes('denies hi/avh')) {
    return outputIncludesAny(normalizedOutput, [/denies\s+hi/, /denies\s+.*avh/, /denies\s+hallucinations/]);
  }

  if (normalizedRule.includes('denies si/hi')) {
    return outputIncludesAny(normalizedOutput, [/denies\s+si/, /denies\s+suicid/, /denies\s+hi/]);
  }

  if (normalizedRule.includes('normal mse') || normalizedRule.includes('detailed mse findings')) {
    return outputIncludesAny(normalizedOutput, [/thought process linear/, /insight and judgment fair/, /speech normal/, /mood euthymic/, /affect appropriate/, /mental status exam.*normal/]);
  }

  if (normalizedRule.includes('normal physical exam')) {
    return outputIncludesAny(normalizedOutput, [/well-appearing/, /nad\b/, /normal exam/, /lungs clear/, /heart regular/]);
  }

  if (normalizedRule.includes('cbt') || normalizedRule.includes('detailed cbt formulation')) {
    return outputIncludesAny(normalizedOutput, [/\bcbt\b/, /\bdbt\b/, /mindfulness/, /grounding/, /reframing/, /cognitive distortion/]);
  }

  if (normalizedRule.includes('confirmed fever or strep diagnosis')) {
    return outputIncludesAny(normalizedOutput, [/strep pharyngitis/, /fever confirmed/, /positive for strep/]);
  }

  if (normalizedRule.includes('medication change not documented')) {
    return outputIncludesAny(normalizedOutput, [/increase/, /decrease/, /start(?:ed)?/, /stop(?:ped)?/, /change medication/, /dose was raised/, /dose was lowered/]);
  }

  if (normalizedRule.includes('labeling patient noncompliant')) {
    return outputIncludesAny(normalizedOutput, [/noncompliant/, /non-compliant/]);
  }

  if (normalizedRule.includes('improvement language not supported') || normalizedRule.includes('major symptom resolution')) {
    return outputIncludesAny(normalizedOutput, [/improved significantly/, /marked improvement/, /doing much better/, /symptoms resolved/, /doing well overall/]);
  }

  if (normalizedRule.includes('treatment plan not present in source') || normalizedRule.includes('homework assignments not mentioned')) {
    return outputIncludesAny(normalizedOutput, [/start antibiotics/, /rest and fluids/, /send culture/, /follow up with pcp/, /homework assigned/, /practice this for homework/]);
  }

  if (normalizedRule.includes('statement that vaping is confirmed fact')) {
    return outputIncludesAny(normalizedOutput, [/patient (?:was|is) vaping/, /vaping confirmed/, /admits vaping/]);
  }

  if (normalizedRule.includes('statement that school performance is objectively declining')) {
    return outputIncludesAny(normalizedOutput, [/school performance .* declining/, /academically declining/, /grades worsening/]);
  }

  if (normalizedRule.includes('blood pressure controlled')) {
    return outputIncludesAny(normalizedOutput, [/blood pressure controlled/, /bp controlled/, /hypertension controlled/]);
  }

  if (normalizedRule.includes('active vomiting')) {
    return outputIncludesAny(normalizedOutput, [/vomiting today/, /continues to vomit/, /ongoing vomiting/]);
  }

  if (normalizedRule.includes('full denial of any suicidal thoughts')) {
    return outputIncludesAny(normalizedOutput, [/denies any suicidal thoughts/, /no suicidal thoughts at all/, /completely denies suicidal thinking/]);
  }

  return normalizedOutput.includes(normalizedRule.replace(' unless documented.', '').replace('.', ''));
}

function truthLikelyMissing(output: string, truth: string) {
  const normalizedOutput = normalizeText(output).toLowerCase();
  const tokens = meaningfulTokens(truth);

  if (!tokens.length) {
    return false;
  }

  const matchedCount = tokens.filter((token) => {
    if (normalizedOutput.includes(token)) {
      return true;
    }

    const equivalents = PHRASE_EQUIVALENTS[token] ?? [];
    return equivalents.some((equivalent) => normalizedOutput.includes(equivalent));
  }).length;

  const coverage = matchedCount / tokens.length;

  if (tokens.length <= 3) {
    return coverage < 0.34;
  }

  return coverage < 0.45;
}

function explicitDateMissing(output: string, date: string) {
  const normalizedOutput = normalizeText(output).toLowerCase();
  const normalizedDate = date.toLowerCase();

  if (normalizedOutput.includes(normalizedDate)) {
    return false;
  }

  const relativeVariants = [
    normalizedDate.replace(/\bone\b/g, '1'),
    normalizedDate.replace(/\btwo\b/g, '2'),
    normalizedDate.replace(/\bthree\b/g, '3'),
  ];

  return !relativeVariants.some((variant) => normalizedOutput.includes(variant));
}

export function getMismatchHints(input: {
  selectedCase: FidelityCase;
  outputSnapshot: string;
  outputFlagsSnapshot: string;
}): MismatchHints {
  const output = input.outputSnapshot || '';

  const missingExpectedTruths = input.selectedCase.expectedTruths.filter((truth) => truthLikelyMissing(output, truth));
  const forbiddenAdditionsFound = input.selectedCase.forbiddenAdditions.filter((item) => phrasePresent(output, item));
  const explicitDates = extractExplicitDates(input.selectedCase.sourceInput);
  const missingExplicitDates = explicitDates.filter((date) => explicitDateMissing(output, date));
  const highRiskWarnings = getHighRiskWarnings({
    sourceInput: input.selectedCase.sourceInput,
    outputText: output,
  }).map((warning) => warning.title);

  return {
    missingExpectedTruths,
    forbiddenAdditionsFound,
    missingExplicitDates,
    highRiskWarnings,
  };
}
