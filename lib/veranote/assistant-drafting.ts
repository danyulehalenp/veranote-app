import type { AssistantApiContext } from '@/types/assistant';

export type DraftSection = 'HPI' | 'Assessment' | 'Plan' | 'Progress Note';

export function looksLikeRawClinicalDetail(message: string) {
  const hasClinicalSignals = /(patient|pt\b|mood|sleep|appetite|anxiety|depression|si\b|hi\b|hallucinat|med|medication|uds|upt|lab|plan|follow up|follow-up|denies|reports|states|weeks?|months?|days?)/i.test(message);
  const hasSentenceShape = /[,;:]|\b(and|but|then|because)\b/i.test(message) || message.split(/\s+/).length >= 12;
  const doesNotLookLikeQuestion = !/[?]$/.test(message.trim()) && !/^(can you|could you|would you|will you|do you|what|why|how|when|where|should|help me)/i.test(message.trim());
  return hasClinicalSignals && hasSentenceShape && doesNotLookLikeQuestion;
}

export function looksPsychFocused(message: string) {
  return /(mood|sleep|appetite|anxiety|depression|mania|psychosis|hallucinat|delusion|si\b|hi\b|safety|risk|panic|trauma|ptsd|adhd|bipolar|schizo|substance|craving)/i.test(message);
}

export function looksMedicalFocused(message: string) {
  return /(bp|blood pressure|glucose|a1c|creatinine|bun|cbc|cmp|lft|wbc|hemoglobin|hematocrit|sodium|potassium|ekg|troponin|oxygen|spo2|fever|infection|diabetes|htn|hypertension|copd|pneumonia|uti|cellulitis|chest pain|shortness of breath|sob|nausea|vomiting|diarrhea|constipation|abdominal pain|wound|lab|uds|upt|vitals?|physical exam|consult|medical h&p|h&p)/i.test(message);
}

export function normalizeDraftText(detail: string) {
  const cleaned = detail
    .replace(/\s+/g, ' ')
    .replace(/^\s*[-:;,.]+/, '')
    .trim();

  if (!cleaned) {
    return '';
  }

  const normalized = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  return /[.!?]$/.test(normalized) ? normalized : `${normalized}.`;
}

export function inferDraftSection(normalizedMessage: string): DraftSection | null {
  if (hasDraftKeyword(normalizedMessage, ['hpi', 'history of present illness', 'interval update'])) {
    return 'HPI';
  }
  if (hasDraftKeyword(normalizedMessage, ['assessment', 'formulation', 'impression'])) {
    return 'Assessment';
  }
  if (hasDraftKeyword(normalizedMessage, ['plan', 'next steps'])) {
    return 'Plan';
  }
  if (hasDraftKeyword(normalizedMessage, ['progress note', 'overall note', 'full note', 'whole note'])) {
    return 'Progress Note';
  }
  return null;
}

export function buildSectionDraft(section: DraftSection, detail: string, context?: AssistantApiContext) {
  const normalized = normalizeDraftText(detail);
  const noteType = context?.noteType?.toLowerCase() || 'note';
  const mixedDomain = looksPsychFocused(detail) && looksMedicalFocused(detail);
  const psychFocused = looksPsychFocused(detail);
  const medicalFocused = looksMedicalFocused(detail);

  if (!normalized) {
    return `I can draft ${section.toLowerCase()} for this ${noteType}, but I need the patient detail you want included.`;
  }

  const sourceCloseParagraph = buildSourceCloseParagraph(detail, {
    assumePatientSubject: section === 'HPI' || section === 'Progress Note',
  });

  if (section === 'HPI') {
    return `HPI draft:\n${sourceCloseParagraph}`;
  }

  if (section === 'Assessment') {
    return `Assessment draft:\n${buildAssessmentParagraph(detail, { mixedDomain, psychFocused, medicalFocused })}`;
  }

  if (section === 'Plan') {
    return `Plan draft:\n${buildPlanParagraph(detail, { mixedDomain, psychFocused, medicalFocused })}`;
  }

  if (section === 'Progress Note') {
    const hpiParagraph = sourceCloseParagraph;
    const assessmentParagraph = buildAssessmentParagraph(detail, { mixedDomain, psychFocused, medicalFocused });
    const planParagraph = buildPlanParagraph(detail, { mixedDomain, psychFocused, medicalFocused });

    return `Working ${noteType} draft:\n\nInterval Update / HPI:\n${hpiParagraph}\n\nAssessment:\n${assessmentParagraph}\n\nPlan:\n${planParagraph}`;
  }

  return `${section} draft:\n${sourceCloseParagraph}`;
}

function hasDraftKeyword(message: string, keywords: string[]) {
  return keywords.some((keyword) => message.includes(keyword));
}

function buildSourceCloseParagraph(detail: string, options?: { assumePatientSubject?: boolean }) {
  const clauses = splitDraftClauses(detail);
  const sentences = clauses
    .map((clause, index) => {
      let normalized = cleanupDraftClause(clause);
      if (!normalized) {
        return null;
      }

      if (/^(denies|endorses|reports|states|notes)\b/i.test(normalized)) {
        normalized = `Patient ${normalized.charAt(0).toLowerCase()}${normalized.slice(1)}`;
      } else if (
        options?.assumePatientSubject
        && index === 0
        && !/^(patient|pt\b|he\b|she\b|they\b)/i.test(normalized)
      ) {
        normalized = `Patient reports ${normalized.charAt(0).toLowerCase()}${normalized.slice(1)}`;
      }

      return normalizeDraftText(normalized);
    })
    .filter((value): value is string => Boolean(value));

  return sentences.join(' ');
}

