export const OUTPUT_DESTINATIONS = [
  'Generic',
  'WellSky',
  'Tebra/Kareo',
  'SimplePractice',
  'TherapyNotes',
  'Valant',
  'ICANotes',
  'TheraNest',
  'Sessions Health',
  'Epic',
  'Oracle Health/Cerner',
  'athenaOne',
  'eClinicalWorks',
  'AdvancedMD',
  'DrChrono',
  'Netsmart myAvatar',
  'Qualifacts/CareLogic',
  'Credible',
] as const;

export type OutputDestination = (typeof OUTPUT_DESTINATIONS)[number];

export type DestinationBehaviorProfile =
  | 'plain-clinical'
  | 'psych-ehr-safe'
  | 'section-paste'
  | 'strict-template-safe';

export const OUTPUT_NOTE_FOCUSES = [
  'general',
  'inpatient-psych-evaluation',
  'inpatient-psych-follow-up',
  'outpatient-evaluation',
  'outpatient-follow-up',
] as const;

export type OutputNoteFocus = (typeof OUTPUT_NOTE_FOCUSES)[number];

export type OutputFieldTarget = {
  id: string;
  label: string;
  aliases: string[];
  note: string;
};

export type OutputProfile = {
  id: string;
  name: string;
  siteLabel: string;
  destination: OutputDestination;
  noteFocus: OutputNoteFocus;
  asciiSafe: boolean;
  paragraphOnly: boolean;
  wellskyFriendly: boolean;
};

export type StarterOutputProfileSeed = {
  name: string;
  siteLabel: string;
  destination: OutputDestination;
  noteFocus: OutputNoteFocus;
  asciiSafe: boolean;
  paragraphOnly: boolean;
  wellskyFriendly: boolean;
};

type OutputDestinationMeta = {
  label: OutputDestination;
  behavior: DestinationBehaviorProfile;
  summaryLabel: string;
  pasteExpectation: string;
  fieldGuideSummary?: string;
  preserveHeadings: boolean;
  enforceAsciiSafe: boolean;
  preferParagraphOnly: boolean;
  normalizeSpacing: boolean;
  flattenBullets: boolean;
  fieldTargets: OutputFieldTarget[];
};

const GENERAL_MEDICAL_FIELD_TARGETS: OutputFieldTarget[] = [
  {
    id: 'medical-history-hpi',
    label: 'History / HPI',
    aliases: ['chief complaint', 'chief concern', 'hpi', 'subjective', 'interval update', 'history of present illness'],
    note: 'Use for the main clinical story, presenting concern, and interval course.',
  },
  {
    id: 'medical-exam-mse',
    label: 'Exam / MSE',
    aliases: ['objective', 'exam', 'mental status', 'observations', 'vitals', 'insight', 'judgment'],
    note: 'Use for observable findings, vitals, exam anchors, and mental status content.',
  },
  {
    id: 'medical-assessment-diagnosis',
    label: 'Assessment / diagnoses',
    aliases: ['assessment', 'diagnosis', 'clinical impression', 'formulation'],
    note: 'Use for clinical assessment, diagnosis framing, and source-supported interpretation.',
  },
  {
    id: 'medical-plan-orders-followup',
    label: 'Plan / follow-up',
    aliases: ['plan', 'medications', 'orders', 'follow-up', 'safety plan', 'proposed discharge'],
    note: 'Use for medication plan language, safety planning, follow-up, and next steps.',
  },
];

const OUTPATIENT_MEDICAL_FIELD_TARGETS: OutputFieldTarget[] = [
  {
    id: 'outpatient-reason-history',
    label: 'Reason for visit / history',
    aliases: ['chief complaint', 'chief concern', 'hpi', 'subjective', 'interval update'],
    note: 'Use for appointment-linked narrative and patient-reported symptoms.',
  },
  {
    id: 'outpatient-review-exam',
    label: 'Review / exam',
    aliases: ['review of systems', 'ros', 'objective', 'exam', 'mental status', 'observations'],
    note: 'Use for review-of-systems, observable findings, exam, or MSE fields.',
  },
  {
    id: 'outpatient-assessment',
    label: 'Assessment',
    aliases: ['assessment', 'diagnosis', 'clinical status', 'impression'],
    note: 'Use for assessment wording and diagnosis-related meaning.',
  },
  {
    id: 'outpatient-plan',
    label: 'Plan',
    aliases: ['plan', 'medications', 'follow-up', 'instructions'],
    note: 'Use for medication, therapy, labs, referrals, follow-up, and patient instructions.',
  },
];

