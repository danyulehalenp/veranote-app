import { summarizeMseSupport } from '@/lib/ai/mse-support';
import {
  SOURCE_LANE_ORDER,
  getSourceLaneContract,
  normalizeSourceLaneText,
  type SourceLaneId,
} from '@/lib/note/source-lane-contract';
import type { SourceSections } from '@/types/session';

export type SourceEvidenceSeverity = 'info' | 'review' | 'caution';

export type SourceEvidenceLaneSummary = {
  id: SourceLaneId;
  label: string;
  shortLabel: string;
  status: 'empty' | 'present' | 'needs-review';
  wordCount: number;
  snippet: string;
  targetId: string;
  role: string;
};

export type SourceEvidenceReviewSignal = {
  id: string;
  severity: SourceEvidenceSeverity;
  label: string;
  summary: string;
  whyThisMatters: string;
  whatToCheck: string[];
  sourceLaneId?: SourceLaneId;
  targetId?: string;
};

export type SourceEvidenceReview = {
  sourceCount: number;
  loadedLaneCount: number;
  laneSummaries: SourceEvidenceLaneSummary[];
  signals: SourceEvidenceReviewSignal[];
  topSignal?: SourceEvidenceReviewSignal;
};

type BuildSourceEvidenceReviewInput = {
  noteType: string;
  sourceSections: SourceSections;
  sourceInput?: string;
  draftText?: string;
};

