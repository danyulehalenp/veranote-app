export type Contradiction = {
  label: string;
  detail: string;
  severity: 'low' | 'moderate' | 'high';
};

export type ContradictionAnalysis = {
  contradictions: Contradiction[];
  severityLevel: 'none' | 'low' | 'moderate' | 'high';
};

type ContradictionRule = {
  label: string;
  severity: Contradiction['severity'];
  left: RegExp[];
  right: RegExp[];
  detail: string;
};

const CONTRADICTION_RULES: ContradictionRule[] = [
  {
    label: 'Suicide denial conflicts with plan',
    severity: 'high',
    left: [/\b(denies si|no si|not suicidal|denies suicidal ideation)\b/i],
    right: [/\b(plan to overdose|suicide plan|intent to die|has a plan)\b/i],
    detail: 'The source includes suicide-denial language alongside plan or intent language. Preserve both and flag the conflict.',
  },
  {
    label: 'Calm language conflicts with agitation',
    severity: 'moderate',
    left: [/\b(calm|cooperative|pleasant)\b/i],
    right: [/\b(agitated|combative|restless|pacing|assaultive)\b/i],
    detail: 'Calm or cooperative wording appears alongside agitation or aggression. Do not silently resolve the contradiction.',
  },
  {
    label: 'Linear thought conflicts with disorganization',
    severity: 'moderate',
    left: [/\b(linear|goal directed|organized thought process)\b/i],
    right: [/\b(disorganized speech|tangential|circumstantial|flight of ideas|loose associations)\b/i],
    detail: 'Organized thought-process wording appears alongside disorganized or tangential language. Keep both visible if both are documented.',
  },
  {
    label: 'No hallucinations conflicts with observed internal preoccupation',
    severity: 'high',
    left: [/\b(no hallucinations|denies hallucinations|denies ah\/vh|denies avh|denies ah|denies vh|not hearing voices|denies hearing voices)\b/i],
    right: [/\b(responding to internal stimuli|internally preoccupied|appears internally preoccupied|laughing to self|staring at unseen stimuli|talking to unseen others)\b/i],
    detail: 'The source includes a reported denial of hallucinations alongside observed internal-preoccupation language. Preserve the reported denial and the observed behavior without resolving the conflict.',
  },
  {
    label: 'Perceptual denial conflicts with psychotic-symptom observation',
    severity: 'high',
    left: [/\b(no hallucinations|denies hallucinations|denies ah\/vh|denies avh|denies ah|denies vh|not hearing voices|denies hearing voices|no psychotic symptoms)\b/i],
    right: [/\b(auditory hallucinations|visual hallucinations|hearing voices|hears voices|seeing things|command hallucinations|psychotic symptoms observed)\b/i],
    detail: 'The source includes a reported denial of perceptual disturbance alongside other language describing perceptual symptoms. Keep the reported and observed material separate and unresolved.',
  },
];

function highestSeverity(contradictions: Contradiction[]): ContradictionAnalysis['severityLevel'] {
  if (contradictions.some((item) => item.severity === 'high')) {
    return 'high';
  }
  if (contradictions.some((item) => item.severity === 'moderate')) {
    return 'moderate';
  }
  if (contradictions.length) {
    return 'low';
  }
  return 'none';
}

export function detectContradictions(inputText: string): ContradictionAnalysis {
  const contradictions = CONTRADICTION_RULES
    .filter((rule) => rule.left.some((pattern) => pattern.test(inputText)) && rule.right.some((pattern) => pattern.test(inputText)))
    .map((rule) => ({
      label: rule.label,
      detail: rule.detail,
      severity: rule.severity,
    }));

  return {
    contradictions,
    severityLevel: highestSeverity(contradictions),
  };
}
