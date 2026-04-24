import { detectRiskTerms, findMseTermsInText } from '@/lib/psychiatry-terminology/seed-loader';
import { ALL_MSE_DOMAINS, MSE_VOCABULARY, type MseDomainKey } from '@/lib/veranote/knowledge/mse/mse-vocabulary';

export type ParsedMseDomain = {
  domain: MseDomainKey;
  matches: string[];
};

export type MseAnalysis = {
  detectedDomains: ParsedMseDomain[];
  missingDomains: MseDomainKey[];
  unsupportedNormals: string[];
  ambiguousSections: string[];
};

function splitSections(text: string) {
  return text
    .split(/\n+/)
    .map((section) => section.trim())
    .filter(Boolean);
}

function normalize(value: string) {
  return value.toLowerCase();
}

function findMatches(text: string, candidates: string[]) {
  const normalized = normalize(text);
  return candidates.filter((candidate) => normalized.includes(candidate.toLowerCase()));
}

function detectAmbiguity(text: string, domain: MseDomainKey) {
  const normalized = normalize(text);
  const warnings: string[] = [];

  if (domain === 'mood' && /(calm|cooperative|pleasant)/i.test(text) && !/(mood|feels|feeling|depressed|anxious|irritable|sad)/i.test(text)) {
    warnings.push('Behavior wording appears present without a direct mood description; do not infer mood.');
  }

  if (domain === 'perception' && /(denies hallucinations|no hallucinations)/i.test(text) && /(internally preoccupied|responding to internal stimuli|laughing to self)/i.test(text)) {
    warnings.push('Perception section contains both denial language and concerning observation; preserve both instead of resolving them.');
  }

  if (domain === 'thought_process' && /(speech)/i.test(text) && !/(linear|tangential|circumstantial|disorganized|flight of ideas|thought process)/i.test(text)) {
    warnings.push('Speech wording appears present without a direct thought-process description; do not infer linear thought process.');
  }

  if (normalized.includes('mse normal')) {
    warnings.push('Generic normal MSE phrasing was detected; confirm each domain is source-supported before using it.');
  }

  return warnings;
}

const TERMINOLOGY_DOMAIN_MAP: Record<MseDomainKey, string[]> = {
  appearance: ['appearance'],
  behavior: ['behavior', 'appearance_behavior'],
  speech: ['speech'],
  mood: ['mood'],
  affect: ['affect'],
  thought_process: ['thought_process'],
  thought_content: ['thought_content'],
  perception: ['perception'],
  cognition: ['cognition'],
  insight: ['insight'],
  judgment: ['judgment'],
};

function terminologyDomainMatchesKey(domainValue: string, domain: MseDomainKey) {
  const normalized = domainValue.toLowerCase().replace(/[^a-z]+/g, '_');
  return TERMINOLOGY_DOMAIN_MAP[domain].includes(normalized);
}

export function parseMSEFromText(text: string): MseAnalysis {
  const detected = new Map<MseDomainKey, Set<string>>();
  const ambiguousSections = new Set<string>();
  const terminologyMatches = findMseTermsInText(text);
  const riskMatches = detectRiskTerms(text);

  for (const domain of ALL_MSE_DOMAINS) {
    const normalMatches = findMatches(text, MSE_VOCABULARY[domain].normalDescriptors);
    const abnormalMatches = findMatches(text, MSE_VOCABULARY[domain].abnormalDescriptors);
    const terminologyDomainMatches = terminologyMatches
      .filter((match) => {
        return terminologyDomainMatchesKey(match.entry.domain || '', domain);
      })
      .map((match) => match.matchedText);
    const matches = [...new Set([...normalMatches, ...abnormalMatches, ...terminologyDomainMatches])];

    if (matches.length) {
      detected.set(domain, new Set(matches));
    }
  }

  if (riskMatches.some((match) => /(suic|homic|violent|self-harm)/i.test(match.matchedText))) {
    const existing = detected.get('thought_content') || new Set<string>();
    riskMatches.forEach((match) => {
      if (/(suic|homic|violent|self-harm)/i.test(match.matchedText)) {
        existing.add(match.matchedText);
      }
    });
    detected.set('thought_content', existing);
  }

  splitSections(text).forEach((section) => {
    ALL_MSE_DOMAINS.forEach((domain) => {
      detectAmbiguity(section, domain).forEach((warning) => ambiguousSections.add(warning));
    });
  });

  const detectedDomains = ALL_MSE_DOMAINS
    .filter((domain) => detected.has(domain))
    .map((domain) => ({
      domain,
      matches: Array.from(detected.get(domain) || []),
    }));
  const missingDomains = ALL_MSE_DOMAINS.filter((domain) => !detected.has(domain));
  const unsupportedNormals = missingDomains.map((domain) => MSE_VOCABULARY[domain].unsupportedNormalWarning);

  return {
    detectedDomains,
    missingDomains,
    unsupportedNormals,
    ambiguousSections: Array.from(ambiguousSections),
  };
}
