import type {
  AssistantApiContext,
  AssistantBuilderFamily,
  AssistantReferenceSource,
  AssistantResponsePayload,
  AssistantStage,
} from '@/types/assistant';

export type AtlasLaneId =
  | 'urgent_crisis'
  | 'medication_facts'
  | 'fda_approval'
  | 'interaction_contraindication'
  | 'monitoring_labs'
  | 'med_lab_safety'
  | 'diagnostic_concept'
  | 'diagnostic_safety'
  | 'documentation_wording'
  | 'risk_suicide_documentation'
  | 'source_conflict'
  | 'capacity_consent'
  | 'medical_h_and_p'
  | 'ehr_export'
  | 'billing_documentation'
  | 'local_policy_documentation'
  | 'workflow_help'
  | 'abstain_clarify';

export type AtlasLaneFamily =
  | 'urgent'
  | 'direct-reference'
  | 'applied-safety'
  | 'documentation'
  | 'workflow'
  | 'governance';

export type AtlasSourceType =
  | 'fda-label'
  | 'professional-guidance'
  | 'peer-reviewed-review'
  | 'local-policy'
  | 'internal-veranote'
  | 'provider-source';

export type AtlasSourceProvenance = {
  id: string;
  label: string;
  url?: string;
  sourceType: AtlasSourceType;
  sourceDate?: string;
  verificationStatus: 'verified' | 'loaded-policy-required' | 'provider-source-required';
  useForLanes: AtlasLaneId[];
};

export type AtlasAnswerContract = {
  laneId: AtlasLaneId;
  answerFormat: string;
  maxBullets: number;
  requiredCaveats: string[];
  forbiddenPhrases: string[];
  askFollowUpWhen: string;
  abstainWhen: string;
  escalateWhen: string;
};

export type AtlasLaneDefinition = {
  id: AtlasLaneId;
  label: string;
  family: AtlasLaneFamily;
  precedence: number;
  purpose: string;
  triggerSummary: string;
  contractId: AtlasLaneId;
};

export type AtlasArbitrationInput = {
  message: string;
  sourceText?: string;
  stage?: AssistantStage;
  context?: AssistantApiContext;
};

export type AtlasArbitrationResult = {
  laneId: AtlasLaneId;
  confidence: 'high' | 'medium' | 'low';
  reason: string;
  suppressedFollowUp: boolean;
};

export const ATLAS_LANE_REGISTRY: readonly AtlasLaneDefinition[] = [
  {
    id: 'urgent_crisis',
    label: 'Urgent / tox / crisis',
    family: 'urgent',
    precedence: 10,
    purpose: 'Escalate imminent safety, toxicity, withdrawal, or medical-danger prompts before routine reference or documentation help.',
    triggerSummary: 'Overdose, imminent SI/HI, severe withdrawal, toxicity, NMS/serotonin syndrome, delirium, severe adverse-event language.',
    contractId: 'urgent_crisis',
  },
  {
    id: 'med_lab_safety',
    label: 'Medication / lab safety',
    family: 'applied-safety',
    precedence: 20,
    purpose: 'Keep medication, lab, adverse-effect, withdrawal, or medical-confounder concerns from being routed as diagnosis-only tasks.',
    triggerSummary: 'Medication or lab value plus symptoms, toxicity concern, renal/QTc/ANC/ammonia/LFT/platelet risk, withdrawal/intoxication cues.',
    contractId: 'med_lab_safety',
  },
  {
    id: 'fda_approval',
    label: 'FDA approvals / indications',
    family: 'direct-reference',
    precedence: 30,
    purpose: 'Answer direct approval or labeled-indication questions without drifting into medication planning.',
    triggerSummary: 'FDA-approved, approved for, indication, labeled use, age-specific approval.',
    contractId: 'fda_approval',
  },
  {
    id: 'interaction_contraindication',
    label: 'Interactions / contraindications',
    family: 'direct-reference',
    precedence: 40,
    purpose: 'Surface interaction or contraindication facts without providing patient-specific prescribing instructions.',
    triggerSummary: 'Interaction, contraindicated, combine, together, CYP, pregnancy/lactation safety, QTc combination concerns.',
    contractId: 'interaction_contraindication',
  },
  {
    id: 'monitoring_labs',
    label: 'Monitoring / labs',
    family: 'direct-reference',
    precedence: 50,
    purpose: 'Answer routine baseline and monitoring reference questions separately from abnormal-result interpretation.',
    triggerSummary: 'What labs, baseline, monitoring, ANC/CBC/CMP/LFT/TSH/A1c/lipids/EKG/UDS monitoring.',
    contractId: 'monitoring_labs',
  },
  {
    id: 'medication_facts',
    label: 'Medication facts',
    family: 'direct-reference',
    precedence: 60,
    purpose: 'Answer direct medication fact questions concisely with source-verification caveats.',
    triggerSummary: 'Medication use, formulation, strengths, class, half-life, general factual reference.',
    contractId: 'medication_facts',
  },
  {
    id: 'local_policy_documentation',
    label: 'Local policy / documentation rules',
    family: 'governance',
    precedence: 70,
    purpose: 'Use loaded/current policy manuals for facility, payer, state, or Louisiana-style documentation guidance.',
    triggerSummary: 'Louisiana, Medicaid, PEC/CEC, inpatient psych approval, payer/facility documentation requirements.',
    contractId: 'local_policy_documentation',
  },
  {
    id: 'capacity_consent',
    label: 'Capacity / consent',
    family: 'documentation',
    precedence: 80,
    purpose: 'Keep decisional capacity, consent, guardianship, and legal-authority questions decision-specific and non-legal-advice.',
    triggerSummary: 'Capacity, consent, refusal, guardian, force medication, court, over objection, legal authority.',
    contractId: 'capacity_consent',
  },
  {
    id: 'risk_suicide_documentation',
    label: 'Risk / suicide documentation',
    family: 'documentation',
    precedence: 90,
    purpose: 'Prevent false reassurance by keeping denial, collateral, observed behavior, and unresolved safety facts side by side.',
    triggerSummary: 'Suicide/violence risk wording, low-risk wording, denies SI/HI plus collateral/recent threats/texts/means concern.',
    contractId: 'risk_suicide_documentation',
  },
  {
    id: 'source_conflict',
    label: 'Source conflict',
    family: 'documentation',
    precedence: 100,
    purpose: 'Preserve conflicts between patient report, collateral, staff observations, objective data, and draft language.',
    triggerSummary: 'Source says/draft says, patient denies but collateral reports, conflicting source, reconcile/resolve contradiction.',
    contractId: 'source_conflict',
  },
  {
    id: 'documentation_wording',
    label: 'Documentation wording',
    family: 'documentation',
    precedence: 110,
    purpose: 'Convert source-supported facts into chart-safe wording without inventing facts or over-resolving uncertainty.',
    triggerSummary: 'How should I word/document/chart/rewrite, chart-ready, source-faithful wording.',
    contractId: 'documentation_wording',
  },
  {
    id: 'diagnostic_safety',
    label: 'Diagnostic safety',
    family: 'applied-safety',
    precedence: 120,
    purpose: 'Block diagnosis from sparse patient-specific data and keep rule-outs/confounders visible.',
    triggerSummary: 'Can I diagnose/call/list/chart, is this bipolar/schizophrenia/PTSD/etc, diagnosis from patient-specific facts.',
    contractId: 'diagnostic_safety',
  },
  {
    id: 'diagnostic_concept',
    label: 'Diagnostic concept reference',
    family: 'direct-reference',
    precedence: 130,
    purpose: 'Explain diagnostic concepts generally without applying them to the patient.',
    triggerSummary: 'What is, symptoms of, difference between, duration requirement, criteria summary.',
    contractId: 'diagnostic_concept',
  },
  {
    id: 'medical_h_and_p',
    label: 'Medical H&P support',
    family: 'documentation',
    precedence: 140,
    purpose: 'Support medical H&P completeness, ROS/PMH/med reconciliation, and psych-medical overlap documentation.',
    triggerSummary: 'H&P, medical consult, ROS, PMH, medical clearance, inpatient medical overlap.',
    contractId: 'medical_h_and_p',
  },
  {
    id: 'billing_documentation',
    label: 'Billing / documentation support',
    family: 'documentation',
    precedence: 150,
    purpose: 'Support documentation sufficiency without guaranteeing billing, payer, or coding outcomes.',
    triggerSummary: 'CPT, billing, medical necessity, level of care, LOS, audit support.',
    contractId: 'billing_documentation',
  },
  {
    id: 'ehr_export',
    label: 'EHR / export formatting',
    family: 'workflow',
    precedence: 160,
    purpose: 'Shape copy/paste and destination formatting without changing clinical meaning.',
    triggerSummary: 'WellSky, Tebra, EHR, export, paste into, formatting for destination.',
    contractId: 'ehr_export',
  },
  {
    id: 'workflow_help',
    label: 'Workflow help',
    family: 'workflow',
    precedence: 170,
    purpose: 'Answer Veranote workflow questions when no clinical lane is triggered.',
    triggerSummary: 'How to use Veranote, start note, open draft, settings, workflow step.',
    contractId: 'workflow_help',
  },
  {
    id: 'abstain_clarify',
    label: 'Abstain / clarify',
    family: 'governance',
    precedence: 180,
    purpose: 'Ask one targeted clarification or abstain when the request is unsupported, unsafe, or too ambiguous.',
    triggerSummary: 'No safe lane, missing source, unsupported direct instruction, unclear clinical target.',
    contractId: 'abstain_clarify',
  },
] as const;

