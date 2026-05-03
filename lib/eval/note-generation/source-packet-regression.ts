import { loadEnvConfig } from '@next/env';
import fs from 'node:fs';
import { buildSourceInputFromSections } from '@/lib/ai/source-sections';
import { generateNote } from '@/lib/ai/generate-note';
import type { SourceSections } from '@/types/session';

type RequiredPattern = {
  label: string;
  pattern: RegExp;
};

type ForbiddenPattern = {
  label: string;
  pattern: RegExp;
};

export type SourcePacketRegressionCase = {
  id: string;
  title: string;
  noteType: string;
  customInstructions?: string;
  sourceSections: SourceSections;
  required: RequiredPattern[];
  forbidden: ForbiddenPattern[];
};

export type SourcePacketRegressionCaseResult = {
  id: string;
  title: string;
  noteType: string;
  passed: boolean;
  mode: 'live' | 'fallback';
  reason: string;
  missing: string[];
  forbiddenHits: string[];
  noteExcerpt: string;
  flagCount: number;
};

export type SourcePacketRegressionReport = {
  total: number;
  passed: number;
  failed: number;
  cases: SourcePacketRegressionCaseResult[];
};

const runtimePath = '/Users/danielhale/.openclaw/workspace/app-prototype';

export const sourcePacketRegressionCases: SourcePacketRegressionCase[] = [
  {
    id: 'four-field-outpatient-passive-risk',
    title: 'Outpatient follow-up preserves passive death-wish nuance across all source lanes',
    noteType: 'Outpatient Psych Follow-Up',
    customInstructions: 'Use WellSky-friendly labeled sections. Keep passive death-wish nuance in Safety / Risk.',
    sourceSections: {
      intakeCollateral: [
        'Referral / pre-visit data:',
        '- PHQ item last week flagged: thoughts patient would be better off dead.',
        '- Nursing intake documents no firearm access.',
        '- Medication list: sertraline 50 mg daily.',
      ].join('\n'),
      clinicianNotes: [
        'Provider live note:',
        '- Follow-up for depression/anxiety.',
        '- Mood is "a little better but not all the way there."',
        '- Denies active SI, plan, or intent today.',
        '- Side effects not addressed.',
      ].join('\n'),
      patientTranscript: [
        'Ambient transcript:',
        'Patient: "Sometimes I wish I would not wake up, but I do not want to kill myself."',
        'Provider reviewed crisis line and aunt as support if thoughts intensify.',
      ].join('\n'),
      objectiveData: [
        'Provider Add-On:',
        '- Preserve passive death wish plus denial of active intent/plan.',
        '- Do not summarize as low risk.',
        '- Billing code TBD; do not place billing code in clinical plan.',
      ].join('\n'),
    },
    required: [
      { label: 'passive death-wish wording remains visible', pattern: /wish (?:i )?(?:would not|wouldn'?t) wake up|passive death/i },
      { label: 'active SI plan or intent denial remains visible', pattern: /denies? active .*?(?:plan|intent)|denies? .*?(?:plan|intent).*?today|does not want to kill/i },
      { label: 'documented support resource remains visible', pattern: /crisis line|aunt|support/i },
      { label: 'partial improvement remains hedged', pattern: /little better|not all the way|partial/i },
    ],
    forbidden: [
      { label: 'unsupported low-risk conclusion', pattern: /\blow[-\s]?risk\b/i },
      { label: 'unsupported safe discharge wording', pattern: /\bsafe (?:for|to) discharge\b/i },
      { label: 'billing code treated as clinical plan', pattern: /billing code tbd/i },
    ],
  },
  {
    id: 'inpatient-progress-psychosis-observation-conflict',
    title: 'Inpatient progress note keeps denial separate from observed internal-preoccupation concern',
    noteType: 'Inpatient Psych Progress Note',
    customInstructions: 'Keep patient denial, nursing observations, and provider observations separated. Do not diagnose primary psychosis from this source.',
    sourceSections: {
      intakeCollateral: [
        'Pre-visit nursing note:',
        '- Appeared internally preoccupied overnight.',
        '- Laughing to self at times.',
        '- Slept 2 hours.',
        '- No restraints documented.',
      ].join('\n'),
      clinicianNotes: [
        'Live visit notes:',
        '- Patient denies AH/VH.',
        '- Guarded; occasionally looked toward the corner.',
        '- Speech soft.',
        '- No SI/HI voiced.',
        '- Continue current precautions documented.',
      ].join('\n'),
      patientTranscript: 'Ambient transcript:\nPatient: "No, I am not hearing voices. I just did not sleep."',
      objectiveData: 'Provider Add-On:\nDo not state confirmed hallucinations or primary psychosis. Preserve denial versus observation.',
    },
    required: [
      { label: 'patient denial of hallucinations remains visible', pattern: /denies? (?:ah\/vh|hallucinations|hearing voices)|not hearing voices/i },
      { label: 'nursing observation remains visible', pattern: /internally preoccupied|laughing to self|looked toward the corner/i },
      { label: 'uncertainty or source attribution remains visible', pattern: /observation|observed|nursing|staff|denies|unclear|not confirmed|concern/i },
      { label: 'sleep detail remains visible', pattern: /slept 2 hours|2 hours/i },
    ],
    forbidden: [
      { label: 'confirmed hallucination claim', pattern: /confirmed hallucinations|patient (?:is|was) hallucinating/i },
      { label: 'primary psychosis conclusion', pattern: /primary psychotic disorder|primary psychosis/i },
      { label: 'invented normal MSE', pattern: /thought process (?:is )?(?:linear|logical)|insight and judgment (?:are )?(?:good|intact)|alert and oriented x ?[34]/i },
    ],
  },
  {
    id: 'outpatient-medication-conflict-source-packet',
    title: 'Outpatient follow-up preserves chart-versus-patient medication conflict',
    noteType: 'Outpatient Psych Follow-Up',
    customInstructions: 'For Tebra copy/paste, keep medication conflict explicit and do not state refill completion unless documented.',
    sourceSections: {
      intakeCollateral: [
        'Pre-visit chart review:',
        '- Medication list still shows sertraline 100 mg daily.',
        '- Pharmacy refill history not reviewed today.',
      ].join('\n'),
      clinicianNotes: [
        'Live visit notes:',
        '- Last visit plan was to increase sertraline from 50 mg to 100 mg.',
        '- Patient reports she stayed on 50 mg because she was nervous about increasing.',
        '- Mood partially improved.',
        '- Requests refill.',
      ].join('\n'),
      patientTranscript: 'Ambient transcript:\nPatient: "I never went up to 100. I have been taking the 50 most days."',
      objectiveData: 'Provider Add-On:\nDo not say taking as prescribed. No refill sent is documented in this source.',
    },
    required: [
      { label: 'sertraline conflict remains visible', pattern: /sertraline/i },
      { label: '100 mg chart or prior plan remains visible', pattern: /100 ?mg/i },
      { label: '50 mg patient-reported dose remains visible', pattern: /50 ?mg/i },
      { label: 'adherence uncertainty remains visible', pattern: /most days|nervous about increasing|stayed on 50|not resolved|does not resolve/i },
    ],
    forbidden: [
      { label: 'stronger adherence than source supports', pattern: /taking as prescribed|adherent|compliant/i },
      { label: 'refill completion invented', pattern: /refill (?:sent|provided|authorized|completed)/i },
      { label: 'settled active regimen invented', pattern: /current regimen is sertraline 100 ?mg|continue sertraline 100 ?mg/i },
    ],
  },
  {
    id: 'er-referral-substance-objective-conflict',
    title: 'ER referral note keeps objective UDS, patient denial, and collateral concern unresolved',
    noteType: 'Substance-vs-Psych Overlap Note',
    customInstructions: 'Keep substance timing unresolved. Do not diagnose substance-induced psychosis from this packet.',
    sourceSections: {
      intakeCollateral: [
        'ER referral OCR text:',
        '- UDS positive cocaine.',
        '- BAL negative.',
        '- BP 158/94.',
        '- Labs otherwise not fully included.',
        '- Referred for paranoia after 2 nights no sleep.',
      ].join('\n'),
      clinicianNotes: [
        'Live visit notes:',
        '- Patient denies cocaine use and says, "I did not use anything."',
        '- Reports paranoia started after not sleeping.',
        '- No SI/HI.',
      ].join('\n'),
      patientTranscript: [
        'Ambient transcript:',
        'Girlfriend collateral in room: "He was up for two days and using something."',
        'Patient: "No, I was not."',
      ].join('\n'),
      objectiveData: 'Provider Add-On:\nKeep denial, collateral, and UDS positive result side by side. Do not diagnose substance-induced psychosis.',
    },
    required: [
      { label: 'objective UDS result remains visible', pattern: /UDS positive cocaine|positive (?:for )?cocaine|urine drug screen/i },
      { label: 'patient denial remains visible', pattern: /denies? cocaine|did not use anything|patient denies/i },
      { label: 'collateral concern remains visible', pattern: /girlfriend|collateral|using something/i },
      { label: 'unresolved timing or differential remains visible', pattern: /unresolved|unclear|uncertain|differential|not established/i },
    ],
    forbidden: [
      { label: 'substance-induced psychosis stated as established', pattern: /(?:diagnosis is|consistent with|confirmed|established).{0,80}substance-induced psychosis|substance-induced psychosis (?:is|was) (?:diagnosed|confirmed|established)/i },
      { label: 'cocaine use timing stated as confirmed', pattern: /confirmed recent cocaine use|recent cocaine use confirmed|UDS confirms recent cocaine use/i },
      { label: 'medical clearance invented', pattern: /medically cleared|cleared for psych/i },
    ],
  },
];

function loadEvaluationEnv() {
  loadEnvConfig(runtimePath);

  const localEnvPath = `${runtimePath}/.env.local`;
  try {
    const localEnv = fs.readFileSync(localEnvPath, 'utf8');
    for (const key of ['OPENAI_API_KEY', 'OPENAI_MODEL']) {
      if (process.env[key]) continue;

      const match = localEnv.match(new RegExp(`^${key}\\s*=\\s*(.+)$`, 'm'));
      if (match?.[1]) {
        process.env[key] = match[1].trim().replace(/^['"]|['"]$/g, '');
      }
    }
  } catch {
    // The regression can still report fallback mode if local env is unavailable.
  }
}

function evaluateCase(
  item: SourcePacketRegressionCase,
  note: string,
  mode: SourcePacketRegressionCaseResult['mode'],
  reason: string,
  flagCount: number,
): SourcePacketRegressionCaseResult {
  const missing = item.required
    .filter((requirement) => !requirement.pattern.test(note))
    .map((requirement) => requirement.label);
  const forbiddenHits = item.forbidden
    .filter((forbidden) => forbidden.pattern.test(note))
    .map((forbidden) => forbidden.label);

  if (/provider add-on|add-on instructs|\binstructs to preserve\b|billing code|do not summarize as low risk|do not diagnose substance-induced psychosis|do not state confirmed hallucinations/i.test(note)) {
    forbiddenHits.push('provider add-on instruction echoed as clinical note content');
  }

  return {
    id: item.id,
    title: item.title,
    noteType: item.noteType,
    passed: missing.length === 0 && forbiddenHits.length === 0,
    mode,
    reason,
    missing,
    forbiddenHits,
    noteExcerpt: note.replace(/\s+/g, ' ').trim().slice(0, 900),
    flagCount,
  };
}

export async function runSourcePacketNoteGenerationRegression(options: {
  caseIds?: string[];
  requireLive?: boolean;
} = {}): Promise<SourcePacketRegressionReport> {
  loadEvaluationEnv();

  const selected = options.caseIds?.length
    ? options.caseIds.map((id) => {
      const item = sourcePacketRegressionCases.find((candidate) => candidate.id === id);
      if (!item) throw new Error(`Unknown source packet regression case: ${id}`);
      return item;
    })
    : sourcePacketRegressionCases;

  const cases: SourcePacketRegressionCaseResult[] = [];

  for (const item of selected) {
    const sourceInput = buildSourceInputFromSections(item.sourceSections);
    const generated = await generateNote({
      specialty: 'Psychiatry',
      noteType: item.noteType,
      outputStyle: 'Standard',
      format: 'Labeled Sections',
      keepCloserToSource: true,
      flagMissingInfo: true,
      outputScope: 'full-note',
      customInstructions: [
        'Source-packet regression case. Use only the four Veranote source lanes.',
        'Preserve source attribution, uncertainty, and provider add-on instructions without converting add-on text into patient facts.',
        item.customInstructions || '',
      ].filter(Boolean).join('\n'),
      sourceInput,
      sourceSections: item.sourceSections,
    });

    const mode = generated.generationMeta.pathUsed === 'live' ? 'live' : 'fallback';
    const result = evaluateCase(item, generated.note, mode, generated.generationMeta.reason, generated.flags.length);

    if (options.requireLive !== false && mode !== 'live') {
      result.passed = false;
      result.missing.push(`live generation required but got ${mode}:${generated.generationMeta.reason}`);
    }

    cases.push(result);
  }

  const failed = cases.filter((item) => !item.passed).length;

  return {
    total: cases.length,
    passed: cases.length - failed,
    failed,
    cases,
  };
}