const BEHAVIORAL_HEALTH_ENTERPRISE_FIELD_TARGETS: OutputFieldTarget[] = [
  {
    id: 'behavioral-health-narrative',
    label: 'Clinical narrative',
    aliases: ['chief complaint', 'chief concern', 'hpi', 'interval update', 'subjective', 'symptom review'],
    note: 'Use for the main behavioral-health narrative or interval update field.',
  },
  {
    id: 'behavioral-health-mse-risk',
    label: 'MSE / risk',
    aliases: ['mental status', 'observations', 'risk assessment', 'safety', 'insight', 'judgment'],
    note: 'Use for mental status, observed behavior, risk, and protective-factor sections.',
  },
  {
    id: 'behavioral-health-assessment',
    label: 'Assessment / formulation',
    aliases: ['assessment', 'diagnosis', 'clinical status', 'formulation', 'response to intervention'],
    note: 'Use for formulation, response to treatment, diagnosis framing, and progress toward goals.',
  },
  {
    id: 'behavioral-health-plan',
    label: 'Plan / interventions',
    aliases: ['plan', 'intervention', 'medications', 'goals', 'service plan', 'proposed discharge'],
    note: 'Use for interventions, medications, service plan updates, goals, and next steps.',
  },
];

const OUTPUT_DESTINATION_META: Record<OutputDestination, OutputDestinationMeta> = {
  Generic: {
    label: 'Generic',
    behavior: 'plain-clinical',
    summaryLabel: 'Flexible destination',
    pasteExpectation: 'Works best for general note editors where standard headings and paragraphs are acceptable.',
    preserveHeadings: true,
    enforceAsciiSafe: false,
    preferParagraphOnly: false,
    normalizeSpacing: false,
    flattenBullets: false,
    fieldTargets: [],
  },
  WellSky: {
    label: 'WellSky',
    behavior: 'strict-template-safe',
    summaryLabel: 'WellSky-safe',
    pasteExpectation: 'Use flatter paragraphs, simpler punctuation, and conservative spacing for more brittle templates.',
    fieldGuideSummary: 'Suggested whole-note or paragraph-first paste targets for stricter behavioral-health templates.',
    preserveHeadings: false,
    enforceAsciiSafe: true,
    preferParagraphOnly: true,
    normalizeSpacing: true,
    flattenBullets: true,
    fieldTargets: [
      {
        id: 'wellsky-summary',
        label: 'Narrative summary',
        aliases: ['opening', 'interval update', 'subjective', 'hpi', 'chief complaint'],
        note: 'Start with the main narrative or HPI-style content if the destination expects one flatter note body.',
      },
      {
        id: 'wellsky-assessment-plan',
        label: 'Assessment / plan',
        aliases: ['assessment', 'plan'],
        note: 'Use for shorter assessment-plan destinations after the narrative is in place.',
      },
    ],
  },
  'Tebra/Kareo': {
    label: 'Tebra/Kareo',
    behavior: 'section-paste',
    summaryLabel: 'Tebra/Kareo ready',
    pasteExpectation: 'Useful when providers paste either the whole note or individual sections into encounter-linked note fields.',
    fieldGuideSummary: 'Suggested paste targets based on Tebra note sections and common psych progress workflows.',
    preserveHeadings: true,
    enforceAsciiSafe: false,
    preferParagraphOnly: false,
    normalizeSpacing: true,
    flattenBullets: true,
    fieldTargets: [
      {
        id: 'tebra-subjective',
        label: 'Subjective / HPI',
        aliases: ['chief complaint', 'chief concern', 'interval update', 'hpi', 'subjective', 'symptom review'],
        note: 'Paste the source-close clinical narrative here first when using SOAP- or psych-progress style templates.',
      },
      {
        id: 'tebra-mental-functional',
        label: 'Mental / Functional',
        aliases: ['mental status', 'observations', 'insight', 'judgment'],
        note: 'Use for MSE-style or mental/functional sections when your template separates them from the main narrative.',
      },
      {
        id: 'tebra-assessment',
        label: 'Assessment',
        aliases: ['assessment', 'clinical status', 'diagnosis'],
        note: 'Use for formulation, diagnoses, and response-to-treatment interpretation.',
      },
      {
        id: 'tebra-plan',
        label: 'Plan',
        aliases: ['plan', 'proposed discharge'],
        note: 'Use for medications, follow-up, safety actions, and next-step planning.',
      },
    ],
  },
  SimplePractice: {
    label: 'SimplePractice',
    behavior: 'psych-ehr-safe',
    summaryLabel: 'SimplePractice ready',
    pasteExpectation: 'Best with clean paragraphs, light headings, and note text that can drop into appointment-linked progress note editors.',
    fieldGuideSummary: 'Suggested paste targets for SOAP/DAP-style progress note templates and appointment-linked notes.',
    preserveHeadings: true,
    enforceAsciiSafe: false,
    preferParagraphOnly: true,
    normalizeSpacing: true,
    flattenBullets: true,
    fieldTargets: [
      {
        id: 'simplepractice-subjective',
        label: 'Subjective / narrative',
        aliases: ['chief complaint', 'chief concern', 'interval update', 'hpi', 'subjective', 'symptom review'],
        note: 'Use for the patient-reported course, concerns, and session narrative.',
      },
      {
        id: 'simplepractice-objective',
        label: 'Objective / MSE',
        aliases: ['mental status', 'observations', 'objective', 'insight', 'judgment'],
        note: 'Use for observable findings and mental status details when the template separates them.',
      },
      {
        id: 'simplepractice-assessment',
        label: 'Assessment',
        aliases: ['assessment', 'diagnosis', 'clinical status'],
        note: 'Use for interpretation, response, and diagnostic framing.',
      },
      {
        id: 'simplepractice-plan',
        label: 'Plan',
        aliases: ['plan', 'proposed discharge'],
        note: 'Use for interventions, medication changes, follow-up, and homework/next steps.',
      },
    ],
  },
  TherapyNotes: {
    label: 'TherapyNotes',
    behavior: 'psych-ehr-safe',
    summaryLabel: 'TherapyNotes ready',
    pasteExpectation: 'Favor paragraph-first note text that can be pasted into structured therapy or med-management note templates.',
    fieldGuideSummary: 'Suggested paste targets based on TherapyNotes SOAP-style and psychiatry progress note structures.',
    preserveHeadings: true,
    enforceAsciiSafe: false,
    preferParagraphOnly: true,
    normalizeSpacing: true,
    flattenBullets: true,
    fieldTargets: [
      {
        id: 'therapynotes-subjective',
        label: 'Subjective',
        aliases: ['chief complaint', 'chief concern', 'interval update', 'hpi', 'subjective', 'symptom review'],
        note: 'Use for patient report, interval history, and therapy/process narrative.',
      },
      {
        id: 'therapynotes-current-mental-status',
        label: 'Current mental status',
        aliases: ['mental status', 'observations', 'insight', 'judgment'],
        note: 'Use when the note template has a dedicated mental status section.',
      },
      {
        id: 'therapynotes-assessment',
        label: 'Assessment / diagnosis',
        aliases: ['assessment', 'diagnosis', 'clinical status'],
        note: 'Use for diagnostic interpretation and clinical meaning.',
      },
      {
        id: 'therapynotes-plan',
        label: 'Plan',
        aliases: ['plan', 'proposed discharge'],
        note: 'Use for treatment steps, follow-up, and medication/therapy next actions.',
      },
    ],
  },
  Valant: {
    label: 'Valant',
    behavior: 'psych-ehr-safe',
    summaryLabel: 'Valant ready',
    pasteExpectation: 'Keep text clean and section-aware for behavioral-health charting fields without relying on rich text behavior.',
    fieldGuideSummary: 'Suggested paste targets for behavioral-health charting fields and structured psych documentation.',
    preserveHeadings: true,
    enforceAsciiSafe: false,
    preferParagraphOnly: true,
    normalizeSpacing: true,
    flattenBullets: true,
    fieldTargets: [
      {
        id: 'valant-history',
        label: 'History / interval',
        aliases: ['chief complaint', 'chief concern', 'interval update', 'hpi', 'subjective', 'symptom review'],
        note: 'Use for the patient story and interval course.',
      },
      {
        id: 'valant-mse',
        label: 'MSE / observations',
        aliases: ['mental status', 'observations', 'insight', 'judgment'],
        note: 'Use for mental status and observed behavior.',
      },
      {
        id: 'valant-assessment',
        label: 'Assessment',
        aliases: ['assessment', 'diagnosis', 'clinical status'],
        note: 'Use for formulation and diagnostic impression.',
      },
      {
        id: 'valant-plan',
        label: 'Plan',
        aliases: ['plan', 'proposed discharge'],
        note: 'Use for medications, therapy plan, follow-up, and next steps.',
      },
    ],
  },
  ICANotes: {
    label: 'ICANotes',
    behavior: 'psych-ehr-safe',
    summaryLabel: 'ICANotes ready',
    pasteExpectation: 'Use flatter note text that can live beside template-driven psych documentation without visual clutter.',
    fieldGuideSummary: 'Suggested paste targets for psychiatry/behavioral-health note sections alongside template-driven charting.',
    preserveHeadings: true,
    enforceAsciiSafe: false,
    preferParagraphOnly: true,
    normalizeSpacing: true,
    flattenBullets: true,
    fieldTargets: [
      {
        id: 'icanotes-narrative',
        label: 'Narrative / interval',
        aliases: ['chief complaint', 'chief concern', 'interval update', 'hpi', 'subjective', 'symptom review'],
        note: 'Use for narrative psych follow-up content when not entering everything point-and-click.',
      },
      {
        id: 'icanotes-mse',
        label: 'MSE',
        aliases: ['mental status', 'observations', 'insight', 'judgment'],
        note: 'Use for mental status or behavioral observations.',
      },
      {
        id: 'icanotes-assessment',
        label: 'Assessment / diagnosis',
        aliases: ['assessment', 'diagnosis', 'clinical status'],
        note: 'Use for assessment-level wording and diagnosis framing.',
      },
      {
        id: 'icanotes-plan',
        label: 'Plan',
        aliases: ['plan', 'proposed discharge'],
        note: 'Use for medications, therapy goals, and next-step treatment planning.',
      },
    ],
  },
  TheraNest: {
    label: 'TheraNest',
    behavior: 'psych-ehr-safe',
    summaryLabel: 'TheraNest ready',
    pasteExpectation: 'Favor clean paragraphs and modest headings for therapy-oriented note editors.',
    fieldGuideSummary: 'Suggested paste targets for SOAP/DAP/BIRP-style therapy note templates.',
    preserveHeadings: true,
    enforceAsciiSafe: false,
    preferParagraphOnly: true,
    normalizeSpacing: true,
    flattenBullets: true,
    fieldTargets: [
      {
        id: 'theranest-data',
        label: 'Data / subjective',
        aliases: ['chief complaint', 'chief concern', 'interval update', 'hpi', 'subjective', 'symptom review'],
        note: 'Use for the session narrative and patient-reported content.',
      },
      {
        id: 'theranest-observations',
        label: 'Objective / observations',
        aliases: ['mental status', 'observations', 'insight', 'judgment'],
        note: 'Use for objective observations or mental status material.',
      },
      {
        id: 'theranest-assessment',
        label: 'Assessment',
        aliases: ['assessment', 'diagnosis', 'clinical status'],
        note: 'Use for interpretation and clinical response.',
      },
      {
        id: 'theranest-plan',
        label: 'Plan',
        aliases: ['plan', 'proposed discharge'],
        note: 'Use for interventions, homework, safety planning, and follow-up.',
      },
    ],
  },
  'Sessions Health': {
    label: 'Sessions Health',
    behavior: 'psych-ehr-safe',
    summaryLabel: 'Sessions Health ready',
    pasteExpectation: 'Best with clean sectioned text and normalized spacing for appointment-linked behavioral-health notes.',
    fieldGuideSummary: 'Suggested paste targets for SOAP/DAP/BIRP/Narrative note templates in appointment-linked workflows.',
    preserveHeadings: true,
    enforceAsciiSafe: false,
    preferParagraphOnly: true,
    normalizeSpacing: true,
    flattenBullets: true,
    fieldTargets: [
      {
        id: 'sessions-summary',
        label: 'Summary / subjective',
        aliases: ['chief complaint', 'chief concern', 'interval update', 'hpi', 'subjective', 'symptom review'],
        note: 'Use for summary or subjective sections in AI-enabled or standard note templates.',
      },
      {
        id: 'sessions-observations',
        label: 'Objective / MSE',
        aliases: ['mental status', 'observations', 'insight', 'judgment'],
        note: 'Use for objective findings and mental status details.',
      },
      {
        id: 'sessions-assessment',
        label: 'Assessment',
        aliases: ['assessment', 'diagnosis', 'clinical status'],
        note: 'Use for interpretation, progress, and diagnosis-related meaning.',
      },
      {
        id: 'sessions-plan',
        label: 'Plan',
        aliases: ['plan', 'proposed discharge'],
        note: 'Use for interventions, goals, medication changes, and follow-up.',
      },
    ],
  },
  Epic: {
    label: 'Epic',
    behavior: 'section-paste',
    summaryLabel: 'Epic-ready',
    pasteExpectation: 'Best with clean section headings and field-level copy targets for encounter note templates.',
    fieldGuideSummary: 'Suggested paste targets for common encounter note sections; direct Epic writeback remains future connector work.',
    preserveHeadings: true,
    enforceAsciiSafe: false,
    preferParagraphOnly: false,
    normalizeSpacing: true,
    flattenBullets: true,
    fieldTargets: GENERAL_MEDICAL_FIELD_TARGETS,
  },
  'Oracle Health/Cerner': {
    label: 'Oracle Health/Cerner',
    behavior: 'section-paste',
    summaryLabel: 'Oracle Health/Cerner-ready',
    pasteExpectation: 'Use conservative section text that can be pasted into structured hospital or clinic note sections.',
    fieldGuideSummary: 'Suggested paste targets for common Cerner/Oracle Health note sections; direct writeback is not enabled.',
    preserveHeadings: true,
    enforceAsciiSafe: false,
    preferParagraphOnly: false,
    normalizeSpacing: true,
    flattenBullets: true,
    fieldTargets: GENERAL_MEDICAL_FIELD_TARGETS,
  },
  athenaOne: {
    label: 'athenaOne',
    behavior: 'section-paste',
    summaryLabel: 'athenaOne-ready',
    pasteExpectation: 'Use appointment-linked, section-aware text for outpatient encounter note fields.',
    fieldGuideSummary: 'Suggested paste targets for outpatient visit sections without claiming certified athenaOne insertion.',
    preserveHeadings: true,
    enforceAsciiSafe: false,
    preferParagraphOnly: true,
    normalizeSpacing: true,
    flattenBullets: true,
    fieldTargets: OUTPATIENT_MEDICAL_FIELD_TARGETS,
  },
  eClinicalWorks: {
    label: 'eClinicalWorks',
    behavior: 'section-paste',
    summaryLabel: 'eClinicalWorks-ready',
    pasteExpectation: 'Use clean outpatient note sections that can be copied into visit documentation fields.',
    fieldGuideSummary: 'Suggested paste targets for outpatient visit documentation; direct eClinicalWorks writeback remains future connector work.',
    preserveHeadings: true,
    enforceAsciiSafe: false,
    preferParagraphOnly: true,
    normalizeSpacing: true,
    flattenBullets: true,
    fieldTargets: OUTPATIENT_MEDICAL_FIELD_TARGETS,
  },
  AdvancedMD: {
    label: 'AdvancedMD',
    behavior: 'section-paste',
    summaryLabel: 'AdvancedMD-ready',
    pasteExpectation: 'Use light headings and clean paragraphs for outpatient behavioral-health or medical note templates.',
    fieldGuideSummary: 'Suggested paste targets for appointment-linked note sections and manual chart entry.',
    preserveHeadings: true,
    enforceAsciiSafe: false,
    preferParagraphOnly: true,
    normalizeSpacing: true,
    flattenBullets: true,
    fieldTargets: OUTPATIENT_MEDICAL_FIELD_TARGETS,
  },
  DrChrono: {
    label: 'DrChrono',
    behavior: 'section-paste',
    summaryLabel: 'DrChrono-ready',
    pasteExpectation: 'Use compact outpatient sections that can be pasted into encounter note templates.',
    fieldGuideSummary: 'Suggested paste targets for outpatient medical and psychiatry note sections.',
    preserveHeadings: true,
    enforceAsciiSafe: false,
    preferParagraphOnly: true,
    normalizeSpacing: true,
    flattenBullets: true,
    fieldTargets: OUTPATIENT_MEDICAL_FIELD_TARGETS,
  },
  'Netsmart myAvatar': {
    label: 'Netsmart myAvatar',
    behavior: 'strict-template-safe',
    summaryLabel: 'Netsmart myAvatar-ready',
    pasteExpectation: 'Favor flatter, source-close behavioral-health text for structured agency or facility templates.',
    fieldGuideSummary: 'Suggested paste targets for behavioral-health enterprise templates; direct writeback is future connector work.',
    preserveHeadings: true,
    enforceAsciiSafe: true,
    preferParagraphOnly: true,
    normalizeSpacing: true,
    flattenBullets: true,
    fieldTargets: BEHAVIORAL_HEALTH_ENTERPRISE_FIELD_TARGETS,
  },
  'Qualifacts/CareLogic': {
    label: 'Qualifacts/CareLogic',
    behavior: 'strict-template-safe',
    summaryLabel: 'Qualifacts/CareLogic-ready',
    pasteExpectation: 'Use conservative behavioral-health sections that can fit structured service-note and progress-note templates.',
    fieldGuideSummary: 'Suggested paste targets for CareLogic-style behavioral-health documentation workflows.',
    preserveHeadings: true,
    enforceAsciiSafe: true,
    preferParagraphOnly: true,
    normalizeSpacing: true,
    flattenBullets: true,
    fieldTargets: BEHAVIORAL_HEALTH_ENTERPRISE_FIELD_TARGETS,
  },
  Credible: {
    label: 'Credible',
    behavior: 'strict-template-safe',
    summaryLabel: 'Credible-ready',
    pasteExpectation: 'Use clean, compact behavioral-health text that can be pasted into service or progress-note forms.',
    fieldGuideSummary: 'Suggested paste targets for behavioral-health service notes and structured progress-note workflows.',
    preserveHeadings: true,
    enforceAsciiSafe: true,
    preferParagraphOnly: true,
    normalizeSpacing: true,
    flattenBullets: true,
    fieldTargets: BEHAVIORAL_HEALTH_ENTERPRISE_FIELD_TARGETS,
  },
};

