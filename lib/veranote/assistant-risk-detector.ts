import { detectRiskTerms } from '@/lib/psychiatry-terminology/seed-loader';
import { RISK_ANALYSIS_WARNING, RISK_LANGUAGE_CONCEPTS, type RiskCategory, type RiskLanguageConcept } from '@/lib/veranote/knowledge/risk/risk-language-concepts';

export type RiskSignal = {
  category: RiskCategory;
  subtype: RiskLanguageConcept['subtype'];
  matchedKeywords: string[];
  confidenceLevel: RiskLanguageConcept['confidenceLevel'];
  documentationCaution: string;
};

export type RiskAnalysis = {
  suicide: RiskSignal[];
  violence: RiskSignal[];
  graveDisability: RiskSignal[];
  generalWarnings: string[];
  level: 'clear_high' | 'possible_high' | 'unclear';
};

function normalize(value: string) {
  return value.toLowerCase();
}

function findMatchedKeywords(text: string, keywords: string[]) {
  const normalized = normalize(text);
  return keywords.filter((keyword) => normalized.includes(keyword.toLowerCase()));
}

function determineRiskLevel(signals: RiskSignal[]): RiskAnalysis['level'] {
  const hasClearSuicideRisk = signals.some((signal) => (
    signal.category === 'suicide'
    && ['active_ideation', 'plan', 'intent'].includes(signal.subtype)
  ));
  const hasClearViolenceRisk = signals.some((signal) => (
    signal.category === 'violence'
    && signal.subtype === 'threats'
  ));

  if (hasClearSuicideRisk || hasClearViolenceRisk) {
    return 'clear_high';
  }

  if (signals.length > 0) {
    return 'possible_high';
  }

  return 'unclear';
}

export function detectRiskSignals(text: string): RiskAnalysis {
  const psychiatrySeedRiskMatches = detectRiskTerms(text);
  const signals = RISK_LANGUAGE_CONCEPTS
    .map((concept) => {
      const keywordMatches = findMatchedKeywords(text, concept.detectionKeywords);
      const seedMatches = psychiatrySeedRiskMatches
        .filter((match) => findMatchedKeywords(match.matchedText, concept.detectionKeywords).length)
        .map((match) => match.matchedText);
      const matchedKeywords = [...new Set([...keywordMatches, ...seedMatches])];

      if (!matchedKeywords.length) {
        return null;
      }

      return {
        category: concept.category,
        subtype: concept.subtype,
        matchedKeywords,
        confidenceLevel: concept.confidenceLevel,
        documentationCaution: concept.documentationCaution,
      } satisfies RiskSignal;
    })
    .filter(Boolean) as RiskSignal[];

  return {
    suicide: signals.filter((signal) => signal.category === 'suicide'),
    violence: signals.filter((signal) => signal.category === 'violence'),
    graveDisability: signals.filter((signal) => signal.category === 'grave_disability'),
    generalWarnings: [RISK_ANALYSIS_WARNING],
    level: determineRiskLevel(signals),
  };
}
