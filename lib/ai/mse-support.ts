import type { SourceSections } from '@/types/session';

type MseDomain =
  | 'appearance'
  | 'behavior'
  | 'speech'
  | 'mood'
  | 'affect'
  | 'thoughtProcess'
  | 'thoughtContent'
  | 'perception'
  | 'cognition'
  | 'insight'
  | 'judgment';

type EvidenceSource = 'clinicianNotes' | 'intakeCollateral' | 'patientTranscript' | 'objectiveData';

export type MseEvidenceItem = {
  domain: MseDomain;
  text: string;
  source: EvidenceSource;
  attributedTo: 'patient' | 'clinician' | 'collateral' | 'objective';
  hedged?: boolean;
  conflictsWithPatientDenial?: boolean;
  historical?: boolean;
};

export type MseSupportSummary = {
  required: boolean;
  limited: boolean;
  supportedDomains: MseDomain[];
  missingDomains: MseDomain[];
  conflictingDomains: MseDomain[];
  evidence: MseEvidenceItem[];
  guidanceLines: string[];
  suggestedFlag?: string;
};

const ALL_DOMAINS: MseDomain[] = [
  'appearance',
  'behavior',
  'speech',
  'mood',
  'affect',
  'thoughtProcess',
  'thoughtContent',
  'perception',
  'cognition',
  'insight',
  'judgment',
];

const DOMAIN_PATTERNS: Array<{ domain: MseDomain; patterns: RegExp[] }> = [
  { domain: 'appearance', patterns: [/dishevel/i, /well-groomed/i, /unkempt/i, /poor hygiene/i, /malodorous/i, /appears older than/i, /appears stated age/i] },
  { domain: 'behavior', patterns: [/agitat/i, /restless/i, /pacing/i, /guarded/i, /cooperative/i, /withdrawn/i, /internally preoccupied/i, /laughing to self/i, /responding to internal stimuli/i, /tearful/i, /psychomotor/i, /slowed/i] },
  { domain: 'speech', patterns: [/pressured speech/i, /rapid speech/i, /speech .* rapid/i, /speech .* slow/i, /speech .* soft/i, /speech .* loud/i, /mute/i, /nonverbal/i] },
  { domain: 'mood', patterns: [/mood/i, /feels? /i, /feeling /i, /depressed/i, /anxious/i, /irritable/i, /sad/i, /angry/i, /overwhelmed/i, /better/i, /about the same/i, /calmer/i] },
  { domain: 'affect', patterns: [/affect/i, /blunted/i, /flat affect/i, /restricted/i, /labile/i, /congruent/i, /incongruent/i, /tearful/i] },
  { domain: 'thoughtProcess', patterns: [/tangential/i, /circumstantial/i, /flight of ideas/i, /loosening of associations/i, /disorganized/i, /thought process/i, /linear/i] },
  { domain: 'thoughtContent', patterns: [/delusion/i, /paranoid/i, /obsession/i, /rumination/i, /hopeless/i, /worthless/i, /suicid/i, /homicid/i, /violent thoughts/i, /wanting to punch/i, /picture hitting/i] },
  { domain: 'perception', patterns: [/auditory halluc/i, /visual halluc/i, /hearing voices/i, /seeing things/i, /ah\/vh/i, /hallucinations?/i, /internally preoccupied/i, /laughing to self/i, /responding to internal stimuli/i, /staring intermittently/i, /look(?:ing)? toward the corner/i] },
  { domain: 'cognition', patterns: [/alert and oriented/i, /oriented x/i, /orientation/i, /attention/i, /memory/i, /concentration/i] },
  { domain: 'insight', patterns: [/insight/i] },
  { domain: 'judgment', patterns: [/judgment/i, /judgement/i] },
];

function isPsychNote(noteType: string) {
  return /psych|psychiat|therapy|behavioral health/i.test(noteType);
}

function splitSentences(text: string) {
  return text
    .split(/\n+/)
    .flatMap((line) => line.split(/(?<=[.!?])\s+/))
    .map((line) => line.trim())
    .filter(Boolean);
}

function hasHedge(text: string) {
  return /(appears?|seems?|may|might|possibly|reports?|states?)/i.test(text);
}

function isHistorical(text: string) {
  return /(yesterday|last week|last month|weeks ago|months ago|previously|historically|overnight)/i.test(text);
}

function patientDeniesPerception(text: string) {
  return /(denies ah\/vh|denies hallucinations|not hearing voices|am not hearing voices|don['’]t think i['’]m hearing|no hallucinations)/i.test(text);
}

function observationRaisesPerceptionConcern(text: string) {
  return /(internally preoccupied|laughing to self|responding to internal stimuli|staring intermittently|look(?:ing)? toward the corner)/i.test(text);
}