const NOTE_FOCUS_LABELS: Record<OutputNoteFocus, string> = {
  general: 'General note workflow',
  'inpatient-psych-evaluation': 'Inpatient psych evaluation',
  'inpatient-psych-follow-up': 'Inpatient psych follow-up',
  'outpatient-evaluation': 'Outpatient evaluation',
  'outpatient-follow-up': 'Outpatient follow-up',
};

const TEBRA_NOTE_FOCUS_TARGETS: Partial<Record<OutputNoteFocus, OutputFieldTarget[]>> = {
  'inpatient-psych-evaluation': [
    {
      id: 'tebra-psych-initial-cc-hpi',
      label: 'CC / HPI',
      aliases: ['chief complaint', 'chief concern', 'hpi', 'interval update', 'opening'],
      note: 'For Tebra Psych Initial Visit, start with CC and HPI-style admission narrative.',
    },
    {
      id: 'tebra-psych-initial-history',
      label: 'PsychHx / PsychFHx / PsychSHx',
      aliases: ['psychiatric history', 'psych history', 'prior treatment', 'family psychiatric', 'social history', 'trauma', 'legal history'],
      note: 'Use for psych history, family history, and social history fields when the note type separates them.',
    },
    {
      id: 'tebra-psych-initial-mse-tests',
      label: 'MSE / Tests',
      aliases: ['mental status', 'observations', 'insight', 'judgment', 'objective'],
      note: 'Use for MSE and screening/test sections in Tebra Psych Initial templates.',
    },
    {
      id: 'tebra-psych-initial-impression',
      label: 'Psych Impression / DSM-5 / Assessment',
      aliases: ['assessment', 'diagnosis', 'clinical status', 'psych impression'],
      note: 'Use for formulation, diagnoses, and initial psych impression.',
    },
    {
      id: 'tebra-psych-initial-plan',
      label: 'Plan',
      aliases: ['plan', 'proposed discharge'],
      note: 'Use for medications, follow-up, and treatment planning.',
    },
  ],
  'inpatient-psych-follow-up': [
    {
      id: 'tebra-psych-progress-followup',
      label: 'Psych Symptom / Follow Up',
      aliases: ['interval update', 'symptom review', 'subjective', 'hpi', 'psych symptom', 'psych syndromes'],
      note: 'For Tebra Psych Progress, lead with interval symptoms, response, and follow-up course.',
    },
    {
      id: 'tebra-psych-progress-mse',
      label: 'MSE',
      aliases: ['mental status', 'observations', 'insight', 'judgment'],
      note: 'Use for the dedicated MSE field in Psych Progress templates.',
    },
    {
      id: 'tebra-psych-progress-impression',
      label: 'Psych Impression / DSM-5 / Assessment',
      aliases: ['assessment', 'diagnosis', 'clinical status', 'psych impression'],
      note: 'Use for current diagnostic framing and treatment response interpretation.',
    },
    {
      id: 'tebra-psych-progress-intervention-plan',
      label: 'Psych Intervention / Plan',
      aliases: ['plan', 'psych intervention', 'proposed discharge'],
      note: 'Use for interventions, medication adjustments, and next-step planning.',
    },
  ],
};

