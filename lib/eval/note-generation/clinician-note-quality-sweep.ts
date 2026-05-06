import {
  runSourcePacketNoteGenerationRegression,
  sourcePacketRegressionCases,
  type SourcePacketRegressionReport,
} from '@/lib/eval/note-generation/source-packet-regression';

type ClinicianSweepArea =
  | 'risk-wording'
  | 'source-conflict'
  | 'medication-reconciliation'
  | 'document-intake'
  | 'ehr-formatting'
  | 'therapy'
  | 'medical-psych-overlap'
  | 'social-work'
  | 'substance-use'
  | 'cpt-provider-add-on';

type ClinicianSweepExpectation = {
  id: string;
  area: ClinicianSweepArea;
  minQualityScore?: number;
  minNoteLength?: number;
  maxNoteLength?: number;
};

export type ClinicianNoteQualitySweepCaseResult = {
  id: string;
  title: string;
  area: ClinicianSweepArea;
  passed: boolean;
  failures: string[];
  qualityScore: number;
  noteLength: number;
  mode: 'live' | 'fallback';
};

export type ClinicianNoteQualitySweepReport = {
  total: number;
  passed: number;
  failed: number;
  areasCovered: ClinicianSweepArea[];
  cases: ClinicianNoteQualitySweepCaseResult[];
};

export const CLINICIAN_NOTE_QUALITY_SWEEP_CASES: ClinicianSweepExpectation[] = [
  { id: 'four-field-outpatient-passive-risk', area: 'risk-wording', minQualityScore: 86 },
  { id: 'inpatient-progress-psychosis-observation-conflict', area: 'source-conflict', minQualityScore: 86 },
  { id: 'outpatient-medication-conflict-source-packet', area: 'medication-reconciliation', minQualityScore: 86 },
  { id: 'ocr-er-referral-first-episode-psychosis-misspellings', area: 'document-intake', minQualityScore: 86 },
  { id: 'tebra-outpatient-eval-referral-history-not-confirmed', area: 'ehr-formatting', minQualityScore: 86 },
  { id: 'therapy-progress-note-dictated-cbt-no-medical-plan', area: 'therapy', minQualityScore: 86 },
  { id: 'provider-named-custom-prompt-with-cpt-diagnosis-preferences', area: 'cpt-provider-add-on', minQualityScore: 86 },
  { id: 'typo-heavy-outpatient-followup-preserves-med-adherence-side-effect-nuance', area: 'medication-reconciliation', minQualityScore: 86 },
  { id: 'psych-admission-medical-hp-pending-a1c-rash', area: 'medical-psych-overlap', minQualityScore: 86 },
  { id: 'social-work-discharge-planning-housing-barrier', area: 'social-work', minQualityScore: 86 },
  { id: 'mat-followup-fentanyl-denial-naloxone-no-dose-change', area: 'substance-use', minQualityScore: 86 },
  { id: 'epic-outpatient-med-allergy-reconciliation-conflict', area: 'ehr-formatting', minQualityScore: 86 },
];

const REQUIRED_AREAS: ClinicianSweepArea[] = [
  'risk-wording',
  'source-conflict',
  'medication-reconciliation',
  'document-intake',
  'ehr-formatting',
  'therapy',
  'medical-psych-overlap',
  'social-work',
  'substance-use',
  'cpt-provider-add-on',
];

const DEFAULT_MIN_NOTE_LENGTH = 220;
const DEFAULT_MAX_NOTE_LENGTH = 9000;

function getCaseTitle(id: string) {
  return sourcePacketRegressionCases.find((item) => item.id === id)?.title || id;
}

export function evaluateClinicianNoteQualitySweep(
  report: SourcePacketRegressionReport,
  expectations: ClinicianSweepExpectation[] = CLINICIAN_NOTE_QUALITY_SWEEP_CASES,
): ClinicianNoteQualitySweepReport {
  const resultById = new Map(report.cases.map((item) => [item.id, item]));
  const cases = expectations.map((expectation): ClinicianNoteQualitySweepCaseResult => {
    const result = resultById.get(expectation.id);
    const failures: string[] = [];

    if (!result) {
      return {
        id: expectation.id,
        title: getCaseTitle(expectation.id),
        area: expectation.area,
        passed: false,
        failures: ['case was not present in the source-packet regression report'],
        qualityScore: 0,
        noteLength: 0,
        mode: 'fallback',
      };
    }

    const minQualityScore = expectation.minQualityScore ?? 86;
    const minNoteLength = expectation.minNoteLength ?? DEFAULT_MIN_NOTE_LENGTH;
    const maxNoteLength = expectation.maxNoteLength ?? DEFAULT_MAX_NOTE_LENGTH;

    if (!result.passed) {
      failures.push('source-packet regression case did not pass');
    }

    if (result.mode !== 'live') {
      failures.push(`expected live generation, got ${result.mode}`);
    }

    if (result.missing.length) {
      failures.push(`missing required concepts: ${result.missing.join(', ')}`);
    }

    if (result.forbiddenHits.length) {
      failures.push(`forbidden concepts present: ${result.forbiddenHits.join(', ')}`);
    }

    if (result.qualityBlockingFindings.length) {
      failures.push(`blocking quality findings: ${result.qualityBlockingFindings.join(', ')}`);
    }

    if (result.qualityScore < minQualityScore) {
      failures.push(`quality score ${result.qualityScore} below clinician sweep minimum ${minQualityScore}`);
    }

    if (result.noteLength < minNoteLength) {
      failures.push(`note length ${result.noteLength} below minimum ${minNoteLength}`);
    }

    if (result.noteLength > maxNoteLength) {
      failures.push(`note length ${result.noteLength} above maximum ${maxNoteLength}`);
    }

    if (/direct writeback|auto[-\s]?insert|silent insertion|certified integration/i.test(result.noteExcerpt)) {
      failures.push('note excerpt implies unsupported direct EHR integration');
    }

    return {
      id: result.id,
      title: result.title,
      area: expectation.area,
      passed: failures.length === 0,
      failures,
      qualityScore: result.qualityScore,
      noteLength: result.noteLength,
      mode: result.mode,
    };
  });

  const areasCovered = Array.from(new Set(cases.map((item) => item.area))).sort();
  for (const area of REQUIRED_AREAS) {
    if (!areasCovered.includes(area)) {
      cases.push({
        id: `missing-area:${area}`,
        title: `Missing clinician sweep area: ${area}`,
        area,
        passed: false,
        failures: [`clinician sweep does not cover ${area}`],
        qualityScore: 0,
        noteLength: 0,
        mode: 'fallback',
      });
    }
  }

  const failed = cases.filter((item) => !item.passed).length;

  return {
    total: cases.length,
    passed: cases.length - failed,
    failed,
    areasCovered: Array.from(new Set(cases.map((item) => item.area))).sort(),
    cases,
  };
}

export async function runClinicianNoteQualitySweep(options: {
  requireLive?: boolean;
} = {}) {
  const report = await runSourcePacketNoteGenerationRegression({
    caseIds: CLINICIAN_NOTE_QUALITY_SWEEP_CASES.map((item) => item.id),
    requireLive: options.requireLive,
  });

  return evaluateClinicianNoteQualitySweep(report);
}
