import { evaluatePostNoteCptRecommendations } from '@/lib/veranote/defensibility/cpt-support';
import type { CptRecommendationStrength, PostNoteCptRecommendationAssessment } from '@/lib/veranote/defensibility/defensibility-types';
import type { EncounterSupport } from '@/types/session';

type ExpectedCandidate = {
  family: string;
  strength?: CptRecommendationStrength;
  candidateCode?: string;
};

type ForbiddenCandidate = {
  family: string;
};

export type PostNoteCptRegressionCase = {
  id: string;
  title: string;
  noteType: string;
  completedNoteText: string;
  encounterSupport?: EncounterSupport;
  expectedCandidates: ExpectedCandidate[];
  forbiddenCandidates?: ForbiddenCandidate[];
  requiredText: RegExp[];
  forbiddenText: RegExp[];
};

export type PostNoteCptRegressionCaseResult = {
  id: string;
  title: string;
  passed: boolean;
  missing: string[];
  forbiddenHits: string[];
  candidateFamilies: string[];
  summary: string;
};

export type PostNoteCptRegressionReport = {
  total: number;
  passed: number;
  failed: number;
  cases: PostNoteCptRegressionCaseResult[];
};

export const postNoteCptRegressionCases: PostNoteCptRegressionCase[] = [
  {
    id: 'outpatient-med-management-with-time',
    title: 'Outpatient medication follow-up suggests E/M family without psychotherapy add-on',
    noteType: 'Outpatient Psych Follow-Up',
    completedNoteText: [
      'Interval update: anxiety worsened with avoidance of stores.',
      'Medication adherence, side effects, and dose adjustment reviewed.',
      'Safety: patient denies suicidal and homicidal ideation today.',
      'Total time: 32 minutes.',
    ].join(' '),
    expectedCandidates: [
      { family: 'Office / outpatient E/M family', strength: 'stronger-documentation-support', candidateCode: '99212-99215' },
    ],
    forbiddenCandidates: [
      { family: 'Psychotherapy add-on with E/M family' },
      { family: 'Psychotherapy-only family' },
    ],
    requiredText: [/possible CPT-support candidate/i, /not definitive billing recommendations/i],
    forbiddenText: [/bill this code/i, /guaranteed/i, /meets criteria for/i],
  },
  {
    id: 'outpatient-med-plus-psychotherapy-addon',
    title: 'Medication management plus separately documented psychotherapy suggests add-on review',
    noteType: 'Outpatient Psych Follow-Up',
    completedNoteText: [
      'Medication adherence and nausea side effects reviewed.',
      'Dose adjustment options discussed.',
      '20 minutes of CBT-oriented psychotherapy focused on reframing anxious avoidance and exposure planning.',
      'Follow-up plan reviewed.',
    ].join(' '),
    encounterSupport: {
      totalMinutes: '40',
      psychotherapyMinutes: '20',
    },
    expectedCandidates: [
      { family: 'Office / outpatient E/M family', candidateCode: '99212-99215' },
      { family: 'Psychotherapy add-on with E/M family', strength: 'stronger-documentation-support', candidateCode: '90833' },
    ],
    requiredText: [/Psychotherapy minutes documented/i, /not definitive billing recommendations/i],
    forbiddenText: [/automatic/i, /guaranteed/i],
  },
  {
    id: 'therapy-only-with-minutes',
    title: 'Therapy-only note suggests psychotherapy-only family and no E/M family',
    noteType: 'Therapy Progress Note',
    completedNoteText: [
      'Therapy session focused on grief triggers, cognitive restructuring, and coping skills.',
      'Client practiced grounding and identified homework.',
      'Psychotherapy time: 53 minutes.',
    ].join(' '),
    expectedCandidates: [
      { family: 'Psychotherapy-only family', strength: 'stronger-documentation-support', candidateCode: '90834' },
    ],
    forbiddenCandidates: [
      { family: 'Office / outpatient E/M family' },
      { family: 'Psychotherapy add-on with E/M family' },
    ],
    requiredText: [/Psychotherapy time appears documented/i, /not definitive billing recommendations/i],
    forbiddenText: [/medication-management/i, /bill this code/i],
  },
  {
    id: 'diagnostic-eval-with-medical-services',
    title: 'Initial psychiatric evaluation with medication services requires 90791 versus 90792 review',
    noteType: 'Outpatient Psychiatric Evaluation',
    completedNoteText: [
      'Chief complaint and psychiatric history reviewed during initial evaluation.',
      'Past psychiatric history, diagnostic impression, medication list, allergies, and current medication risks reviewed.',
      'Medication options and prescribing considerations were discussed but final code selection is not part of the clinical note.',
    ].join(' '),
    expectedCandidates: [
      { family: 'Psychiatric diagnostic evaluation family', strength: 'possible-review', candidateCode: '90792' },
    ],
    requiredText: [/90791 versus 90792/i, /current CPT/i],
    forbiddenText: [/must bill 90792/i, /guaranteed/i],
  },
  {
    id: 'crisis-risk-without-crisis-timing',
    title: 'Risk language without crisis timing does not become crisis psychotherapy support',
    noteType: 'Psychiatric Crisis Note',
    completedNoteText: 'Patient endorsed suicidal ideation. Safety plan discussed and follow-up arranged. No crisis psychotherapy timing documented.',
    expectedCandidates: [
      { family: 'Psychotherapy for crisis family', strength: 'insufficient-support', candidateCode: '90839' },
    ],
    requiredText: [/Crisis timing is not clearly visible/i, /Urgency or risk language alone/i],
    forbiddenText: [/stronger-documentation-support/i, /guaranteed/i],
  },
  {
    id: 'crisis-with-timing',
    title: 'Crisis intervention with timing remains a review candidate, not a final assignment',
    noteType: 'Psychiatric Crisis Note',
    completedNoteText: [
      'Crisis intervention addressed acute suicidal ideation and de-escalation.',
      'Safety planning and means-restriction review completed.',
      'Crisis psychotherapy time: 62 minutes.',
    ].join(' '),
    expectedCandidates: [
      { family: 'Psychotherapy for crisis family', strength: 'possible-review', candidateCode: '90839' },
    ],
    requiredText: [/Crisis timing appears visible/i, /not definitive billing recommendations/i],
    forbiddenText: [/guaranteed/i, /bill this code/i],
  },
  {
    id: 'telehealth-missing-location-and-consent',
    title: 'Telehealth note with missing consent/location shows modifier review gaps',
    noteType: 'Outpatient Psych Telehealth Follow-Up',
    completedNoteText: 'Telehealth medication follow-up completed by video. Medication adherence and side effects reviewed.',
    expectedCandidates: [
      { family: 'Office / outpatient E/M family', candidateCode: '99212-99215' },
      { family: 'Telehealth billing/modifier review', strength: 'insufficient-support' },
    ],
    requiredText: [/Telehealth consent is not clearly documented/i, /Patient location is not clearly documented/i],
    forbiddenText: [/modifier is confirmed/i, /place-of-service confirmed/i],
  },
  {
    id: 'misspelled-therapy-without-minutes',
    title: 'Misspelled psychotherapy content is detected while minutes remain required',
    noteType: 'Therapy Progress Note',
    completedNoteText: 'Psycotherpay visit focused on coping skills and reframing grief triggers. No minutes listed.',
    expectedCandidates: [
      { family: 'Psychotherapy-only family', strength: 'possible-review' },
    ],
    requiredText: [/Psychotherapy minutes should be documented/i, /not definitive billing recommendations/i],
    forbiddenText: [/stronger-documentation-support/i, /bill this code/i],
  },
  {
    id: 'interactive-complexity-review',
    title: 'Interactive complexity remains add-on review with reason support',
    noteType: 'Outpatient Psych Follow-Up',
    completedNoteText: 'Medication follow-up with caregiver conflict and disruptive communication requiring repeated redirection.',
    encounterSupport: {
      interactiveComplexity: true,
      interactiveComplexityReason: 'Caregiver conflict and disruptive communication affected the encounter.',
    },
    expectedCandidates: [
      { family: 'Office / outpatient E/M family' },
      { family: 'Interactive complexity add-on review', strength: 'possible-review', candidateCode: '90785' },
    ],
    requiredText: [/Interactive complexity/i, /Treat this as a coding-review candidate/i],
    forbiddenText: [/automatically pair/i, /guaranteed/i],
  },
  {
    id: 'thin-completed-note-no-family-forcing',
    title: 'Thin completed note does not force a CPT-support family',
    noteType: 'Outpatient Psych Follow-Up',
    completedNoteText: 'Follow-up completed. Patient doing okay.',
    expectedCandidates: [],
    forbiddenCandidates: [
      { family: 'Office / outpatient E/M family' },
      { family: 'Psychotherapy add-on with E/M family' },
      { family: 'Psychotherapy-only family' },
      { family: 'Psychotherapy for crisis family' },
      { family: 'Interactive complexity add-on review' },
    ],
    requiredText: [/too thin for meaningful CPT-support candidates/i, /Encounter family is not clear/i],
    forbiddenText: [/stronger-documentation-support/i, /bill this code/i, /guaranteed/i],
  },
];