function buildAssessmentParagraph(
  detail: string,
  options: { mixedDomain: boolean; psychFocused: boolean; medicalFocused: boolean },
) {
  const allFragments = splitDraftClauses(detail)
    .map(clauseToAssessmentFragment)
    .filter(Boolean);
  const riskFragment = allFragments.find((fragment) => /(denial of|suic|homic|safety|risk)/i.test(fragment));
  let fragments = allFragments.slice(0, 3);
  if (riskFragment && !fragments.includes(riskFragment)) {
    fragments = [...fragments, riskFragment];
  }

  const lead = fragments.length
    ? `Current presentation is notable for ${joinFragments(fragments)}.`
    : 'Current presentation should stay tied to the documented interval update above.';

  const qualifier = options.mixedDomain
    ? 'Keep psychiatric symptoms, medical findings, medication truth, and safety wording clearly separated, and preserve uncertainty anywhere the source is mixed.'
    : options.psychFocused
      ? 'Keep symptom course, adherence, and risk wording conservative anywhere chronology or source support remains incomplete.'
      : options.medicalFocused
        ? 'Keep objective findings, medication details, and any unresolved medical interpretation close to source rather than implying more certainty than documented.'
        : 'Keep the assessment narrow and source-faithful anywhere the record still feels incomplete or mixed.';

  return `${lead} ${qualifier}`;
}

function buildPlanParagraph(
  detail: string,
  options: { mixedDomain: boolean; psychFocused: boolean; medicalFocused: boolean },
) {
  const clauses = splitDraftClauses(detail).map(cleanupDraftClause).filter(Boolean);
  const medicationOrMonitoringSignals = clauses.filter((clause) => /(continue|start|stop|hold|resume|increase|decrease|taper|maintain|monitor|recheck|repeat|follow up|follow-up|return|safety plan|precautions|observe|admit|discharge|consult|medication|dose|mg|labs? pending|repeat labs?)/i.test(clause));

  const lead = medicationOrMonitoringSignals.length
    ? `Keep the documented next steps explicit: ${joinFragments(medicationOrMonitoringSignals.slice(0, 3).map((clause) => lowercaseFragment(clause)))}.`
    : 'Document only the exact medication, monitoring, follow-up, and safety steps you want in the plan.';

  const qualifier = options.mixedDomain
    ? 'Separate psych follow-up from medical monitoring so the plan stays clear and does not imply undocumented decisions.'
    : options.psychFocused
      ? 'Keep medication changes, follow-up, and safety steps explicit instead of implied.'
      : options.medicalFocused
        ? 'Keep objective monitoring, medical follow-up, and medication instructions literal rather than padded.'
        : 'Avoid adding routine next steps that are not directly supported in source.';

  return `${lead} ${qualifier}`;
}

function splitDraftClauses(detail: string) {
  const cleaned = detail.replace(/\s+/g, ' ').trim();
  if (!cleaned) {
    return [];
  }

  const primaryParts = cleaned
    .split(/[.;]\s+|\s+\|\s+|\s+-\s+/)
    .map((part) => part.trim())
    .filter(Boolean);

  if (primaryParts.length > 1) {
    return primaryParts;
  }

  const commaParts = cleaned
    .split(/,\s+/)
    .map((part) => part.trim())
    .filter(Boolean);

  return commaParts.length > 1 ? commaParts : [cleaned];
}

function cleanupDraftClause(clause: string) {
  return clause
    .replace(/^\s*[-:;,.]+/, '')
    .replace(/^(and|but|then)\s+/i, '')
    .trim()
    .replace(/[.]+$/, '');
}

function clauseToAssessmentFragment(clause: string) {
  const cleaned = cleanupDraftClause(clause)
    .replace(/^(patient|pt|he|she|they)\s+(reports?|states?|notes?)\s+/i, '')
    .replace(/^(reports?|states?|notes?)\s+/i, '')
    .trim();

  if (!cleaned) {
    return '';
  }

  const denialMatch = cleaned.match(/^denies?\s+(.+)$/i);
  if (denialMatch?.[1]) {
    return `denial of ${lowercaseFragment(denialMatch[1])}`;
  }

  const improvementMatch = cleaned.match(/^(.+?)\s+is\s+(?:a little|slightly|somewhat)\s+better$/i);
  if (improvementMatch?.[1]) {
    return `slight improvement in ${lowercaseFragment(improvementMatch[1])}`;
  }

  const stillLowMoodMatch = cleaned.match(/^mood\s+is\s+still\s+low$/i);
  if (stillLowMoodMatch) {
    return 'persistently low mood';
  }

  const sleepMatch = cleaned.match(/^still sleeping\s+(.+)$/i);
  if (sleepMatch?.[1]) {
    return `sleep limited to ${sleepMatch[1]}`;
  }

  const offMedsMatch = cleaned.match(/^off\s+(?:meds?|medications?)\s+for\s+(.+)$/i);
  if (offMedsMatch?.[1]) {
    return `${offMedsMatch[1]} of medication nonadherence`;
  }

  return lowercaseFragment(cleaned);
}

function joinFragments(fragments: string[]) {
  if (!fragments.length) {
    return '';
  }

  if (fragments.length === 1) {
    return fragments[0];
  }

  if (fragments.length === 2) {
    return `${fragments[0]} and ${fragments[1]}`;
  }

  return `${fragments.slice(0, -1).join(', ')}, and ${fragments[fragments.length - 1]}`;
}

function lowercaseFragment(value: string) {
  if (/^[A-Z]{2,}\b/.test(value)) {
    return value;
  }

  return value.charAt(0).toLowerCase() + value.slice(1);
}