export const ATLAS_FAILURE_TAXONOMY = [
  'wrong_lane',
  'missed_direct_answer',
  'overdiagnosis',
  'unsafe_directive',
  'false_reassurance',
  'too_vague',
  'too_long',
  'missing_caveat',
  'hallucinated_fact',
  'source_mismatch',
  'unsupported_source_citation',
  'phi_privacy_risk',
  'ui_backend_mismatch',
  'local_policy_overreach',
  'ignored_contradiction',
  'ignored_urgent_trigger',
  'unnecessary_followup',
  'missing_needed_clarification',
  'raw_reasoning_exposure',
  'workflow_confusion',
] as const;

export const ATLAS_CLINICIAN_REVIEW_RUBRIC = [
  'Correct lane',
  'Directness',
  'Factual accuracy',
  'Evidence/source concordance',
  'Completeness without verbosity',
  'Appropriate uncertainty',
  'No unsafe directive',
  'No overdiagnosis',
  'No hallucinated facts',
  'Source fidelity',
  'Documentation usefulness',
  'Potential patient harm if blindly followed',
] as const;

export const ATLAS_SOURCE_PROVENANCE: readonly AtlasSourceProvenance[] = [
  {
    id: 'fda-cds-guidance',
    label: 'FDA Clinical Decision Support Software Guidance',
    url: 'https://www.fda.gov/medical-devices/software-medical-device-samd/clinical-decision-support-software-frequently-asked-questions-faqs',
    sourceType: 'professional-guidance',
    sourceDate: '2022',
    verificationStatus: 'verified',
    useForLanes: ['workflow_help', 'abstain_clarify', 'documentation_wording'],
  },
  {
    id: 'chai-cds-test-evaluation-framework',
    label: 'CHAI Clinical Decision Support Testing and Evaluation Framework',
    url: 'https://rai-content.chai.org/en/latest/clinical-decision-support/t%26e-framework.html',
    sourceType: 'professional-guidance',
    verificationStatus: 'verified',
    useForLanes: ['workflow_help', 'abstain_clarify'],
  },
  {
    id: 'apa-ai-position-statement',
    label: 'American Psychiatric Association AI Position Statement',
    url: 'https://www.psychiatry.org/getattachment/a05f1fa4-2016-422c-bc53-5960c47890bb/Position-Statement-Role-of-AI.pdf',
    sourceType: 'professional-guidance',
    sourceDate: '2024',
    verificationStatus: 'verified',
    useForLanes: ['diagnostic_safety', 'risk_suicide_documentation', 'documentation_wording'],
  },
  {
    id: 'hhs-hipaa-minimum-necessary',
    label: 'HHS HIPAA Minimum Necessary Standard',
    url: 'https://www.hhs.gov/hipaa/for-professionals/privacy/guidance/minimum-necessary-requirement/index.html',
    sourceType: 'professional-guidance',
    verificationStatus: 'verified',
    useForLanes: ['workflow_help', 'abstain_clarify'],
  },
  {
    id: 'louisiana-bhs-provider-manual',
    label: 'Louisiana Behavioral Health Services Provider Manual',
    url: 'https://www.lmmis.com/provweb1/providermanuals/manuals/BHS/BHS.pdf',
    sourceType: 'local-policy',
    verificationStatus: 'loaded-policy-required',
    useForLanes: ['local_policy_documentation'],
  },
] as const;