const THERAPYNOTES_NOTE_FOCUS_TARGETS: Partial<Record<OutputNoteFocus, OutputFieldTarget[]>> = {
  'outpatient-evaluation': [
    {
      id: 'therapynotes-intake-presenting-problem',
      label: 'Presenting Problem',
      aliases: ['chief complaint', 'chief concern', 'presenting problem', 'opening'],
      note: 'For TherapyNotes Psychiatry Intake, start with the presenting problem and reason for care.',
    },
    {
      id: 'therapynotes-intake-current-mental-status',
      label: 'Current Mental Status',
      aliases: ['mental status', 'observations', 'insight', 'judgment'],
      note: 'Use for the dedicated Current Mental Status section.',
    },
    {
      id: 'therapynotes-intake-risk-assessment',
      label: 'Risk Assessment',
      aliases: ['safety', 'risk', 'risk assessment'],
      note: 'Use for suicide/self-harm/violence risk and protective-factor content.',
    },
    {
      id: 'therapynotes-intake-biopsychosocial',
      label: 'Biopsychosocial Assessment',
      aliases: ['psychiatric history', 'psych history', 'social history', 'family psychiatric', 'trauma', 'legal history', 'substance history', 'prior treatment'],
      note: 'Use for the history-heavy biopsychosocial field set in Psychiatry Intake.',
    },
    {
      id: 'therapynotes-intake-medication-plan-diagnosis',
      label: 'Medication / Diagnosis / Plan',
      aliases: ['medications', 'assessment', 'diagnosis', 'plan'],
      note: 'Use for meds, diagnostic framing, and plan in the psychiatry intake workflow.',
    },
  ],
  'outpatient-follow-up': [
    {
      id: 'therapynotes-progress-subjective',
      label: 'Subjective / session narrative',
      aliases: ['interval update', 'subjective', 'hpi', 'symptom review'],
      note: 'For TherapyNotes Psychiatry Progress, use for interval history and session narrative.',
    },
    {
      id: 'therapynotes-progress-current-mental-status',
      label: 'Current Mental Status',
      aliases: ['mental status', 'observations', 'insight', 'judgment'],
      note: 'Use for the Current Mental Status section.',
    },
    {
      id: 'therapynotes-progress-risk-assessment',
      label: 'Risk Assessment',
      aliases: ['safety', 'risk', 'risk assessment'],
      note: 'Use for updated risk language and protective factors.',
    },
    {
      id: 'therapynotes-progress-assessment-plan',
      label: 'Diagnosis / assessment / plan',
      aliases: ['assessment', 'diagnosis', 'plan', 'clinical status'],
      note: 'Use for diagnosis updates, formulation, and follow-up plan.',
    },
  ],
};