function normalizeText(value = '') {
  return value
    .replace(/\r/g, '\n')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function countWords(value: string) {
  return normalizeText(value).split(/\s+/).filter(Boolean).length;
}

function truncate(value: string, maxLength = 180) {
  const normalized = normalizeText(value);
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength - 3)}...` : normalized;
}

function has(text: string, pattern: RegExp) {
  pattern.lastIndex = 0;
  return pattern.test(text);
}

function pushSignal(signals: SourceEvidenceReviewSignal[], signal: SourceEvidenceReviewSignal) {
  if (!signals.some((item) => item.id === signal.id)) {
    signals.push(signal);
  }
}

function sourceTargetId(id: SourceLaneId) {
  return `source-field-${id}`;
}

function buildLaneSummaries(sourceSections: SourceSections): SourceEvidenceLaneSummary[] {
  return SOURCE_LANE_ORDER.map((id) => {
    const contract = getSourceLaneContract(id);
    const value = normalizeSourceLaneText(sourceSections, id);
    const wordCount = countWords(value);
    const hasReviewLoad =
      id === 'patientTranscript' && wordCount > 0
        ? true
        : id === 'objectiveData' && has(value, /\b(prompt|instruction|cpt|billing|code|format|site rule|preference)\b/i);

    return {
      id,
      label: contract?.label || id,
      shortLabel: contract?.shortLabel || id,
      status: wordCount ? (hasReviewLoad ? 'needs-review' : 'present') : 'empty',
      wordCount,
      snippet: truncate(value),
      targetId: sourceTargetId(id),
      role: contract?.generationRole || 'Source material for draft generation.',
    };
  });
}

function getSignalRank(signal: SourceEvidenceReviewSignal) {
  switch (signal.severity) {
    case 'caution':
      return 0;
    case 'review':
      return 1;
    case 'info':
    default:
      return 2;
  }
}

export function buildSourceEvidenceReview(input: BuildSourceEvidenceReviewInput): SourceEvidenceReview {
  const sourceInput = input.sourceInput || SOURCE_LANE_ORDER
    .map((id) => normalizeSourceLaneText(input.sourceSections, id))
    .filter(Boolean)
    .join('\n\n');
  const source = normalizeText(sourceInput);
  const sourceLower = source.toLowerCase();
  const draft = normalizeText(input.draftText || '');
  const laneSummaries = buildLaneSummaries(input.sourceSections);
  const loadedLaneCount = laneSummaries.filter((lane) => lane.wordCount > 0).length;
  const signals: SourceEvidenceReviewSignal[] = [];

  if (!loadedLaneCount) {
    pushSignal(signals, {
      id: 'source-needed',
      severity: 'info',
      label: 'Source needed',
      summary: 'Paste, dictate, upload, or commit reviewed transcript before generating.',
      whyThisMatters: 'A source-first note should not be generated from an empty workspace.',
      whatToCheck: ['Start with Pre-Visit Data or Live Visit Notes, then generate the draft.'],
      sourceLaneId: 'intakeCollateral',
      targetId: sourceTargetId('intakeCollateral'),
    });
  }

  const patientRiskDenial = has(source, /\b(?:patient\s+)?den(?:y|ies|ied)\b.{0,80}\b(?:si|suicid|self[-\s]?harm|hi|homicid|hallucination|ah\/vh)\b/i)
    || has(source, /\b(?:no|denies)\s+(?:si\/hi|suicidal|homicidal|hallucinations?|ah\/vh)\b/i);
  const collateralRiskConcern = has(source, /\b(?:collateral|mother|father|parent|girlfriend|boyfriend|spouse|family|staff|nursing|school|police|ems)\b.{0,160}\b(?:suicid|self[-\s]?harm|homicid|threat|texts?|weapon|attempt|overdose|responding to internal stimuli|hallucinat|voices)\b/i)
    || has(source, /\b(?:suicidal texts?|threatening texts?|reported attempt|staff observed|nursing observed|responding to internal stimuli)\b/i);

  if (patientRiskDenial && collateralRiskConcern) {
    pushSignal(signals, {
      id: 'patient-collateral-risk-conflict',
      severity: 'caution',
      label: 'Source conflict',
      summary: 'Patient denial and collateral/staff concern both appear in source.',
      whyThisMatters: 'Risk documentation should preserve who said what instead of flattening the chart into “denies risk” or “high risk.”',
      whatToCheck: [
        'Keep patient denial and collateral/staff report side by side.',
        'Avoid “no risk” or “no safety concerns” unless the clinician has documented the full basis.',
      ],
      sourceLaneId: 'intakeCollateral',
      targetId: sourceTargetId('intakeCollateral'),
    });
  }

  if (
    has(source, /\b(?:denies hallucinations|denies ah\/vh|no hallucinations|not hearing voices)\b/i)
    && has(source, /\b(?:responding to internal stimuli|internally preoccupied|laughing to self|talking to self|staring into corner|staff observed)\b/i)
  ) {
    pushSignal(signals, {
      id: 'perception-observation-conflict',
      severity: 'review',
      label: 'MSE conflict',
      summary: 'Perception denial and observed psychosis cue both appear in source.',
      whyThisMatters: 'MSE wording should not erase either the patient report or the observed behavior.',
      whatToCheck: [
        'Attribute the denial to the patient.',
        'Attribute observed behavior to staff/provider/source when documented.',
      ],
      sourceLaneId: 'clinicianNotes',
      targetId: sourceTargetId('clinicianNotes'),
    });
  }

  if (has(source, /\b(?:pending|not resulted|awaiting|not back yet|labs pending|medical clearance pending|clearance pending|uds pending|ekg pending)\b/i)) {
    pushSignal(signals, {
      id: 'pending-data-visible',
      severity: 'review',
      label: 'Pending data',
      summary: 'Source includes pending labs, clearance, or other incomplete data.',
      whyThisMatters: 'The draft should keep pending-result uncertainty visible instead of implying completed review.',
      whatToCheck: [
        'Do not write “normal labs,” “medically cleared,” or “stable for discharge” unless the source supports it.',
        'Use pending/not resulted wording when the source remains incomplete.',
      ],
      sourceLaneId: 'intakeCollateral',
      targetId: sourceTargetId('intakeCollateral'),
    });
  }

  if (
    has(source, /\b(?:med list|medication list|mar|pharmacy|patient reports|collateral reports)\b.{0,140}\b(?:stopped|not taking|refus(?:e|ed|ing)|nonadherent|missed|discontinued|still shows|unclear)\b/i)
    || has(source, /\b(?:stopped|not taking|refus(?:e|ed|ing)|nonadherent|missed)\b.{0,80}\b(?:med|medication|dose|mar|pharmacy)\b/i)
  ) {
    pushSignal(signals, {
      id: 'medication-source-discrepancy',
      severity: 'review',
      label: 'Medication discrepancy',
      summary: 'Medication source may include adherence, MAR, or list discrepancy language.',
      whyThisMatters: 'Medication documentation should distinguish active list, patient report, adherence, and plan wording.',
      whatToCheck: [
        'Avoid converting an unclear med list into a settled current regimen.',
        'Preserve stopped/refused/missed-dose wording when source-supported.',
      ],
      sourceLaneId: 'objectiveData',
      targetId: sourceTargetId('objectiveData'),
    });
  }

  const mseSupport = summarizeMseSupport({
    noteType: input.noteType,
    sourceSections: input.sourceSections,
    sourceInput,
  });

  if (mseSupport?.conflictingDomains.length) {
    pushSignal(signals, {
      id: 'mse-conflicting-domains',
      severity: 'caution',
      label: 'MSE conflict',
      summary: `Conflicting MSE domain${mseSupport.conflictingDomains.length === 1 ? '' : 's'}: ${mseSupport.conflictingDomains.join(', ')}.`,
      whyThisMatters: 'Psych notes should preserve patient report and observation conflicts without resolving them silently.',
      whatToCheck: mseSupport.guidanceLines.slice(0, 3),
      sourceLaneId: 'patientTranscript',
      targetId: sourceTargetId('patientTranscript'),
    });
  } else if (mseSupport?.required && mseSupport.limited) {
    pushSignal(signals, {
      id: 'mse-limited-source',
      severity: 'review',
      label: 'MSE gap',
      summary: mseSupport.supportedDomains.length
        ? `MSE source is limited to ${mseSupport.supportedDomains.join(', ')}.`
        : 'MSE details are not clearly documented in source.',
      whyThisMatters: 'Veranote should not auto-complete normal MSE findings from sparse source text.',
      whatToCheck: [
        `Missing domains: ${mseSupport.missingDomains.slice(0, 8).join(', ')}${mseSupport.missingDomains.length > 8 ? ', ...' : ''}.`,
        'Leave missing MSE domains unfilled unless the source supports them.',
      ],
      sourceLaneId: 'clinicianNotes',
      targetId: sourceTargetId('clinicianNotes'),
    });
  }

  if (
    has(input.sourceSections.objectiveData || '', /\b(?:prompt|instruction|cpt|billing|code preference|site rule|format|paragraph|do not|avoid)\b/i)
  ) {
    pushSignal(signals, {
      id: 'provider-addon-instruction-only',
      severity: 'info',
      label: 'Add-on is instruction-only',
      summary: 'Provider Add-On contains prompt, code, or formatting language.',
      whyThisMatters: 'This can guide drafting, but raw prompt names, CPT preferences, and internal instructions should not leak into the final note.',
      whatToCheck: [
        'Use Add-On for preferences and constraints.',
        'Add-On instruction text should not leak into the final note unless it is explicitly clinical source material.',
      ],
      sourceLaneId: 'objectiveData',
      targetId: sourceTargetId('objectiveData'),
    });
  }

  const sourceHasUncertainty = has(sourceLower, /\b(?:si|suicid|hi|homicid|collateral|pending|not resulted|clearance|weapon|attempt|overdose|withdrawal|intoxication|responding to internal stimuli)\b/i);
  if (
    draft
    && sourceHasUncertainty
    && has(draft, /\b(?:low[-\s]?risk|no safety concerns|stable for discharge|safe for discharge|medically cleared|cleared for psych|normal labs)\b/i)
    && !has(draft, /\b(?:pending|not resulted|not documented|source limitation|unclear|per collateral|per staff|patient denies but)\b/i)
  ) {
    pushSignal(signals, {
      id: 'unsupported-reassurance-draft',
      severity: 'caution',
      label: 'Unsupported reassurance',
      summary: 'Draft may sound more certain than the source allows.',
      whyThisMatters: 'Risk, discharge, and clearance wording should not outrun pending data or source conflicts.',
      whatToCheck: [
        'Tie reassurance to documented clinician assessment and current evidence.',
        'Keep pending data, denial/collateral conflict, or medical uncertainty visible.',
      ],
      sourceLaneId: 'intakeCollateral',
      targetId: sourceTargetId('intakeCollateral'),
    });
  }

  const sortedSignals = signals.sort((left, right) => getSignalRank(left) - getSignalRank(right));

  return {
    sourceCount: laneSummaries.reduce((sum, lane) => sum + lane.wordCount, 0),
    loadedLaneCount,
    laneSummaries,
    signals: sortedSignals,
    topSignal: sortedSignals[0],
  };
}