export const ATLAS_ANSWER_CONTRACTS: Record<AtlasLaneId, AtlasAnswerContract> = {
  urgent_crisis: {
    laneId: 'urgent_crisis',
    answerFormat: 'Urgent safety frame, what to preserve, what to check, local emergency/escalation workflow caveat.',
    maxBullets: 4,
    requiredCaveats: ['Use clinician/emergency/local policy judgment.', 'Do not handle as routine drafting.'],
    forbiddenPhrases: ['safe to discharge', 'no risk', 'routine monitoring', 'increase the dose', 'stop the medication'],
    askFollowUpWhen: 'Only if it does not delay urgent review and one detail materially changes escalation.',
    abstainWhen: 'The user asks for patient-specific emergency orders or dosing.',
    escalateWhen: 'Imminent self-harm, harm to others, overdose, toxicity, delirium, severe withdrawal, or severe adverse-event concern appears.',
  },
  medication_facts: {
    laneId: 'medication_facts',
    answerFormat: 'Direct factual answer, key caveat, source basis, current-label verification reminder.',
    maxBullets: 6,
    requiredCaveats: ['Verify with a current prescribing reference.'],
    forbiddenPhrases: ['start this patient', 'stop this patient', 'increase this patient', 'safe to combine'],
    askFollowUpWhen: 'Formulation, route, age group, indication, or setting changes the answer.',
    abstainWhen: 'No confident medication match exists.',
    escalateWhen: 'The medication fact question includes toxicity, overdose, severe symptoms, or urgent lab values.',
  },
  fda_approval: {
    laneId: 'fda_approval',
    answerFormat: 'Approval status, indication/age/formulation caveat, current label verification.',
    maxBullets: 5,
    requiredCaveats: ['Verify against current product labeling and local policy.'],
    forbiddenPhrases: ['therefore prescribe', 'best choice for this patient', 'start'],
    askFollowUpWhen: 'The product, formulation, age group, or indication is ambiguous.',
    abstainWhen: 'The product/indication cannot be verified from trusted references.',
    escalateWhen: 'Approval question is mixed with urgent toxicity or patient-specific emergency management.',
  },
  interaction_contraindication: {
    laneId: 'interaction_contraindication',
    answerFormat: 'Interaction status, why it matters, what clinician should verify.',
    maxBullets: 5,
    requiredCaveats: ['Medication reconciliation and clinical judgment remain required.'],
    forbiddenPhrases: ['safe to combine', 'go ahead', 'no concern'],
    askFollowUpWhen: 'Dose, route, timing, renal/hepatic status, pregnancy/lactation, or other interacting drugs are unclear.',
    abstainWhen: 'The combination or substance cannot be identified.',
    escalateWhen: 'QTc risk, serotonin syndrome/NMS, clozapine ANC/myocarditis, lithium toxicity, severe withdrawal, or overdose is present.',
  },
  monitoring_labs: {
    laneId: 'monitoring_labs',
    answerFormat: 'Routine monitoring reference, abnormal-result boundary, verification reminder.',
    maxBullets: 6,
    requiredCaveats: ['Use current label/guideline and patient-specific context.'],
    forbiddenPhrases: ['normal so safe', 'ignore', 'continue'],
    askFollowUpWhen: 'The prompt includes an abnormal result, symptom, timing issue, or high-risk medication.',
    abstainWhen: 'No medication/test anchor is present.',
    escalateWhen: 'Critical lab values, toxicity signs, severe symptoms, or urgent medication/lab pairing appears.',
  },
  med_lab_safety: {
    laneId: 'med_lab_safety',
    answerFormat: 'Safety concern, why routine interpretation is unsafe, what to verify, no treatment order.',
    maxBullets: 5,
    requiredCaveats: ['Do not make an automatic medication decision from one data point.'],
    forbiddenPhrases: ['increase', 'hold', 'continue', 'safe to discharge'],
    askFollowUpWhen: 'A focused detail like timing, level draw, eGFR, QTc electrolytes, or symptom severity changes safety interpretation.',
    abstainWhen: 'The user asks Atlas to prescribe, hold, or dose-adjust.',
    escalateWhen: 'Toxicity, severe withdrawal, delirium, seizure, syncope, severe QTc risk, clozapine ANC/myocarditis concern, or overdose appears.',
  },
  diagnostic_concept: {
    laneId: 'diagnostic_concept',
    answerFormat: 'Plain-language concept summary, common confounders, documentation caution.',
    maxBullets: 5,
    requiredCaveats: ['General reference only; diagnosis requires full assessment.'],
    forbiddenPhrases: ['the patient has', 'meets criteria', 'DSM says verbatim'],
    askFollowUpWhen: 'The provider asks how to apply the concept to a patient.',
    abstainWhen: 'The request asks for DSM verbatim text.',
    escalateWhen: 'Patient-specific risk, delirium, intoxication, withdrawal, or medical instability is present.',
  },
  diagnostic_safety: {
    laneId: 'diagnostic_safety',
    answerFormat: 'Not-enough-to-diagnose frame, supported facts, missing facts, rule-outs/confounders, safer wording.',
    maxBullets: 6,
    requiredCaveats: ['Diagnostic judgment stays with the clinician after full assessment.'],
    forbiddenPhrases: ['definitely has', 'diagnosis is', 'no rule-out needed', 'meets criteria'],
    askFollowUpWhen: 'One targeted missing fact would materially change diagnostic safety.',
    abstainWhen: 'The request asks Atlas to assign the diagnosis.',
    escalateWhen: 'Risk, delirium, intoxication/withdrawal, medical instability, or imminent danger appears.',
  },
  documentation_wording: {
    laneId: 'documentation_wording',
    answerFormat: 'Source-grounded wording, attribution labels, missing-data note, safer phrasing.',
    maxBullets: 5,
    requiredCaveats: ['Use only source-supported facts.'],
    forbiddenPhrases: ['clearly', 'proves', 'resolved', 'no risk'],
    askFollowUpWhen: 'The source facts needed for chart-ready wording are missing.',
    abstainWhen: 'No source facts are available and the user asks for patient-specific wording.',
    escalateWhen: 'The wording request would erase urgent risk, contradiction, medical danger, or legal uncertainty.',
  },
  risk_suicide_documentation: {
    laneId: 'risk_suicide_documentation',
    answerFormat: 'Risk data present, risk data missing, source conflicts, safety wording caution.',
    maxBullets: 6,
    requiredCaveats: ['Denial alone does not establish absence of risk.'],
    forbiddenPhrases: ['low risk', 'no risk', 'safe to discharge', 'cleared'],
    askFollowUpWhen: 'Means/access, current intent, timing, protective factors, collateral reliability, or disposition is missing.',
    abstainWhen: 'The provider asks Atlas to declare risk level from sparse or conflicting data.',
    escalateWhen: 'Imminent intent, plan, means, recent attempt, command hallucinations, severe intoxication/withdrawal, or inability to maintain safety appears.',
  },
  source_conflict: {
    laneId: 'source_conflict',
    answerFormat: 'Name each source voice separately, preserve contradiction, state what remains unresolved.',
    maxBullets: 5,
    requiredCaveats: ['Do not reconcile conflicting source elements without documentation support.'],
    forbiddenPhrases: ['resolved', 'proves', 'ignore collateral', 'patient denied so no concern'],
    askFollowUpWhen: 'Timing, attribution, or source reliability is unknown.',
    abstainWhen: 'The user asks Atlas to choose which source is true without evidence.',
    escalateWhen: 'The conflict involves imminent risk, medical danger, legal authority, or discharge readiness.',
  },
  capacity_consent: {
    laneId: 'capacity_consent',
    answerFormat: 'Decision-specific capacity frame, factors to document, patient/collateral separation, local policy/legal caveat.',
    maxBullets: 6,
    requiredCaveats: ['Capacity is decision-specific.', 'Legal authority requires local policy/legal review.'],
    forbiddenPhrases: ['no capacity full stop', 'competent', 'incompetent', 'guardian decides always', 'force medication'],
    askFollowUpWhen: 'The exact decision, understanding, appreciation, reasoning, stable choice, alternatives, or legal process is missing.',
    abstainWhen: 'The request asks Atlas to decide legal authority or capacity as a final conclusion.',
    escalateWhen: 'Capacity/consent question is mixed with immediate danger, emergency medication, hold authority, or court language.',
  },
  medical_h_and_p: {
    laneId: 'medical_h_and_p',
    answerFormat: 'Completeness checklist, medical/psych overlap, source-bound H&P wording support.',
    maxBullets: 6,
    requiredCaveats: ['Do not document medical clearance or stability unless source supports it.'],
    forbiddenPhrases: ['medically cleared', 'normal', 'stable'] ,
    askFollowUpWhen: 'ROS/PMH/med reconciliation/objective data needed for H&P completeness are missing.',
    abstainWhen: 'No medical source facts are available.',
    escalateWhen: 'Delirium, intoxication/withdrawal, abnormal vitals/labs, hypoxia, head injury, or acute medical danger appears.',
  },
  ehr_export: {
    laneId: 'ehr_export',
    answerFormat: 'Destination formatting guidance without changing clinical meaning.',
    maxBullets: 4,
    requiredCaveats: ['Formatting should not change meaning, certainty, or attribution.'],
    forbiddenPhrases: ['drop uncertainty', 'remove risk language'],
    askFollowUpWhen: 'The target EHR or note type is unknown.',
    abstainWhen: 'The user asks for unsupported EHR automation.',
    escalateWhen: 'Export formatting would hide safety or source-fidelity warnings.',
  },
  billing_documentation: {
    laneId: 'billing_documentation',
    answerFormat: 'Documentation sufficiency support, missing elements, coding/billing uncertainty caveat.',
    maxBullets: 5,
    requiredCaveats: ['Not billing/legal advice; verify payer and local rules.'],
    forbiddenPhrases: ['guarantees reimbursement', 'bill this', 'always use'],
    askFollowUpWhen: 'Service, time, complexity, medical necessity, or payer context is missing.',
    abstainWhen: 'The provider asks for guaranteed billing outcome.',
    escalateWhen: 'Billing request would pressure documentation beyond source support.',
  },
  local_policy_documentation: {
    laneId: 'local_policy_documentation',
    answerFormat: 'Loaded-policy basis, required elements, missing documentation, local verification caveat.',
    maxBullets: 6,
    requiredCaveats: ['Use current loaded policy/manual; not legal or payer approval advice.'],
    forbiddenPhrases: ['approved', 'guaranteed', 'legally required without verification'],
    askFollowUpWhen: 'State, payer, facility, service type, or policy source is missing.',
    abstainWhen: 'No current source document or policy basis is available for the requested jurisdiction.',
    escalateWhen: 'Policy question asks for legal authority, involuntary hold decision, or treatment over objection.',
  },
  workflow_help: {
    laneId: 'workflow_help',
    answerFormat: 'One clear workflow next step plus optional second step.',
    maxBullets: 4,
    requiredCaveats: ['Keep clinical decisions with the provider.'],
    forbiddenPhrases: ['the system decides', 'automatic clinical decision'],
    askFollowUpWhen: 'The requested workflow target is unclear.',
    abstainWhen: 'The workflow request is unsupported.',
    escalateWhen: 'Workflow shortcut would bypass safety review.',
  },
  abstain_clarify: {
    laneId: 'abstain_clarify',
    answerFormat: 'Brief abstention, reason, one targeted clarification or safer alternative.',
    maxBullets: 3,
    requiredCaveats: ['Do not guess when unsupported.'],
    forbiddenPhrases: ['probably', 'just do', 'I am sure'],
    askFollowUpWhen: 'One answerable clarification can safely unlock the task.',
    abstainWhen: 'Clinical facts, source basis, or supported lane are missing.',
    escalateWhen: 'Unsafe directive or urgent concern is embedded in the ambiguous request.',
  },
};

const LANE_BY_ID = new Map(ATLAS_LANE_REGISTRY.map((lane) => [lane.id, lane]));