function stringifyAssessment(assessment: PostNoteCptRecommendationAssessment) {
  return JSON.stringify(assessment);
}

export function evaluatePostNoteCptRegressionCase(
  item: PostNoteCptRegressionCase,
): PostNoteCptRegressionCaseResult {
  const assessment = evaluatePostNoteCptRecommendations({
    noteType: item.noteType,
    completedNoteText: item.completedNoteText,
    encounterSupport: item.encounterSupport,
  });
  const assessmentText = stringifyAssessment(assessment);
  const missing: string[] = [];
  const forbiddenHits: string[] = [];

  for (const expected of item.expectedCandidates) {
    const candidate = assessment.candidates.find((entry) => entry.family === expected.family);
    if (!candidate) {
      missing.push(`missing candidate family: ${expected.family}`);
      continue;
    }

    if (expected.strength && candidate.strength !== expected.strength) {
      missing.push(`candidate ${expected.family} strength ${candidate.strength} did not match ${expected.strength}`);
    }

    if (expected.candidateCode && !candidate.candidateCodes.includes(expected.candidateCode)) {
      missing.push(`candidate ${expected.family} missing code family hint ${expected.candidateCode}`);
    }
  }

  for (const forbidden of item.forbiddenCandidates || []) {
    if (assessment.candidates.some((entry) => entry.family === forbidden.family)) {
      forbiddenHits.push(`forbidden candidate family: ${forbidden.family}`);
    }
  }

  for (const required of item.requiredText) {
    if (!required.test(assessmentText)) {
      missing.push(`missing text: ${required}`);
    }
  }

  for (const forbidden of item.forbiddenText) {
    if (forbidden.test(assessmentText)) {
      forbiddenHits.push(`forbidden text: ${forbidden}`);
    }
  }

  if (!/not definitive billing recommendations/i.test(assessment.guardrails.join(' '))) {
    missing.push('global guardrail missing not-definitive language');
  }

  return {
    id: item.id,
    title: item.title,
    passed: missing.length === 0 && forbiddenHits.length === 0,
    missing,
    forbiddenHits,
    candidateFamilies: assessment.candidates.map((candidate) => `${candidate.family}:${candidate.strength}`),
    summary: assessment.summary,
  };
}

export function runPostNoteCptRegression(): PostNoteCptRegressionReport {
  const cases = postNoteCptRegressionCases.map(evaluatePostNoteCptRegressionCase);
  const failed = cases.filter((item) => !item.passed).length;

  return {
    total: cases.length,
    passed: cases.length - failed,
    failed,
    cases,
  };
}
