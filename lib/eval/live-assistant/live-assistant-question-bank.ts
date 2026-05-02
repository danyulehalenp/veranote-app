export type LiveAssistantExpectedMode =
  | 'pure_reference'
  | 'applied_clinical'
  | 'interaction_safety'
  | 'lai_approval'
  | 'urgent_safety'
  | 'documentation'
  | 'approval_indication'
  | 'lab_monitoring'
  | 'diagnostic_summary'
  | 'simple_factual';

export type LiveAssistantQuestionCase = {
  id: string;
  question: string;
  expectedLane?: string;
  expectedMode: LiveAssistantExpectedMode;
  expectedMustInclude: string[];
  expectedMustNotInclude: string[];
  maxWords?: number;
  maxChars?: number;
  shouldAskFollowUp: boolean;
  category?: string;
  safetyLevel?: 'routine' | 'caution' | 'urgent' | 'diagnostic_reference';
  needsVerification?: boolean;
  notes?: string;
  recentMessages?: Array<{ role: 'provider' | 'assistant'; content: string; answerMode?: string }>;
};

export const LIVE_ASSISTANT_QUESTION_BANK: LiveAssistantQuestionCase[] = [
  {
    id: 'lithium-normal-levels',
    question: 'what are normal therapeutic levels of lithium for a patient?',
    expectedMode: 'pure_reference',
    expectedMustInclude: ['maintenance', '0.6-1.0', 'acute mania', '0.8-1.2'],
    expectedMustNotInclude: ['Follow-up:', 'Key context:', 'Was this a true trough?', 'How is the patient clinically?'],
    maxWords: 80,
    shouldAskFollowUp: false,
    notes: 'Generic patient phrasing should not turn a reference range question into applied lab interpretation.',
  },
  {
    id: 'lai-adolescent-approval',
    question: 'are any long acting injection antipsychotics approved for adolescents?',
    expectedMode: 'lai_approval',
    expectedMustInclude: [
      'long-acting injectable antipsychotics',
      'under 18',
      'adult-focused',
      'product-specific labeling',
    ],
    expectedMustNotInclude: ['Oral-to-LAI framework', 'current oral dose', 'oral overlap', 'last injection date', 'missed-dose', 'restart rules'],
    maxWords: 100,
    shouldAskFollowUp: false,
    notes: 'Approval/age questions should answer labeling/age directly, not transition into LAI conversion.',
  },
  {
    id: 'creatinine-lithium-candidacy',
    question: 'I have a patient with creatinine 1.7. Is lithium a good choice?',
    expectedMode: 'applied_clinical',
    expectedMustInclude: ['renal', 'lithium', 'eGFR', 'baseline'],
    expectedMustNotInclude: ['lithium level of 1.7', 'Typical lithium therapeutic levels'],
    maxWords: 120,
    shouldAskFollowUp: true,
    notes: 'Creatinine values near lithium should remain renal candidacy context, not serum lithium level context.',
  },
  {
    id: 'lithium-toxic',
    question: 'Lithium level 1.6 and confused',
    expectedMode: 'urgent_safety',
    expectedMustInclude: ['not routine monitoring', 'toxicity', 'urgent'],
    expectedMustNotInclude: ['increase the dose', 'hold the medication', 'continue lithium', 'Typical lithium therapeutic levels:'],
    maxWords: 120,
    shouldAskFollowUp: false,
  },
  {
    id: 'lamotrigine-strengths',
    question: 'What mg does lamotrigine come in?',
    expectedMode: 'pure_reference',
    expectedMustInclude: ['25 mg', '100 mg', '150 mg', '200 mg'],
    expectedMustNotInclude: ['Follow-up:', 'Key context:', 'What should I do'],
    maxWords: 120,
    shouldAskFollowUp: false,
  },
  {
    id: 'qtc-haldol',
    question: 'QTc 520 on Haldol',
    expectedMode: 'urgent_safety',
    expectedMustInclude: ['QTc', 'high-risk', 'potassium', 'magnesium'],
    expectedMustNotInclude: ['full QTc table', 'safe to combine', 'continue Haldol'],
    maxWords: 120,
    shouldAskFollowUp: true,
  },
  {
    id: 'depakote-sedated',
    question: 'Valproate level 110 and patient sedated',
    expectedMode: 'urgent_safety',
    expectedMustInclude: ['Valproate', 'sedation', 'ammonia', 'LFT', 'platelets'],
    expectedMustNotInclude: ['increase the dose', 'hold Depakote', 'continue Depakote'],
    maxWords: 120,
    shouldAskFollowUp: false,
  },
];