function sourceLabel(source: EvidenceSource) {
  switch (source) {
    case 'clinicianNotes':
      return 'clinician notes';
    case 'intakeCollateral':
      return 'collateral';
    case 'patientTranscript':
      return 'transcript';
    case 'objectiveData':
      return 'objective/staff data';
    default:
      return source;
  }
}

export function summarizeMseSupport(input: { noteType: string; sourceSections?: SourceSections | null; sourceInput: string }): MseSupportSummary | null {
  if (!isPsychNote(input.noteType)) {
    return null;
  }

  const sections = input.sourceSections;
  const buckets: Array<{ source: EvidenceSource; text: string; attributedTo: MseEvidenceItem['attributedTo'] }> = [
    { source: 'clinicianNotes', text: sections?.clinicianNotes || '', attributedTo: 'clinician' },
    { source: 'intakeCollateral', text: sections?.intakeCollateral || '', attributedTo: 'collateral' },
    { source: 'patientTranscript', text: sections?.patientTranscript || '', attributedTo: 'patient' },
    { source: 'objectiveData', text: sections?.objectiveData || '', attributedTo: 'objective' },
  ];

  const evidence: MseEvidenceItem[] = [];
  let perceptionDeniedByPatient = false;
  let perceptionConcernObserved = false;

  for (const bucket of buckets) {
    for (const sentence of splitSentences(bucket.text)) {
      if (bucket.attributedTo === 'patient' && patientDeniesPerception(sentence)) {
        perceptionDeniedByPatient = true;
      }
      if ((bucket.attributedTo === 'clinician' || bucket.attributedTo === 'objective' || bucket.attributedTo === 'collateral') && observationRaisesPerceptionConcern(sentence)) {
        perceptionConcernObserved = true;
      }

      for (const entry of DOMAIN_PATTERNS) {
        if (entry.patterns.some((pattern) => pattern.test(sentence))) {
          evidence.push({
            domain: entry.domain,
            text: sentence,
            source: bucket.source,
            attributedTo: bucket.attributedTo,
            hedged: hasHedge(sentence),
            historical: isHistorical(sentence),
            conflictsWithPatientDenial: entry.domain === 'perception' ? perceptionDeniedByPatient && observationRaisesPerceptionConcern(sentence) : false,
          });
        }
      }
    }
  }

  const supportedDomains = Array.from(new Set(evidence.map((item) => item.domain)));
  const conflictingDomains = Array.from(new Set([
    ...evidence.filter((item) => item.conflictsWithPatientDenial).map((item) => item.domain),
    ...(perceptionDeniedByPatient && perceptionConcernObserved ? ['perception' as const] : []),
  ]));
  const missingDomains = ALL_DOMAINS.filter((domain) => !supportedDomains.includes(domain));
  const limited = supportedDomains.length <= 3;

  const guidanceLines: string[] = [
    'Mental Status / Observations section is required for this psych note.',
  ];

  if (!supportedDomains.length) {
    guidanceLines.push('The provided source does not support specific MSE domains. Output a clearly limited MSE section rather than omitting it or inventing normal findings.');
  } else {
    guidanceLines.push(`Supported MSE domains from source: ${supportedDomains.join(', ')}.`);
  }

  if (limited) {
    guidanceLines.push('MSE support is limited. Write a limited MSE using only the supported observations and explicitly note that additional MSE details were not documented in the provided source.');
  }

  if (conflictingDomains.length) {
    guidanceLines.push(`Conflicting MSE domains: ${conflictingDomains.join(', ')}. Preserve patient denial and conflicting observation side by side without resolving the conflict.`);
  }

  const evidencePreview = evidence
    .slice(0, 8)
    .map((item) => `- ${item.domain} (${sourceLabel(item.source)}, ${item.attributedTo}${item.hedged ? ', hedged' : ''}${item.historical ? ', historical' : ''}): ${item.text}`);

  if (evidencePreview.length) {
    guidanceLines.push('Candidate MSE evidence from source:');
    guidanceLines.push(...evidencePreview);
  }

  if (!supportedDomains.length) {
    guidanceLines.push('If needed, acceptable limited-language example: "Mental Status / Observations: Limited MSE information available in the provided source beyond the documented interview content."');
  }

  return {
    required: true,
    limited,
    supportedDomains,
    missingDomains,
    conflictingDomains,
    evidence,
    guidanceLines,
    suggestedFlag: !supportedDomains.length
      ? 'MSE not documented beyond limited interview content.'
      : limited
        ? 'MSE supported only in limited domains; review psych note completeness.'
        : undefined,
  };
}