function normalizeNoteFocusValue(value: string) {
  return value.trim().toLowerCase();
}

export function inferOutputNoteFocus(noteType: string): OutputNoteFocus {
  const normalized = normalizeNoteFocusValue(noteType);

  if (/inpatient psych initial|admission|initial adult eval|initial adolescent eval/.test(normalized)) {
    return 'inpatient-psych-evaluation';
  }

  if (/inpatient psych progress|day two|discharge/.test(normalized)) {
    return 'inpatient-psych-follow-up';
  }

  if (/outpatient psychiatric evaluation|outpatient psych evaluation|psychiatry intake/.test(normalized)) {
    return 'outpatient-evaluation';
  }

  if (/outpatient psych follow-up|outpatient psych follow up|telehealth follow-up|psychiatry progress/.test(normalized)) {
    return 'outpatient-follow-up';
  }

  return 'general';
}

export function getOutputNoteFocusLabel(noteFocus: OutputNoteFocus) {
  return NOTE_FOCUS_LABELS[noteFocus];
}

export function buildStarterOutputProfiles(input: {
  noteType: string;
  destination: OutputDestination;
  asciiSafe: boolean;
  paragraphOnly: boolean;
  wellskyFriendly: boolean;
}) {
  const noteFocus = inferOutputNoteFocus(input.noteType);
  const focusLabel = getOutputNoteFocusLabel(noteFocus);
  const seeds: StarterOutputProfileSeed[] = [];

  seeds.push({
    name: `Primary site - ${input.destination} ${focusLabel}`,
    siteLabel: 'Primary site',
    destination: input.destination,
    noteFocus,
    asciiSafe: input.asciiSafe,
    paragraphOnly: input.paragraphOnly,
    wellskyFriendly: input.wellskyFriendly,
  });

  if (input.destination !== 'Generic') {
    seeds.push({
      name: `Alternate site - Generic ${focusLabel}`,
      siteLabel: 'Alternate site',
      destination: 'Generic',
      noteFocus,
      asciiSafe: false,
      paragraphOnly: false,
      wellskyFriendly: false,
    });
  }

  if (noteFocus === 'inpatient-psych-follow-up' || noteFocus === 'inpatient-psych-evaluation') {
    seeds.push({
      name: 'Hospital A - Tebra/Kareo psych workflow',
      siteLabel: 'Hospital A',
      destination: 'Tebra/Kareo',
      noteFocus,
      asciiSafe: false,
      paragraphOnly: false,
      wellskyFriendly: false,
    });
  }

  if (noteFocus === 'outpatient-evaluation' || noteFocus === 'outpatient-follow-up') {
    seeds.push({
      name: 'Clinic B - TherapyNotes outpatient psych',
      siteLabel: 'Clinic B',
      destination: 'TherapyNotes',
      noteFocus,
      asciiSafe: false,
      paragraphOnly: true,
      wellskyFriendly: false,
    });
  }

  return seeds.filter((seed, index, all) => all.findIndex((item) => item.name === seed.name) === index);
}

