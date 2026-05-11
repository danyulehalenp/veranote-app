import type {
  PatientContinuityFact,
  PatientContinuityFactCategory,
  PatientContinuityInput,
  PatientContinuityPrivacyMode,
  PatientContinuityRecord,
  PatientContinuitySearchInput,
  PatientContinuityTodaySignal,
} from '@/types/patient-continuity';

const MAX_FACTS_PER_CATEGORY = 5;

const CATEGORY_LABELS: Record<PatientContinuityFactCategory, string> = {
  'active-theme': 'Active themes',
  medication: 'Medication continuity',
  'risk-safety': 'Risk and safety',
  'open-loop': 'Open loops for next visit',
  'prior-intervention': 'Prior interventions',
  'source-conflict': 'Source conflicts',
  other: 'Other continuity',
};

const MEDICATION_PATTERN = /\b(lithium|lamotrigine|lamictal|sertraline|zoloft|fluoxetine|prozac|paroxetine|paxil|bupropion|wellbutrin|venlafaxine|effexor|escitalopram|lexapro|citalopram|celexa|quetiapine|seroquel|risperidone|risperdal|paliperidone|invega|olanzapine|zyprexa|aripiprazole|abilify|haloperidol|haldol|valproate|depakote|divalproex|suboxone|buprenorphine|naltrexone|clozapine|clozaril|stimulant|adderall|vyvanse|methylphenidate|ritalin)\b/i;

const RISK_PATTERN = /\b(suicid|homicid|self-harm|self harm|overdose|attempt|plan|intent|means|access to|threat|violence|aggression|psychosis|command hallucination|grave disability|cannot contract|safety plan|collateral concern|naloxone|intoxication|withdrawal)\b/i;

const OPEN_LOOP_PATTERN = /\b(pending|follow up|follow-up|recheck|monitor|confirm|verify|collateral|lab|level|cbc|cmp|anc|qtc|ekg|appointment|referral|safety plan|homework|next visit|tomorrow|repeat|awaiting|culture)\b/i;

const INTERVENTION_PATTERN = /\b(started|stopped|continued|increased|decreased|changed|discussed|reviewed|ordered|referred|safety plan|psychoeducation|cbt|grounding|homework|naloxone|labs ordered|medication education|collateral call)\b/i;

function nowIso() {
  return new Date().toISOString();
}

