import { loadEnvConfig } from '@next/env';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

type BankCase = {
  id: string;
  noteType: string;
  sourceStyle: string;
  syntheticRawInput: string;
  expectedSections: string[];
  mustInclude: string[];
  mustNotInclude: string[];
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  sourcePattern: string;
  scoringRubric: Record<RootCause, string[]>;
};

type RootCause =
  | 'sourceFidelity'
  | 'structure'
  | 'riskWording'
  | 'mseHandling'
  | 'assessmentQuality'
  | 'planQuality'
  | 'dischargeSafety';

type Issue = {
  rootCause: RootCause;
  severity: 'minor' | 'major' | 'critical';
  detail: string;
};

type CaseResult = {
  id: string;
  noteType: string;
  appNoteType: string;
  riskLevel: BankCase['riskLevel'];
  passed: boolean;
  failureReasons: string[];
  noteExcerpt: string;
  issues: Issue[];
  recommendedAction: 'no_change' | 'needs_fix' | 'needs_regression';
  generationMode: 'live' | 'fallback';
  generationReason: string;
  generatedNoteLength: number;
};

type EvalSummary = {
  selected: number;
  run: number;
  passed: number;
  failed: number;
  passRate: number;
  failuresByNoteType: Record<string, number>;
  failuresByRootCause: Record<RootCause, number>;
  top10Failures: Array<{
    id: string;
    noteType: string;
    riskLevel: BankCase['riskLevel'];
    issueCount: number;
    criticalIssues: number;
    majorIssues: number;
    failureReasons: string[];
    recommendedAction: CaseResult['recommendedAction'];
  }>;
  recommendedFirstRepairCluster: string;
};

export type NoteBuilderE2eReport = {
  runtimePath: string;
  bankPath: string;
  generatedAt: string;
  selectionMethod: string;
  generation: {
    modes: Record<string, number>;
    reasons: Record<string, number>;
  };
  summary: EvalSummary;
  cases: CaseResult[];
};

const runtimePath = '/Users/danielhale/.openclaw/workspace/app-prototype';
const defaultBankPath = '/Users/danielhale/Documents/New project/lib/eval/note-builder/provider-history-note-builder-bank.json';
const outputJsonPath = path.join(runtimePath, 'test-results/note-builder-provider-history-e2e-first25.json');
const outputMarkdownPath = path.join(runtimePath, 'test-results/note-builder-provider-history-e2e-first25.md');
const defaultReportTitle = 'Veranote Note-Builder Provider-History E2E First 25';

const rootCauseLabels: Record<RootCause, string> = {
  sourceFidelity: 'source fidelity',
  structure: 'structure',
  riskWording: 'risk wording',
  mseHandling: 'MSE handling',
  assessmentQuality: 'assessment quality',
  planQuality: 'plan quality',
  dischargeSafety: 'discharge safety',
};

const priorityNoteTypes = [
  'psychiatric_crisis_note',
  'risk_heavy_note',
  'inpatient_psych_discharge_summary',
  'collateral_heavy_note',
  'substance_vs_psych_overlap_note',
  'medical_vs_psych_overlap_note',
];

function loadBank(bankPath = defaultBankPath) {
  return JSON.parse(fs.readFileSync(bankPath, 'utf8')) as BankCase[];
}

function unquoteEnvValue(value: string) {
  const trimmed = value.trim();
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }

  return trimmed;
}

function loadEvaluationEnv() {
  loadEnvConfig(runtimePath);

  const localEnvPath = path.join(runtimePath, '.env.local');
  if (!fs.existsSync(localEnvPath)) return;

  const localEnv = fs.readFileSync(localEnvPath, 'utf8');
  for (const key of ['OPENAI_API_KEY', 'OPENAI_MODEL']) {
    if (process.env[key]) continue;

    const match = localEnv.match(new RegExp(`^${key}\\s*=\\s*(.+)$`, 'm'));
    if (match?.[1]) {
      process.env[key] = unquoteEnvValue(match[1]);
    }
  }
}

export function selectFirst25Cases(bank: BankCase[]) {
  function score(item: BankCase) {
    let value = 0;
    if (item.riskLevel === 'critical') value += 1000;
    if (item.riskLevel === 'high') value += 100;
    const priorityIndex = priorityNoteTypes.indexOf(item.noteType);
    if (priorityIndex >= 0) value += 80 - priorityIndex * 10;
    return value;
  }

  return bank
    .map((item, index) => ({ item, index }))
    .sort((a, b) => score(b.item) - score(a.item) || a.index - b.index)
    .slice(0, 25)
    .map(({ item }) => item);
}

