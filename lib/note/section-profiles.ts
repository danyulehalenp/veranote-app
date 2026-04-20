export type NoteSectionKey =
  | 'chiefConcern'
  | 'intervalUpdate'
  | 'symptomReview'
  | 'medications'
  | 'mentalStatus'
  | 'insightJudgment'
  | 'safetyRisk'
  | 'assessment'
  | 'plan'
  | 'psychHistory'
  | 'substanceHistory'
  | 'priorTreatment'
  | 'socialHistory'
  | 'familyHistory'
  | 'developmentalEducationalHistory'
  | 'traumaHistory'
  | 'legalHistory'
  | 'constitutionalReview'
  | 'musculoskeletalExam'
  | 'strengthsLimitations'
  | 'diagnosis'
  | 'medicalDiagnosis'
  | 'proposedDischarge'
  | 'hospitalizationJustification'
  | 'attestation'
  | 'clinicalStatusComplexity';

export type OutputScope = 'hpi-only' | 'selected-sections' | 'full-note';

export type NoteProfile = {
  id: string;
  label: string;
  noteTypeMatches: RegExp[];
  defaultScope: OutputScope;
  availableSections: NoteSectionKey[];
  defaultSectionsByScope: Record<OutputScope, NoteSectionKey[]>;
  requiresStandaloneMseByScope: Partial<Record<OutputScope, boolean>>;
};

export const SECTION_LABELS: Record<NoteSectionKey, string> = {
  chiefConcern: 'Chief Complaint / Chief Concern',
  intervalUpdate: 'Interval Update / HPI',
  symptomReview: 'Symptom Review',
  medications: 'Medications / Adherence / Side Effects',
  mentalStatus: 'Mental Status / Observations',
  insightJudgment: 'Insight / Judgment',
  safetyRisk: 'Safety / Risk',
  assessment: 'Assessment',
  plan: 'Plan',
  psychHistory: 'Psychiatric History',
  substanceHistory: 'Substance History',
  priorTreatment: 'Prior Treatment',
  socialHistory: 'Social History',
  familyHistory: 'Family Psychiatric / Relevant Family History',
  developmentalEducationalHistory: 'Developmental / Educational History',
  traumaHistory: 'Trauma / Abuse History',
  legalHistory: 'Legal History',
  constitutionalReview: 'Constitutional Review',
  musculoskeletalExam: 'Musculoskeletal Exam',
  strengthsLimitations: 'Patient Strengths and Limitations',
  diagnosis: 'Psychiatric Diagnosis',
  medicalDiagnosis: 'Medical Diagnosis / Medical Conditions',
  proposedDischarge: 'Plan / Proposed Discharge',
  hospitalizationJustification: 'Justification of Hospitalization',
  attestation: 'Attestation',
  clinicalStatusComplexity: 'Clinical Status / Complexity',
};