function createContinuityId() {
  return `continuity_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function createFactId(category: PatientContinuityFactCategory, text: string) {
  const slug = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 42);
  return `${category}:${slug || Math.random().toString(36).slice(2, 8)}`;
}

function cleanText(value: unknown, maxLength: number) {
  if (typeof value !== 'string') {
    return '';
  }

  return value
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

function splitCandidateSentences(text: string) {
  return text
    .replace(/\r\n/g, '\n')
    .split(/(?<=[.!?])\s+|\n+/)
    .map((sentence) => cleanText(sentence, 360))
    .filter((sentence) => sentence.length >= 24);
}

function pushFact(
  facts: PatientContinuityFact[],
  category: PatientContinuityFactCategory,
  summary: string,
  input: PatientContinuityInput,
  status: PatientContinuityFact['status'] = 'needs-confirmation-today',
) {
  const cleanedSummary = cleanText(summary, 240);
  if (!cleanedSummary) {
    return;
  }

  if (facts.filter((fact) => fact.category === category).length >= MAX_FACTS_PER_CATEGORY) {
    return;
  }

  const normalized = cleanedSummary.toLowerCase();
  if (facts.some((fact) => fact.category === category && fact.summary.toLowerCase() === normalized)) {
    return;
  }

  facts.push({
    id: createFactId(category, cleanedSummary),
    category,
    summary: cleanedSummary,
    status,
    sourceDraftId: input.sourceDraftId,
    sourceNoteType: input.sourceNoteType,
    sourceDate: input.sourceDate,
    sourceExcerpt: cleanedSummary,
  });
}

function deriveFacts(input: PatientContinuityInput) {
  const text = `${input.sourceText || ''}\n\n${input.noteText || ''}`;
  const sentences = splitCandidateSentences(text);
  const facts: PatientContinuityFact[] = [];

  for (const sentence of sentences) {
    if (RISK_PATTERN.test(sentence)) {
      pushFact(facts, 'risk-safety', sentence, input);
    }

    if (MEDICATION_PATTERN.test(sentence)) {
      pushFact(facts, 'medication', sentence, input);
    }

    if (OPEN_LOOP_PATTERN.test(sentence)) {
      pushFact(facts, 'open-loop', sentence, input);
    }

    if (INTERVENTION_PATTERN.test(sentence)) {
      pushFact(facts, 'prior-intervention', sentence, input, 'previously-documented');
    }
  }

  const lowered = text.toLowerCase();
  const themeSignals = [
    ['depression', /\b(depress|low mood|hopeless|anhedonia)\b/],
    ['anxiety', /\b(anxious|anxiety|panic|worry|avoidance)\b/],
    ['psychosis', /\b(psychosis|hallucination|delusion|paranoia|responding to internal stimuli)\b/],
    ['mania / activation', /\b(mania|hypomania|pressured speech|decreased need for sleep|racing thoughts)\b/],
    ['substance use', /\b(substance|alcohol|fentanyl|opioid|cannabis|withdrawal|intoxication|uds)\b/],
    ['trauma', /\b(trauma|ptsd|flashback|nightmare|hypervigilance)\b/],
    ['adherence / tolerability', /\b(adherence|missed dose|side effect|sedation|nausea|rash)\b/],
  ] as const;

  for (const [label, pattern] of themeSignals) {
    if (pattern.test(lowered)) {
      pushFact(facts, 'active-theme', label, input, 'previously-documented');
    }
  }

  if (!facts.length && text.trim()) {
    pushFact(facts, 'other', 'Prior Veranote note exists; review before relying on continuity.', input);
  }

  return facts;
}

function mergeFacts(previous: PatientContinuityFact[], next: PatientContinuityFact[]) {
  const byKey = new Map<string, PatientContinuityFact>();

  for (const fact of [...previous, ...next]) {
    const key = `${fact.category}:${fact.summary.toLowerCase()}`;
    byKey.set(key, {
      ...byKey.get(key),
      ...fact,
      id: byKey.get(key)?.id || fact.id,
      status: fact.status,
    });
  }

  return Array.from(byKey.values()).slice(0, 40);
}

function summarizeFacts(facts: PatientContinuityFact[], category: PatientContinuityFactCategory) {
  return facts
    .filter((fact) => fact.category === category && fact.status !== 'archived')
    .map((fact) => fact.summary)
    .slice(0, MAX_FACTS_PER_CATEGORY);
}

function buildRecallSummary(facts: PatientContinuityFact[]) {
  const activeThemes = summarizeFacts(facts, 'active-theme');
  const meds = summarizeFacts(facts, 'medication');
  const risks = summarizeFacts(facts, 'risk-safety');
  const loops = summarizeFacts(facts, 'open-loop');

  const parts = [
    activeThemes.length ? `Themes: ${activeThemes.join('; ')}` : '',
    meds.length ? `Medication continuity: ${meds.slice(0, 3).join('; ')}` : '',
    risks.length ? `Risk/safety: ${risks.slice(0, 3).join('; ')}` : '',
    loops.length ? `Open loops: ${loops.slice(0, 3).join('; ')}` : '',
  ].filter(Boolean);

  return parts.join(' | ') || 'Continuity snapshot saved. Review prior note details before relying on them today.';
}

export function normalizePatientContinuityRecord(
  raw: Partial<PatientContinuityRecord>,
  providerIdentityId: string,
): PatientContinuityRecord {
  const timestamp = nowIso();
  const continuityFacts = Array.isArray(raw.continuityFacts)
    ? raw.continuityFacts
      .filter((fact): fact is PatientContinuityFact => Boolean(fact) && typeof fact.summary === 'string')
      .slice(0, 40)
    : [];

  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : createContinuityId(),
    providerIdentityId,
    patientLabel: cleanText(raw.patientLabel, 80) || 'Unlabeled patient',
    patientDescription: cleanText(raw.patientDescription, 180) || undefined,
    privacyMode: isPrivacyMode(raw.privacyMode) ? raw.privacyMode : 'neutral-id',
    createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : timestamp,
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : timestamp,
    lastUsedAt: typeof raw.lastUsedAt === 'string' ? raw.lastUsedAt : undefined,
    archivedAt: typeof raw.archivedAt === 'string' ? raw.archivedAt : undefined,
    sourceDraftIds: Array.isArray(raw.sourceDraftIds) ? raw.sourceDraftIds.filter((item): item is string => typeof item === 'string') : [],
    sourceNoteTypes: Array.isArray(raw.sourceNoteTypes) ? raw.sourceNoteTypes.filter((item): item is string => typeof item === 'string') : [],
    lastSourceDate: typeof raw.lastSourceDate === 'string' ? raw.lastSourceDate : undefined,
    continuityFacts,
    todayPrepChecklist: Array.isArray(raw.todayPrepChecklist)
      ? raw.todayPrepChecklist.filter((item): item is string => typeof item === 'string').slice(0, 8)
      : buildTodayPrepChecklist(continuityFacts),
    recallSummary: cleanText(raw.recallSummary, 1200) || buildRecallSummary(continuityFacts),
    safetySummary: cleanText(raw.safetySummary, 600) || summarizeFacts(continuityFacts, 'risk-safety').join('; ') || undefined,
    medicationSummary: cleanText(raw.medicationSummary, 600) || summarizeFacts(continuityFacts, 'medication').join('; ') || undefined,
    openLoopSummary: cleanText(raw.openLoopSummary, 600) || summarizeFacts(continuityFacts, 'open-loop').join('; ') || undefined,
  };
}

export function buildPatientContinuityRecord(
  input: PatientContinuityInput,
  providerIdentityId: string,
): PatientContinuityRecord {
  const timestamp = nowIso();
  const previous = input.existingRecord ? normalizePatientContinuityRecord(input.existingRecord, providerIdentityId) : null;
  const nextFacts = deriveFacts(input);
  const continuityFacts = mergeFacts(previous?.continuityFacts || [], nextFacts);
  const sourceDraftIds = new Set(previous?.sourceDraftIds || []);
  const sourceNoteTypes = new Set(previous?.sourceNoteTypes || []);

  if (input.sourceDraftId) {
    sourceDraftIds.add(input.sourceDraftId);
  }

  if (input.sourceNoteType) {
    sourceNoteTypes.add(input.sourceNoteType);
  }

  return normalizePatientContinuityRecord({
    ...(previous || {}),
    id: previous?.id,
    providerIdentityId,
    patientLabel: cleanText(input.patientLabel, 80) || previous?.patientLabel || createNeutralPatientLabel(),
    patientDescription: cleanText(input.patientDescription, 180) || previous?.patientDescription,
    privacyMode: isPrivacyMode(input.privacyMode) ? input.privacyMode : previous?.privacyMode || 'neutral-id',
    createdAt: previous?.createdAt || timestamp,
    updatedAt: timestamp,
    sourceDraftIds: Array.from(sourceDraftIds).slice(-12),
    sourceNoteTypes: Array.from(sourceNoteTypes).slice(-12),
    lastSourceDate: input.sourceDate || previous?.lastSourceDate || timestamp,
    continuityFacts,
    todayPrepChecklist: buildTodayPrepChecklist(continuityFacts),
    recallSummary: buildRecallSummary(continuityFacts),
  }, providerIdentityId);
}

function createNeutralPatientLabel() {
  const compact = new Date().toISOString().slice(5, 10).replace('-', '');
  return `Veranote patient ${compact}`;
}

function isPrivacyMode(value: unknown): value is PatientContinuityPrivacyMode {
  return value === 'neutral-id' || value === 'patient-name' || value === 'description-only';
}

export function buildTodayPrepChecklist(facts: PatientContinuityFact[]) {
  const checklist = [
    'Confirm what changed since the prior Veranote note.',
    'Keep prior facts marked as previously documented unless confirmed today.',
  ];

  if (facts.some((fact) => fact.category === 'risk-safety')) {
    checklist.push('Reassess risk/safety and preserve any denial-versus-collateral conflicts.');
  }

  if (facts.some((fact) => fact.category === 'medication')) {
    checklist.push('Verify current medication adherence, side effects, dose, and reconciliation conflicts.');
  }

  if (facts.some((fact) => fact.category === 'open-loop')) {
    checklist.push('Close or update open loops: labs, collateral, homework, referrals, or follow-up tasks.');
  }

  return checklist.slice(0, 8);
}

export function buildContinuitySourceBlock(record: PatientContinuityRecord) {
  const activeFacts = record.continuityFacts.filter((fact) => fact.status !== 'archived');
  const grouped = Object.entries(CATEGORY_LABELS)
    .map(([category, label]) => {
      const facts = activeFacts.filter((fact) => fact.category === category).slice(0, MAX_FACTS_PER_CATEGORY);
      if (!facts.length) {
        return '';
      }

      return `${label}:\n${facts.map((fact) => `- ${fact.summary} (${fact.status.replaceAll('-', ' ')})`).join('\n')}`;
    })
    .filter(Boolean)
    .join('\n\n');

  return [
    'Patient Continuity Context - Veranote recall layer',
    `Patient label: ${record.patientLabel}`,
    record.patientDescription ? `Identifying description: ${record.patientDescription}` : '',
    record.lastSourceDate ? `Last source date: ${record.lastSourceDate}` : '',
    'Use this as prior context only. Verify today before documenting as current fact.',
    record.recallSummary ? `Recall summary: ${record.recallSummary}` : '',
    grouped,
    record.todayPrepChecklist.length
      ? `Today's prep checklist:\n${record.todayPrepChecklist.map((item) => `- ${item}`).join('\n')}`
      : '',
    'Continuity safety rule: do not silently copy prior note content into today. Mark previously documented, confirmed today, or conflicting with today source.',
  ].filter(Boolean).join('\n');
}