export function getOutputDestinationMeta(destination: OutputDestination) {
  return OUTPUT_DESTINATION_META[destination];
}

export function getOutputDestinationOptions() {
  return OUTPUT_DESTINATIONS.map((destination) => OUTPUT_DESTINATION_META[destination]);
}

export function getOutputDestinationFieldTargets(destination: OutputDestination, noteFocus: OutputNoteFocus = 'general') {
  if (destination === 'Tebra/Kareo' && TEBRA_NOTE_FOCUS_TARGETS[noteFocus]) {
    return TEBRA_NOTE_FOCUS_TARGETS[noteFocus] || OUTPUT_DESTINATION_META[destination].fieldTargets;
  }

  if (destination === 'TherapyNotes' && THERAPYNOTES_NOTE_FOCUS_TARGETS[noteFocus]) {
    return THERAPYNOTES_NOTE_FOCUS_TARGETS[noteFocus] || OUTPUT_DESTINATION_META[destination].fieldTargets;
  }

  return OUTPUT_DESTINATION_META[destination].fieldTargets;
}

export function hasNamedOutputDestination(destination: OutputDestination) {
  return destination !== 'Generic';
}

function toAsciiSafe(value: string) {
  return value
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[–—]/g, '-')
    .replace(/…/g, '...')
    .replace(/\u00A0/g, ' ');
}