function appNoteTypeFor(noteType: string) {
  switch (noteType) {
    case 'inpatient_psych_initial_evaluation':
      return 'Inpatient Psych Initial Adult Evaluation';
    case 'inpatient_psych_progress_note':
      return 'Inpatient Psych Progress Note';
    case 'inpatient_psych_discharge_summary':
      return 'Inpatient Psych Discharge Summary';
    case 'medical_h_and_p':
      return 'Medical H&P';
    case 'medical_consult_note':
      return 'Medical Consultation Note';
	    case 'psychiatric_crisis_note':
	      return 'Psychiatric Crisis Note';
		    case 'outpatient_psych_followup':
		      return 'Outpatient Psych Follow-Up';
	    case 'sparse_source_note':
	      return 'Sparse Source Note';
    case 'substance_vs_psych_overlap_note':
      return 'Substance-vs-Psych Overlap Note';
    case 'medical_vs_psych_overlap_note':
      return 'Medical-vs-Psych Overlap Note';
    case 'collateral_heavy_note':
      return 'Collateral-Heavy Note';
    case 'risk_heavy_note':
      return 'Risk-Heavy Note';
    default:
      return 'Psychiatry Follow-Up';
  }
}

function normalize(value: string) {
  return value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

function hasAny(text: string, patterns: RegExp[]) {
  return patterns.some((pattern) => pattern.test(text));
}

const sectionPatterns: Record<string, RegExp[]> = {
  chiefComplaint: [/chief (complaint|concern)/i, /\bcc\b/i, /reason for medical h&p/i, /admission context/i, /medical chief concern/i],
  historyOfPresentIllness: [/history of present illness/i, /\bhpi\b/i, /interval update/i, /reason for evaluation/i, /presenting concern/i, /presenting symptoms/i, /clinical concern/i],
  psychiatricHistory: [/psychiatric history/i, /psych history/i],
  substanceUseHistory: [/substance (use )?history/i, /substance use/i, /exposure timeline/i, /substance.*timeline/i],
	  medicalHistory: [/medical history/i, /medical conditions/i],
  pastMedicalHistory: [/past medical history/i, /\bpmh\b/i, /medical history/i],
  medications: [/medications/i, /medication list/i, /home meds/i, /meds/i],
  allergies: [/allergies/i, /allergy/i],
  reviewOfSystems: [/review of systems/i, /\bros\b/i],
  physicalExam: [/physical exam/i, /exam \/ observations/i, /physical.*observations/i],
	  mentalStatusExam: [/mental status/i, /\bmse\b/i, /observations/i],
	  riskAssessment: [/risk assessment/i, /risk assessment at discharge/i, /safety \/ risk/i, /safety and risk/i, /risk rationale/i],
	  assessment: [/\nassessment\b/i, /^assessment\b/i, /assessment \/ medical problems/i, /assessment \/ medical impression/i, /assessment \/ clinical formulation/i, /assessment \/ clinical impression/i, /assessment \/ diagnostic impression/i, /clinical formulation/i, /diagnostic impression/i],
	  plan: [/\nplan\b/i, /^plan\b/i, /plan \/ recommendations/i, /recommendations \/ plan/i, /plan \/ monitoring/i, /plan \/ monitoring \/ reassessment/i, /plan \/ follow-up \/ verification/i, /plan \/ safety \/ monitoring/i, /plan \/ proposed discharge/i, /proposed discharge/i, /monitoring \/ disposition/i, /reassessment/i, /next steps/i],
	  intervalHistory: [/interval history/i, /interval update/i, /patient report/i],
	  symptoms: [/symptoms/i, /symptom review/i, /functional status/i],
	  medicationResponse: [/medication response/i, /response to medication/i, /medication.*(benefit|effect|response|help)/i, /(benefit|effect|response).*medication/i],
	  sideEffects: [/side effects/i, /adverse effects/i, /tolerability/i, /nausea/i],
  triggerOrContext: [/trigger/i, /context/i, /chief concern/i, /reason for crisis evaluation/i, /presenting concern/i],
  observedBehavior: [/observed behavior/i, /objective behavior/i, /behavior/i],
  interventions: [/intervention/i, /de-escalation/i],
  response: [/response/i, /patient response/i],
  riskHistory: [/risk history/i, /recent or collateral risk evidence/i, /reason for risk review/i, /risk assessment/i, /safety \/ risk/i],
  currentRiskAssessment: [/current risk/i, /risk assessment/i, /safety \/ risk/i],
  protectiveFactors: [/protective factor/i, /protective factors \/ supports/i],
  safetyPlan: [/safety plan/i, /safety plan \/ discharge readiness/i, /discharge readiness/i, /plan/i],
  reasonForAdmission: [/reason for admission/i, /admission/i],
  hospitalCourse: [/hospital course/i],
  mentalStatusAtDischarge: [/mental status.*discharge/i, /mental status/i],
  dischargeMedications: [/discharge medications/i, /medications/i],
  followUp: [/follow[- ]?up/i, /aftercare/i],
  dischargeCondition: [/discharge condition/i, /condition/i],
	  sourceSummary: [/source summary/i, /source/i],
	  limitedSourceSummary: [/limited source/i, /sparse source/i, /fragmented source/i, /incomplete source/i, /reason for note \/ limited source context/i],
	  availableFacts: [/available facts/i, /documented facts/i, /facts documented/i],
	  notDocumented: [/not documented/i, /not provided/i, /missing information/i, /source limitations/i],
	  assessmentLimits: [/assessment limits/i, /assessment \/ clinical formulation/i, /insufficient.*formulation/i, /source.*insufficient/i, /limited.*assessment/i],
	  nextSteps: [/next steps/i, /plan \/ next steps/i, /questions/i, /verify/i, /clarify/i],
	  patientReport: [/patient report/i, /patient says/i, /patient denies/i],
	  collateralReport: [/collateral report/i, /collateral/i],
  chartOrStaffReport: [/chart or staff report/i, /staff or chart report/i, /chart\/staff/i, /staff\/chart/i, /chart/i, /staff/i, /nursing/i],
  differentialAssessment: [/differential/i, /diagnostic uncertainty/i, /assessment/i],
  medicalConcerns: [/medical concern/i, /medical contributors/i, /red flags/i, /medical workup/i, /missing evaluation/i, /medical/i, /workup/i],
  consultQuestion: [/consult question/i, /clinical concern/i, /reason for consultation/i, /reason for consult/i],
  history: [/relevant history/i, /\bhpi\b/i, /\bhistory\b/i],
  pertinentFindings: [/pertinent (exam|findings|labs|vitals|diagnostics)/i, /exam \/ observations/i, /labs \/ vitals \/ diagnostics/i, /findings/i, /observations/i],
  impression: [/assessment \/ medical impression/i, /medical impression/i, /\bimpression\b/i, /\bassessment\b/i],
  recommendations: [/recommendations \/ plan/i, /\brecommendations\b/i, /\bplan\b/i],
  limitations: [/source limitations/i, /missing information/i, /\blimitations\b/i, /missing data/i],
};

const conceptPatterns: Array<[RegExp, RegExp[]]> = [
  [/chief concern/i, [/chief (complaint|concern)/i]],
  [/source-labeled|source labels|separate sources/i, [/patient report/i, /collateral/i, /staff/i, /chart/i, /source/i]],
  [/mental status|mse/i, [/mental status/i, /\bmse\b/i, /observations/i]],
  [/risk assessment|risk rationale|risk significance|safety/i, [/risk/i, /safety/i]],
	  [/missing data|gaps|limits|not documented|not assessed|missing workup/i, [/not documented/i, /missing/i, /unclear/i, /not assessed/i, /not provided/i, /gap/i]],
	  [/limited source statement/i, [/limited source/i, /sparse source/i, /fragmented/i, /incomplete/i, /constrained/i]],
	  [/available facts only/i, [/documented facts/i, /available facts/i, /only documented/i, /constrained to documented/i]],
	  [/not documented items/i, [/not documented/i, /not provided/i, /missing/i]],
	  [/missing safety and medication data/i, [/(safety|risk)[\s\S]*(medication|dose|meds)/i, /(medication|dose|meds)[\s\S]*(safety|risk)/i]],
	  [/next-step questions/i, [/next steps/i, /questions/i, /verify/i, /clarify/i, /needs verification/i]],
	  [/interval symptoms/i, [/interval/i, /symptom/i, /sleep/i, /mood/i, /anxiety/i, /depress/i, /function/i]],
	  [/medication response if provided/i, [/medication response/i, /response.*medication/i, /medication.*response/i, /medication.*not documented/i, /not documented.*medication/i]],
	  [/side effects if provided/i, [/side effects/i, /adverse effects/i, /tolerability/i, /nausea/i, /side effects.*not documented/i, /not documented.*side effects/i]],
	  [/risk screen limits/i, [/risk/i, /safety/i, /screen/i, /means/i, /not documented/i, /limited/i, /gap/i]],
	  [/follow-up plan/i, [/follow[- ]?up/i, /plan/i, /not documented/i]],
	  [/assessment and plan/i, [/assessment/i, /plan/i]],
	  [/medical chief concern/i, [/medical chief concern/i, /reason for medical h&p/i, /admission context/i, /chief concern/i, /poor intake/i, /weakness/i, /chest tightness/i, /confusion/i, /tremor/i, /nausea/i, /transfer/i]],
	  [/pertinent positives and negatives from source/i, [/pertinent/i, /positive/i, /negative/i, /denies/i, /reported/i, /documented/i, /not documented/i]],
	  [/missing medication\/allergy data/i, [/(medication|medications|meds)[\s\S]*(allerg|not documented|unknown|missing|verify|unclear)/i, /(allerg)[\s\S]*(medication|medications|meds|not documented|unknown|missing|verify|unclear)/i]],
	  [/consult question/i, [/consult question/i, /clinical concern/i, /reason for consultation/i, /reason for consult/i]],
	  [/relevant history/i, [/relevant history/i, /\bhpi\b/i, /\bhistory\b/i]],
	  [/impression tied to uncertainty/i, [/(impression|assessment)[\s\S]*(unclear|uncertain|not established|limited|missing|pending|not documented|not provided|cannot be established)/i, /(unclear|uncertain|not established|limited|missing|pending|not documented|not provided|cannot be established)[\s\S]*(impression|assessment)/i]],
	  [/recommendations not orders/i, [/recommendations/i, /clinical considerations/i, /not orders/i, /not documented.*recommendations/i, /recommendations.*not documented/i, /needs verification/i]],
	  [/objective behavior|observed behavior/i, [/objective/i, /observed/i, /staff/i, /behavior/i]],
  [/de-escalation|intervention/i, [/de-?escalation/i, /intervention/i, /redirect/i, /attempt/i]],
  [/patient response/i, [/response/i]],
  [/ongoing monitoring plan|reassessment\/monitoring|monitoring plan/i, [/monitor/i, /reassess/i, /observe/i, /follow/i]],
  [/contradictions preserved|conflicts preserved|conflicting/i, [/conflict/i, /contradict/i, /denies[\s\S]*(collateral|staff|chart)/i, /(collateral|staff|chart)[\s\S]*denies/i, /however/i]],
  [/means\/target\/access|means|target|access/i, [/means/i, /access/i, /target/i, /weapon/i]],
  [/protective factors/i, [/protective/i]],
  [/safety plan limits|safety planning status/i, [/safety plan/i, /incomplete/i, /not documented/i, /gap/i]],
  [/hospital course/i, [/hospital course/i]],
  [/residual risk/i, [/residual risk/i, /ongoing risk/i, /risk.*remain/i]],
  [/follow-up status/i, [/follow[- ]?up/i]],
  [/patient report/i, [/patient report/i, /patient says/i, /patient denies/i]],
  [/collateral report/i, [/collateral/i]],
  [/staff\/chart|chart\/staff|chart or staff/i, [/staff/i, /chart/i, /nursing/i]],
  [/substance timing uncertainty/i, [/substance/i, /timing/i, /unclear/i, /unknown/i]],
  [/psych symptoms described neutrally|psychiatric symptoms/i, [/psych/i, /hallucination/i, /paranoi/i, /mood/i, /anxiety/i, /depress/i]],
  [/differential diagnosis/i, [/differential/i, /medical/i, /substance/i, /psychiatric/i]],
  [/medical red flags/i, [/medical/i, /workup/i, /vitals/i, /labs/i, /red flag/i, /clearance/i]],
  [/SI\/HI\/psychosis\/agitation details from source/i, [/suicid/i, /\bSI\b/i, /passive death wish/i, /homicid/i, /\bHI\b/i, /psychosis/i, /voices/i, /internally preoccupied/i, /paranoi/i, /agitation/i, /violence/i, /threat/i, /impulsive/i, /insomnia/i, /substance/i, /risk/i]],
];

function conceptPresent(note: string, concept: string) {
  const noteText = note.toLowerCase();
  const direct = normalize(concept);
  if (direct && noteText.includes(direct)) return true;

  const match = conceptPatterns.find(([pattern]) => pattern.test(concept));
  if (!match) {
    const terms = normalize(concept).split(' ').filter((term) => term.length > 3);
    return terms.length > 0 && terms.every((term) => noteText.includes(term));
  }

  return match[1].some((pattern) => pattern.test(note));
}

function forbiddenPresent(note: string, forbidden: string) {
  const lowerForbidden = forbidden.toLowerCase();
  const noteText = note.toLowerCase();

  if (lowerForbidden.includes('patient identifiers')) {
    return /\b(?:patient\s+name|name|mrn|record|chart|patient id)\s*[:#]\s*[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?\b/.test(note);
  }
  if (lowerForbidden.includes('birth dates') || lowerForbidden.includes('exact calendar dates')) {
    return /\b\d{1,2}\/\d{1,2}\/(?:\d{2}|\d{4})\b|\b\d{4}-\d{2}-\d{2}\b/.test(note);
  }
  if (lowerForbidden.includes('addresses') || lowerForbidden.includes('phone') || lowerForbidden.includes('emails')) {
    return /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}|\b(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)\d{3}[-.\s]?\d{4}\b/i.test(note);
  }
  if (lowerForbidden.includes('invented normal mental status') || lowerForbidden.includes('complete normal mse')) {
    return /within normal limits|w\/?nl|normal mood and affect|insight and judgment (?:are )?(?:good|intact)|thought process (?:is )?(?:linear|logical)|alert and oriented x ?[34]/i.test(note);
  }
  if (lowerForbidden.includes('facility names')) {
    return /\b(?:[A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3})\s+(?:Hospital|Clinic|Medical Center)\b/.test(note);
  }
  if (lowerForbidden.includes('unsupported diagnosis certainty') || lowerForbidden.includes('definitive diagnosis')) {
    return /diagnosis is|clearly (?:has|is)|primary psychosis|substance-induced .* disorder/i.test(note) && !/differential|unclear|not established|cannot determine|limit definitive|not definitive|uncertainty|may have/i.test(note);
  }
  if (lowerForbidden.includes('false reassurance') || lowerForbidden.includes('guaranteed safety') || lowerForbidden.includes('low-risk conclusion') || lowerForbidden.includes('low-risk claim')) {
    return /low risk|safe for discharge|safe to discharge|no safety concerns|(?:denies|reports|states) (?:any )?safety concerns|denies .* therefore|guaranteed safety|contract(?:ed)? for safety/i.test(note);
  }
  if (lowerForbidden.includes('restraint') || lowerForbidden.includes('seclusion')) return /restraint|seclusion/i.test(note) && !/not documented|not supported/i.test(note);
  if (lowerForbidden.includes('single cleaned narrative')) return !/collateral|staff|chart|patient report|conflict|contradict/i.test(note);
  if (lowerForbidden.includes('collateral dismissed')) return /\b(?:collateral|family)\s+(?:is|are|was|were)\s+(?:unreliable|dismissed|ignored|not credible)\b/i.test(note);
  if (lowerForbidden.includes('substance-induced certainty')) return /substance-induced/i.test(note) && !/unclear|uncertain|differential|not established/i.test(note);
  if (lowerForbidden.includes('primary psychosis certainty') || lowerForbidden.includes('psychiatric-only')) return /primary psychosis|psychiatric-only|medically cleared/i.test(note) && !/not established|unclear|differential|missing/i.test(note);
  if (lowerForbidden.includes('medical clearance')) return /medically cleared|medical clearance/i.test(note) && !/not documented|not established|not supported/i.test(note);
  if (lowerForbidden.includes('definitive clearance')) return /medically cleared|cleared for psych|cleared to transfer|no medical contraindications?/i.test(note) && !/not documented|not established|not supported|cannot be established|unclear|uncertain|not cleared/i.test(note);
  if (lowerForbidden.includes('medication list not provided')) return /discharge medications:\s*(?:[A-Z][a-z]+|\w+ \d+ ?mg)/i.test(note) && !/not documented|not provided/i.test(note);
  if (lowerForbidden.includes('normal exam findings')) return /normal (?:physical )?exam|exam (?:is )?(?:normal|within normal limits)|no acute distress/i.test(note) && !/not documented|not supplied|only documented|limited to|source documents|documented observation/i.test(note);
  if (lowerForbidden.includes('complete review of systems')) return /complete review of systems|ros (?:is )?(?:negative|normal|within normal limits)|all other systems (?:reviewed )?(?:negative|normal)/i.test(note) && !/not documented|not supplied|not provided/i.test(note);

  return false;
}

function addIssue(issues: Issue[], rootCause: RootCause, severity: Issue['severity'], detail: string) {
  issues.push({ rootCause, severity, detail });
}

function assessCase(item: BankCase, note: string, generationMode: 'live' | 'fallback', generationReason: string): CaseResult {
  const issues: Issue[] = [];
  const missingSections = item.expectedSections.filter((section) => !hasAny(note, sectionPatterns[section] ?? [new RegExp(section, 'i')]));
  const missingMustInclude = item.mustInclude.filter((concept) => {
    if (/if present/i.test(concept)) {
      if (/protective/i.test(concept) && !/protective/i.test(item.syntheticRawInput)) return false;
      if (/staff|chart/i.test(concept) && !/staff|chart|nursing/i.test(item.syntheticRawInput)) return false;
    }

    return !conceptPresent(note, concept);
  });
  const forbiddenHits = item.mustNotInclude.filter((concept) => forbiddenPresent(note, concept));

  if (generationMode === 'fallback') {
    addIssue(issues, 'sourceFidelity', 'major', `Generation used fallback mode (${generationReason}), not live OpenAI drafting.`);
  }

  if (missingSections.length) {
    addIssue(issues, 'structure', missingSections.length > 2 ? 'major' : 'minor', `Missing or unrecognizable expected sections: ${missingSections.join(', ')}.`);
  }

  if (missingMustInclude.length) {
    const rootCause = missingMustInclude.some((concept) => /risk|safety|means|target|collateral|conflict|contradiction/i.test(concept))
      ? 'riskWording'
      : missingMustInclude.some((concept) => /plan|follow|monitor|reassess/i.test(concept))
        ? 'planQuality'
        : missingMustInclude.some((concept) => /differential|assessment|medical|substance|psych/i.test(concept))
          ? 'assessmentQuality'
          : 'sourceFidelity';
    addIssue(issues, rootCause, missingMustInclude.length > 2 ? 'major' : 'minor', `Missing required concepts: ${missingMustInclude.join('; ')}.`);
  }

  if (forbiddenHits.length) {
    const rootCause = forbiddenHits.some((concept) => /mse|mental status|normal/i.test(concept))
      ? 'mseHandling'
      : forbiddenHits.some((concept) => /safety|risk|discharge|guaranteed|low-risk/i.test(concept))
        ? 'riskWording'
        : 'sourceFidelity';
    addIssue(issues, rootCause, 'critical', `Forbidden content detected: ${forbiddenHits.join('; ')}.`);
  }

  if (/not assessed|not provided|missing|unclear|incomplete|collateral|denies|risk|safety|means|target/i.test(item.syntheticRawInput) && !/not documented|not assessed|not provided|missing|unclear|incomplete|gap/i.test(note)) {
    addIssue(issues, 'sourceFidelity', 'major', 'Source contains explicit uncertainty or gaps, but draft does not keep uncertainty visible.');
  }

  if ((item.riskLevel === 'critical' || item.riskLevel === 'high') && !/risk|safety|si|hi|suicid|homicid|violence|agitation|means|target/i.test(note)) {
    addIssue(issues, 'riskWording', 'critical', 'High/critical-risk case lacks a visible risk/safety formulation.');
  }

  if (/collateral|staff|chart|denies|conflict|differs|reports/i.test(item.syntheticRawInput) && !/collateral|staff|chart|source|patient report|conflict|contradict|denies[\s\S]*but|denies[\s\S]*however/i.test(note)) {
    addIssue(issues, 'sourceFidelity', 'major', 'Collateral or cross-source conflict is present in source but not clearly attributed in draft.');
  }

  if (/complete MSE|MSE|mental status|observed|not assessed|complete exam/i.test(item.syntheticRawInput) && !/mental status|MSE|observations|not documented|not assessed/i.test(note)) {
    addIssue(issues, 'mseHandling', 'major', 'MSE-relevant source requires documented-only MSE handling, but draft lacks a visible MSE/observation treatment.');
  }

  const overlapOrDifferentialSource = /overlap_note/.test(item.noteType)
    || /\bdifferential\b|medical red flags?|medical contributor|substance timing|workup|labs|vitals|withdrawal|psychosis/i.test(item.syntheticRawInput);
  if (overlapOrDifferentialSource && !/differential|unclear|uncertain|uncertainty|not established|medical|substance|psychiatric|workup|reassess/i.test(note)) {
    addIssue(issues, 'assessmentQuality', 'major', 'Overlap case does not preserve differential or diagnostic uncertainty.');
  }

  if (/plan|follow|monitor|safety plan|reassess|discharge|workup/i.test(item.syntheticRawInput) && !/plan|follow|monitor|safety plan|reassess|workup|not documented/i.test(note)) {
    addIssue(issues, 'planQuality', 'major', 'Plan does not reflect source-supported follow-up, monitoring, safety-plan, or missing-plan limits.');
  }

  if (/discharge/i.test(item.noteType) || /discharge|dc |d\/c|follow-up|safety plan/i.test(item.syntheticRawInput)) {
    if (/stable for discharge|safe for discharge|low risk/i.test(note) && !/not supported|incomplete|gap|unclear|residual/i.test(note)) {
      addIssue(issues, 'dischargeSafety', 'critical', 'Discharge wording appears more reassuring than the incomplete/contradictory source supports.');
    }
    if (!/follow|safety plan|residual|gap|incomplete|not documented/i.test(note)) {
      addIssue(issues, 'dischargeSafety', 'major', 'Discharge-related source lacks visible follow-up, safety-plan, residual-risk, or gap wording in draft.');
    }
  }

  const uniqueIssues = issues.filter((issue, index) => (
    issues.findIndex((candidate) => candidate.rootCause === issue.rootCause && candidate.detail === issue.detail) === index
  ));
  const failureReasons = uniqueIssues.map((issue) => `${rootCauseLabels[issue.rootCause]}: ${issue.detail}`);
  const criticalOrMajor = uniqueIssues.filter((issue) => issue.severity !== 'minor').length;
  const passed = uniqueIssues.length === 0;
  const recommendedAction: CaseResult['recommendedAction'] = passed
    ? 'no_change'
    : criticalOrMajor >= 2 || uniqueIssues.some((issue) => issue.severity === 'critical')
      ? 'needs_fix'
      : 'needs_regression';

  return {
    id: item.id,
    noteType: item.noteType,
    appNoteType: appNoteTypeFor(item.noteType),
    riskLevel: item.riskLevel,
    passed,
    failureReasons,
    noteExcerpt: note.replace(/\s+/g, ' ').trim().slice(0, 700),
    issues: uniqueIssues,
    recommendedAction,
    generationMode,
    generationReason,
    generatedNoteLength: note.length,
  };
}

function countBy<T extends string>(items: T[]) {
  return items.reduce<Record<string, number>>((acc, item) => {
    acc[item] = (acc[item] ?? 0) + 1;
    return acc;
  }, {});
}

function summarize(cases: CaseResult[]): EvalSummary {
  const failedCases = cases.filter((item) => !item.passed);
  const rootCauseEntries = cases.flatMap((item) => item.issues.map((issue) => issue.rootCause));
  const failuresByRootCause = Object.keys(rootCauseLabels).reduce<Record<RootCause, number>>((acc, key) => {
    acc[key as RootCause] = 0;
    return acc;
  }, {} as Record<RootCause, number>);

  for (const rootCause of rootCauseEntries) {
    failuresByRootCause[rootCause] += 1;
  }

  const top10Failures = failedCases
    .map((item) => ({
      id: item.id,
      noteType: item.noteType,
      riskLevel: item.riskLevel,
      issueCount: item.issues.length,
      criticalIssues: item.issues.filter((issue) => issue.severity === 'critical').length,
      majorIssues: item.issues.filter((issue) => issue.severity === 'major').length,
      failureReasons: item.failureReasons.slice(0, 3),
      recommendedAction: item.recommendedAction,
    }))
    .sort((a, b) => b.criticalIssues - a.criticalIssues || b.majorIssues - a.majorIssues || b.issueCount - a.issueCount)
    .slice(0, 10);

  const firstRepairRoot = Object.entries(failuresByRootCause).sort((a, b) => b[1] - a[1])[0]?.[0] as RootCause | undefined;
  const firstRepairNoteType = Object.entries(countBy(failedCases.map((item) => item.noteType))).sort((a, b) => b[1] - a[1])[0]?.[0];
  const recommendedFirstRepairCluster = firstRepairRoot && firstRepairNoteType
    ? `${rootCauseLabels[firstRepairRoot]} in ${firstRepairNoteType}, especially section-profile/rendering gaps and missing risk/differential wording.`
    : 'No repair cluster identified from this 25-case run.';

  return {
    selected: cases.length,
    run: cases.length,
    passed: cases.length - failedCases.length,
    failed: failedCases.length,
    passRate: cases.length ? Number((((cases.length - failedCases.length) / cases.length) * 100).toFixed(1)) : 0,
    failuresByNoteType: countBy(failedCases.map((item) => item.noteType)),
    failuresByRootCause,
    top10Failures,
    recommendedFirstRepairCluster,
  };
}

function renderMarkdown(report: NoteBuilderE2eReport, reportTitle = defaultReportTitle) {
  const lines = [
    `# ${reportTitle}`,
    '',
    `Generated: ${report.generatedAt}`,
    `Runtime: \`${report.runtimePath}\``,
    `Bank: \`${report.bankPath}\``,
    `Selection: ${report.selectionMethod}`,
    '',
    '## Summary',
    '',
    `- Total selected: ${report.summary.selected}`,
    `- Total run: ${report.summary.run}`,
    `- Passed: ${report.summary.passed}`,
    `- Failed: ${report.summary.failed}`,
    `- Pass rate: ${report.summary.passRate}%`,
    `- Generation modes: ${JSON.stringify(report.generation.modes)}`,
    `- Generation reasons: ${JSON.stringify(report.generation.reasons)}`,
    '',
    '## Failures By Note Type',
    '',
    ...Object.entries(report.summary.failuresByNoteType).map(([key, value]) => `- ${key}: ${value}`),
    '',
    '## Failures By Root Cause',
    '',
    ...Object.entries(report.summary.failuresByRootCause).map(([key, value]) => `- ${rootCauseLabels[key as RootCause]}: ${value}`),
    '',
    '## Top 10 Failures',
    '',
    ...report.summary.top10Failures.flatMap((item, index) => [
      `${index + 1}. ${item.id} (${item.noteType}, ${item.riskLevel}) - ${item.issueCount} issues, ${item.criticalIssues} critical, ${item.majorIssues} major`,
      `   - ${item.failureReasons.join(' | ')}`,
    ]),
    '',
    '## Recommended First Repair Cluster',
    '',
    report.summary.recommendedFirstRepairCluster,
    '',
    '## Case Results',
    '',
    ...report.cases.flatMap((item) => [
      `### ${item.id} - ${item.noteType}`,
      '',
      `- App note type: ${item.appNoteType}`,
      `- Passed: ${item.passed}`,
      `- Recommended action: ${item.recommendedAction}`,
      `- Generation: ${item.generationMode} (${item.generationReason})`,
      `- Failure reasons: ${item.failureReasons.length ? item.failureReasons.join(' | ') : 'none'}`,
      `- Excerpt: ${item.noteExcerpt}`,
      '',
    ]),
  ];

  return `${lines.join('\n')}\n`;
}

export async function runProviderHistoryNoteBuilderE2e(options: {
  bankPath?: string;
  caseIds?: string[];
  outputJsonPath?: string;
  outputMarkdownPath?: string;
  reportTitle?: string;
  selectionMethod?: string;
  writeResults?: boolean;
} = {}): Promise<NoteBuilderE2eReport> {
  loadEvaluationEnv();

  const bankPath = options.bankPath ?? defaultBankPath;
  const bank = loadBank(bankPath);
  const selected = options.caseIds?.length
    ? options.caseIds.map((id) => {
      const item = bank.find((candidate) => candidate.id === id);
      if (!item) throw new Error(`Unknown note-builder bank case id: ${id}`);
      return item;
    })
    : selectFirst25Cases(bank);
  const { generateNote } = await import('@/lib/ai/generate-note');

  const cases: CaseResult[] = [];

  for (const item of selected) {
    const appNoteType = appNoteTypeFor(item.noteType);
    const result = await generateNote({
      specialty: /medical/i.test(item.noteType) ? 'Psychiatry / Medical' : 'Psychiatry',
      noteType: appNoteType,
      outputStyle: 'Standard',
      format: 'Labeled Sections',
      keepCloserToSource: true,
      flagMissingInfo: true,
      outputScope: 'full-note',
      customInstructions: [
        `Evaluation note-builder source case: ${item.noteType}.`,
        `Expected sections: ${item.expectedSections.join(', ')}.`,
        'Use only the synthetic source input. Preserve uncertainty, source labels, risk contradictions, and missing data.',
      ].join('\n'),
      sourceInput: item.syntheticRawInput,
    });

    cases.push(assessCase(
      item,
      result.note,
      result.generationMeta.pathUsed === 'live' ? 'live' : 'fallback',
      result.generationMeta.reason,
    ));
  }

  const report: NoteBuilderE2eReport = {
    runtimePath,
    bankPath,
    generatedAt: new Date().toISOString(),
    selectionMethod: options.selectionMethod ?? 'First 25 by critical risk, then psychiatric crisis, risk-heavy, inpatient discharge, collateral-heavy, substance-vs-psych overlap, medical-vs-psych overlap, preserving bank order within ties.',
    generation: {
      modes: countBy(cases.map((item) => item.generationMode)),
      reasons: countBy(cases.map((item) => item.generationReason)),
    },
    summary: summarize(cases),
    cases,
  };

  if (options.writeResults !== false) {
    const jsonPath = options.outputJsonPath ?? outputJsonPath;
    const markdownPath = options.outputMarkdownPath ?? outputMarkdownPath;
    fs.mkdirSync(path.dirname(jsonPath), { recursive: true });
    fs.mkdirSync(path.dirname(markdownPath), { recursive: true });
    fs.writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
    fs.writeFileSync(markdownPath, renderMarkdown(report, options.reportTitle));
  }

  return report;
}

const currentFile = fileURLToPath(import.meta.url);

if (process.argv[1] && path.resolve(process.argv[1]) === currentFile) {
  runProviderHistoryNoteBuilderE2e()
    .then((report) => {
      process.stdout.write(JSON.stringify({
        runtimePath: report.runtimePath,
        bankPath: report.bankPath,
        summary: report.summary,
        generation: report.generation,
      }, null, 2));
      process.stdout.write('\n');
    })
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}