export function buildContinuityTodaySignals(
  record: PatientContinuityRecord | null | undefined,
  todaySourceText: string,
): PatientContinuityTodaySignal[] {
  if (!record) {
    return [];
  }

  const text = todaySourceText.toLowerCase();
  const signals: PatientContinuityTodaySignal[] = [];
  const hasPriorRisk = record.continuityFacts.some((fact) => fact.category === 'risk-safety');

  if (hasPriorRisk && /\bdenies (si|suicidal|homicidal|hi)\b/.test(text)) {
    signals.push({
      id: 'risk-denial-does-not-erase-history',
      tone: 'caution',
      label: 'Risk history needs reconciliation',
      detail: 'Today includes denial language while prior continuity has risk/safety items. Keep both visible unless the provider confirms resolution.',
    });
  }

  if (record.continuityFacts.some((fact) => fact.category === 'medication') && /\b(stopped|missed|ran out|side effect|rash|sedat|nausea)\b/.test(text)) {
    signals.push({
      id: 'medication-reconciliation-needed',
      tone: 'review',
      label: 'Medication continuity changed',
      detail: 'Today mentions adherence, stopping, running out, or side effects. Verify against prior medication continuity before drafting the follow-up.',
    });
  }

  if (record.continuityFacts.some((fact) => fact.category === 'open-loop')) {
    signals.push({
      id: 'open-loop-check',
      tone: 'info',
      label: 'Open loops carried forward',
      detail: 'Prior note has tasks or pending items. Confirm which items are resolved, still pending, or no longer relevant today.',
    });
  }

  return signals;
}