export const NOTE_PROFILES: NoteProfile[] = [
  {
    id: 'psychiatric-crisis-note',
    label: 'Psychiatric Crisis Note',
    noteTypeMatches: [/psychiatric crisis/i, /psych crisis/i],
    defaultScope: 'full-note',
    availableSections: [
      'chiefConcern',
      'intervalUpdate',
      'mentalStatus',
      'safetyRisk',
      'assessment',
      'plan',
      'clinicalStatusComplexity',
    ],
    defaultSectionsByScope: {
      'hpi-only': ['intervalUpdate'],
      'selected-sections': ['intervalUpdate', 'safetyRisk', 'assessment', 'plan'],
      'full-note': ['chiefConcern', 'intervalUpdate', 'mentalStatus', 'safetyRisk', 'assessment', 'plan', 'clinicalStatusComplexity'],
    },
    requiresStandaloneMseByScope: {
      'hpi-only': false,
      'selected-sections': false,
      'full-note': true,
    },
  },
  {
    id: 'psychiatry-follow-up',
    label: 'Psychiatry Follow-Up',
    noteTypeMatches: [
      /psychiatry follow-up/i,
      /psychiatry follow up/i,
      /psych follow-up/i,
      /outpatient psych follow-up/i,
    ],
    defaultScope: 'full-note',
    availableSections: [
      'chiefConcern',
      'intervalUpdate',
      'symptomReview',
      'medications',
      'mentalStatus',
      'safetyRisk',
      'assessment',
      'plan',
    ],
    defaultSectionsByScope: {
      'hpi-only': ['intervalUpdate'],
      'selected-sections': ['intervalUpdate', 'assessment', 'plan'],
      'full-note': ['chiefConcern', 'symptomReview', 'medications', 'mentalStatus', 'safetyRisk', 'assessment', 'plan'],
    },
    requiresStandaloneMseByScope: {
      'hpi-only': false,
      'selected-sections': false,
      'full-note': true,
    },
  },
  {
    id: 'outpatient-psych-telehealth-follow-up',
    label: 'Outpatient Psych Telehealth Follow-Up',
    noteTypeMatches: [/outpatient psych telehealth follow-up/i, /telehealth psych follow-up/i],
    defaultScope: 'full-note',
    availableSections: [
      'chiefConcern',
      'intervalUpdate',
      'symptomReview',
      'medications',
      'mentalStatus',
      'safetyRisk',
      'assessment',
      'plan',
    ],
    defaultSectionsByScope: {
      'hpi-only': ['intervalUpdate'],
      'selected-sections': ['intervalUpdate', 'assessment', 'plan'],
      'full-note': ['chiefConcern', 'intervalUpdate', 'symptomReview', 'medications', 'mentalStatus', 'safetyRisk', 'assessment', 'plan'],
    },
    requiresStandaloneMseByScope: {
      'hpi-only': false,
      'selected-sections': false,
      'full-note': true,
    },
  },
  {
    id: 'inpatient-psych-progress',
    label: 'Inpatient Psych Progress Note',
    noteTypeMatches: [/inpatient psych progress/i],
    defaultScope: 'full-note',
    availableSections: [
      'intervalUpdate',
      'symptomReview',
      'medications',
      'mentalStatus',
      'insightJudgment',
      'safetyRisk',
      'assessment',
      'plan',
      'clinicalStatusComplexity',
      'proposedDischarge',
    ],
    defaultSectionsByScope: {
      'hpi-only': ['intervalUpdate'],
      'selected-sections': ['intervalUpdate', 'assessment', 'plan'],
      'full-note': ['intervalUpdate', 'symptomReview', 'medications', 'mentalStatus', 'insightJudgment', 'safetyRisk', 'assessment', 'plan'],
    },
    requiresStandaloneMseByScope: {
      'hpi-only': false,
      'selected-sections': false,
      'full-note': true,
    },
  },
  {
    id: 'outpatient-psych-evaluation',
    label: 'Outpatient Psychiatric Evaluation',
    noteTypeMatches: [/outpatient psychiatric evaluation/i, /outpatient psych evaluation/i],
    defaultScope: 'full-note',
    availableSections: [
      'chiefConcern',
      'psychHistory',
      'substanceHistory',
      'priorTreatment',
      'socialHistory',
      'familyHistory',
      'traumaHistory',
      'legalHistory',
      'medications',
      'mentalStatus',
      'strengthsLimitations',
      'diagnosis',
      'medicalDiagnosis',
      'safetyRisk',
      'assessment',
      'plan',
      'clinicalStatusComplexity',
    ],
    defaultSectionsByScope: {
      'hpi-only': ['chiefConcern'],
      'selected-sections': ['chiefConcern', 'mentalStatus', 'assessment', 'plan'],
      'full-note': [
        'chiefConcern',
        'psychHistory',
        'substanceHistory',
        'priorTreatment',
        'socialHistory',
        'familyHistory',
        'traumaHistory',
        'legalHistory',
        'medications',
        'mentalStatus',
        'strengthsLimitations',
        'diagnosis',
        'medicalDiagnosis',
        'safetyRisk',
        'assessment',
        'plan',
        'clinicalStatusComplexity',
      ],
    },
    requiresStandaloneMseByScope: {
      'hpi-only': false,
      'selected-sections': false,
      'full-note': true,
    },
  },
  {
    id: 'psych-initial-adult-eval',
    label: 'Psychiatric Initial Adult Eval / Admission',
    noteTypeMatches: [/initial adult eval/i, /adult evaluation/i],
    defaultScope: 'full-note',
    availableSections: [
      'chiefConcern',
      'psychHistory',
      'substanceHistory',
      'priorTreatment',
      'socialHistory',
      'familyHistory',
      'traumaHistory',
      'legalHistory',
      'medications',
      'constitutionalReview',
      'musculoskeletalExam',
      'mentalStatus',
      'strengthsLimitations',
      'diagnosis',
      'medicalDiagnosis',
      'safetyRisk',
      'plan',
      'proposedDischarge',
      'hospitalizationJustification',
      'attestation',
      'clinicalStatusComplexity',
    ],
    defaultSectionsByScope: {
      'hpi-only': ['chiefConcern'],
      'selected-sections': ['chiefConcern', 'mentalStatus', 'assessment', 'plan'],
      'full-note': [
        'chiefConcern',
        'psychHistory',
        'substanceHistory',
        'priorTreatment',
        'socialHistory',
        'familyHistory',
        'traumaHistory',
        'legalHistory',
        'medications',
        'constitutionalReview',
        'musculoskeletalExam',
        'mentalStatus',
        'strengthsLimitations',
        'diagnosis',
        'medicalDiagnosis',
        'safetyRisk',
        'plan',
        'proposedDischarge',
        'hospitalizationJustification',
        'attestation',
        'clinicalStatusComplexity',
      ],
    },
    requiresStandaloneMseByScope: {
      'hpi-only': false,
      'selected-sections': false,
      'full-note': true,
    },
  },
  {
    id: 'psych-initial-adolescent-eval',
    label: 'Psychiatric Initial Adolescent Eval / Admission',
    noteTypeMatches: [/initial adolescent eval/i, /child\/adolescent/i, /adolescent evaluation/i],
    defaultScope: 'full-note',
    availableSections: [
      'chiefConcern',
      'psychHistory',
      'substanceHistory',
      'priorTreatment',
      'socialHistory',
      'familyHistory',
      'developmentalEducationalHistory',
      'traumaHistory',
      'legalHistory',
      'medications',
      'constitutionalReview',
      'musculoskeletalExam',
      'mentalStatus',
      'strengthsLimitations',
      'diagnosis',
      'medicalDiagnosis',
      'safetyRisk',
      'plan',
      'proposedDischarge',
      'hospitalizationJustification',
      'attestation',
      'clinicalStatusComplexity',
    ],
    defaultSectionsByScope: {
      'hpi-only': ['chiefConcern'],
      'selected-sections': ['chiefConcern', 'mentalStatus', 'assessment', 'plan'],
      'full-note': [
        'chiefConcern',
        'psychHistory',
        'substanceHistory',
        'priorTreatment',
        'socialHistory',
        'familyHistory',
        'developmentalEducationalHistory',
        'traumaHistory',
        'legalHistory',
        'medications',
        'constitutionalReview',
        'musculoskeletalExam',
        'mentalStatus',
        'strengthsLimitations',
        'diagnosis',
        'medicalDiagnosis',
        'safetyRisk',
        'plan',
        'proposedDischarge',
        'hospitalizationJustification',
        'attestation',
        'clinicalStatusComplexity',
      ],
    },
    requiresStandaloneMseByScope: {
      'hpi-only': false,
      'selected-sections': false,
      'full-note': true,
    },
  },
];

