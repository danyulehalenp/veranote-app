import type { SourceSections } from '@/types/session';

export type NoteQualityFindingSeverity = 'blocking' | 'review' | 'info';

export type NoteQualityFinding = {
  id: string;
  category:
    | 'source-fidelity'
    | 'risk-wording'
    | 'mse-honesty'
    | 'clinical-readability'
    | 'ehr-copy-hygiene'
    | 'instruction-leakage';
  severity: NoteQualityFindingSeverity;
  message: string;
};

export type NoteQualityAuditInput = {
  note: string;
  noteType?: string;
  ehr?: string;
  sourceSections?: SourceSections;
};

export type NoteQualityAuditResult = {
  passed: boolean;
  score: number;
  findings: NoteQualityFinding[];
  blockingFindings: NoteQualityFinding[];
  reviewFindings: NoteQualityFinding[];
};

function normalizeText(value = '') {
  return value
    .replace(/\r/g, '\n')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function sourceTextFromSections(sourceSections?: SourceSections) {
  return normalizeText(Object.values(sourceSections || {}).filter(Boolean).join('\n\n'));
}

function has(text: string, pattern: RegExp) {
  pattern.lastIndex = 0;
  return pattern.test(text);
}

function pushFinding(
  findings: NoteQualityFinding[],
  finding: NoteQualityFinding,
) {
  if (!findings.some((item) => item.id === finding.id)) {
    findings.push(finding);
  }
}

function sourceSupportsNormalMse(sourceText: string, pattern: RegExp) {
  return has(sourceText, pattern);
}

function hasUnsupportedReassurance(note: string) {
  if (has(note, /\b(?:low[-\s]?risk|risk is low|safe (?:for|to) discharge|stable for discharge|ready for discharge|cleared for psych|medically stable)\b/i)) {
    return true;
  }

  if (!has(note, /\bmedically cleared\b/i)) {
    return false;
  }

  const clearanceIsQuestionedOrNegated = has(
    note,
    /\b(?:not|no|without|unclear|question(?:s|ed|ing)?|whether|pending|not documented|not established)\b.{0,80}\bmedically cleared\b|\bmedically cleared\b.{0,80}\b(?:not documented|not established|unclear|question mark|\?)/i,
  );

  return !clearanceIsQuestionedOrNegated;
}

export function auditGeneratedNoteQuality(input: NoteQualityAuditInput): NoteQualityAuditResult {
  const note = normalizeText(input.note);
  const noteLower = note.toLowerCase();
  const source = sourceTextFromSections(input.sourceSections);
  const findings: NoteQualityFinding[] = [];

  if (note.length < 180) {
    pushFinding(findings, {
      id: 'note-too-short',
      category: 'clinical-readability',
      severity: 'blocking',
      message: 'Generated note is too short to function as a usable clinical note.',
    });
  }

  if (has(note, /\bundefined\b|\bnull\b|\[object object\]|```|<script|<\/?[a-z][\s\S]*?>/i)) {
    pushFinding(findings, {
      id: 'technical-artifact',
      category: 'ehr-copy-hygiene',
      severity: 'blocking',
      message: 'Generated note contains a technical artifact that should not be copied into an EHR.',
    });
  }

  const veryLongLineCount = input.note
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 1800).length;

  if (veryLongLineCount > 0) {
    pushFinding(findings, {
      id: 'very-long-ehr-copy-line',
      category: 'ehr-copy-hygiene',
      severity: 'blocking',
      message: 'Generated note contains an overly long line that is difficult to copy into EHR fields.',
    });
  }

  if (has(note, /\b(?:Veranote|Atlas)\b|(?:^|\n)\s*Assistant:|Clinical Assistant|source-packet regression|review once for source fidelity|apply to draft|verified by veranote/i)) {
    pushFinding(findings, {
      id: 'assistant-ui-leakage',
      category: 'ehr-copy-hygiene',
      severity: 'blocking',
      message: 'Generated note appears to include assistant/UI wording rather than only clinical note content.',
    });
  }

  if (
    has(note, /provider add-on|provider instructions?|named prompt|cpt preference|source-packet regression|use only the four veranote source lanes|do not (?:state|say|diagnose|summarize|place|invent|convert|erase)|the provider requested|per provider instruction/i)
  ) {
    pushFinding(findings, {
      id: 'provider-instruction-leakage',
      category: 'instruction-leakage',
      severity: 'blocking',
      message: 'Provider instructions or prompt text leaked into the clinical note.',
    });
  }

  if (has(note, /\b(?:sent|uploaded|pushed|filed|posted|saved)\b.{0,40}\b(?:WellSky|Tebra|Epic|Cerner|Oracle|athena|EHR|chart)\b/i)) {
    pushFinding(findings, {
      id: 'ehr-writeback-claim',
      category: 'ehr-copy-hygiene',
      severity: 'blocking',
      message: 'Generated note claims an EHR action occurred even though Veranote should only prepare copy/paste output here.',
    });
  }

  const sourceHasRiskOrUncertainty = has(source, /\b(?:si|suicid|hi|homicid|passive death|wish (?:i )?(?:would not|wouldn't) wake|firearm|collateral|mother|girlfriend|school|staff|nursing|pending|med clear\?|medical clearance|discharge|intoxication|bal|withdrawal|tox|lithium|clozapine|qtc)\b/i);
  if (
    sourceHasRiskOrUncertainty
    && hasUnsupportedReassurance(note)
  ) {
    pushFinding(findings, {
      id: 'unsupported-reassurance',
      category: 'risk-wording',
      severity: 'blocking',
      message: 'Generated note uses reassuring safety/clearance wording despite source risk, collateral, or pending-data uncertainty.',
    });
  }

  if (
    sourceHasRiskOrUncertainty
    && has(note, /\b(?:no safety concerns|no acute safety concerns|no current safety concerns)\b/i)
  ) {
    pushFinding(findings, {
      id: 'soft-safety-reassurance',
      category: 'risk-wording',
      severity: 'review',
      message: 'Generated note uses broad “no safety concerns” wording; verify it remains tied to the documented source and risk context.',
    });
  }

  if (has(source, /\bpending\b/i) && !has(note, /\bpending|ordered but result|result not (?:available|documented)|not resulted|not yet available|not finalized|incomplete|not visible|not included|source limitation|unreadable|question[-\s]?marked|question mark|not captured|line not visible|cut off/i)) {
    pushFinding(findings, {
      id: 'pending-data-not-preserved',
      category: 'source-fidelity',
      severity: 'blocking',
      message: 'Source contains pending data, but the generated note does not preserve pending-result uncertainty.',
    });
  }

  if (
    has(source, /\b(?:collateral|mother|girlfriend|parent|school|staff|nursing|teacher)\b/i)
    && has(source, /\bden(?:y|ies|ied)|denial|patient says|patient reports\b/i)
    && !has(note, /\b(?:collateral|mother|girlfriend|parent|school|staff|nursing|teacher|den(?:y|ies|ied)|patient reports|patient states)\b/i)
  ) {
    pushFinding(findings, {
      id: 'source-conflict-not-attributed',
      category: 'source-fidelity',
      severity: 'review',
      message: 'Source appears to contain patient-versus-collateral conflict, but the note may not clearly attribute who reported what.',
    });
  }

  if (has(source, /\b(?:den(?:y|ies|ied) SI\/HI|den(?:y|ies|ied) suicidal|den(?:y|ies|ied) homicidal|no SI\/HI)\b/i)
    && !has(note, /\b(?:SI\/HI|suicid\w*|homicid\w*)\b/i)) {
    pushFinding(findings, {
      id: 'risk-denial-omitted',
      category: 'risk-wording',
      severity: 'review',
      message: 'Source includes SI/HI denial or risk wording, but the note may not preserve it.',
    });
  }

  if (
    has(note, /\b(?:thought process (?:is )?(?:linear|logical|goal directed)|linear thought process|goal directed thought process)\b/i)
    && !sourceSupportsNormalMse(source, /\b(?:thought process|linear|logical|goal directed|goal-directed)\b/i)
  ) {
    pushFinding(findings, {
      id: 'invented-thought-process',
      category: 'mse-honesty',
      severity: 'blocking',
      message: 'Generated note includes a normal thought-process finding not supported by source text.',
    });
  }

  if (
    has(note, /\b(?:insight and judgment (?:are )?(?:good|fair|intact)|judgment (?:is )?(?:good|fair|intact)|insight (?:is )?(?:good|fair|intact))\b/i)
    && !sourceSupportsNormalMse(source, /\b(?:insight|judgment|judgement)\b/i)
  ) {
    pushFinding(findings, {
      id: 'invented-insight-judgment',
      category: 'mse-honesty',
      severity: 'blocking',
      message: 'Generated note includes insight/judgment findings not supported by source text.',
    });
  }

  if (
    has(note, /\b(?:alert and oriented x ?[34]|oriented to person, place, time(?:, and situation)?)\b/i)
    && !sourceSupportsNormalMse(source, /\b(?:alert|oriented|orientation|a&o|a\/o)\b/i)
  ) {
    pushFinding(findings, {
      id: 'invented-orientation',
      category: 'mse-honesty',
      severity: 'blocking',
      message: 'Generated note includes orientation findings not supported by source text.',
    });
  }

  if (
    has(source, /\b(?:mse.*(?:limited|not documented|not detailed)|mental status.*(?:limited|not documented|not detailed)|no detailed mse|video froze|camera keeps freezing)\b/i)
    && !has(noteLower, /\b(?:mse|mental status|video|camera)\b.*\b(?:limited|not documented|not detailed|source|available)\b/i)
  ) {
    pushFinding(findings, {
      id: 'limited-mse-not-preserved',
      category: 'mse-honesty',
      severity: 'review',
      message: 'Source says MSE data were limited, but the note may not make that limitation visible.',
    });
  }

  const blockingFindings = findings.filter((finding) => finding.severity === 'blocking');
  const reviewFindings = findings.filter((finding) => finding.severity === 'review');
  const score = Math.max(
    0,
    100 - blockingFindings.length * 22 - reviewFindings.length * 7 - findings.filter((item) => item.severity === 'info').length * 2,
  );

  return {
    passed: blockingFindings.length === 0,
    score,
    findings,
    blockingFindings,
    reviewFindings,
  };
}