function collapseToParagraphs(value: string) {
  return value
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n([A-Z][A-Za-z /&-]{1,80}:)\n/g, '\n$1 ')
    .trim();
}

function flattenBullets(value: string) {
  return value
    .replace(/^[\t ]*[•▪◦●○]\s+/gm, '- ')
    .replace(/^[\t ]*\d+\.\s+/gm, '- ')
    .replace(/^[\t ]*-\s+/gm, '- ');
}

function normalizeTemplateSpacing(value: string, preserveHeadings: boolean) {
  const normalized = value
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n');

  if (!preserveHeadings) {
    return normalized
      .replace(/\n([A-Z][A-Za-z /&-]{1,80}:)\n/g, '\n$1 ')
      .replace(/\n([A-Z][A-Za-z /&-]{1,80}:) /g, '\n')
      .trim();
  }

  return normalized.trim();
}

export function formatTextForOutputDestination(input: {
  text: string;
  destination: OutputDestination;
  asciiSafe?: boolean;
  paragraphOnly?: boolean;
  preserveHeadings?: boolean;
}) {
  const meta = getOutputDestinationMeta(input.destination);
  let output = input.text || '';
  const asciiSafe = input.asciiSafe || meta.enforceAsciiSafe;
  const paragraphOnly = input.paragraphOnly || meta.preferParagraphOnly;
  const preserveHeadings = input.preserveHeadings ?? meta.preserveHeadings;

  if (asciiSafe) {
    output = toAsciiSafe(output);
  }

  if (meta.flattenBullets) {
    output = flattenBullets(output);
  }

  if (meta.normalizeSpacing) {
    output = normalizeTemplateSpacing(output, preserveHeadings);
  }

  if (paragraphOnly) {
    output = collapseToParagraphs(output);
  }

  return output.trim();
}