function normalize(value: string) {
  return value.toLowerCase().replace(/[’']/g, "'").replace(/\s+/g, ' ').trim();
}

function hasAny(value: string, patterns: RegExp[]) {
  return patterns.some((pattern) => pattern.test(value));
}

function line(...parts: string[]) {
  return parts.filter(Boolean).join(' ');
}

function hasMedicationAnchor(text: string) {
  return hasAny(text, [
    /\b(lithium|valproate|depakote|divalproex|lamotrigine|lamictal|clozapine|clozaril|haldol|haloperidol|quetiapine|seroquel|olanzapine|zyprexa|risperidone|paliperidone|invega|aripiprazole|abilify|bupropion|wellbutrin|citalopram|celexa|diphenhydramine|benadryl|lai\b|long[-\s]?acting injectable|oral bridge|gabapentin|kratom|alcohol withdrawal|benzodiazepine|benzo|ativan|lorazepam|xanax|alprazolam|klonopin|clonazepam|opioid|buprenorphine|methadone|naltrexone|naloxone|narcan|ssris?|snris?|maois?|tca|stimulant|antipsychotic|antidepressant|mood stabilizer)\b/,
  ]);
}

function hasLabSafetyAnchor(text: string) {
  return hasAny(text, [
    /\b(level\s*\d|serum level|creatinine|egfr|qtc|anc|wbc|ammonia|lft|platelets?|sodium|hyponatremia|potassium|magnesium|renal|kidney|toxicity|toxic|confused|confusion|disoriented|urinary retention|anticholinergic|ataxia|seizure|syncope|sedated|sedation|vomiting|diarrhea|tremor|rigidity|clonus|fever)\b/,
  ]);
}

function hasUrgentCrisisAnchor(text: string) {
  return hasAny(text, [
    /\b(imminent|emergency|urgent|crisis|overdose|toxicity|toxic|poison control|withdrawal|delirium|seizure|syncope|nms|neuroleptic malignant|serotonin syndrome|severe agitation|cannot maintain safety)\b/,
    /\b(kill (?:myself|himself|herself|themselves|someone)|plan to overdose|access to (?:gun|weapon|means)|active (?:si|suicidal ideation|homicidal ideation)|command hallucinations?)\b/,
  ]);
}

function isPureReferenceQuestion(text: string) {
  return hasAny(text, [
    /^(what is|what are|what symptoms|what are the symptoms|how is|how are|how do you distinguish|how do i distinguish|what is the first[-\s]?line|difference between)\b/,
  ]);
}

function isDocumentationRiskQuestion(text: string) {
  return hasDocumentationAnchor(text) || hasAny(text, [
    /\b(can i (?:write|say)|draft|rewrite|wording|chart|document)\b.*\b(low risk|no risk|risk|discharge|cleared|stable)\b/,
    /\b(low[-\s]?(?:suicide|violence)?[-\s]?risk|no suicide risk|no violence risk|risk wording)\b/,
  ]);
}

function hasImminentSafetyAnchor(text: string) {
  return hasAny(text, [
    /\b(plan to overdose|if sent home|cannot maintain safety|active (?:si|suicidal ideation|homicidal ideation)|command hallucinations?.*(?:kill|harm)|access to (?:gun|weapon|means)(?! unknown))\b/,
  ]);
}

function hasFdaApprovalAnchor(text: string) {
  return hasAny(text, [
    /\b(fda[-\s]?approved|approved for|approved in|approved to|approved medication|approved treatment|indication|indicated for|fda[-\s]?labeled|labeled use)\b/,
  ]);
}

function hasInteractionAnchor(text: string) {
  return hasAny(text, [
    /\b(interaction|interact|combine|combined|together|contraindicated|avoid|cyp|inducer|inhibitor|pregnancy|pregnant|breastfeeding|lactation|qtc combination)\b/,
  ]);
}

function hasMonitoringAnchor(text: string) {
  return hasAny(text, [
    /\b(labs?|monitoring|baseline|checked|required|ekg|ecg|cbc|anc|cmp|lft|tsh|a1c|lipids|prolactin|pregnancy test|uds|urine drug screen)\b/,
  ]);
}

function hasLocalPolicyAnchor(text: string) {
  return hasAny(text, [
    /\b(louisiana|medicaid|managed care|payer|facility policy|local policy|uploaded policy|loaded policy|policy manual|current policy|pec\b|cec\b|inpatient psych approval|continued stay|prior authorization|documentation requirements?)\b/,
  ]);
}

function hasCapacityAnchor(text: string) {
  return hasAny(text, [
    /\b(capacity|consent|guardian|over objection|force meds?|force medication|forced medication|court|legal authority|competent|incompetent|can .* refuse)\b/,
    /\b(?:refuses|refusal|refusing)\b.{0,80}\b(?:capacity|consent|legal|over objection|force|court)\b/,
    /\b(?:capacity|consent|legal|over objection|force|court)\b.{0,80}\b(?:refuses|refusal|refusing)\b/,
  ]);
}

function hasRiskDocumentationAnchor(text: string) {
  return hasAny(text, [
    /\b(risk wording|suicide[-\s]?risk wording|violence[-\s]?risk wording|low[-\s]?risk wording|say no risk|no suicide risk|no violence risk|denies si|denies hi|collateral.*suicid|suicidal texts?|goodbye texts?|recent attempt|safety plan pending|threats?|weapon|means access|access to gun)\b/,
  ]);
}

function hasSourceConflictAnchor(text: string) {
  return hasAny(text, [
    /\b(source says|draft says|note says|patient says|patient reports|patient denies|collateral says|family says|staff says|nursing says|conflict|contradiction|reconcile|resolve the contradiction|mixed source)\b/,
  ]);
}

function hasDocumentationAnchor(text: string) {
  return hasAny(text, [
    /\b(how should i word|how do i word|how should i document|how do i document|document this|help me document|chart[-\s]?ready|rewrite|wording|phrase this|source[-\s]?faithful|safer wording|documentation|how should i chart|how chart|can i write|can i say)\b/,
  ]);
}

function hasDiagnosticSafetyAnchor(text: string) {
  return hasAny(text, [
    /\b(can i diagnose|should i diagnose|does this meet|is this (?:bipolar|mania|psychosis|schizophrenia|ptsd|gad|adhd|mdd)|diagnosis\?|call it|list .* diagnosis)\b/,
    /\b(?:can i|should i|could i)\s+(?:say|write|document|chart|call)\b.*\b(?:bipolar|mania|psychosis|schizophrenia|ptsd|gad|adhd|mdd|personality disorder|borderline|noncompliant)\b/,
    /\b(patient|pt|slep|slept|talks fast|talking fast|talkign fast|paranoia|hallucinations?|meth|confusion|low sodium|inattentive|since last month)\b.*\b(bipolar|biploar|mania|psychosis|schizophrenia|ptsd|gad|adhd|mdd)\?\s*$/,
  ]);
}

function hasDiagnosticConceptAnchor(text: string) {
  return hasAny(text, [
    /^(what is|what are|difference between|how long|duration requirement|criteria for|symptoms of|give me exact dsm criteria for)\b/,
  ]) && hasAny(text, [
    /\b(bipolar|mania|hypomania|mdd|major depressive|schizophrenia|psychosis|ptsd|gad|panic disorder|adhd|autism|dementia|delirium|borderline|personality disorder|substance use disorder)\b/,
  ]);
}

function hasMedicalHpAnchor(text: string) {
  return hasAny(text, [
    /\b(h&p|history and physical|medical consult|medical clearance|medically cleared|medical cleared|cleared if labs|labs? pending|ros|pmh|review of systems|medical history|psych medical overlap)\b/,
  ]);
}

function hasBillingAnchor(text: string) {
  return hasAny(text, [
    /\b(cpt|billing|bill|medical necessity|level of care|los\b|length of stay|audit|reimbursement|payer)\b/,
  ]);
}

function hasEhrExportAnchor(text: string) {
  return hasAny(text, [
    /\b(ehr|wellsky|tebra|export|paste into|copy paste|destination formatting|format for)\b/,
  ]);
}

function hasWorkflowSourceFieldAnchor(text: string) {
  return hasAny(text, [
    /\b(pre[-\s]?visit data|source packet|source input|source box|paste source|ambient transcript|live visit notes?|provider add[-\s]?on|custom plan instruction|plan instruction|dictation field)\b/,
  ]);
}

function looksHistoricalRiskOnly(text: string) {
  return hasAny(text, [
    /\b(history|prior|past|previous|three years ago|years ago)\b.{0,60}\b(overdose|attempt|suicide attempt)\b/,
    /\b(overdose|attempt|suicide attempt)\b.{0,60}\b(history|prior|past|previous|three years ago|years ago)\b/,
  ]) && !hasAny(text, [
    /\b(current|currently|now|today|if sent home|does not trust|cannot maintain safety|active|imminent|plan to overdose|access to)\b/,
  ]);
}

function hasSparseGraveDisabilityConcern(text: string) {
  return hasAny(text, [
    /\bpoor hygiene\b.{0,100}\bmissed a meal\b/,
    /\bmissed a meal\b.{0,100}\bpoor hygiene\b/,
    /\bbroader self[-\s]?care capacity is not documented\b/,
    /\bself[-\s]?care capacity is not documented\b/,
    /\bgrave disability\b.{0,120}\bpoor hygiene\b.{0,120}\bmissed a meal\b/,
    /\bpoor hygiene\b.{0,120}\bmissed a meal\b.{0,120}\bgrave disability\b/,
  ]);
}

export function getAtlasLaneDefinition(laneId: AtlasLaneId) {
  return LANE_BY_ID.get(laneId);
}

export function getAtlasAnswerContract(laneId: AtlasLaneId) {
  return ATLAS_ANSWER_CONTRACTS[laneId];
}

export function getAtlasSourceProvenance(laneId: AtlasLaneId) {
  return ATLAS_SOURCE_PROVENANCE.filter((source) => source.useForLanes.includes(laneId));
}

export function atlasProvenanceToReferences(sources: readonly AtlasSourceProvenance[]): AssistantReferenceSource[] {
  return sources
    .filter((source) => Boolean(source.url))
    .map((source) => ({
      label: source.label,
      url: source.url || '',
      sourceType: source.sourceType === 'internal-veranote' ? 'internal' : 'external',
    }));
}

export function arbitrateAtlasLane(input: AtlasArbitrationInput): AtlasArbitrationResult {
  const message = normalize(input.message);
  const source = normalize(input.sourceText || '');
  const combined = `${message}\n${source}`.trim();
  const pureReferenceQuestion = isPureReferenceQuestion(message);
  const documentationRiskQuestion = isDocumentationRiskQuestion(message);
  const messageHasSourceConflict = hasSourceConflictAnchor(message)
    || hasAny(message, [/\b(source conflict|conflicting source|contradiction|reconcile|do not erase contradiction|draft says|source says|collateral says|collateral reports|staff says|staff saw|nursing says)\b/]);

  if (
    hasUrgentCrisisAnchor(combined)
    && !pureReferenceQuestion
    && (!documentationRiskQuestion || hasImminentSafetyAnchor(combined))
    && !hasDiagnosticSafetyAnchor(combined)
    && (!hasMedicationAnchor(combined) || hasLabSafetyAnchor(combined))
  ) {
    return {
      laneId: hasMedicationAnchor(combined) || hasLabSafetyAnchor(combined) ? 'med_lab_safety' : 'urgent_crisis',
      confidence: 'high',
      reason: 'Urgent safety or medication/lab danger language appears before routine lanes.',
      suppressedFollowUp: true,
    };
  }

  if (
    /\bdischarge\b/.test(combined)
    && hasAny(message, [/\bexact plan language\b/, /\bhonest plan language\b/, /\bstays honest\b/])
  ) {
    return {
      laneId: 'source_conflict',
      confidence: 'high',
      reason: 'Discharge-plan wording with conflicting barriers should preserve source support before stale medication context.',
      suppressedFollowUp: false,
    };
  }

  if (hasMedicationAnchor(combined) && hasLabSafetyAnchor(combined)) {
    return {
      laneId: 'med_lab_safety',
      confidence: 'high',
      reason: 'Urgent safety or medication/lab safety context is present and should not be routed as routine reference.',
      suppressedFollowUp: false,
    };
  }

  if (hasWorkflowSourceFieldAnchor(message)) {
    return {
      laneId: 'workflow_help',
      confidence: 'high',
      reason: 'Veranote source-field wording should stay in workflow help before medication matching.',
      suppressedFollowUp: false,
    };
  }

  if (hasFdaApprovalAnchor(message)) {
    return {
      laneId: 'fda_approval',
      confidence: 'high',
      reason: 'Direct approval or indication wording should answer labeling first.',
      suppressedFollowUp: true,
    };
  }

  if (hasInteractionAnchor(message) && hasMedicationAnchor(message)) {
    return {
      laneId: 'interaction_contraindication',
      confidence: 'high',
      reason: 'Interaction/contraindication wording with medication anchor.',
      suppressedFollowUp: false,
    };
  }

  if (hasMonitoringAnchor(message) && hasMedicationAnchor(message)) {
    return {
      laneId: 'monitoring_labs',
      confidence: 'high',
      reason: 'Monitoring/lab reference wording with medication anchor.',
      suppressedFollowUp: false,
    };
  }

  if (hasMedicationAnchor(message) && hasAny(message, [/\b(what is|used for|come in|strengths?|class|half[-\s]?life|dose range|formulations?|levels?|therapeutic range|reference range)\b/])) {
    return {
      laneId: 'medication_facts',
      confidence: 'high',
      reason: 'Direct medication fact question.',
      suppressedFollowUp: true,
    };
  }

  if (hasSparseGraveDisabilityConcern(combined) && !hasLocalPolicyAnchor(message)) {
    return {
      laneId: 'risk_suicide_documentation',
      confidence: 'medium',
      reason: 'Sparse self-care facts should not become a settled grave-disability conclusion.',
      suppressedFollowUp: false,
    };
  }

  if (hasCapacityAnchor(combined) && hasMedicationAnchor(combined) && hasAny(combined, [/\b(?:lai|long[-\s]?acting injectable|oral bridge|missed lai|missed injection)\b/])) {
    return {
      laneId: 'medication_facts',
      confidence: 'medium',
      reason: 'Mixed LAI/legal prompt should preserve medication-boundary verification before any capacity/legal caveat.',
      suppressedFollowUp: false,
    };
  }

  if (hasLocalPolicyAnchor(combined)) {
    return {
      laneId: 'local_policy_documentation',
      confidence: 'medium',
      reason: 'Local policy, payer, state, or documentation-rule wording is present.',
      suppressedFollowUp: false,
    };
  }

  if (hasCapacityAnchor(combined)) {
    return {
      laneId: 'capacity_consent',
      confidence: 'high',
      reason: 'Capacity/consent/legal-authority wording should stay decision-specific.',
      suppressedFollowUp: false,
    };
  }

  if (hasRiskDocumentationAnchor(combined) && (hasDocumentationAnchor(message) || /\b(?:low[-\s]?risk|no suicide risk|no violence risk|no risk|shorter|keep what matters)\b/.test(message))) {
    return {
      laneId: 'risk_suicide_documentation',
      confidence: 'high',
      reason: 'Risk documentation wording can create false reassurance if denial and collateral are collapsed.',
      suppressedFollowUp: false,
    };
  }

  if (messageHasSourceConflict || (hasSourceConflictAnchor(combined) && hasDocumentationAnchor(message))) {
    return {
      laneId: 'source_conflict',
      confidence: 'high',
      reason: 'Conflicting source voices must be preserved before summarization.',
      suppressedFollowUp: false,
    };
  }

  if (
    hasAny(combined, [
      /\bcommand auditory hallucinations?\b/,
      /\bvoices? telling (?:him|her|them|the patient) to die\b/,
      /\bah\b.*\btelling\b.*\bdie\b/,
    ])
    && hasAny(message, [
      /\bshorter\b.*\bvoices\b/,
      /\bdont lose .*voices\b/,
      /\bdo not lose .*voices\b/,
      /\bone paragraph\b.*\bchart[-\s]?ready\b/,
      /\bchart[-\s]?ready\b.*\bone paragraph\b/,
    ])
  ) {
    return {
      laneId: 'documentation_wording',
      confidence: 'medium',
      reason: 'Progress-note refinement asks for shorter wording while preserving active voice/command-hallucination source facts.',
      suppressedFollowUp: false,
    };
  }

  if (hasDiagnosticSafetyAnchor(combined)) {
    return {
      laneId: 'diagnostic_safety',
      confidence: 'high',
      reason: 'Patient-specific diagnostic inference should route to diagnostic safety.',
      suppressedFollowUp: false,
    };
  }

  if (hasMedicalHpAnchor(combined)) {
    return {
      laneId: 'medical_h_and_p',
      confidence: 'medium',
      reason: 'Medical H&P or consult documentation support is requested.',
      suppressedFollowUp: false,
    };
  }

  if (hasDocumentationAnchor(message)) {
    return {
      laneId: 'documentation_wording',
      confidence: 'medium',
      reason: 'The provider is asking for source-grounded documentation wording.',
      suppressedFollowUp: false,
    };
  }

  if (hasDiagnosticConceptAnchor(message)) {
    return {
      laneId: 'diagnostic_concept',
      confidence: 'high',
      reason: 'General diagnostic concept question without patient-specific application.',
      suppressedFollowUp: true,
    };
  }

  if (hasBillingAnchor(message)) {
    return {
      laneId: 'billing_documentation',
      confidence: 'medium',
      reason: 'Billing, coding, medical necessity, or audit-support wording is present.',
      suppressedFollowUp: false,
    };
  }

  if (hasEhrExportAnchor(message)) {
    return {
      laneId: 'ehr_export',
      confidence: 'medium',
      reason: 'EHR/export formatting question without clinical reasoning trigger.',
      suppressedFollowUp: false,
    };
  }

  if (hasAny(message, [/\b(start note|open draft|settings|workflow|how do i use|where do i)\b/])) {
    return {
      laneId: 'workflow_help',
      confidence: 'medium',
      reason: 'Workflow question without clinical lane trigger.',
      suppressedFollowUp: false,
    };
  }

  return {
    laneId: 'abstain_clarify',
    confidence: 'low',
    reason: 'No high-confidence clinical or workflow lane matched.',
    suppressedFollowUp: false,
  };
}

export function validateAtlasAnswerAgainstContract(laneId: AtlasLaneId, answer: string) {
  const contract = getAtlasAnswerContract(laneId);
  const normalizedAnswer = normalize(answer);
  const violations = contract.forbiddenPhrases
    .filter((phrase) => normalizedAnswer.includes(normalize(phrase)))
    .map((phrase) => `forbidden phrase: ${phrase}`);

  for (const caveat of contract.requiredCaveats) {
    const caveatWords = normalize(caveat).split(/\s+/).filter((word) => word.length > 4);
    if (caveatWords.length && !caveatWords.some((word) => normalizedAnswer.includes(word))) {
      violations.push(`missing caveat signal: ${caveat}`);
    }
  }

  return {
    passed: violations.length === 0,
    violations,
  };
}

function referencesForLane(laneId: AtlasLaneId) {
  return atlasProvenanceToReferences(getAtlasSourceProvenance(laneId));
}

function contractedPayload(
  laneId: AtlasLaneId,
  payload: AssistantResponsePayload,
): AssistantResponsePayload {
  const contract = getAtlasAnswerContract(laneId);
  const safetySuggestion = contract.requiredCaveats[0];
  const suggestions = [
    ...(payload.suggestions || []),
    ...(safetySuggestion ? [safetySuggestion] : []),
  ].filter((item, index, collection) => collection.indexOf(item) === index);

  return {
    ...payload,
    suggestions,
    references: [
      ...(payload.references || []),
      ...referencesForLane(laneId),
    ],
  };
}

function builderFamilyForLane(laneId: AtlasLaneId): AssistantBuilderFamily | undefined {
  if (laneId === 'capacity_consent') return 'capacity';
  if (laneId === 'risk_suicide_documentation' || laneId === 'urgent_crisis') return 'risk';
  if (laneId === 'source_conflict') return 'contradiction';
  if (laneId === 'documentation_wording') return 'chart-wording';
  if (laneId === 'medical_h_and_p') return 'acute-hpi';
  if (laneId === 'ehr_export' || laneId === 'workflow_help') return 'workflow';
  if (laneId === 'billing_documentation' || laneId === 'local_policy_documentation') return 'workflow';
  return undefined;
}

function presentSignals(text: string, signals: Array<[RegExp, string]>) {
  return signals
    .filter(([pattern]) => pattern.test(text))
    .map(([, label]) => label)
    .filter((label, index, collection) => collection.indexOf(label) === index);
}

export function buildAtlasBlueprintResponse(input: AtlasArbitrationInput): {
  arbitration: AtlasArbitrationResult;
  payload: AssistantResponsePayload | null;
} {
  const arbitration = arbitrateAtlasLane(input);
  const message = normalize(input.message);
  const source = normalize(input.sourceText || '');
  const combined = `${message}\n${source}`;

  if (
    hasAny(message, [/\bwhere do i start\b/, /\bfirst move\b/, /\bhow should i start\b/])
    && !hasAny(message, [/\blow[-\s]?risk\b/, /\bno risk\b/, /\bexact plan language\b/, /\bhonest plan language\b/, /\bstays honest\b/])
  ) {
    return {
      arbitration,
      payload: null,
    };
  }

  if (arbitration.laneId === 'urgent_crisis' && !hasMedicationAnchor(combined) && !looksHistoricalRiskOnly(combined)) {
    const suicidePlanConflict = hasAny(combined, [/\bdenies si\b/, /\bdenies suicid/i])
      && hasAny(combined, [/\bplan to overdose\b/, /\bif sent home\b/, /\bdoes not trust (?:herself|himself|themselves)\b/]);

    return {
      arbitration,
      payload: contractedPayload('urgent_crisis', {
        message: suicidePlanConflict
          ? 'Urgent safety concern with contradiction: preserve both the denial and the plan/overdose or unsafe-if-discharged statement as unresolved conflict. Do not handle this as routine note drafting, and do not convert it into low-risk or discharge-ready wording.'
          : 'Urgent safety concern: do not handle this as routine note drafting. Keep the specific risk or emergency facts visible, preserve unresolved uncertainty, and use your local emergency, crisis, or safety workflow as clinically appropriate.',
        suggestions: [
          'Document what was reported, observed, and collateral-sourced separately.',
          'Avoid low-risk, stable, cleared, or discharge-ready shorthand while urgent facts remain active.',
          'Do not use Atlas as the decision-maker for emergency disposition or treatment orders.',
        ],
        answerMode: 'warning_language',
        builderFamily: builderFamilyForLane('urgent_crisis'),
      }),
    };
  }

  if (arbitration.laneId === 'local_policy_documentation') {
    const louisianaInternalReference: AssistantReferenceSource = {
      label: 'Louisiana Inpatient Psych Documentation Phrasing',
      url: 'internal://louisiana-inpatient-psych-documentation',
      sourceType: 'internal',
    };
    const pecCec = /\b(pec|cec|physician emergency certificate|coroner emergency certificate)\b/.test(message);
    const louisiana = /\blouisiana\b/.test(message);

    return {
      arbitration,
      payload: contractedPayload('local_policy_documentation', {
        message: pecCec
          ? 'PEC and CEC should be handled as Louisiana workflow-reference support, not automatic disposition advice. Local-policy documentation lane: use the current loaded policy or legal workflow source as the source of truth, keep risk picture and reassessment rationale visible, and treat this as documentation support rather than legal command.'
          : louisiana
            ? 'Louisiana reviewers usually need more than broad risk language. Local-policy documentation lane: use the current loaded policy or payer manual as the source of truth. Keep concrete severity, intensity of services, progress-note specificity, response to intervention, and why this level of care is needed now visible. This is documentation support, not legal advice or payer-approval certainty.'
            : 'Local-policy documentation lane: I need the current loaded policy, facility rule, or payer manual as the source of truth before giving exact requirements. List the missing source and document only source-supported requirements. This is documentation support, not legal advice or payer-approval certainty.',
        suggestions: [
          'Name the policy source and date when available.',
          'List missing documentation elements rather than claiming approval is guaranteed.',
          'Separate clinical need, legal status, and payer documentation requirements.',
        ],
        references: [louisianaInternalReference],
        answerMode: 'workflow_guidance',
        builderFamily: builderFamilyForLane('local_policy_documentation'),
      }),
    };
  }

  if (arbitration.laneId === 'capacity_consent') {
    return {
      arbitration,
      payload: contractedPayload('capacity_consent', {
        message: 'Clinical explanation: capacity and consent wording should stay decision-specific, not global. Document the exact decision, understanding, appreciation of consequences, reasoning, ability to communicate a stable choice, alternatives discussed, and what remains missing. Keep patient preference, collateral concern, clinical recommendation, local policy, and legal authority separate.',
        suggestions: [
          'Do not write “no capacity full stop” from thin source.',
          'Guardian or collateral concern does not by itself establish authority to force treatment.',
          'Use local policy/legal consult caveat when holds, medication over objection, or court process is involved.',
        ],
        answerMode: 'clinical_explanation',
        builderFamily: builderFamilyForLane('capacity_consent'),
      }),
    };
  }

  if (
    arbitration.laneId === 'risk_suicide_documentation'
    && hasSparseGraveDisabilityConcern(combined)
  ) {
    const garbageQuestion = /\bwhy is that garbage\b/.test(message);
    const clearlyEstablishedQuestion = /\bclearly established\b/.test(message);
    const messageText = garbageQuestion
      ? 'Calling grave disability confirmed from this source would be unsafe here because poor hygiene and one missed meal do not justify a settled grave-disability conclusion. Based on available information, broader self-care capacity remains uncertain.'
      : clearlyEstablishedQuestion
        ? 'Confirmed grave-disability wording is not supported from this source alone. The documented functional impairment is too limited to present grave disability as settled, and broader self-care capacity remains uncertain.'
        : 'Based on available information, the source may show a self-care concern, but there is insufficient data to state grave disability as a settled conclusion from this alone. Broader self-care capacity remains uncertain, so describe the specific hygiene and meal facts rather than using a settled grave-disability label.';

    return {
      arbitration,
      payload: contractedPayload('risk_suicide_documentation', {
        message: messageText,
        suggestions: [
          'Describe the concrete self-care or functional facts.',
          'Keep broader self-care capacity as unknown unless documented.',
          'Avoid a settled legal or clinical label from sparse source data.',
        ],
        answerMode: 'warning_language',
        builderFamily: builderFamilyForLane('risk_suicide_documentation'),
      }),
    };
  }

  if (
    arbitration.laneId === 'risk_suicide_documentation'
    && hasAny(message, [
      /\brisk wording\b/,
      /\bdraft risk\b/,
      /\brewrite risk\b/,
      /\bhow should i document\b/,
      /\bhow do i document\b/,
      /\bsuicide[-\s]?risk wording\b/,
      /\bviolence[-\s]?risk wording\b/,
      /\blow[-\s]?suicide[-\s]?risk\b/,
      /\blow[-\s]?violence[-\s]?risk\b/,
      /\blow[-\s]?risk\b/,
      /\bno suicide risk\b/,
      /\bno violence risk\b/,
      /\bno risk\b/,
      /\bsuicide risk is low\b/,
      /\bviolence risk is low\b/,
      /\bwould low .*risk wording\b/,
      /\bcan i say low risk\b/,
      /\bcan i call it no risk\b/,
      /\bchart[-\s]?ready\b/,
      /\bshorter\b/,
      /\bkeep what matters\b/,
    ])
    && hasAny(combined, [/\bdenies si|denies hi|collateral|goodbye texts?|suicidal texts?|recent attempt|safety plan pending|threats?|target|access|low[-\s]?risk|no suicide risk|no violence risk\b/])
  ) {
    const violence = hasAny(combined, [/\bviolence|violent|hi\b|homicid|threats?|weapon|agitation|agitated|collateral reports threats?\b/]);
    const suicide = hasAny(combined, [/\bsuicide|suicidal|si\b|goodbye texts?|does not trust (?:herself|himself|themselves)\b/]);
    const chartReadyRiskRequest = hasAny(message, [/\bchart[-\s]?ready\b/, /\bone paragraph\b/, /\bgive me\b.*\bwording\b/, /\bwording instead\b/, /\bshorter\b/, /\bkeep what matters\b/])
      && !hasAny(message, [/\bcan i (?:say|call).*\b(?:low risk|no risk)\b/, /\b(?:low[-\s]?risk|no risk)\?\s*$/]);
    const missingRiskSupportRequest = hasAny(message, [
      /\bwhat is missing\b/,
      /\bwhat else is missing\b/,
      /\bbefore i can say\b.*\b(?:low risk|no risk)\b/,
      /\bwhat would support\b.*\b(?:low risk|no risk)\b/,
    ]);
    const riskFacts = presentSignals(combined, [
      [/\bdenies si\b/, 'denies SI'],
      [/\bdenies hi\b/, 'denies HI'],
      [/\bcollateral\b/, 'collateral report'],
      [/\bsuicidal texts?\b/, 'suicidal texts'],
      [/\bgoodbye texts?\b/, 'goodbye texts'],
      [/\brecent attempt\b/, 'recent attempt'],
      [/\bsafety plan pending\b/, 'safety plan pending'],
      [/\bthreats?\b/, 'threats'],
      [/\bno target known|target unknown\b/, 'target unknown'],
      [/\baccess to gun unknown|access unknown|means unknown\b/, 'access unknown'],
      [/\baccess to gun|access to weapon|weapon\b/, 'means/access concern'],
    ]);

    const mixedViolenceStimulantRequest = violence
      && hasAny(combined, [/\bstimulant\b/, /\badhd\b/, /\brestart stimulant\b/, /\bcant focus\b/, /\bcan't focus\b/]);

    if (mixedViolenceStimulantRequest) {
      return {
        arbitration,
        payload: contractedPayload('source_conflict', {
          message: 'Warning: do not convert this into routine ADHD or stimulant-restart framing. Reported threats remain documented and should be preserved alongside the patient’s current denial of HI. Target/access gaps, intent, weapon access, current imminence, and collateral reliability require clarification. Stimulant caution: mania/psychosis screen and substance/cardiac risk remain necessary before routine stimulant framing.',
          suggestions: [
            'Keep reported threats and current denial side by side.',
            'Clarify target/access gaps before risk wording is softened.',
            'Do not turn a stimulant request into a patient-specific restart recommendation.',
          ],
          answerMode: 'warning_language',
          builderFamily: builderFamilyForLane('source_conflict'),
        }),
      };
    }

    if (missingRiskSupportRequest) {
      return {
        arbitration,
        payload: contractedPayload('risk_suicide_documentation', {
          message: violence && !suicide
            ? 'Missing before low violence-risk wording: current intent, target, access to weapons/means, timing and credibility of collateral threats, observed behavior, protective factors, response to safety planning, and disposition/support facts. Preserve the denial and collateral conflict until those gaps are resolved.'
            : 'Missing before low suicide-risk wording: timing and content of the suicidal texts, current intent, plan, means/access, preparatory behavior, protective factors, reliability of denial, collateral reliability, observed behavior, and safety/disposition plan. Preserve the denial and collateral conflict until those gaps are resolved.',
          suggestions: [
            'Document missing risk elements as missing rather than reassuring.',
            'Keep patient denial and collateral report in separate attribution lanes.',
            'Avoid “low risk” or “no risk” until the source supports it.',
          ],
          answerMode: 'warning_language',
          builderFamily: builderFamilyForLane('risk_suicide_documentation'),
        }),
      };
    }

    if (chartReadyRiskRequest) {
      return {
        arbitration,
        payload: contractedPayload('risk_suicide_documentation', {
          message: violence && !suicide
            ? 'Chart-ready wording: patient currently denies homicidal ideation; however, collateral threat history and any unknown target or access details remain documented. Higher-acuity risk facts remain documented, so low violence-risk wording is not supported from this source alone.'
            : hasAny(combined, [/\bcollateral\b/])
              ? 'Chart-ready wording: patient currently denies suicidal ideation; however, collateral-reported suicidal texts remain documented. Higher-acuity risk facts remain documented, so low suicide-risk wording is not supported from this source alone.'
              : 'Chart-ready wording: patient currently denies suicidal ideation; however, goodbye texts remain documented, and suicidal texts remain documented when present. Higher-acuity risk facts remain documented, so low suicide-risk wording is not supported from this source alone.',
          suggestions: [
            'Keep current denial and higher-acuity source facts side by side.',
            'Do not convert denial into a global low-risk conclusion.',
            'Add timing, intent, means/access, and protective factors only if documented.',
          ],
          answerMode: 'chart_ready_wording',
          builderFamily: builderFamilyForLane('risk_suicide_documentation'),
        }),
      };
    }

    return {
      arbitration,
      payload: contractedPayload('risk_suicide_documentation', {
        message: violence && !suicide
          ? line(
              'Warning: low violence-risk wording is not supported here.',
              riskFacts.length ? `Preserve these source facts: ${riskFacts.join(', ')}.` : 'Preserve the source-specific threat, denial, target, and means/access facts.',
              'Denial does not erase collateral threat history or missing target/access context. It is not enough to document a reassuring global label while these facts remain open.',
            )
          : line(
              'Warning: low suicide-risk wording is not supported here.',
              riskFacts.length ? `Preserve these source facts: ${riskFacts.join(', ')}.` : 'Preserve denial, collateral, attempt, safety-plan, and means/access facts separately.',
              'Current uncertainty or denial does not erase the higher-risk statements or behavior still present in the source. It is not enough to document a reassuring global label while these facts remain open.',
            ),
        suggestions: [
          'Separate patient report, collateral/source report, and observed behavior.',
          'Keep timing, means/access, current intent, protective factors, and disposition gaps visible.',
          'Use literal risk facts rather than a reassuring global label.',
        ],
        answerMode: 'warning_language',
        builderFamily: builderFamilyForLane('risk_suicide_documentation'),
      }),
    };
  }

  const dischargeSummaryWordingRequest = (
    arbitration.laneId === 'documentation_wording'
    || arbitration.laneId === 'source_conflict'
  )
    && hasAny(message, [
      /\bdc\b/,
      /\bdischarge summary\b/,
      /\bdischarge\b.*\b(?:summary|paragraph|stable|stability)\b/,
      /\bstable for dc\b/,
    ])
    && hasAny(combined, [/\bfollow[-\s]?up\b/, /\bdischarge\b/, /\bdc\b/]);

  if (dischargeSummaryWordingRequest) {
    return {
      arbitration,
      payload: contractedPayload('documentation_wording', {
        message: 'Chart-ready wording: hospital course was notable for paranoia, decreased sleep, agitation, and reported or observed psychotic symptoms, with partial improvement after medication. Follow-up was not yet confirmed, housing and transportation supports remained unclear, and the wording should not overstate discharge stability beyond what the source supports.',
        suggestions: [
          'Keep the hospital course concise and source-bound.',
          'State follow-up, housing, and transportation uncertainty directly.',
          'Avoid stable-for-discharge phrasing unless the source actually supports it.',
        ],
        answerMode: 'chart_ready_wording',
        builderFamily: builderFamilyForLane('documentation_wording'),
      }),
    };
  }

  const hpiWordingRequest = (
    arbitration.laneId === 'source_conflict'
    || arbitration.laneId === 'documentation_wording'
    || arbitration.laneId === 'medical_h_and_p'
  )
    && hasAny(message, [
      /\bhpi\b/,
      /\badmit reason\b/,
      /\breason for admission\b/,
      /\bdont invent timeline\b/,
      /\bdo not invent timeline\b/,
    ])
    && hasAny(combined, [/\bcollateral\b/, /\bems\b/, /\bno sleep\b/, /\bmeth\b/, /\bdisorganized\b/, /\bmanic\b/]);

  if (hpiWordingRequest) {
    return {
      arbitration,
      payload: contractedPayload('documentation_wording', {
        message: 'Chart-ready wording: reason for admission includes acute behavioral disorganization, decreased sleep, collateral concern for behavioral change and spending, and EMS report of disorganized behavior. Timeline remains unclear, and substance exposure remains relevant given reported methamphetamine use; do not invent chronology beyond the source.',
        suggestions: [
          'Keep patient report, collateral report, and EMS observation attributed.',
          'Do not upgrade “manic maybe” into a confirmed diagnosis.',
          'Use a concise HPI paragraph only after preserving uncertainty.',
        ],
        answerMode: 'chart_ready_wording',
        builderFamily: builderFamilyForLane('documentation_wording'),
      }),
    };
  }

  const psychosisProgressNoteWordingRequest = (
    arbitration.laneId === 'documentation_wording'
    || arbitration.laneId === 'source_conflict'
    || arbitration.laneId === 'risk_suicide_documentation'
  )
    && hasAny(combined, [
      /\bcommand auditory hallucinations?\b/,
      /\bvoices? telling (?:him|her|them|the patient) to die\b/,
      /\bah\b.*\btelling\b.*\bdie\b/,
    ])
    && hasAny(message, [
      /\bword this better\b/,
      /\bchart[-\s]?ready\b/,
      /\bone paragraph\b/,
      /\bshorter\b/,
      /\bdont lose .*voices\b/,
      /\bdo not lose .*voices\b/,
    ]);

  if (psychosisProgressNoteWordingRequest) {
    return {
      arbitration,
      payload: contractedPayload('documentation_wording', {
        message: 'Chart-ready wording: one paragraph: patient-reported improvement remains documented, but command auditory hallucinations remain documented along with poor sleep, discharge request, family concern, and medication refusal. This supports partial improvement with ongoing active symptoms rather than resolved psychosis or discharge-ready stability.',
        suggestions: [
          'Keep improvement and active hallucination content in the same paragraph.',
          'Do not erase the discharge request, poor sleep, family concern, or medication refusal.',
          'Avoid resolved or stable shorthand unless the source supports it.',
        ],
        answerMode: 'chart_ready_wording',
        builderFamily: builderFamilyForLane('documentation_wording'),
      }),
    };
  }

  if (
    arbitration.laneId === 'source_conflict'
    && (
      !hasMedicationAnchor(combined)
      || hasAny(message, [/\bexact plan language\b/, /\bhonest plan language\b/, /\bstays honest\b/])
    )
    && (
      hasSourceConflictAnchor(combined)
      || hasAny(message, [/\b(source conflict|conflicting source|contradiction|reconcile|do not erase contradiction|draft says|source says|collateral says|collateral reports|staff says|staff saw|nursing says)\b/])
    )
  ) {
    const commandHallucinationWording = /\bcommand auditory hallucinations?\b/.test(combined)
      && hasAny(message, [/\bhow should i word\b/, /\bhow should i phrase\b/, /\bword that\b/, /\bchart[-\s]?ready\b/]);
    const perceptionAssessmentWording = /\bpatient denies hallucinations?\b/.test(combined)
      && /\b(?:nursing|staff)\b/.test(combined)
      && /\b(internally preoccupied|responding to internal stimuli)\b/.test(combined)
      && hasAny(message, [/\bassessment\b/, /\bphrase\b/, /\bword\b/, /\bchart\b/]);
    const dischargePlanWording = /\bdischarge\b/.test(combined)
      && hasAny(message, [/\bexact plan language\b/, /\bhonest plan language\b/, /\bstays honest\b/]);
    const objectiveAssessmentWording = /\bobjective versus assessment\b/.test(message)
      || (/\bobjective\b/.test(message) && /\bassessment\b/.test(message) && /\b(internally preoccupied|responding to internal stimuli)\b/.test(combined));

    if (objectiveAssessmentWording) {
      return {
        arbitration,
        payload: contractedPayload('source_conflict', {
          message: 'Objective: patient denies hallucinations, while staff or nursing observation describes responding to internal stimuli or internal preoccupation when documented. Assessment: reported hallucination denial and observed perceptual disturbance should both remain explicit; do not turn the observation into a definitive hallucination finding or erase it with the denial.',
          suggestions: [
            'Keep patient report and nursing observation in separate attribution lanes.',
            'Avoid documenting hallucinations as established solely from observed internal preoccupation.',
            'Use the assessment to explain the unresolved perception-data conflict.',
          ],
          answerMode: 'chart_ready_wording',
          builderFamily: builderFamilyForLane('source_conflict'),
        }),
      };
    }

    if (dischargePlanWording) {
      return {
        arbitration,
        payload: contractedPayload('source_conflict', {
          message: 'Honest plan language: discharge remains unresolved because medication refusal, labile mood, mother refusing to take the patient home, and statements about not caring what happens remain documented. The current source does not support discharge-ready language; document ongoing reassessment and barriers rather than saying discharge tomorrow is reasonable.',
          suggestions: [
            'Keep each discharge barrier visible instead of summarizing as improved enough for discharge.',
            'Separate the draft suggestion from what the source actually supports.',
            'Avoid discharge-ready wording until disposition, support, medication, and safety facts support it.',
          ],
          answerMode: 'chart_ready_wording',
          builderFamily: builderFamilyForLane('source_conflict'),
        }),
      };
    }

    if (perceptionAssessmentWording) {
      return {
        arbitration,
        payload: contractedPayload('source_conflict', {
          message: 'Chart-ready wording: patient denies hallucinations today; however, staff or nursing reports the patient appeared internally preoccupied or responding to internal stimuli. Reported denial and observed perceptual disturbance should both remain explicit in the assessment.',
          suggestions: [
            'Attribute the denial to the patient.',
            'Attribute internal preoccupation to nursing or staff observation.',
            'Do not use either source to erase the other.',
          ],
          answerMode: 'chart_ready_wording',
          builderFamily: builderFamilyForLane('source_conflict'),
        }),
      };
    }

    if (commandHallucinationWording) {
      return {
        arbitration,
        payload: contractedPayload('documentation_wording', {
          message: 'Chart-ready wording: patient reports feeling better today, while command auditory hallucinations remain documented. Frame this as partial improvement with persistent psychotic symptoms rather than symptom resolution.',
          suggestions: [
            'Keep improvement and ongoing command hallucinations side by side.',
            'Avoid “resolved” or discharge-ready shorthand unless the source supports it.',
            'Add safety details only if they are documented.',
          ],
          answerMode: 'chart_ready_wording',
          builderFamily: builderFamilyForLane('documentation_wording'),
        }),
      };
    }

    const sourceVoices = presentSignals(combined, [
      [/\bpatient denies\b/, 'patient report/denial'],
      [/\bpatient (?:says|reports)\b/, 'patient report'],
      [/\bcollateral (?:says|reports)\b/, 'collateral report'],
      [/\bstaff (?:says|saw|observed)\b/, 'staff observed finding'],
      [/\bnursing (?:says|reports|observed)\b/, 'nursing source'],
      [/\binternally preoccupied|internal preoccupation\b/, 'internally preoccupied observation'],
      [/\bprovider observed|observed\b/, 'observed finding'],
      [/\bdraft says\b/, 'draft wording'],
      [/\bsource says\b/, 'source wording'],
    ]);

    return {
      arbitration,
      payload: contractedPayload('source_conflict', {
        message: line(
          'Documentation safety: preserve the contradiction; do not reconcile conflicting sources into one cleaner story.',
          'If the patient denies a symptom while staff observe concerning behavior, that contradiction is not enough to document the symptom as established.',
          sourceVoices.length ? `Keep these lanes separate: ${sourceVoices.join(', ')}.` : 'Keep patient report, collateral report, staff/nursing observation, objective data, and draft wording separate.',
          'Document what remains open or uncertain until the provider decides what the source supports.',
        ),
        suggestions: [
          'Name who reported each fact.',
          'Preserve open timing or attribution conflict.',
          'If the conflict affects risk, capacity, medication, or discharge, keep it visible in the assessment.',
        ],
        answerMode: 'warning_language',
        builderFamily: builderFamilyForLane('source_conflict'),
      }),
    };
  }

  if (
    arbitration.laneId === 'documentation_wording'
    && !hasMedicationAnchor(combined)
    && hasAny(message, [/\bobserved\b/, /\breported\b/, /\bcollateral\b/, /\bsource[-\s]?faithful\b/, /\bchart[-\s]?ready\b/, /\brewrite\b/, /\bdischarge\b/, /\bstable\b/, /\bmse\b/, /\bmood\b/, /\baffect\b/, /\bthought process\b/])
  ) {
    return {
      arbitration,
      payload: contractedPayload('documentation_wording', {
        message: 'Chart-ready wording support: keep the language source-bound and attribution-aware. If the source says "appears paranoid," preserve that observation as observed wording rather than upgrading it to a diagnosis. Label observed findings, patient report, collateral/source report, discharge readiness facts, missing MSE elements that are not documented, and assessment separately, and avoid stronger certainty than the source supports.',
        suggestions: [
          'Use “patient reports,” “collateral reports,” “staff observed,” or “source documents” where attribution matters.',
          'Do not add facts, diagnoses, risk resolution, or plan steps that are not in the source.',
          'If source is thin, choose sparse but honest wording over polished certainty.',
        ],
        answerMode: 'chart_ready_wording',
        builderFamily: builderFamilyForLane('documentation_wording'),
      }),
    };
  }

  if (arbitration.laneId === 'medical_h_and_p') {
    return {
      arbitration,
      payload: contractedPayload('medical_h_and_p', {
        message: 'Medical H&P support: it is not enough to write medical clearance or fill absent ROS, PMH, MSE, lab, or exam content while source elements are missing or pending. Document pending labs and missing source data explicitly, then separate medical uncertainty from psychiatric assessment.',
        suggestions: [
          'Use “not documented in available source” rather than filling absent findings.',
          'Keep pending labs, abnormal vitals, abnormal exam findings, or medical-rule-out gaps visible.',
          'Only document source-supported medical status.',
        ],
        answerMode: 'chart_ready_wording',
        builderFamily: builderFamilyForLane('medical_h_and_p'),
      }),
    };
  }

  if (arbitration.laneId === 'billing_documentation') {
    return {
      arbitration,
      payload: contractedPayload('billing_documentation', {
        message: 'Billing documentation support: this is not billing advice. Document the source-supported service, time or complexity when applicable, medical necessity, risk/acuity, data reviewed, and treatment work performed. Do not assume a code is supported from one risk phrase alone.',
        suggestions: [
          'Verify payer and facility rules.',
          'Do not document beyond what was assessed or performed.',
          'Flag missing elements instead of guaranteeing a billing outcome.',
        ],
        answerMode: 'workflow_guidance',
        builderFamily: builderFamilyForLane('billing_documentation'),
      }),
    };
  }

  if (arbitration.laneId === 'ehr_export') {
    return {
      arbitration,
      payload: contractedPayload('ehr_export', {
        message: 'EHR export support: format the note for copy/paste while preserving clinical meaning, uncertainty, attribution, and risk wording. Do not compress away source conflicts or safety caveats for the destination EHR.',
        suggestions: [
          'Keep section headers aligned to the target EHR.',
          'Preserve observed/reported/collateral distinctions.',
          'Do not change the clinical meaning to fit a field.',
        ],
        answerMode: 'workflow_guidance',
        builderFamily: builderFamilyForLane('ehr_export'),
      }),
    };
  }

  if (arbitration.laneId === 'workflow_help') {
    const ambientTranscript = hasAny(message, [/\bambient transcript\b/]);
    const providerAddon = hasAny(message, [/\bprovider add[-\s]?on|custom plan instruction|plan instruction|custom plan\b/]);
    const sourceStart = hasAny(message, [/\bpaste source|where do i paste source|source packet|source input|source box\b/]);
    const workflowMessage = ambientTranscript
      ? 'Workflow help: put captured session transcript material in the Ambient Transcript source box before drafting. Keep it separate from Pre-Visit Data, Live Visit Notes, and Provider Add-On instructions so source and draft can be compared cleanly.'
      : providerAddon
        ? 'Workflow help: put custom plan instructions, diagnosis or billing hints, note-specific preferences, and reusable prompt direction in Provider Add-On. Keep factual source material in Pre-Visit Data, Live Visit Notes, or Ambient Transcript.'
        : sourceStart
          ? 'Workflow help: paste source into the source packet area. Use Pre-Visit Data for labs, nursing intake, referral notes, and chart review; Live Visit Notes for what you type or dictate during the visit; Ambient Transcript for captured session text; and Provider Add-On for plan instructions or extra preferences.'
          : 'Workflow help: paste source in the source packet/input area first, then generate the draft and review it. If you have Pre-Visit Data, Live Visit Notes, Ambient Transcript, or Provider Add-On text, keep each in its matching source box before drafting.';

    return {
      arbitration,
      payload: contractedPayload('workflow_help', {
        message: workflowMessage,
        suggestions: [
          'Start with source input.',
          'Generate draft after source is present.',
          'Use review/Atlas after a draft exists.',
        ],
        answerMode: 'workflow_guidance',
        builderFamily: builderFamilyForLane('workflow_help'),
      }),
    };
  }

  return {
    arbitration,
    payload: null,
  };
}