export function resolveNoteProfile(noteType: string): NoteProfile | null {
  const normalized = noteType.trim();
  return NOTE_PROFILES.find((profile) => profile.noteTypeMatches.some((pattern) => pattern.test(normalized))) ?? null;
}

export function resolveRequestedScope(input?: string | null): OutputScope {
  if (input === 'hpi-only' || input === 'selected-sections' || input === 'full-note') {
    return input;
  }

  return 'full-note';
}

export function planSections(input: { noteType: string; requestedScope?: string | null; requestedSections?: string[] | null }) {
  const profile = resolveNoteProfile(input.noteType);
  const scope = resolveRequestedScope(input.requestedScope);

  if (!profile) {
    return {
      scope,
      profile: null,
      sections: [] as NoteSectionKey[],
      requiresStandaloneMse: false,
    };
  }

  const requestedSections = Array.isArray(input.requestedSections)
    ? input.requestedSections.filter((section): section is NoteSectionKey => profile.availableSections.includes(section as NoteSectionKey))
    : [];

  const sections = scope === 'selected-sections' && requestedSections.length
    ? requestedSections
    : profile.defaultSectionsByScope[scope];

  return {
    scope,
    profile,
    sections,
    requiresStandaloneMse: profile.requiresStandaloneMseByScope[scope] ?? false,
  };
}