export function searchPatientContinuityRecords(
  records: PatientContinuityRecord[],
  input: PatientContinuitySearchInput = {},
) {
  const queryTerms = cleanText(input.query, 140)
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  const dateFrom = input.dateFrom ? new Date(input.dateFrom).getTime() : Number.NEGATIVE_INFINITY;
  const dateTo = input.dateTo ? new Date(input.dateTo).getTime() + 86_399_999 : Number.POSITIVE_INFINITY;
  const noteType = cleanText(input.noteType, 80).toLowerCase();
  const category = input.category && input.category !== 'all' ? input.category : '';

  return records
    .filter((record) => input.includeArchived ? true : !record.archivedAt)
    .filter((record) => {
      const lastSourceTime = new Date(record.lastSourceDate || record.updatedAt || record.createdAt).getTime();
      return (Number.isNaN(lastSourceTime) ? true : lastSourceTime >= dateFrom && lastSourceTime <= dateTo);
    })
    .filter((record) => {
      if (!noteType) {
        return true;
      }

      return record.sourceNoteTypes.some((item) => item.toLowerCase().includes(noteType));
    })
    .filter((record) => {
      if (!category) {
        return true;
      }

      return record.continuityFacts.some((fact) => fact.category === category && fact.status !== 'archived');
    })
    .filter((record) => {
      if (!queryTerms.length) {
        return true;
      }

      const haystack = [
        record.patientLabel,
        record.patientDescription,
        record.recallSummary,
        record.safetySummary,
        record.medicationSummary,
        record.openLoopSummary,
        record.sourceDraftIds.join(' '),
        record.sourceNoteTypes.join(' '),
        record.continuityFacts.map((fact) => `${fact.category} ${fact.summary} ${fact.status}`).join(' '),
        record.todayPrepChecklist.join(' '),
      ].filter(Boolean).join(' ').toLowerCase();

      return queryTerms.every((term) => haystack.includes(term));
    })
    .sort((left, right) => (
      new Date(right.lastUsedAt || right.updatedAt).getTime()
      - new Date(left.lastUsedAt || left.updatedAt).getTime()
    ));
}
