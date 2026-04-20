'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { findProviderProfile } from '@/lib/constants/provider-profiles';
import { DEFAULT_PROVIDER_SETTINGS, type ProviderSettings } from '@/lib/constants/settings';
import { DRAFT_SESSION_KEY } from '@/lib/constants/storage';
import { describePopulatedSourceSections, EMPTY_SOURCE_SECTIONS, normalizeSourceSections } from '@/lib/ai/source-sections';
import { countWords, parseDraftSections, reconcileSectionReviewState } from '@/lib/note/review-sections';
import { buildSectionEvidenceMap, buildSourceBlocks, getSignalLabel, highlightTermsInText, type SourceBlock } from '@/lib/note/source-linking';
import { getHighRiskWarnings } from '@/lib/eval/high-risk-warnings';
import { buildDiagnosisProfileSummary, normalizeDiagnosisProfile } from '@/lib/note/diagnosis-profile';
import { buildEncounterSupportSummary, buildEncounterSupportWarnings, getEncounterSupportConfig, normalizeEncounterSupport } from '@/lib/note/encounter-support';
import { evaluateMedicalNecessitySupport } from '@/lib/note/medical-necessity-support';
import { buildMedicationProfileSummary, normalizeMedicationProfile } from '@/lib/note/medication-profile';
import { SECTION_LABELS, planSections } from '@/lib/note/section-profiles';
import { evaluateMedicationWarningsSorted } from '@/lib/medications/runtime-warning-engine';
import { findMedicationMentionsInText, getMedicationById, getPsychMedicationWarningBundle } from '@/lib/medications/seed-loader';
import { findDiagnosisAvoidTermsInText, findDiagnosisMentionsInText, findDiagnosisNonAutoMapTermsInText } from '@/lib/psychiatry-diagnosis/seed-loader';
import { detectRiskTerms, findAbbreviationMentionsInText, findAvoidTermsInText, findMseTermsInText } from '@/lib/psychiatry-terminology/seed-loader';
import { ASSISTANT_ACTION_EVENT, ASSISTANT_PENDING_ACTION_KEY, publishAssistantContext } from '@/lib/veranote/assistant-context';
import { dismissLanePreferenceSuggestion, getLanePreferenceSuggestion, recordLanePreferenceSelection } from '@/lib/veranote/assistant-learning';
import { buildLanePreferencePrompt } from '@/lib/veranote/preference-draft';
import { getCurrentProviderId, getProviderSettingsStorageKey } from '@/lib/veranote/provider-identity';
import { resolveVeraAddress } from '@/lib/veranote/vera-relationship';
import type { DraftSession, ReviewStatus, SourceSections } from '@/types/session';
import type { NoteSectionKey, OutputScope } from '@/lib/note/section-profiles';

function sanitizeFileName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'note-draft';
}

type RewriteMode = 'more-concise' | 'more-formal' | 'closer-to-source' | 'regenerate-full-note';

function splitFlags(flags: string[]) {
  const contradictionFlags = flags.filter((flag) => /^Possible contradiction:/i.test(flag));
  const missingInfoFlags = flags.filter((flag) => !/^Possible contradiction:/i.test(flag));
  return { contradictionFlags, missingInfoFlags };
}

function unique<T>(items: T[]) {
  return Array.from(new Set(items));
}

function uniqueBy<T>(items: T[], getKey: (item: T) => string) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = getKey(item);
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function extractFirstReviewSentence(text: string | null | undefined) {
  if (!text?.trim()) {
    return undefined;
  }

  const normalized = text.replace(/\s+/g, ' ').trim();
  const parts = normalized.match(/[^.!?]+[.!?]?/g)?.map((part) => part.trim()).filter(Boolean) || [];
  return parts.find((part) => part.length >= 24) || parts[0] || undefined;
}

function getConfirmedEvidenceBlockIds(session: DraftSession | null, anchor: string) {
  return session?.sectionReviewState?.[anchor]?.confirmedEvidenceBlockIds || [];
}

function looksLikeDischargeNote(noteType: string) {
  return /discharge/i.test(noteType || '');
}

function hasDestinationConstraintSignal(session: DraftSession | null) {
  const combined = [
    session?.format,
    session?.customInstructions,
    session?.sourceInput,
    session?.presetName,
  ].filter(Boolean).join('\n').toLowerCase();

  return /ascii-safe|wellsky|destination|template|format|paragraph only|minimal headings/.test(combined);
}

function collectMedicationSignals(sourceText: string) {
  const lowered = sourceText.toLowerCase();
  const mentionedChanges = /medications adjusted|medications changed|medications optimized|medication changes|started |increased |decreased |titrated |continue current discharge medications|reconciled/i.test(sourceText);
  const medicationMentions = findMedicationMentionsInText(sourceText);
  const dosageSignals = sourceText.match(/\b\d+\s?(mg|mcg|g|ml)\b/gi) || [];
  const frequencySignals = sourceText.match(/\b(daily|bid|tid|qhs|qam|nightly|bedtime|prn|twice daily|once daily)\b/gi) || [];

  return {
    mentionedChanges,
    medicationIds: medicationMentions.medicationIds,
    medicationNameCount: medicationMentions.medicationIds.length,
    medicationTerms: medicationMentions.matchedTerms,
    dosageSignalCount: dosageSignals.length,
    frequencySignalCount: frequencySignals.length,
    hasMarOrReconciliation: /\bmar\b|medication reconciliation|discharge medication/i.test(lowered),
  };
}

function formatMedicationFlag(flag: string) {
  return flag.replace(/_/g, ' ').replace(/\b\w/g, (match) => match.toUpperCase());
}

function formatMedicationSourceStatus(value: string) {
  return value.replace(/_/g, ' ');
}

function buildMedicationRuntimeInput(
  sourceText: string,
  medicationEntries: Array<NonNullable<ReturnType<typeof getMedicationById>>>,
  noteType: string,
  careSetting?: string,
  structuredMedicationProfile?: DraftSession['medicationProfile'],
) {
  const lowered = sourceText.toLowerCase();
  const matchedAge = sourceText.match(/\b(\d{1,2})\s?(?:year old|yo|y\/o)\b/i);
  const hasRecentStopSignal = /\brecently stopped\b|\bstopped\b|\bdiscontinued\b|\blast dose\b|\bwashout\b/i.test(sourceText);
  const hasDoseChangeSignal = /\bstarted\b|\bnew start\b|\bincreased\b|\bdecreased\b|\btitrat|\bdose change\b|\breduced\b/i.test(sourceText);
  const hasStartDateSignal = /\bstarted on\b|\bsince \d{1,2}\/\d{1,2}\b|\bbegan\b/i.test(sourceText);
  const activeMedicationIds = unique([
    ...medicationEntries.map((item) => item.id),
    ...normalizeMedicationProfile(structuredMedicationProfile)
      .filter((item) => item.status !== 'recently-stopped')
      .map((item) => item.normalizedMedicationId)
      .filter((item): item is string => Boolean(item)),
  ]);
  const activeMedicationTags = unique(medicationEntries.flatMap((item) => item.highRiskFlags));
  const recentMedicationIds = unique(
    normalizeMedicationProfile(structuredMedicationProfile)
      .filter((item) => item.status === 'recently-stopped')
      .map((item) => item.normalizedMedicationId)
      .filter((item): item is string => Boolean(item)),
  );
  const context: Record<string, unknown> = {};

  if (activeMedicationIds.length) {
    context.active_medications = true;
  }
  if (hasRecentStopSignal) {
    context.recent_medications = true;
    context.start_stop_dates = true;
  }
  if (hasDoseChangeSignal) {
    context.new_start_or_dose_change = true;
    context.dose_changes = ['documented'];
  }
  if (hasStartDateSignal) {
    context.start_date = true;
  }
  if (matchedAge?.[1]) {
    context.age = Number.parseInt(matchedAge[1], 10);
  }
  if (/\bbipolar\b|\bmania\b|\bmanic\b/.test(lowered)) {
    context.diagnoses = ['bipolar-spectrum-mentioned'];
    context.history_of_mania = true;
    context.mood_history = 'documented';
  }
  if (/\bproblem list\b/.test(lowered)) {
    context.problem_list = true;
  }
  if (/\bseizure\b|\bepilep/i.test(lowered)) {
    context.history_of_seizure = true;
    context.seizure_history = true;
  }
  if (/\beating disorder\b|\banorexi|\bbulimi/i.test(lowered)) {
    context.eating_disorder_history = true;
  }
  if (/\balcohol\b|\bcannabis\b|\bopioid\b|\bsubstance use\b|\bdrug use\b/.test(lowered)) {
    context.substance_use_history = ['documented'];
    context.substance_use_context = true;
  }
  if (/\bqt\b|\barrhythm|\bcardiac\b|\bheart disease\b|\bheart failure\b/.test(lowered)) {
    context.cardiac_history = ['documented'];
  }
  if (/\bsyncope\b|\bfaint/i.test(lowered)) {
    context.syncope_history = true;
  }
  if (/\bhypokal/i.test(lowered) || /\bhypomagnes/i.test(lowered) || /\bdehydrat/i.test(lowered)) {
    context.electrolyte_risk = true;
    context.dehydration_risk = true;
  }
  if (/\bcbc\b|\banc\b|\babsolute neutrophil\b/.test(lowered)) {
    context.cbc_anc = 'documented';
    context.cbc_anc_data = true;
  }
  if (/\bconstipation\b|\bileus\b|\bbowel obstruction\b/.test(lowered)) {
    context.constipation_history = true;
  }
  if (/\bcurrent smoker\b|\bsmokes\b/.test(lowered)) {
    context.smoking_status = 'current';
  } else if (/\bformer smoker\b|\bquit smoking\b/.test(lowered)) {
    context.smoking_status = 'former';
  } else if (/\bnever smoked\b/.test(lowered)) {
    context.smoking_status = 'never';
  }
  if (/\bcreatinine\b|\begfr\b|\brenal\b/.test(lowered)) {
    context.renal_function = 'documented';
  }
  if (/\btsh\b|\bthyroid\b/.test(lowered)) {
    context.thyroid_status = 'documented';
  }
  if (/\blithium level\b/.test(lowered)) {
    context.lithium_level = 'documented';
    context.lithium_level_if_available = true;
  }
  if (/\bpregnan/i.test(lowered)) {
    context.pregnancy_status = 'documented';
    context.reproductive_potential = 'documented';
  }
  if (/\bbmi\b|\bweight\b/.test(lowered)) {
    context.weight_bmi = 'documented';
  }
  if (/\b\d{2,3}\/\d{2,3}\b/.test(sourceText) || /\bblood pressure\b/.test(lowered)) {
    context.blood_pressure = 'documented';
  }
  if (/\bheart rate\b|\bpulse\b|\bhr\b/.test(lowered)) {
    context.heart_rate = 'documented';
  }
  if (/\blipid\b|\bcholesterol\b|\btriglyceride\b/.test(lowered)) {
    context.lipids = 'documented';
  }
  if (/\ba1c\b|\bglucose\b|\bhemoglobin a1c\b/.test(lowered)) {
    context.a1c_or_glucose = 'documented';
  }
  if (/\bdiabetes\b/.test(lowered)) {
    context.diabetes_history = true;
  }
  if (/\btd\b|\btardive\b|\beps\b|\bakathisia\b|\bparkinson/i.test(lowered)) {
    context.movement_disorder_history = true;
  }
  if (/\baims\b/.test(lowered)) {
    context.aims_if_available = true;
  }
  if (/\brespiratory\b|\bcopd\b|\bsleep apnea\b/.test(lowered)) {
    context.respiratory_disease_history = true;
  }
  if (/\bhepatic\b|\bliver\b/.test(lowered)) {
    context.hepatic_history = 'documented';
  }
  if (/\blast injection\b|\binjection due\b/.test(lowered)) {
    context.last_injection_date = 'documented';
  }
  if (/\boral tolerability\b|\btolerating oral\b/.test(lowered)) {
    context.oral_tolerability_documented = true;
  }
  if (medicationEntries.some((item) => item.isLai)) {
    context.is_lai = true;
    context.planned_product = true;
  }
  if (careSetting) {
    context.care_setting = careSetting.toLowerCase();
  } else if (/telehealth/i.test(noteType)) {
    context.care_setting = 'telehealth';
  } else if (/outpatient|crisis/i.test(noteType)) {
    context.care_setting = 'outpatient';
  } else {
    context.care_setting = 'inpatient';
  }

  return {
    activeMedicationIds,
    recentMedicationIds: hasRecentStopSignal ? unique([...recentMedicationIds, ...activeMedicationIds]) : recentMedicationIds,
    activeMedicationTags,
    context,
  };
}

function formatWarningSeverity(value: string) {
  return value.replace(/_/g, ' ').replace(/\b\w/g, (match) => match.toUpperCase());
}

function formatRiskAction(value: string) {
  return value.replace(/_/g, ' ');
}

function formatDiagnosisAction(value: string) {
  return value.replace(/_/g, ' ');
}

function hasTimeframeSignal(text: string) {
  return /\b\d+\s?(day|days|week|weeks|month|months|year|years|hour|hours)\b|\bover the last\b|\bsince\b|\byesterday\b|\bovernight\b|\bfor the past\b|\blast \w+\b/i.test(text);
}

type DischargeTimelineBucket = {
  id: string;
  label: string;
  hint: string;
  snippets: Array<{
    sourceLabel: string;
    text: string;
  }>;
};

type ObjectiveReviewState = {
  hasObjectiveData: boolean;
  hasConflictRisk: boolean;
  sourceSignals: string[];
  conflictBullets: string[];
  reviewPrompts: string[];
  snippets: Array<{
    id: string;
    sourceLabel: string;
    text: string;
    sourceKey: keyof SourceSections;
  }>;
};

function buildDischargeTimelineBuckets(sourceBlocks: SourceBlock[]): DischargeTimelineBucket[] {
  const bucketDefs = [
    {
      id: 'admission',
      label: 'Admission / presenting picture',
      hint: 'What was happening when the patient came in?',
      regex: /\badmitted\b|\badmission\b|presenting|on arrival|came in|reason for admission/i,
    },
    {
      id: 'during-stay',
      label: 'During stay / hospital course',
      hint: 'What changed, escalated, or was managed during the stay?',
      regex: /during stay|hospital course|required prn|group|participated|over the last|throughout stay|on the unit/i,
    },
    {
      id: 'recent',
      label: 'Recent but not current',
      hint: 'What happened yesterday, overnight, or recently enough that it should not disappear?',
      regex: /yesterday|last night|overnight|2 days ago|three days ago|recently|earlier in admission/i,
    },
    {
      id: 'current-discharge',
      label: 'Current discharge status',
      hint: 'What is true now at discharge or today?',
      regex: /\btoday\b|at discharge|currently|now denies|denies today|sleeping better|calmer now|ready to go home/i,
    },
  ];

  return bucketDefs.map((bucket) => {
    const snippets = sourceBlocks
      .filter((block) => bucket.regex.test(block.text))
      .slice(0, 4)
      .map((block) => ({
        sourceLabel: block.sourceLabel,
        text: block.text.length > 260 ? `${block.text.slice(0, 257)}...` : block.text,
      }));

    return {
      id: bucket.id,
      label: bucket.label,
      hint: bucket.hint,
      snippets,
    };
  }).filter((bucket) => bucket.snippets.length > 0);
}

function truncateObjectiveSnippet(text: string) {
  const normalized = text.trim().replace(/\s+/g, ' ');
  return normalized.length > 220 ? `${normalized.slice(0, 217)}...` : normalized;
}

function buildObjectiveReviewState(input: {
  sourceBlocks: SourceBlock[];
  sourceSections: SourceSections;
  sourceInput: string;
  draftText: string;
  contradictionFlags: string[];
  highRiskWarnings: Array<{ id: string; title: string }>;
  copilotSuggestions: Array<{ title: string; detail?: string }>;
}): ObjectiveReviewState {
  const objectiveBlocks = input.sourceBlocks.filter((block) => block.sourceKey === 'objectiveData');
  const objectiveText = input.sourceSections.objectiveData || '';
  const sourceText = `${input.sourceInput}\n${objectiveText}`.toLowerCase();
  const draftText = input.draftText.toLowerCase();
  const sourceSignals: string[] = [];
  const conflictBullets: string[] = [];

  if (/\blab\b|\blabs\b|\bcbc\b|\bmp\b|\bcmp\b|\buds\b|\burine drug screen\b|\bpositive for cocaine\b|\bpositive\b/.test(sourceText)) {
    sourceSignals.push('Objective source includes lab, toxicology, or other structured result language.');
  }
  if (/\bbp\b|\bblood pressure\b|\bheart rate\b|\bpulse\b|\btemp\b|\bvitals?\b/.test(sourceText)) {
    sourceSignals.push('Objective source includes vitals or other measured findings.');
  }
  if (/\bmar\b|\bmedication list still shows\b|\bmedication list shows\b|\bnot yet updated\b/.test(sourceText)) {
    sourceSignals.push('Objective source includes medication-list or MAR wording that may conflict with patient report or plan language.');
  }
  if (/\bresponding to internal stimuli\b|\blaughing to self\b|\binternally preoccupied\b|\bobserved\b/.test(sourceText)) {
    sourceSignals.push('Objective source includes observed behavior that may not align cleanly with the narrative summary.');
  }

  const contradictionObjectiveFlags = input.contradictionFlags.filter((flag) => /objective|lab|mar|medication|abnormal|positive|vital/i.test(flag));
  contradictionObjectiveFlags.forEach((flag) => conflictBullets.push(flag));

  const objectiveRiskWarnings = input.highRiskWarnings.filter((warning) =>
    warning.id === 'subjective-objective-mismatch'
    || warning.id === 'conflict-adjudication-language'
    || /objective|mismatch/i.test(warning.title),
  );
  objectiveRiskWarnings.forEach((warning) => {
    const bullet = `${warning.title}.`;
    if (!conflictBullets.includes(bullet)) {
      conflictBullets.push(bullet);
    }
  });

  const objectiveCopilotSuggestions = input.copilotSuggestions.filter((item) =>
    /objective|lab|vital|mar|medication conflict|mismatch/i.test(`${item.title} ${item.detail || ''}`),
  );
  objectiveCopilotSuggestions.forEach((item) => {
    const bullet = item.detail?.trim() ? `${item.title}: ${item.detail}` : item.title;
    if (!conflictBullets.includes(bullet)) {
      conflictBullets.push(bullet);
    }
  });

  if (sourceSignals.length && !/(objective|lab|vital|mar|medication list|positive screen|uds|observed|internally preoccupied)/.test(draftText)) {
    conflictBullets.push('The draft may read more cleanly than the objective source packet. Re-check whether vitals, labs, med-list conflict, or observed behavior stayed visible.');
  }

  const reviewPrompts = [
    'Keep patient report, charted data, observed behavior, and medication-list details visibly separated when they do not line up cleanly.',
    'Do not let a calmer narrative erase abnormal vitals, positive screens, MAR conflict, or observed psychosis concern that still matters to the note.',
    'When the source stays unresolved, prefer explicit mismatch wording over quietly choosing one side as the final truth.',
  ];

  return {
    hasObjectiveData: Boolean(objectiveText.trim() || objectiveBlocks.length),
    hasConflictRisk: Boolean(conflictBullets.length),
    sourceSignals: unique(sourceSignals),
    conflictBullets: unique(conflictBullets),
    reviewPrompts,
    snippets: objectiveBlocks.slice(0, 4).map((block) => ({
      id: block.id,
      sourceLabel: block.sourceLabel,
      text: truncateObjectiveSnippet(block.text),
      sourceKey: block.sourceKey,
    })),
  };
}

type PsychReviewGuidance = {
  careSetting: 'Inpatient' | 'Outpatient' | 'Telehealth';
  title: string;
  intro: string;
  priorities: string[];
  sectionChecks: string[];
};

function getPsychReviewGuidance(noteType: string): PsychReviewGuidance {
  if (/psychiatric crisis/i.test(noteType)) {
    return {
      careSetting: 'Outpatient',
      title: 'Psychiatric crisis review frame',
      intro: 'Crisis notes should preserve acute-risk wording, interventions, and disposition boundaries without quietly converting a crisis encounter into a calmer routine follow-up.',
      priorities: [
        'Keep passive thoughts, active thoughts, intent, plan, access, and current willingness to stay safe visibly distinct when the source keeps them distinct.',
        'Do not overstate resolution just because safety planning or collateral contact happened during the encounter.',
        'Leave crisis actions and escalation thresholds literal instead of replacing them with generic supportive language.',
      ],
      sectionChecks: [
        'Risk wording should stay time-bound to the crisis encounter and current acute picture.',
        'Assessment should preserve what remains dangerous, uncertain, or only partially improved.',
        'Plan should show the real disposition boundary, including ED escalation, mobile crisis, family support, or close follow-up when actually documented.',
      ],
    };
  }

  if (/telehealth/i.test(noteType)) {
    return {
      careSetting: 'Telehealth',
      title: 'Telehealth psych review frame',
      intro: 'Telehealth notes should stay honest about what was observed remotely, what was patient-reported, and what remains uncertain without in-person objective data.',
      priorities: [
        'Do not let "no current plan or intent" erase chronic passive SI or longstanding risk context when that history is still present.',
        'Avoid implying in-person observations, vitals, or exam findings that were never available during a remote encounter.',
        'Keep acute stress worsening, functioning, and adherence changes literal rather than flattening them into a generic stable follow-up.',
      ],
      sectionChecks: [
        'Safety wording should distinguish chronic background risk from current acute intent.',
        'Mental-status wording should not sound more directly observed than the visit format allows.',
        'Plan language should stay bounded to what was actually discussed or documented on the telehealth visit.',
      ],
    };
  }

  if (/outpatient psychiatric evaluation/i.test(noteType)) {
    return {
      careSetting: 'Outpatient',
      title: 'Outpatient evaluation review frame',
      intro: 'Outpatient evaluations should support diagnostic clarification and treatment planning without turning old labels or partial history into false certainty.',
      priorities: [
        'Keep prior diagnoses visibly historical unless today’s source actually confirms them.',
        'Let the differential stay open when bipolarity, trauma, anxiety, ADHD, or substance-related explanations are still mixed together.',
        'Preserve chronology between prior records, current symptoms, and the clinician’s present impression.',
      ],
      sectionChecks: [
        'Assessment and diagnosis sections should not outrun the evidence in the intake source.',
        'Collateral and outside-record attribution should remain explicit.',
        'Risk wording should reflect current status without erasing historical passive SI, past treatment, or unresolved uncertainty.',
      ],
    };
  }

  if (/outpatient psych follow-up/i.test(noteType) || /psychiatry follow-up/i.test(noteType)) {
    return {
      careSetting: 'Outpatient',
      title: 'Outpatient follow-up review frame',
      intro: 'Outpatient follow-up notes should preserve partial response, side-effect nuance, functioning changes, and refill boundaries instead of smoothing everything into a cleaner med check.',
      priorities: [
        'Do not overstate improvement when the source only supports “somewhat better” or “about the same.”',
        'Keep adherence and side effects literal, especially when the patient is missing doses or describing mild but real tolerability issues.',
        'Avoid turning chronic risk history into either false reassurance or false crisis language.',
      ],
      sectionChecks: [
        'Medication and plan sections should not imply a refill, continuation, or dose change unless that decision is actually documented.',
        'Functioning claims should stay tied to the source, such as still working but exhausted.',
        'Assessment wording should preserve what is better, worse, and unchanged rather than compressing it into a generic stable note.',
      ],
    };
  }

  return {
    careSetting: 'Inpatient',
    title: 'Inpatient psych review frame',
    intro: 'Inpatient notes need tighter chronology control so admission symptoms, behavior on unit, PRNs, med changes, and current status do not get blurred together.',
    priorities: [
      'Keep current status separate from earlier admission symptoms and recent events on the unit.',
      'Leave staff observations, collateral, and patient statements visibly sourced when they conflict.',
      'Do not overstate readiness, stabilization, or symptom resolution just because the note sounds cleaner.',
    ],
    sectionChecks: [
      'Risk wording should stay literal and time-bound to the documented day or discharge moment.',
      'Medication, PRN, and lab context should remain exact and source-grounded.',
      'Hospital-course language should stay bounded to what the record actually documents.',
    ],
  };
}

function formatExportBundle(session: DraftSession, draftText: string) {
  const suggestionLines = session.copilotSuggestions?.length
    ? session.copilotSuggestions.map((item) => `${item.severity.toUpperCase()}: ${item.title} — ${item.detail}`)
    : ['None'];

  const reviewStateLines = Object.values(session.sectionReviewState || {}).length
    ? Object.values(session.sectionReviewState || {}).map((item) => {
      const confirmedEvidence = item.confirmedEvidenceBlockIds?.length
        ? ` | reviewer-confirmed evidence: ${item.confirmedEvidenceBlockIds.join(', ')}`
        : '';

      const reviewerComment = item.reviewerComment?.trim() ? ` | reviewer note: ${item.reviewerComment.trim()}` : '';
      return `${item.heading}: ${item.status}${confirmedEvidence}${reviewerComment}`;
    })
    : ['None'];

  const bundle = [
    `Note Type: ${session.noteType}`,
    `Template: ${session.template}`,
    `Specialty: ${session.specialty}`,
    `Mode: ${session.mode || 'live'}`,
    '',
    '--- Draft Note ---',
    draftText,
    '',
    '--- Flags ---',
    ...(session.flags?.length ? session.flags : ['None']),
    '',
    '--- Section Review State ---',
    ...reviewStateLines,
    '',
    '--- Copilot Suggestions ---',
    ...suggestionLines,
  ];

  return bundle.join('\n');
}

function toAsciiSafe(value: string) {
  return value
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[–—]/g, '-')
    .replace(/…/g, '...')
    .replace(/\u00A0/g, ' ');
}

function buildExportConstraintList(session: DraftSession | null, providerSettings: ProviderSettings) {
  const constraints = [
    `Destination: ${providerSettings.outputDestination}`,
    `ASCII-safe: ${providerSettings.asciiSafe ? 'On' : 'Off'}`,
    `Paragraph-only: ${providerSettings.paragraphOnly ? 'On' : 'Off'}`,
    `Format: ${session?.format || 'Unknown'}`,
  ];

  if (providerSettings.wellskyFriendly || providerSettings.outputDestination === 'WellSky') {
    constraints.push('WellSky-friendly cleanup active');
  }

  if (session?.customInstructions?.trim()) {
    constraints.push('Custom provider instructions attached');
  }

  return constraints;
}

function buildExportPreviewText(draftText: string, session: DraftSession | null, providerSettings: ProviderSettings) {
  let preview = draftText || '';

  if (providerSettings.asciiSafe || providerSettings.outputDestination === 'WellSky') {
    preview = toAsciiSafe(preview);
  }

  if (providerSettings.paragraphOnly || session?.format === 'Paragraph Style') {
    preview = preview
      .replace(/\n{3,}/g, '\n\n')
      .replace(/[ \t]+\n/g, '\n');
  }

  return preview.trim();
}

const sourceSectionMeta: Array<{ key: keyof SourceSections; label: string; hint: string }> = [
  { key: 'clinicianNotes', label: 'Clinician raw notes', hint: 'Your shorthand, rough bullets, and direct impressions.' },
  { key: 'intakeCollateral', label: 'Intake / collateral', hint: 'Family report, nursing intake, social work, collateral history.' },
  { key: 'patientTranscript', label: 'Patient conversation / transcript', hint: 'Direct patient wording, interview excerpts, quoted chronology.' },
  { key: 'objectiveData', label: 'Objective data', hint: 'Vitals, labs, meds, structured findings, other objective inputs.' },
];

const severityClasses = {
  info: 'border-sky-200 bg-sky-50 text-sky-900',
  review: 'border-amber-200 bg-amber-50 text-amber-900',
  warning: 'border-rose-200 bg-rose-50 text-rose-900',
} as const;

const reviewStatusClasses: Record<ReviewStatus, string> = {
  unreviewed: 'border-slate-200 bg-slate-50 text-slate-700',
  approved: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  'needs-review': 'border-amber-200 bg-amber-50 text-amber-900',
};

const evidenceSignalClasses = {
  'strong-overlap': 'border-emerald-200 bg-emerald-50 text-emerald-800',
  'possible-overlap': 'border-sky-200 bg-sky-50 text-sky-900',
  'weak-overlap': 'border-slate-200 bg-slate-50 text-slate-700',
} as const;

function ProvenanceChip({ label }: { label: string }) {
  return (
    <span className="rounded-full border border-white/12 bg-white/10 px-2.5 py-1 text-[11px] font-medium text-cyan-50 shadow-[0_8px_22px_rgba(4,12,24,0.18)]">
      {label}
    </span>
  );
}

function WarningWhyThisAppeared(props: {
  summary: string;
  bullets: string[];
  toneClassName: string;
}) {
  if (!props.bullets.length) {
    return null;
  }

  return (
    <details className={`aurora-soft-panel mt-3 rounded-[18px] border p-3 ${props.toneClassName}`}>
      <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide">
        Why this appeared
      </summary>
      <div className="mt-2 text-xs">
        <div className="font-medium">{props.summary}</div>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          {props.bullets.map((bullet) => (
            <li key={bullet}>{bullet}</li>
          ))}
        </ul>
      </div>
    </details>
  );
}

function CollapsibleReviewSection(props: {
  id?: string;
  title: string;
  subtitle: string;
  toneClassName: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  return (
    <details id={props.id} open={props.defaultOpen} className={`aurora-panel mb-4 rounded-[26px] px-5 py-5 text-sm ${props.toneClassName}`}>
      <summary className="cursor-pointer list-none">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-lg font-semibold">{props.title}</div>
            <p className="mt-2 max-w-3xl text-sm leading-7 opacity-90">{props.subtitle}</p>
          </div>
          <div className="rounded-full border border-white/12 bg-white/10 px-3 py-1 text-[11px] font-medium uppercase tracking-wide text-cyan-50 shadow-[0_8px_22px_rgba(4,12,24,0.18)]">
            Expand
          </div>
        </div>
      </summary>
      <div className="mt-4">
        {props.children}
      </div>
    </details>
  );
}

type SectionPressureCue = {
  id: string;
  label: string;
  detail: string;
  toneClassName: string;
  warningFamily:
    | 'objective-warning-layer'
    | 'high-risk-warning-layer'
    | 'diagnosis-warning-layer'
    | 'terminology-warning-layer'
    | 'medication-warning-layer'
    | 'encounter-warning-layer';
};

type SectionClaimSupportCue = {
  id: string;
  claimText: string;
  toneClassName: string;
  statusLabel: string;
  detail: string;
  revisionHint: string;
  topSourceBlockId?: string;
  topSourceKey?: keyof SourceSections;
};

type EncounterDocumentationCheck = {
  id: string;
  label: string;
  detail: string;
};

type PhaseTwoTrustCue = {
  id: string;
  label: string;
  detail: string;
  toneClassName: string;
  warningFamily: SectionPressureCue['warningFamily'];
  sectionAnchor?: string | null;
};

function buildSectionPressureCues(input: {
  sectionHeading: string;
  objectiveCount: number;
  highRiskCount: number;
  diagnosisCount: number;
  terminologyCount: number;
  medicationCount: number;
  encounterCount: number;
  topSourceLabel?: string;
}) {
  const heading = input.sectionHeading.toLowerCase();
  const cues: SectionPressureCue[] = [];
  const topSourceText = input.topSourceLabel ? `Most relevant source block: ${input.topSourceLabel}.` : 'No strong source block is currently highlighted for this section.';

  if (/(objective|lab|vital|med|medication|assessment|mse|risk|plan)/.test(heading) && input.objectiveCount > 0) {
    cues.push({
      id: 'objective',
      label: 'Objective-data pressure',
      detail: `${input.objectiveCount} objective/lab cue${input.objectiveCount === 1 ? '' : 's'} may affect this section. ${topSourceText}`,
      toneClassName: 'border-sky-200 bg-sky-50 text-sky-950',
      warningFamily: 'objective-warning-layer',
    });
  }

  if (/(assessment|diagnosis|impression|formulation)/.test(heading) && input.diagnosisCount > 0) {
    cues.push({
      id: 'diagnosis',
      label: 'Diagnosis pressure',
      detail: `${input.diagnosisCount} diagnosis-layer cue${input.diagnosisCount === 1 ? '' : 's'} may affect this section. ${topSourceText}`,
      toneClassName: 'border-rose-200 bg-rose-50 text-rose-900',
      warningFamily: 'diagnosis-warning-layer',
    });
  }

  if (/(mental status|mse|risk|safety|subjective|history|hpi|assessment)/.test(heading) && input.terminologyCount > 0) {
    cues.push({
      id: 'terminology',
      label: 'Terminology pressure',
      detail: `${input.terminologyCount} terminology-layer cue${input.terminologyCount === 1 ? '' : 's'} may affect wording in this section. ${topSourceText}`,
      toneClassName: 'border-fuchsia-200 bg-fuchsia-50 text-fuchsia-900',
      warningFamily: 'terminology-warning-layer',
    });
  }

  if (/(med|medication|plan|objective|assessment)/.test(heading) && input.medicationCount > 0) {
    cues.push({
      id: 'medication',
      label: 'Medication pressure',
      detail: `${input.medicationCount} medication-layer cue${input.medicationCount === 1 ? '' : 's'} may affect this section. ${topSourceText}`,
      toneClassName: 'border-cyan-200 bg-cyan-50 text-cyan-900',
      warningFamily: 'medication-warning-layer',
    });
  }

  if (/(plan|telehealth|visit|billing|coding|assessment|objective)/.test(heading) && input.encounterCount > 0) {
    cues.push({
      id: 'encounter',
      label: 'Encounter support pressure',
      detail: `${input.encounterCount} encounter-support cue${input.encounterCount === 1 ? '' : 's'} may affect how this section should read. ${topSourceText}`,
      toneClassName: 'border-amber-200 bg-amber-50 text-amber-900',
      warningFamily: 'encounter-warning-layer',
    });
  }

  if (input.highRiskCount > 0) {
    cues.push({
      id: 'high-risk',
      label: 'High-risk pressure',
      detail: `${input.highRiskCount} high-risk cue${input.highRiskCount === 1 ? '' : 's'} is active for this draft, so this section deserves extra source checking. ${topSourceText}`,
      toneClassName: 'border-amber-200 bg-amber-50 text-amber-900',
      warningFamily: 'high-risk-warning-layer',
    });
  }

  return cues.slice(0, 3);
}

function splitSectionClaims(text: string) {
  return text
    .split(/\n+/)
    .flatMap((part) => part.split(/(?<=[.!?])\s+/))
    .map((part) => part.trim())
    .filter((part) => part.length >= 28)
    .slice(0, 6);
}

function isClaimSupportTargetSection(heading: string) {
  return /(assessment|impression|formulation|risk|safety|med|medication|plan)/i.test(heading);
}

function buildSectionClaimSupportCues(input: {
  sectionHeading: string;
  sectionBody: string;
  evidenceLinks: Array<{ blockId: string; score: number; overlapTerms: string[] }>;
  sourceBlocks: SourceBlock[];
}) {
  if (!isClaimSupportTargetSection(input.sectionHeading)) {
    return [];
  }

  const candidateClaims = splitSectionClaims(input.sectionBody);
  const normalizedHeading = input.sectionHeading.toLowerCase();

  return candidateClaims.map((claimText, index) => {
    const claimTokens = unique(
      claimText
        .toLowerCase()
        .replace(/[^a-z0-9%/.\-\s]/g, ' ')
        .split(/\s+/)
        .map((token) => token.replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, ''))
        .filter((token) => token.length >= 4),
    );

    const rankedBlocks = input.evidenceLinks
      .map((link) => {
        const block = input.sourceBlocks.find((item) => item.id === link.blockId);
        if (!block) {
          return null;
        }

        const overlapTerms = claimTokens.filter((token) => block.tokens.includes(token));
        const overlapScore = overlapTerms.length / Math.max(claimTokens.length, 1);

        return {
          block,
          overlapTerms,
          overlapScore,
          combinedScore: overlapScore + link.score,
        };
      })
      .filter((item): item is NonNullable<typeof item> => Boolean(item))
      .sort((left, right) => right.combinedScore - left.combinedScore);

    const topMatch = rankedBlocks[0];

    if (!topMatch || topMatch.overlapTerms.length === 0) {
      return {
        id: `${input.sectionHeading}-${index}`,
        claimText,
        toneClassName: 'border-amber-200 bg-amber-50 text-amber-950',
        statusLabel: 'Review support looks thin',
        detail: 'No strong lexical support is showing for this sentence yet. Re-check the source manually before trusting it.',
        revisionHint: /risk|safety/.test(normalizedHeading)
          ? 'Tighten this to only the specific risk details documented in source, or cut it if the source does not actually support the claim.'
          : /med/.test(normalizedHeading)
            ? 'Tighten this to the exact medication facts documented in source, or remove any dose/adherence/benefit wording that is not clearly supported.'
            : /plan/.test(normalizedHeading)
              ? 'Keep this plan sentence minimal and source-literal. Do not imply a decision or follow-up action that the source does not document.'
              : 'Tighten this sentence to what is directly documented in source, or replace it with a more cautious, explicitly hedged version.',
      } satisfies SectionClaimSupportCue;
    }

    if (topMatch.overlapScore >= 0.34) {
      return {
        id: `${input.sectionHeading}-${index}`,
        claimText,
        toneClassName: 'border-emerald-200 bg-emerald-50 text-emerald-950',
        statusLabel: 'Better visible support',
        detail: `${topMatch.block.sourceLabel} appears to support this sentence. Strongest overlap: ${topMatch.overlapTerms.slice(0, 4).join(', ')}.`,
        revisionHint: 'This sentence appears better supported. Keep it only if the linked source block still supports the full wording after manual review.',
        topSourceBlockId: topMatch.block.id,
        topSourceKey: topMatch.block.sourceKey,
      } satisfies SectionClaimSupportCue;
    }

    return {
      id: `${input.sectionHeading}-${index}`,
      claimText,
      toneClassName: 'border-sky-200 bg-sky-50 text-sky-950',
      statusLabel: 'Partial source support',
      detail: `${topMatch.block.sourceLabel} may support part of this sentence, but the wording likely still needs a closer source check. Strongest overlap: ${topMatch.overlapTerms.slice(0, 4).join(', ')}.`,
      revisionHint: /assessment|impression|formulation/.test(normalizedHeading)
        ? 'Revise this assessment sentence so it preserves uncertainty and only keeps the part clearly backed by source.'
        : /risk|safety/.test(normalizedHeading)
          ? 'Revise this risk sentence so denial, concern, and uncertainty stay distinct rather than blended together.'
          : /med/.test(normalizedHeading)
            ? 'Revise this medication sentence so only the supported med facts remain, with conflict or uncertainty left visible.'
            : 'Revise this sentence so it stays closer to the linked source wording and drops any unsupported extra interpretation.',
      topSourceBlockId: topMatch.block.id,
      topSourceKey: topMatch.block.sourceKey,
    } satisfies SectionClaimSupportCue;
  }).slice(0, 3);
}

function buildCautiousClaimReplacement(sectionHeading: string, cue: SectionClaimSupportCue) {
  const heading = sectionHeading.toLowerCase();

  if (/risk|safety/.test(heading)) {
    return cue.statusLabel === 'Review support looks thin'
      ? 'Risk detail should stay limited to what is directly documented in source; stronger risk wording should be rechecked before final use.'
      : 'Risk detail remains partially supported in source and should stay explicitly qualified rather than stated as settled fact.';
  }

  if (/med/.test(heading)) {
    return cue.statusLabel === 'Review support looks thin'
      ? 'Medication detail should stay limited to the exact regimen facts documented in source.'
      : 'Medication wording should remain conservative and keep any unresolved regimen detail explicit.';
  }

  if (/plan/.test(heading)) {
    return cue.statusLabel === 'Review support looks thin'
      ? 'Plan should stay limited to the actions explicitly documented in source.'
      : 'Plan wording should remain conservative and reflect only the clearly documented actions or follow-up details.';
  }

  return cue.statusLabel === 'Review support looks thin'
    ? 'Assessment should stay narrow and source-faithful here rather than implying a firmer conclusion than the source supports.'
    : 'Assessment should preserve uncertainty and only keep the part of this statement that is clearly backed by source.';
}

function buildMedicationProfileGapSummary(entries: ReturnType<typeof normalizeMedicationProfile>) {
  const unresolvedEntries = entries.filter((entry) => !entry.normalizedMedicationId && entry.rawName.trim());
  const missingRegimenEntries = entries.filter(
    (entry) => entry.normalizedMedicationId && (!entry.doseText?.trim() || !entry.scheduleText?.trim()),
  );
  const missingRouteEntries = entries.filter(
    (entry) => entry.normalizedMedicationId && !entry.route?.trim() && entry.status !== 'recently-stopped',
  );

  return {
    unresolvedEntries,
    missingRegimenEntries,
    missingRouteEntries,
  };
}

function buildEncounterDocumentationChecks(input: {
  encounterSupport: ReturnType<typeof normalizeEncounterSupport>;
  noteType: string;
  draftText: string;
}) {
  const checks: EncounterDocumentationCheck[] = [];
  const loweredDraft = input.draftText.toLowerCase();

  if (/telehealth/i.test(input.noteType) || input.encounterSupport.telehealthModality === 'audio-video' || input.encounterSupport.telehealthModality === 'audio-only') {
    if (input.encounterSupport.telehealthModality && !/telehealth|audio-only|audio only|video|audio-video|virtual/i.test(loweredDraft)) {
      checks.push({
        id: 'telehealth-modality',
        label: 'Telehealth modality may not be visible in the draft',
        detail: 'Structured encounter support includes visit modality, but the draft does not clearly show it yet.',
      });
    }
    if (input.encounterSupport.telehealthConsent && !/consent/i.test(loweredDraft)) {
      checks.push({
        id: 'telehealth-consent',
        label: 'Telehealth consent may not be visible in the draft',
        detail: 'Consent is recorded in structured encounter support, but the draft does not clearly mention it.',
      });
    }
  }

  if (input.encounterSupport.psychotherapyMinutes?.trim() && !/psychotherapy|minutes/i.test(loweredDraft)) {
    checks.push({
      id: 'psychotherapy-minutes',
      label: 'Psychotherapy minutes may not be visible in the draft',
      detail: 'Structured encounter support includes psychotherapy minutes, but that time-sensitive detail does not appear clearly in the draft.',
    });
  }

  if ((input.encounterSupport.crisisStartTime?.trim() || input.encounterSupport.crisisEndTime?.trim()) && !/crisis|start time|end time|minutes/i.test(loweredDraft)) {
    checks.push({
      id: 'crisis-timing',
      label: 'Crisis timing may not be visible in the draft',
      detail: 'Structured encounter support includes crisis timing, but the draft does not clearly reflect those time-sensitive details.',
    });
  }

  if (input.encounterSupport.interactiveComplexity && !/interactive complexity/i.test(loweredDraft)) {
    checks.push({
      id: 'interactive-complexity',
      label: 'Interactive complexity may not be visible in the draft',
      detail: 'Interactive complexity is recorded in structured encounter support, but the draft does not clearly mention it.',
    });
  }

  return checks;
}

function findSectionAnchorByPattern(
  sections: Array<{ anchor: string; heading: string }>,
  pattern: RegExp,
) {
  return sections.find((section) => pattern.test(section.heading))?.anchor ?? null;
}

function buildPhaseTwoTrustCues(input: {
  draftSections: Array<{ anchor: string; heading: string }>;
  objectiveReview: ObjectiveReviewState;
  medicationProfileGapSummary: ReturnType<typeof buildMedicationProfileGapSummary>;
  medicationScaffoldWarnings: ReturnType<typeof evaluateMedicationWarningsSorted>;
  structuredDiagnosisAlignment: {
    missingFromDraft: ReturnType<typeof normalizeDiagnosisProfile>;
    draftOnlyAgainstStructured: Array<{
      diagnosis: ReturnType<typeof findDiagnosisMentionsInText>[number]['diagnosis'];
      differentialCaution?: ReturnType<typeof findDiagnosisMentionsInText>[number]['differentialCaution'];
      timeframeRule?: ReturnType<typeof findDiagnosisMentionsInText>[number]['timeframeRule'];
    }>;
  };
  diagnosisTimeframeGaps: ReturnType<typeof findDiagnosisMentionsInText>;
  highRiskWarnings: Array<{ id: string; title: string; detail: string }>;
  draftOnlyRiskTerms: ReturnType<typeof detectRiskTerms>;
}) {
  const cues: PhaseTwoTrustCue[] = [];
  const assessmentAnchor = findSectionAnchorByPattern(input.draftSections, /(assessment|impression|formulation|diagnosis)/i);
  const medicationAnchor = findSectionAnchorByPattern(input.draftSections, /(med|medication)/i);
  const planAnchor = findSectionAnchorByPattern(input.draftSections, /plan/i);
  const riskAnchor = findSectionAnchorByPattern(input.draftSections, /(risk|safety|assessment)/i);

  if (input.objectiveReview.hasConflictRisk) {
    cues.push({
      id: 'objective-conflict',
      label: 'Objective conflict still needs explicit clinician review',
      detail: input.objectiveReview.conflictBullets[0] || 'Objective findings and narrative wording may not line up cleanly yet.',
      toneClassName: 'border-sky-200 bg-sky-50 text-sky-950',
      warningFamily: 'objective-warning-layer',
      sectionAnchor: assessmentAnchor || planAnchor,
    });
  }

  const medicationGapCount =
    input.medicationProfileGapSummary.unresolvedEntries.length
    + input.medicationProfileGapSummary.missingRegimenEntries.length
    + input.medicationProfileGapSummary.missingRouteEntries.length;

  if (medicationGapCount || input.medicationScaffoldWarnings.length) {
    cues.push({
      id: 'medication-truth',
      label: 'Medication truth still has unresolved gaps',
      detail: medicationGapCount
        ? `${medicationGapCount} structured medication gap${medicationGapCount === 1 ? '' : 's'} still need review before the regimen reads settled.`
        : `${input.medicationScaffoldWarnings.length} medication warning cue${input.medicationScaffoldWarnings.length === 1 ? '' : 's'} remains active.`,
      toneClassName: 'border-cyan-200 bg-cyan-50 text-cyan-950',
      warningFamily: 'medication-warning-layer',
      sectionAnchor: medicationAnchor || planAnchor,
    });
  }

  if (
    input.structuredDiagnosisAlignment.missingFromDraft.length
    || input.structuredDiagnosisAlignment.draftOnlyAgainstStructured.length
    || input.diagnosisTimeframeGaps.length
  ) {
    cues.push({
      id: 'diagnosis-caution',
      label: 'Assessment wording may outrun the diagnosis frame',
      detail: input.structuredDiagnosisAlignment.draftOnlyAgainstStructured.length
        ? `${input.structuredDiagnosisAlignment.draftOnlyAgainstStructured.length} diagnosis cue${input.structuredDiagnosisAlignment.draftOnlyAgainstStructured.length === 1 ? '' : 's'} in the draft goes beyond the structured assessment frame.`
        : input.structuredDiagnosisAlignment.missingFromDraft.length
          ? `${input.structuredDiagnosisAlignment.missingFromDraft.length} structured diagnosis item${input.structuredDiagnosisAlignment.missingFromDraft.length === 1 ? '' : 's'} is not clearly reflected in the draft.`
          : `${input.diagnosisTimeframeGaps.length} timeframe-sensitive diagnosis cue${input.diagnosisTimeframeGaps.length === 1 ? '' : 's'} still needs review.`,
      toneClassName: 'border-rose-200 bg-rose-50 text-rose-950',
      warningFamily: 'diagnosis-warning-layer',
      sectionAnchor: assessmentAnchor,
    });
  }

  const riskHeavyWarnings = input.highRiskWarnings.filter((warning) => /risk|si|self-harm|safety|suicid/i.test(`${warning.id} ${warning.title} ${warning.detail}`));
  if (riskHeavyWarnings.length || input.draftOnlyRiskTerms.length) {
    cues.push({
      id: 'risk-nuance',
      label: 'Risk wording may be too clean or too strong',
      detail: riskHeavyWarnings.length
        ? riskHeavyWarnings[0]?.detail || 'Risk wording still needs a closer source check.'
        : `${input.draftOnlyRiskTerms.length} risk-language term${input.draftOnlyRiskTerms.length === 1 ? '' : 's'} appears in the draft without a matching source term.`,
      toneClassName: 'border-amber-200 bg-amber-50 text-amber-950',
      warningFamily: 'high-risk-warning-layer',
      sectionAnchor: riskAnchor,
    });
  }

  return cues.slice(0, 4);
}

type ReviewWorkspaceProps = {
  initialSession?: DraftSession | null;
  embedded?: boolean;
  onBackToEdit?: () => void;
};

export function ReviewWorkspace({
  initialSession = null,
  embedded = false,
  onBackToEdit,
}: ReviewWorkspaceProps = {}) {
  const router = useRouter();
  const [session, setSession] = useState<DraftSession | null>(initialSession);
  const [providerSettings, setProviderSettings] = useState<ProviderSettings>(DEFAULT_PROVIDER_SETTINGS);
  const [draftText, setDraftText] = useState(initialSession?.note || '');
  const [isHydrating, setIsHydrating] = useState(!initialSession);
  const [copyMessage, setCopyMessage] = useState('');
  const [exportMessage, setExportMessage] = useState('');
  const [rewriteMessage, setRewriteMessage] = useState('');
  const [saveMessage, setSaveMessage] = useState('');
  const [activeSourceKey, setActiveSourceKey] = useState<keyof SourceSections | 'combined'>('combined');
  const [isRewriting, setIsRewriting] = useState<RewriteMode | null>(null);
  const [focusedSectionAnchor, setFocusedSectionAnchor] = useState<string | null>(null);
  const [focusedEvidenceBlockId, setFocusedEvidenceBlockId] = useState<string | null>(null);
  const [lanePreferenceSuggestion, setLanePreferenceSuggestion] = useState<ReturnType<typeof getLanePreferenceSuggestion>>(null);
  const draftTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const activeProviderProfile = useMemo(() => findProviderProfile(providerSettings.providerProfileId), [providerSettings.providerProfileId]);

  useEffect(() => {
    if (!initialSession) {
      return;
    }

    setSession(initialSession);
    setDraftText(initialSession.note || '');
    setIsHydrating(false);
  }, [initialSession]);

  useEffect(() => {
    if (initialSession) {
      return;
    }

    async function hydrateDraft() {
      const raw = localStorage.getItem(DRAFT_SESSION_KEY);

      if (raw) {
        try {
          const parsed = JSON.parse(raw) as DraftSession;
          setSession(parsed);
          setDraftText(parsed.note);
          setIsHydrating(false);
          return;
        } catch {
          localStorage.removeItem(DRAFT_SESSION_KEY);
        }
      }

      try {
        const response = await fetch('/api/drafts/latest', { cache: 'no-store' });
        const data = (await response.json()) as { draft?: DraftSession | null };
        const parsed = data?.draft;

        if (parsed) {
          setSession(parsed);
          setDraftText(parsed.note);
          localStorage.setItem(DRAFT_SESSION_KEY, JSON.stringify(parsed));
        }
      } catch {
        // Keep the review screen graceful if backend restore is unavailable.
      } finally {
        setIsHydrating(false);
      }
    }

    void hydrateDraft();
  }, [initialSession]);

  useEffect(() => {
    setLanePreferenceSuggestion(getLanePreferenceSuggestion(session?.noteType));
  }, [session?.noteType]);

  useEffect(() => {
    async function hydrateProviderSettings() {
      const providerId = getCurrentProviderId();
      const storageKey = getProviderSettingsStorageKey(providerId);
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        try {
          const parsed = JSON.parse(raw) as ProviderSettings;
          setProviderSettings({ ...DEFAULT_PROVIDER_SETTINGS, ...parsed });
          return;
        } catch {
          localStorage.removeItem(storageKey);
        }
      }

      try {
        const response = await fetch(`/api/settings/provider?providerId=${encodeURIComponent(providerId)}`, { cache: 'no-store' });
        const data = (await response.json()) as { settings?: ProviderSettings };
        const merged = { ...DEFAULT_PROVIDER_SETTINGS, ...(data?.settings || {}) };
        setProviderSettings(merged);
        localStorage.setItem(storageKey, JSON.stringify(merged));
      } catch {
        // Leave defaults in place if provider settings are unavailable.
      }
    }

    void hydrateProviderSettings();
  }, []);

  useEffect(() => {
    publishAssistantContext({
      stage: 'review',
      noteType: session?.noteType,
      specialty: session?.specialty,
      currentDraftText: draftText ? draftText.slice(0, 4000) : undefined,
      providerProfileId: providerSettings.providerProfileId,
      providerProfileName: activeProviderProfile?.name,
      providerAddressingName: resolveVeraAddress(providerSettings, activeProviderProfile?.name),
      veraInteractionStyle: providerSettings.veraInteractionStyle,
      veraProactivityLevel: providerSettings.veraProactivityLevel,
      veraMemoryNotes: providerSettings.veraMemoryNotes,
      outputDestination: providerSettings.outputDestination,
      customInstructions: session?.customInstructions,
      presetName: session?.presetName,
      selectedPresetId: session?.selectedPresetId,
    });
  }, [
    activeProviderProfile,
    draftText,
    providerSettings.outputDestination,
    providerSettings.providerProfileId,
    providerSettings.veraInteractionStyle,
    providerSettings.veraMemoryNotes,
    providerSettings.veraProactivityLevel,
    session?.customInstructions,
    session?.noteType,
    session?.presetName,
    session?.selectedPresetId,
    session?.specialty,
  ]);

  useEffect(() => {
    function handleAssistantAction(event: Event) {
      const nextEvent = event as CustomEvent<{
        type: 'replace-preferences' | 'append-preferences' | 'create-preset-draft' | 'jump-to-source-evidence' | 'run-review-rewrite' | 'apply-conservative-rewrite' | 'apply-note-revision';
        instructions: string;
        presetName?: string;
        rewriteMode?: RewriteMode;
        originalText?: string;
        replacementText?: string;
        revisionText?: string;
        targetSectionHeading?: string;
      }>;

      if (
        nextEvent.detail.type === 'apply-conservative-rewrite'
        && nextEvent.detail.originalText
        && nextEvent.detail.replacementText
      ) {
        replaceDraftSentence(nextEvent.detail.originalText, nextEvent.detail.replacementText);
        return;
      }

      if (nextEvent.detail.type === 'apply-note-revision' && nextEvent.detail.revisionText) {
        applyAssistantNoteRevision(nextEvent.detail.revisionText, nextEvent.detail.targetSectionHeading);
        return;
      }

      if (nextEvent.detail.type === 'run-review-rewrite' && nextEvent.detail.rewriteMode) {
        void handleRewrite(nextEvent.detail.rewriteMode);
        window.setTimeout(() => {
          const target = document.getElementById('rewrite-tools-layer');
          if (target) {
            target.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }
        }, 0);
        return;
      }

      if (nextEvent.detail.type !== 'jump-to-source-evidence') {
        return;
      }

      setActiveSourceKey('combined');

      window.setTimeout(() => {
        const target = document.getElementById('source-evidence-layer');
        if (target) {
          target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }, 0);
    }

    window.addEventListener(ASSISTANT_ACTION_EVENT, handleAssistantAction);
    return () => window.removeEventListener(ASSISTANT_ACTION_EVENT, handleAssistantAction);
  }, []);

  const draftSections = useMemo(() => parseDraftSections(draftText), [draftText]);
  const reconciledSectionReviewState = useMemo(
    () => reconcileSectionReviewState(draftSections, session?.sectionReviewState),
    [draftSections, session?.sectionReviewState],
  );

  useEffect(() => {
    if (!session) {
      return;
    }

    const updatedSession: DraftSession = {
      ...session,
      note: draftText,
      sectionReviewState: reconciledSectionReviewState,
    };

    localStorage.setItem(DRAFT_SESSION_KEY, JSON.stringify(updatedSession));
  }, [draftText, reconciledSectionReviewState, session]);

  async function persistDraft(nextSession: DraftSession) {
    try {
      await fetch('/api/drafts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(nextSession),
      });
    } catch {
      // Prototype still works with local persistence if backend save fails.
    }
  }

  function rememberLanePreferenceFromReview() {
    if (!session?.noteType) {
      return;
    }

    recordLanePreferenceSelection({
      noteType: session.noteType,
      outputScope: (session.outputScope || 'full-note') as OutputScope,
      outputStyle: session.outputStyle || 'Standard',
      format: session.format || 'Labeled Sections',
      requestedSections: Array.isArray(session.requestedSections) ? session.requestedSections as NoteSectionKey[] : [],
    });
    setLanePreferenceSuggestion(getLanePreferenceSuggestion(session.noteType));
  }

  function handleDraftLanePreferenceFromReview() {
    if (!session?.noteType || !lanePreferenceSuggestion) {
      return;
    }

    const instructions = buildLanePreferencePrompt({
      noteType: session.noteType,
      outputScope: lanePreferenceSuggestion.outputScope as OutputScope,
      outputStyle: lanePreferenceSuggestion.outputStyle,
      format: lanePreferenceSuggestion.format,
      requestedSections: lanePreferenceSuggestion.requestedSections as NoteSectionKey[],
    });

    localStorage.setItem(ASSISTANT_PENDING_ACTION_KEY, JSON.stringify({
      type: 'append-preferences',
      instructions,
    }));

    if (embedded && onBackToEdit) {
      onBackToEdit();
      return;
    }

    router.push('/#workspace');
  }

  async function handleCopy() {
    if (!exportReadiness.ready) {
      setCopyMessage('Finish section review before copying the final note text.');
      window.setTimeout(() => setCopyMessage(''), 2500);
      return;
    }

    try {
      await navigator.clipboard.writeText(draftText);
      rememberLanePreferenceFromReview();
      setCopyMessage('Note copied.');
      window.setTimeout(() => setCopyMessage(''), 2000);
    } catch {
      setCopyMessage('Unable to copy note automatically on this browser.');
      window.setTimeout(() => setCopyMessage(''), 2500);
    }
  }

  function handleExportNote() {
    if (!exportReadiness.ready) {
      setExportMessage('Finish section review before exporting the final note.');
      window.setTimeout(() => setExportMessage(''), 2500);
      return;
    }

    try {
      const fileName = `${sanitizeFileName(session?.noteType || 'note')}-draft.txt`;
      const blob = new Blob([draftText], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      rememberLanePreferenceFromReview();
      setExportMessage('Text note exported.');
      window.setTimeout(() => setExportMessage(''), 2000);
    } catch {
      setExportMessage('Unable to export text file on this browser.');
      window.setTimeout(() => setExportMessage(''), 2500);
    }
  }

  function handleExportReviewBundle() {
    if (!session) {
      return;
    }

    try {
      const fileName = `${sanitizeFileName(session.noteType || 'note')}-review-bundle.txt`;
      const sessionForExport: DraftSession = {
        ...session,
        note: draftText,
        sectionReviewState: reconciledSectionReviewState,
      };
      const blob = new Blob([formatExportBundle(sessionForExport, draftText)], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      rememberLanePreferenceFromReview();
      setExportMessage('Review bundle exported.');
      window.setTimeout(() => setExportMessage(''), 2200);
    } catch {
      setExportMessage('Unable to export review bundle on this browser.');
      window.setTimeout(() => setExportMessage(''), 2500);
    }
  }

  async function handleRewrite(mode: RewriteMode) {
    if (!session) {
      return;
    }

    setRewriteMessage('');
    setIsRewriting(mode);

    try {
      const response = await fetch('/api/rewrite-note', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceInput: session.sourceInput,
          currentDraft: draftText,
          noteType: session.noteType,
          rewriteMode: mode,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error || 'Unable to rewrite draft right now.');
      }

      const nextSession = {
        ...session,
        note: data.note,
        sectionReviewState: reconcileSectionReviewState(parseDraftSections(data.note), session.sectionReviewState),
        mode: data.mode ?? session.mode,
        warning: typeof data.warning === 'string' ? data.warning : session.warning,
      } as DraftSession;

      setDraftText(data.note);
      setSession(nextSession);
      localStorage.setItem(DRAFT_SESSION_KEY, JSON.stringify(nextSession));
      void persistDraft(nextSession);

      if (data.mode === 'fallback') {
        setRewriteMessage(`Rewrite completed using fallback mode. ${data.warning || ''}`.trim());
      } else {
        setRewriteMessage('Rewrite completed.');
      }

      window.setTimeout(() => setRewriteMessage(''), 2500);
    } catch (error) {
      setRewriteMessage(error instanceof Error ? error.message : 'Unable to rewrite draft right now.');
      window.setTimeout(() => setRewriteMessage(''), 3000);
    } finally {
      setIsRewriting(null);
    }
  }

  function handleSectionStatusChange(anchor: string, status: ReviewStatus) {
    if (!session) {
      return;
    }

    const nextSession: DraftSession = {
      ...session,
      note: draftText,
      sectionReviewState: {
        ...reconciledSectionReviewState,
        [anchor]: {
          heading: reconciledSectionReviewState[anchor]?.heading || 'Section',
          status,
          updatedAt: new Date().toISOString(),
          confirmedEvidenceBlockIds: reconciledSectionReviewState[anchor]?.confirmedEvidenceBlockIds || [],
          reviewerComment: reconciledSectionReviewState[anchor]?.reviewerComment || '',
        },
      },
    };

    setSession(nextSession);
    localStorage.setItem(DRAFT_SESSION_KEY, JSON.stringify(nextSession));
  }

  function handleConfirmedEvidenceToggle(anchor: string, blockId: string) {
    if (!session) {
      return;
    }

    const currentIds = getConfirmedEvidenceBlockIds(session, anchor);
    const confirmedEvidenceBlockIds = currentIds.includes(blockId)
      ? currentIds.filter((item) => item !== blockId)
      : unique([...currentIds, blockId]);

    const nextSession: DraftSession = {
      ...session,
      note: draftText,
      sectionReviewState: {
        ...reconciledSectionReviewState,
        [anchor]: {
          heading: reconciledSectionReviewState[anchor]?.heading || 'Section',
          status: reconciledSectionReviewState[anchor]?.status || 'unreviewed',
          updatedAt: new Date().toISOString(),
          confirmedEvidenceBlockIds,
          reviewerComment: reconciledSectionReviewState[anchor]?.reviewerComment || '',
        },
      },
    };

    setSession(nextSession);
    localStorage.setItem(DRAFT_SESSION_KEY, JSON.stringify(nextSession));
  }

  function handleReviewerCommentChange(anchor: string, reviewerComment: string) {
    if (!session) {
      return;
    }

    const nextSession: DraftSession = {
      ...session,
      note: draftText,
      sectionReviewState: {
        ...reconciledSectionReviewState,
        [anchor]: {
          heading: reconciledSectionReviewState[anchor]?.heading || 'Section',
          status: reconciledSectionReviewState[anchor]?.status || 'unreviewed',
          updatedAt: new Date().toISOString(),
          confirmedEvidenceBlockIds: reconciledSectionReviewState[anchor]?.confirmedEvidenceBlockIds || [],
          reviewerComment,
        },
      },
    };

    setSession(nextSession);
    localStorage.setItem(DRAFT_SESSION_KEY, JSON.stringify(nextSession));
  }

  async function handleSaveDraft() {
    if (!session) {
      return;
    }

    const nextSession: DraftSession = {
      ...session,
      note: draftText,
      sectionReviewState: reconciledSectionReviewState,
    };

    setSession(nextSession);
    localStorage.setItem(DRAFT_SESSION_KEY, JSON.stringify(nextSession));
    await persistDraft(nextSession);
    setSaveMessage('Draft and section review state saved.');
    window.setTimeout(() => setSaveMessage(''), 2500);
  }

  function handleSectionPressureNavigate(params: {
    sectionAnchor: string;
    warningFamily: SectionPressureCue['warningFamily'];
    sourceBlockId?: string;
    sourceKey?: keyof SourceSections;
  }) {
    setFocusedSectionAnchor(params.sectionAnchor);

    if (params.sourceBlockId) {
      setFocusedEvidenceBlockId(params.sourceBlockId);
    }

    if (params.sourceKey) {
      setActiveSourceKey(params.sourceKey);
    }

    window.setTimeout(() => {
      const target = document.getElementById(params.warningFamily);
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 0);
  }

  function focusDraftSentence(claimText: string) {
    const textarea = draftTextareaRef.current;
    const start = draftText.indexOf(claimText);

    if (!textarea || start < 0) {
      return;
    }

    const end = start + claimText.length;
    textarea.focus();
    textarea.setSelectionRange(start, end);
    textarea.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function focusDraftMatch(text: string) {
    const textarea = draftTextareaRef.current;
    const start = draftText.toLowerCase().indexOf(text.toLowerCase());

    if (!textarea || start < 0) {
      return;
    }

    const end = start + text.length;
    textarea.focus();
    textarea.setSelectionRange(start, end);
    textarea.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function replaceDraftSentence(originalText: string, replacementText: string) {
    const start = draftText.indexOf(originalText);
    if (start < 0) {
      setRewriteMessage('Unable to find that exact sentence in the current draft.');
      window.setTimeout(() => setRewriteMessage(''), 2500);
      return;
    }

    const nextDraft = `${draftText.slice(0, start)}${replacementText}${draftText.slice(start + originalText.length)}`;
    setDraftText(nextDraft);
    focusDraftSentence(replacementText);
    setRewriteMessage('Applied a more cautious revision. Please review the sentence before final use.');
    window.setTimeout(() => setRewriteMessage(''), 2800);
  }

  function replaceFirstDraftMatch(originalText: string, replacementText: string) {
    const start = draftText.toLowerCase().indexOf(originalText.toLowerCase());
    if (start < 0) {
      setRewriteMessage('Unable to find that exact term in the current draft.');
      window.setTimeout(() => setRewriteMessage(''), 2500);
      return;
    }

    const nextDraft = `${draftText.slice(0, start)}${replacementText}${draftText.slice(start + originalText.length)}`;
    setDraftText(nextDraft);
    focusDraftMatch(replacementText);
    setRewriteMessage('Applied a safer wording replacement. Please review the surrounding sentence before final use.');
    window.setTimeout(() => setRewriteMessage(''), 2800);
  }

  function applyAssistantNoteRevision(revisionText: string, targetSectionHeading?: string) {
    const normalizedRevision = revisionText.trim();

    if (!normalizedRevision) {
      setRewriteMessage('Unable to apply an empty revision.');
      window.setTimeout(() => setRewriteMessage(''), 2500);
      return;
    }

    const lines = draftText.split('\n');
    const desiredHeading = targetSectionHeading?.trim().toLowerCase();

    if (desiredHeading) {
      const headingIndex = lines.findIndex((line) => {
        const trimmed = line.trim().replace(/^#{1,3}\s+/, '').replace(/:$/, '').trim().toLowerCase();
        return trimmed === desiredHeading;
      });

      if (headingIndex >= 0) {
        let insertAt = lines.length;

        for (let index = headingIndex + 1; index < lines.length; index += 1) {
          const trimmed = lines[index].trim();
          const isHeading = /^[A-Z][A-Za-z0-9 /&(),'-]{1,60}:$/.test(trimmed) || /^#{1,3}\s+/.test(trimmed);

          if (isHeading) {
            insertAt = index;
            break;
          }
        }

        const nextLines = [...lines];
        const insertion = [normalizedRevision, ''];
        nextLines.splice(insertAt, 0, ...insertion);
        const nextDraft = nextLines.join('\n').replace(/\n{3,}/g, '\n\n');
        setDraftText(nextDraft);
        focusDraftMatch(normalizedRevision);
        setRewriteMessage(`Applied Vera revision in ${targetSectionHeading}. Please review it before final use.`);
        window.setTimeout(() => setRewriteMessage(''), 3200);
        return;
      }
    }

    const nextDraft = `${draftText.trim()}\n\n${normalizedRevision}`.trim();
    setDraftText(nextDraft);
    focusDraftMatch(normalizedRevision);
    setRewriteMessage('Applied Vera revision to the current draft. Please review it before final use.');
    window.setTimeout(() => setRewriteMessage(''), 3200);
  }

  const flagItems = useMemo(() => session?.flags ?? [], [session]);
  const { contradictionFlags, missingInfoFlags } = useMemo(() => splitFlags(flagItems), [flagItems]);
  const sourceSections = useMemo(() => normalizeSourceSections(session?.sourceSections || EMPTY_SOURCE_SECTIONS), [session]);
  const sourceSectionLabels = useMemo(() => describePopulatedSourceSections(sourceSections), [sourceSections]);
  const sourcePanels = useMemo(() => sourceSectionMeta.map((meta) => ({ ...meta, value: sourceSections[meta.key].trim() })), [sourceSections]);
  const activeSourcePanel = useMemo(() => {
    if (activeSourceKey === 'combined') {
      return {
        label: 'Combined source input',
        hint: 'Full assembled source that was sent to generation.',
        value: session?.sourceInput?.trim() || '',
      };
    }

    const panel = sourcePanels.find((item) => item.key === activeSourceKey);
    return {
      label: panel?.label || 'Source input',
      hint: panel?.hint || '',
      value: panel?.value || '',
    };
  }, [activeSourceKey, session?.sourceInput, sourcePanels]);
  const sourceBlocks = useMemo(() => buildSourceBlocks(sourceSections), [sourceSections]);
  const isDischargeNote = useMemo(() => looksLikeDischargeNote(session?.noteType || ''), [session?.noteType]);
  const dischargeTimelineBuckets = useMemo(
    () => (isDischargeNote ? buildDischargeTimelineBuckets(sourceBlocks) : []),
    [isDischargeNote, sourceBlocks],
  );
  const sectionEvidenceMap = useMemo(() => buildSectionEvidenceMap(draftSections, sourceSections), [draftSections, sourceSections]);
  const focusedSectionEvidence = focusedSectionAnchor ? sectionEvidenceMap[focusedSectionAnchor] : null;
  const focusedSectionBody = useMemo(
    () => draftSections.find((section) => section.anchor === focusedSectionAnchor)?.body || undefined,
    [draftSections, focusedSectionAnchor],
  );
  const focusedSectionSentence = useMemo(
    () => extractFirstReviewSentence(focusedSectionBody),
    [focusedSectionBody],
  );
  const focusedSectionHeading = useMemo(
    () => focusedSectionEvidence?.sectionHeading || draftSections.find((section) => section.anchor === focusedSectionAnchor)?.heading || undefined,
    [draftSections, focusedSectionAnchor, focusedSectionEvidence],
  );
  const reviewCounts = useMemo(() => {
    const entries = Object.values(reconciledSectionReviewState);
    return {
      approved: entries.filter((entry) => entry.status === 'approved').length,
      needsReview: entries.filter((entry) => entry.status === 'needs-review').length,
      unreviewed: entries.filter((entry) => entry.status === 'unreviewed').length,
      confirmedEvidence: entries.reduce((total, entry) => total + (entry.confirmedEvidenceBlockIds?.length || 0), 0),
      reviewerComments: entries.filter((entry) => entry.reviewerComment?.trim()).length,
    };
  }, [reconciledSectionReviewState]);
  const draftWordCount = useMemo(() => countWords(draftText), [draftText]);
  const sourceWordCount = useMemo(() => countWords(session?.sourceInput || ''), [session?.sourceInput]);
  const highRiskWarnings = useMemo(() => getHighRiskWarnings({
    sourceInput: session?.sourceInput || '',
    outputText: draftText,
    sourceSections,
  }), [draftText, session?.sourceInput, sourceSections]);
  const objectiveReview = useMemo(
    () => buildObjectiveReviewState({
      sourceBlocks,
      sourceSections,
      sourceInput: session?.sourceInput || '',
      draftText,
      contradictionFlags,
      highRiskWarnings,
      copilotSuggestions: session?.copilotSuggestions ?? [],
    }),
    [contradictionFlags, draftText, highRiskWarnings, session?.copilotSuggestions, session?.sourceInput, sourceBlocks, sourceSections],
  );
  const draftAvoidTerms = useMemo(
    () => uniqueBy(findAvoidTermsInText(draftText), (item) => item.entry.id),
    [draftText],
  );
  const sourceDiagnosisMentions = useMemo(
    () => uniqueBy(findDiagnosisMentionsInText(session?.sourceInput || ''), (item) => item.diagnosis.id),
    [session?.sourceInput],
  );
  const draftDiagnosisMentions = useMemo(
    () => uniqueBy(findDiagnosisMentionsInText(draftText), (item) => item.diagnosis.id),
    [draftText],
  );
  const draftDiagnosisAvoidTerms = useMemo(
    () => uniqueBy(findDiagnosisAvoidTermsInText(draftText), (item) => item.entry.id),
    [draftText],
  );
  const diagnosisNonAutoMapTerms = useMemo(
    () => uniqueBy(findDiagnosisNonAutoMapTermsInText(draftText), (item) => `${item.entry.id}:${item.matchedText}`),
    [draftText],
  );
  const draftOnlyDiagnoses = useMemo(() => {
    const sourceIds = new Set(sourceDiagnosisMentions.map((item) => item.diagnosis.id));
    return draftDiagnosisMentions.filter((item) => !sourceIds.has(item.diagnosis.id));
  }, [draftDiagnosisMentions, sourceDiagnosisMentions]);
  const diagnosisTimeframeGaps = useMemo(
    () => draftDiagnosisMentions.filter((item) => item.timeframeRule && !hasTimeframeSignal(session?.sourceInput || '')),
    [draftDiagnosisMentions, session?.sourceInput],
  );
  const draftAbbreviationMentions = useMemo(
    () => uniqueBy(findAbbreviationMentionsInText(draftText), (item) => item.entry.id),
    [draftText],
  );
  const reviewFirstAbbreviations = useMemo(
    () => draftAbbreviationMentions.filter((item) => item.entry.should_trigger_review_warning || !item.entry.safe_for_auto_expansion),
    [draftAbbreviationMentions],
  );
  const sourceRiskTerms = useMemo(
    () => uniqueBy(detectRiskTerms(session?.sourceInput || ''), (item) => item.entry.id),
    [session?.sourceInput],
  );
  const draftRiskTerms = useMemo(
    () => uniqueBy(detectRiskTerms(draftText), (item) => item.entry.id),
    [draftText],
  );
  const draftOnlyRiskTerms = useMemo(() => {
    const sourceTermIds = new Set(sourceRiskTerms.map((item) => item.entry.id));
    return draftRiskTerms.filter((item) => !sourceTermIds.has(item.entry.id));
  }, [draftRiskTerms, sourceRiskTerms]);
  const draftMseTermsNeedingReview = useMemo(
    () => uniqueBy(findMseTermsInText(draftText), (item) => item.entry.id).filter((item) => item.entry.should_trigger_extra_review),
    [draftText],
  );
  const destinationConstraintActive = useMemo(() => hasDestinationConstraintSignal(session), [session]);
  const medicationSignalSummary = useMemo(
    () => collectMedicationSignals(session?.sourceInput || ''),
    [session?.sourceInput],
  );
  const structuredMedicationProfile = useMemo(
    () => normalizeMedicationProfile(session?.medicationProfile),
    [session?.medicationProfile],
  );
  const structuredDiagnosisProfile = useMemo(
    () => normalizeDiagnosisProfile(session?.diagnosisProfile),
    [session?.diagnosisProfile],
  );
  const structuredDiagnosisSummary = useMemo(
    () => buildDiagnosisProfileSummary(structuredDiagnosisProfile),
    [structuredDiagnosisProfile],
  );
  const structuredDiagnosisAlignment = useMemo(() => {
    if (!structuredDiagnosisProfile.length) {
      return {
        missingFromDraft: [],
        draftOnlyAgainstStructured: [],
      };
    }

    const structuredIds = new Set(
      structuredDiagnosisProfile
        .map((item) => item.normalizedDiagnosisId)
        .filter((item): item is string => Boolean(item)),
    );
    const draftDiagnosisIds = new Set(draftDiagnosisMentions.map((item) => item.diagnosis.id));

    return {
      missingFromDraft: structuredDiagnosisProfile.filter((item) => item.normalizedDiagnosisId && !draftDiagnosisIds.has(item.normalizedDiagnosisId)),
      draftOnlyAgainstStructured: draftDiagnosisMentions.filter((item) => structuredIds.size > 0 && !structuredIds.has(item.diagnosis.id)),
    };
  }, [draftDiagnosisMentions, structuredDiagnosisProfile]);
  const structuredMedicationSummary = useMemo(
    () => buildMedicationProfileSummary(structuredMedicationProfile),
    [structuredMedicationProfile],
  );
  const medicationProfileGapSummary = useMemo(
    () => buildMedicationProfileGapSummary(structuredMedicationProfile),
    [structuredMedicationProfile],
  );
  const matchedMedicationEntries = useMemo(
    () => {
      const structuredIds = structuredMedicationProfile
        .map((item) => item.normalizedMedicationId)
        .filter((item): item is string => Boolean(item));
      const combinedIds = unique([...structuredIds, ...medicationSignalSummary.medicationIds]);

      return combinedIds
        .map((item) => getMedicationById(item))
        .filter((item): item is NonNullable<typeof item> => Boolean(item));
    },
    [medicationSignalSummary.medicationIds, structuredMedicationProfile],
  );
  const medicationReviewHighlights = useMemo(() => {
    const topFlags = unique(
      matchedMedicationEntries.flatMap((item) => item.highRiskFlags).filter(Boolean),
    ).slice(0, 8);

    return {
      highRiskFlags: topFlags,
      provisionalCount: matchedMedicationEntries.filter((item) => item.provisional).length,
      withSourceAnchors: matchedMedicationEntries.filter((item) => item.sourceLinks.length > 0).length,
      laiCount: matchedMedicationEntries.filter((item) => item.isLai).length,
    };
  }, [matchedMedicationEntries]);
  const psychReviewGuidance = useMemo(
    () => session?.specialty === 'Psychiatry' ? getPsychReviewGuidance(session.noteType || '') : null,
    [session?.noteType, session?.specialty],
  );
  const populatedSourceKinds = useMemo(
    () => describePopulatedSourceSections(sourceSections),
    [sourceSections],
  );
  const medicationScaffoldWarnings = useMemo(() => {
    if (!matchedMedicationEntries.length) {
      return [];
    }

    const warningBundle = getPsychMedicationWarningBundle();
    const runtimeInput = buildMedicationRuntimeInput(
      session?.sourceInput || '',
      matchedMedicationEntries,
      session?.noteType || '',
      psychReviewGuidance?.careSetting,
      structuredMedicationProfile,
    );

    return evaluateMedicationWarningsSorted(warningBundle, runtimeInput).slice(0, 8);
  }, [matchedMedicationEntries, psychReviewGuidance?.careSetting, session?.noteType, session?.sourceInput]);
  const dischargeReviewCues = useMemo(() => {
    if (!isDischargeNote) {
      return [];
    }

    return [
      'Separate current discharge status from earlier admission symptoms so the note does not read like psychosis, suicidality, or agitation were absent throughout the stay.',
      'If improvement is partial, keep it partial. Do not let discharge wording imply full remission or full readiness unless the source really says that.',
      'Hospital-course language should stay bounded to what is actually documented, especially PRNs, behavior events, med changes, and follow-up plans.',
    ];
  }, [isDischargeNote]);
  const destinationConstraintCues = useMemo(() => {
    if (!destinationConstraintActive) {
      return [];
    }

    return [
      'Formatting requests such as ASCII-safe, paragraph-only, or destination-specific structure should change presentation, not clinical meaning.',
      'Do a last pass for punctuation and export-profile cleanup only after the note content feels faithful to source.',
      'Do not let destination formatting erase uncertainty, source conflict, or residual symptoms just because the output is being cleaned up.',
    ];
  }, [destinationConstraintActive]);
  const exportConstraintList = useMemo(
    () => buildExportConstraintList(session, providerSettings),
    [providerSettings, session],
  );
  const activeOutputProfileHighlights = useMemo(() => {
    const highlights = [
      `Scope: ${session?.outputScope || 'full-note'}`,
      `Style: ${session?.outputStyle || 'Standard'}`,
      `Format: ${session?.format || 'Unknown'}`,
      `Destination: ${providerSettings.outputDestination}`,
    ];

    if (providerSettings.asciiSafe) {
      highlights.push('ASCII-safe cleanup');
    }

    if (providerSettings.paragraphOnly || session?.format === 'Paragraph Style') {
      highlights.push('Paragraph-only output');
    }

    if (providerSettings.wellskyFriendly || providerSettings.outputDestination === 'WellSky') {
      highlights.push('WellSky-friendly formatting');
    }

    if (session?.customInstructions?.trim()) {
      highlights.push('Provider-specific instructions attached');
    }

    return highlights;
  }, [providerSettings, session]);
  const exportPreviewText = useMemo(
    () => buildExportPreviewText(draftText, session, providerSettings),
    [draftText, providerSettings, session],
  );
  const encounterSupport = useMemo(
    () => normalizeEncounterSupport(session?.encounterSupport, session?.noteType || ''),
    [session?.encounterSupport, session?.noteType],
  );
  const encounterSupportConfig = useMemo(
    () => getEncounterSupportConfig(session?.noteType || ''),
    [session?.noteType],
  );
  const encounterSupportSummary = useMemo(
    () => buildEncounterSupportSummary(encounterSupport, session?.noteType || ''),
    [encounterSupport, session?.noteType],
  );
  const encounterSupportWarnings = useMemo(
    () => buildEncounterSupportWarnings(encounterSupport, session?.noteType || ''),
    [encounterSupport, session?.noteType],
  );
  const encounterDocumentationChecks = useMemo(
    () => buildEncounterDocumentationChecks({
      encounterSupport,
      noteType: session?.noteType || '',
      draftText,
    }),
    [draftText, encounterSupport, session?.noteType],
  );
  const medicalNecessitySupport = useMemo(
    () => evaluateMedicalNecessitySupport({
      noteType: session?.noteType || '',
      draftText,
    }),
    [draftText, session?.noteType],
  );
  const phaseTwoTrustCues = useMemo(
    () => buildPhaseTwoTrustCues({
      draftSections,
      objectiveReview,
      medicationProfileGapSummary,
      medicationScaffoldWarnings,
      structuredDiagnosisAlignment,
      diagnosisTimeframeGaps,
      highRiskWarnings,
      draftOnlyRiskTerms,
    }),
    [
      diagnosisTimeframeGaps,
      draftOnlyRiskTerms,
      draftSections,
      highRiskWarnings,
      medicationProfileGapSummary,
      medicationScaffoldWarnings,
      objectiveReview,
      structuredDiagnosisAlignment,
    ],
  );
  const exportReadiness = useMemo(() => {
    const blockers = [];
    const warnings = [];

    if (draftSections.length && reviewCounts.unreviewed > 0) {
      blockers.push(`${reviewCounts.unreviewed} section${reviewCounts.unreviewed === 1 ? '' : 's'} still marked unreviewed.`);
    }

    if (reviewCounts.needsReview > 0) {
      blockers.push(`${reviewCounts.needsReview} section${reviewCounts.needsReview === 1 ? '' : 's'} still marked needs review.`);
    }

    if (contradictionFlags.length) {
      warnings.push(`${contradictionFlags.length} contradiction prompt${contradictionFlags.length === 1 ? '' : 's'} still needs clinician judgment.`);
    }

    if (highRiskWarnings.length) {
      warnings.push(`${highRiskWarnings.length} high-risk review cue${highRiskWarnings.length === 1 ? '' : 's'} should be checked before final use.`);
    }

    if (phaseTwoTrustCues.length) {
      warnings.push(`${phaseTwoTrustCues.length} Phase 2 trust cue${phaseTwoTrustCues.length === 1 ? '' : 's'} is still active in Review. Re-check objective conflict, medication truth, diagnosis caution, or risk wording before export.`);
    }

    if (isDischargeNote) {
      warnings.push('Discharge note detected: confirm that current discharge status is not being back-projected across the whole hospitalization.');
    }

    if (destinationConstraintActive) {
      warnings.push('Destination formatting is active: verify that export cleanup did not change meaning, uncertainty, or symptom timeline.');
    }

    if (
      isDischargeNote &&
      medicationSignalSummary.mentionedChanges &&
      (
        medicationSignalSummary.medicationNameCount === 0
        || medicationSignalSummary.dosageSignalCount === 0
      )
    ) {
      warnings.push('Medication changes are mentioned, but regimen detail looks thin. Avoid inventing med names, doses, or exact discharge regimen wording.');
    }

    warnings.push(...encounterSupportWarnings);

    if (medicalNecessitySupport.applies && medicalNecessitySupport.reviewWarnings.length) {
      warnings.push(`Inpatient medical-necessity support is ${medicalNecessitySupport.statusLabel.toLowerCase()}. Re-check ${medicalNecessitySupport.reviewWarnings.slice(0, 2).join(' and ')}.`);
    }

    return {
      ready: blockers.length === 0,
      blockers,
      warnings,
    };
  }, [
    contradictionFlags.length,
    destinationConstraintActive,
    draftSections.length,
    highRiskWarnings.length,
    encounterSupportWarnings,
    medicalNecessitySupport,
    phaseTwoTrustCues.length,
    isDischargeNote,
    medicationSignalSummary.dosageSignalCount,
    medicationSignalSummary.medicationNameCount,
    medicationSignalSummary.mentionedChanges,
    reviewCounts.needsReview,
    reviewCounts.unreviewed,
  ]);

  useEffect(() => {
    const topHighRiskWarning = highRiskWarnings[0];

    publishAssistantContext({
      stage: 'review',
      noteType: session?.noteType,
      specialty: session?.specialty,
      currentDraftText: draftText ? draftText.slice(0, 4000) : undefined,
      providerProfileId: providerSettings.providerProfileId,
      providerProfileName: activeProviderProfile?.name,
      providerAddressingName: resolveVeraAddress(providerSettings, activeProviderProfile?.name),
      veraInteractionStyle: providerSettings.veraInteractionStyle,
      veraProactivityLevel: providerSettings.veraProactivityLevel,
      veraMemoryNotes: providerSettings.veraMemoryNotes,
      outputDestination: providerSettings.outputDestination,
      customInstructions: session?.customInstructions,
      presetName: session?.presetName,
      selectedPresetId: session?.selectedPresetId,
      focusedSectionHeading,
      focusedSectionSentence,
      focusedEvidenceCount: focusedSectionEvidence?.links.length,
      contradictionCount: contradictionFlags.length,
      highRiskWarningTitles: highRiskWarnings.map((warning) => warning.title).slice(0, 3),
      topHighRiskWarningId: topHighRiskWarning?.id,
      topHighRiskWarningTitle: topHighRiskWarning?.title,
      topHighRiskWarningDetail: topHighRiskWarning?.detail,
      topHighRiskWarningReviewHint: topHighRiskWarning?.reviewHint,
      phaseTwoCueCount: phaseTwoTrustCues.length,
      needsReviewCount: reviewCounts.needsReview,
      unreviewedCount: reviewCounts.unreviewed,
      destinationConstraintActive,
    });
  }, [
    activeProviderProfile,
    contradictionFlags.length,
    draftText,
    destinationConstraintActive,
    focusedSectionEvidence,
    focusedSectionHeading,
    focusedSectionSentence,
    highRiskWarnings,
    phaseTwoTrustCues.length,
    providerSettings.outputDestination,
    providerSettings.providerProfileId,
    providerSettings.veraInteractionStyle,
    providerSettings.veraMemoryNotes,
    providerSettings.veraProactivityLevel,
    reviewCounts.needsReview,
    reviewCounts.unreviewed,
    session?.customInstructions,
    session?.noteType,
    session?.presetName,
    session?.selectedPresetId,
    session?.specialty,
  ]);
  const copilotSuggestions = session?.copilotSuggestions ?? [];
  const sectionPlan = useMemo(() => planSections({
    noteType: session?.noteType || '',
    requestedScope: session?.outputScope,
    requestedSections: session?.requestedSections,
  }), [session?.noteType, session?.outputScope, session?.requestedSections]);

  useEffect(() => {
    if (!draftSections.length) {
      setFocusedSectionAnchor(null);
      setFocusedEvidenceBlockId(null);
      return;
    }

    const nextAnchor = focusedSectionAnchor && draftSections.some((section) => section.anchor === focusedSectionAnchor)
      ? focusedSectionAnchor
      : draftSections[0]?.anchor ?? null;

    setFocusedSectionAnchor(nextAnchor);
  }, [draftSections, focusedSectionAnchor]);

  useEffect(() => {
    if (!focusedSectionAnchor) {
      setFocusedEvidenceBlockId(null);
      return;
    }

    const strongestLink = sectionEvidenceMap[focusedSectionAnchor]?.links[0];
    setFocusedEvidenceBlockId((current) => {
      if (current && sourceBlocks.some((block) => block.id === current)) {
        return current;
      }
      return strongestLink?.blockId ?? null;
    });
  }, [focusedSectionAnchor, sectionEvidenceMap, sourceBlocks]);

  if (isHydrating) {
    return (
      <div className="aurora-panel rounded-[28px] p-7">
        <h2 className="text-lg font-semibold">Loading draft...</h2>
        <p className="mt-2 text-sm text-muted">Restoring the most recently saved draft for review.</p>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="aurora-panel rounded-[28px] p-7">
        <h2 className="text-lg font-semibold">No draft loaded yet</h2>
        <p className="mt-2 text-sm text-muted">
          {embedded
            ? 'Generate a draft in the note workspace first, then review will open here without leaving the page.'
            : 'Generate a draft from the New Note page first, then come back here to review it.'}
        </p>
        {embedded ? (
          <button onClick={onBackToEdit} className="aurora-primary-button mt-4 inline-flex rounded-xl px-4 py-3 font-medium">
            Back to compose
          </button>
        ) : (
          <Link href="/dashboard/new-note" className="aurora-primary-button mt-4 inline-flex rounded-xl px-4 py-3 font-medium">
            Go to New Note
          </Link>
        )}
      </div>
    );
  }

  return (
    <>
      {session.warning ? (
        <div className="aurora-soft-panel mb-4 rounded-[22px] border border-amber-200 px-5 py-4 text-sm text-amber-900">
          Live generation was unavailable, so the app used a local fallback draft. Details: {session.warning}
        </div>
      ) : null}

      {contradictionFlags.length ? (
        <div className="aurora-soft-panel mb-4 rounded-[24px] border border-rose-200 px-5 py-4 text-sm text-rose-900">
          <div className="font-semibold">Possible contradictions to review</div>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {contradictionFlags.map((flag) => (
              <li key={flag}>{flag}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {objectiveReview.hasObjectiveData ? (
        <div id="objective-warning-layer" className="aurora-panel mb-4 rounded-[26px] border border-sky-200 px-5 py-5 text-sm text-sky-950">
          <div className="flex flex-wrap items-center gap-2">
            <div className="font-semibold">Objective data and lab review</div>
            <ProvenanceChip label="Objective source panel" />
            <ProvenanceChip label="Conflict-preservation review" />
          </div>
          <p className="mt-1 text-sky-900">
            Use this to keep vitals, labs, toxicology, MAR details, observed behavior, and other measured findings visible when the narrative summary reads cleaner than the source packet.
          </p>
          <div className="mt-3 grid gap-3 lg:grid-cols-[1.1fr,0.9fr]">
            <div className="aurora-soft-panel rounded-[20px] border border-sky-200 px-4 py-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-sky-900">What the objective packet appears to contain</div>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sky-950">
                {objectiveReview.sourceSignals.length ? objectiveReview.sourceSignals.map((signal) => (
                  <li key={signal}>{signal}</li>
                )) : <li>Objective data is present, but no strong lab/vital/MAR subtype was auto-identified.</li>}
              </ul>
              <div className="mt-3 text-xs font-semibold uppercase tracking-wide text-sky-900">Review prompts</div>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sky-950">
                {objectiveReview.reviewPrompts.map((prompt) => (
                  <li key={prompt}>{prompt}</li>
                ))}
              </ul>
            </div>
            <div className={`aurora-soft-panel rounded-[20px] border px-4 py-4 ${objectiveReview.hasConflictRisk ? 'border-amber-200 bg-amber-50 text-amber-950' : 'border-emerald-200 bg-emerald-50 text-emerald-900'}`}>
              <div className="text-xs font-semibold uppercase tracking-wide">
                {objectiveReview.hasConflictRisk ? 'Why this deserves extra review' : 'Current objective read'}
              </div>
              {objectiveReview.hasConflictRisk ? (
                <ul className="mt-2 list-disc space-y-1 pl-5">
                  {objectiveReview.conflictBullets.map((bullet) => (
                    <li key={bullet}>{bullet}</li>
                  ))}
                </ul>
              ) : (
                <div className="mt-2 text-sm">
                  Objective data is present, but no strong narrative-vs-objective mismatch cue was detected yet. Still verify that measured findings remained visible in the draft.
                </div>
              )}
            </div>
          </div>
          {objectiveReview.snippets.length ? (
            <div className="aurora-soft-panel mt-3 rounded-[20px] border border-sky-200 px-4 py-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-sky-900">Objective source snippets to inspect first</div>
              <div className="mt-2 grid gap-2">
                {objectiveReview.snippets.map((snippet) => (
                  <button
                    key={snippet.id}
                    type="button"
                    onClick={() => {
                      setFocusedEvidenceBlockId(snippet.id);
                      setActiveSourceKey(snippet.sourceKey);
                    }}
                    className={`rounded-lg border border-sky-200 px-3 py-2 text-left text-xs text-sky-950 transition hover:shadow-sm ${focusedEvidenceBlockId === snippet.id ? 'bg-sky-100 ring-2 ring-sky-200' : 'bg-sky-50'}`}
                  >
                    <div className="font-semibold">{snippet.sourceLabel}</div>
                    <div className="mt-1">{snippet.text}</div>
                    <div className="mt-2 font-medium underline underline-offset-2">Focus this source block</div>
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {highRiskWarnings.length ? (
        <div id="high-risk-warning-layer" className="aurora-panel mb-4 rounded-[26px] border border-amber-200 px-5 py-5 text-sm text-amber-950">
          <div className="font-semibold">High-risk warning cues</div>
          <p className="mt-1 text-amber-900">These are conservative review cues for known high-risk distortion patterns. They are not diagnoses, risk scores, or proof that the draft is wrong.</p>
          <div className="mt-3 space-y-3">
            {highRiskWarnings.map((warning) => (
              <div key={warning.id} className="aurora-soft-panel rounded-[20px] border border-amber-200 px-4 py-4">
                <div className="font-medium text-amber-950">{warning.title}</div>
                <div className="mt-1 text-amber-900">{warning.detail}</div>
                <div className="mt-2 text-xs font-medium uppercase tracking-wide text-amber-800">Review focus: {warning.reviewHint}</div>
                <WarningWhyThisAppeared
                  summary="This cue is coming from the high-risk review layer."
                  toneClassName="border-amber-200 text-amber-900"
                  bullets={[
                    `Warning rule: ${warning.id.replace(/-/g, ' ')}`,
                    populatedSourceKinds.length ? `Source sections in play: ${populatedSourceKinds.join(', ')}` : 'Source sections in play: combined source only',
                    `Draft word count: ${draftWordCount}`,
                    `Source word count: ${sourceWordCount}`,
                  ]}
                />
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="aurora-soft-panel mb-4 rounded-[22px] border border-emerald-200 px-5 py-4 text-sm text-emerald-900">
        The latest draft can be restored here so you can continue review without losing your place.
      </div>

      <div className="aurora-panel mb-4 rounded-[26px] border border-slate-300 px-5 py-5 text-sm text-slate-900">
        <div className="font-semibold">Trust and review notice</div>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-slate-800">
          <li>This draft is a starting point, not a completed clinical note.</li>
          <li>Use the source panel to verify wording, dates, meds, doses, routes, frequencies, refill language, timelines, quoted statements, and who is speaking.</li>
          <li>If the source is thin or the plan is not explicit, the honest answer may be a visibly sparse section or “not documented in source” wording.</li>
          <li>High-risk warning cues are review prompts for known distortion patterns, not authoritative findings.</li>
          <li>Suggested evidence is heuristic only: useful for review triage, not proof.</li>
          <li>Reviewer-confirmed evidence only records what you checked during review. It does not certify medical truth.</li>
          <li>Mark each section as approved or needs review before export so saved drafts preserve where trust work stopped.</li>
        </ul>
      </div>

      {session.specialty === 'Psychiatry' ? (
        <div className="aurora-panel mb-4 rounded-[26px] border border-violet-200 px-5 py-5 text-sm text-violet-950">
          <div className="font-semibold">Psych review priorities</div>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-violet-900">
            <li>Keep risk language literal. Do not let the draft sharpen vague source into stronger suicidality, homicidality, psychosis, or mania claims than the source supports.</li>
            <li>Check MSE wording carefully, especially affect, thought process, thought content, orientation, insight, judgment, and any quoted patient statements.</li>
            <li>Leave collateral conflict visible when sources disagree instead of smoothing it into one confident story.</li>
            <li>Verify medication names, doses, PRNs, refill wording, adherence, side effects, and relevant lab context before export.</li>
          </ul>
        </div>
      ) : null}

      {phaseTwoTrustCues.length ? (
        <div className="aurora-panel aurora-edge-emphasis mb-4 rounded-[26px] border border-sky-200 px-5 py-5 text-sm text-sky-950">
          <div className="flex flex-wrap items-center gap-2">
            <div className="font-semibold">Phase 2 trust summary</div>
            <ProvenanceChip label="Core trust workflow" />
          </div>
          <p className="mt-1 text-sky-900">
            These are the highest-signal trust issues still showing in the core workflow. Start here before digging into the deeper review panels.
          </p>
          <div className="mt-3 grid gap-3 lg:grid-cols-2">
            {phaseTwoTrustCues.map((cue) => (
              <div key={cue.id} className={`rounded-[20px] border px-4 py-4 ${cue.toneClassName}`}>
                <div className="font-medium">{cue.label}</div>
                <div className="mt-1 text-sm">{cue.detail}</div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {cue.sectionAnchor ? (
                    <button
                      type="button"
                      onClick={() => handleSectionPressureNavigate({ sectionAnchor: cue.sectionAnchor || draftSections[0]?.anchor || '', warningFamily: cue.warningFamily })}
                    className="aurora-pill rounded-full px-2.5 py-1 text-[11px] font-medium"
                    >
                      Focus related draft section
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => {
                      const target = document.getElementById(cue.warningFamily);
                      if (target) {
                        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
                      }
                    }}
                    className="aurora-pill rounded-full px-2.5 py-1 text-[11px] font-medium"
                  >
                    Open related review layer
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {structuredMedicationProfile.length ? (
        <CollapsibleReviewSection
          title="Structured psychiatric medication profile"
          subtitle="Provider-entered medication details are available here as added review support."
          toneClassName="border-cyan-200 bg-cyan-50 text-cyan-950"
        >
          <div className="font-semibold">Structured psychiatric medication profile</div>
          <p className="mt-1 text-cyan-900">
            This draft includes a provider-entered med profile. Veranote should treat these entries as review support, not as a fully reconciled final regimen unless the source packet clearly supports that.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {structuredMedicationSummary.map((item) => (
              <span key={item} className="aurora-pill rounded-full border border-cyan-200 px-3 py-1 text-xs font-medium text-cyan-950">
                {item}
              </span>
            ))}
          </div>
        </CollapsibleReviewSection>
      ) : null}

      {structuredDiagnosisProfile.length ? (
        <CollapsibleReviewSection
          title="Structured diagnosis / assessment profile"
          subtitle="Provider-entered assessment framing is available here when you want to compare it against the draft."
          toneClassName="border-rose-200 bg-rose-50 text-rose-950"
        >
          <div className="font-semibold">Structured diagnosis / assessment profile</div>
          <p className="mt-1 text-rose-900">
            This draft includes a provider-entered diagnosis profile. Veranote should treat these entries as assessment scaffolding, not as proof that the final draft is allowed to sound more certain than the source.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {structuredDiagnosisSummary.map((item) => (
              <span key={item} className="aurora-pill rounded-full border border-rose-200 px-3 py-1 text-xs font-medium text-rose-950">
                {item}
              </span>
            ))}
          </div>
          {(structuredDiagnosisAlignment.missingFromDraft.length || structuredDiagnosisAlignment.draftOnlyAgainstStructured.length) ? (
            <div className="aurora-soft-panel mt-4 rounded-lg border border-rose-200 p-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-rose-900">Assessment alignment check</div>
              {structuredDiagnosisAlignment.missingFromDraft.length ? (
                <div className="mt-3">
                  <div className="text-xs font-medium text-rose-950">Structured diagnosis entries not clearly reflected in draft</div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {structuredDiagnosisAlignment.missingFromDraft.map((item) => (
                      <span key={item.id} className="rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-xs font-medium text-rose-950">
                        {item.normalizedDisplayName || item.rawLabel.trim()}
                      </span>
                    ))}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {findSectionAnchorByPattern(draftSections, /(assessment|impression|formulation|diagnosis)/i) ? (
                      <button
                        type="button"
                        onClick={() => handleSectionPressureNavigate({
                          sectionAnchor: findSectionAnchorByPattern(draftSections, /(assessment|impression|formulation|diagnosis)/i) || draftSections[0]?.anchor || '',
                          warningFamily: 'diagnosis-warning-layer',
                        })}
                        className="rounded-full border border-rose-200 bg-white px-2.5 py-1 text-[11px] font-medium text-rose-950"
                      >
                        Focus assessment section
                      </button>
                    ) : null}
                  </div>
                </div>
              ) : null}
              {structuredDiagnosisAlignment.draftOnlyAgainstStructured.length ? (
                <div className="mt-3">
                  <div className="text-xs font-medium text-rose-950">Diagnoses in draft that go beyond the structured assessment frame</div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {structuredDiagnosisAlignment.draftOnlyAgainstStructured.slice(0, 8).map(({ diagnosis }) => (
                      <span key={diagnosis.id} className="rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-xs font-medium text-rose-950">
                        {diagnosis.diagnosis_name}
                      </span>
                    ))}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {findSectionAnchorByPattern(draftSections, /(assessment|impression|formulation|diagnosis)/i) ? (
                      <button
                        type="button"
                        onClick={() => handleSectionPressureNavigate({
                          sectionAnchor: findSectionAnchorByPattern(draftSections, /(assessment|impression|formulation|diagnosis)/i) || draftSections[0]?.anchor || '',
                          warningFamily: 'diagnosis-warning-layer',
                        })}
                        className="rounded-full border border-rose-200 bg-white px-2.5 py-1 text-[11px] font-medium text-rose-950"
                      >
                        Focus assessment section
                      </button>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
        </CollapsibleReviewSection>
      ) : null}

      {(draftOnlyDiagnoses.length || diagnosisTimeframeGaps.length || diagnosisNonAutoMapTerms.length || draftDiagnosisAvoidTerms.length) ? (
        <CollapsibleReviewSection
          id="diagnosis-warning-layer"
          title="Diagnosis review support"
          subtitle="Open this for a deeper read on diagnosis wording, timeframe, and uncertainty drift."
          toneClassName="border-rose-200 bg-rose-50 text-rose-950"
        >
          <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
            <div className="font-semibold">Diagnosis review support</div>
            <div className="flex flex-wrap gap-2">
              <ProvenanceChip label="Diagnosis reference" />
              <ProvenanceChip label="Timeframe guidance" />
              <ProvenanceChip label="Differential guidance" />
            </div>
          </div>
          <p className="mt-1 text-rose-900">
            These cues come from the diagnosis reference library. They are here to slow down diagnosis overstatement, preserve differential uncertainty, and make timeframe-sensitive labels easier to review before export.
          </p>

          {draftOnlyDiagnoses.length ? (
            <div className="mt-4 rounded-lg border border-rose-200 bg-white p-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-rose-900">Diagnoses appearing in draft but not clearly in source</div>
              <div className="mt-3 space-y-3">
                {draftOnlyDiagnoses.slice(0, 8).map(({ diagnosis, differentialCaution }) => (
                  <div key={diagnosis.id} className="rounded-lg border border-rose-100 bg-rose-50/40 p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="font-medium text-rose-950">{diagnosis.diagnosis_name}</div>
                      <span className="rounded-full border border-rose-200 bg-white px-2 py-0.5 text-[11px] font-medium text-rose-950">
                        {diagnosis.category}
                      </span>
                      {diagnosis.warn_before_upgrading_symptoms_to_diagnosis ? (
                        <span className="rounded-full border border-rose-200 bg-white px-2 py-0.5 text-[11px] font-medium text-rose-950">
                          review before upgrade
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-2 text-xs text-rose-900">{diagnosis.summary}</div>
                    <div className="mt-2 text-xs text-rose-800">
                      Outpatient certainty caution: {diagnosis.outpatient_certainty_caution}
                    </div>
                    {differentialCaution ? (
                      <div className="mt-2 text-xs text-rose-800">
                        Preserve uncertainty when: {differentialCaution.when_app_should_preserve_uncertainty}
                      </div>
                    ) : null}
                    <WarningWhyThisAppeared
                      summary="This cue is coming from the diagnosis reference layer because the draft mentions a matched diagnosis that the source text does not clearly support."
                      toneClassName="border-rose-200 text-rose-900"
                      bullets={[
                        `Diagnosis id: ${diagnosis.id}`,
                        `Category: ${diagnosis.category}`,
                        diagnosis.warn_before_upgrading_symptoms_to_diagnosis ? 'Bundle marks this diagnosis as review-before-upgrade from symptoms.' : 'Bundle does not mark this diagnosis as an auto-upgrade concern.',
                        `Source diagnosis mentions found: ${sourceDiagnosisMentions.length}`,
                        `Draft diagnosis mentions found: ${draftDiagnosisMentions.length}`,
                      ]}
                    />
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => focusDraftMatch(diagnosis.diagnosis_name)}
                        className="rounded-full border border-rose-200 bg-white px-2.5 py-1 text-[11px] font-medium text-rose-950"
                      >
                        Focus in draft
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {diagnosisTimeframeGaps.length ? (
            <div className="mt-4 rounded-lg border border-rose-200 bg-white p-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-rose-900">Timeframe-sensitive diagnoses needing review</div>
              <div className="mt-3 space-y-3">
                {diagnosisTimeframeGaps.slice(0, 8).map(({ diagnosis, timeframeRule }) => (
                  <div key={`${diagnosis.id}-timeframe`} className="rounded-lg border border-rose-100 bg-rose-50/40 p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="font-medium text-rose-950">{diagnosis.diagnosis_name}</div>
                      <span className="rounded-full border border-rose-200 bg-white px-2 py-0.5 text-[11px] font-medium text-rose-950">
                        timeframe-sensitive
                      </span>
                    </div>
                    <div className="mt-2 text-xs text-rose-900">{timeframeRule?.minimum_duration_timeframe}</div>
                    <div className="mt-2 text-xs text-rose-800">
                      Risk if ignored: {timeframeRule?.common_product_failure_mode_if_ignored}
                    </div>
                    <WarningWhyThisAppeared
                      summary="This cue is coming from the diagnosis timeframe guidance because the draft mentions a duration-sensitive diagnosis without strong timeframe language in source."
                      toneClassName="border-rose-200 text-rose-900"
                      bullets={[
                        `Diagnosis: ${diagnosis.diagnosis_name}`,
                        timeframeRule?.minimum_duration_timeframe ? `Minimum timeframe summary: ${timeframeRule.minimum_duration_timeframe}` : 'Minimum timeframe summary not available.',
                        `Source timeframe signal detected: ${hasTimeframeSignal(session?.sourceInput || '') ? 'Yes' : 'No'}`,
                      ]}
                    />
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {diagnosisNonAutoMapTerms.length ? (
            <div className="mt-4 rounded-lg border border-rose-200 bg-white p-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-rose-900">Alias or shorthand needing diagnosis review</div>
              <div className="mt-3 space-y-3">
                {diagnosisNonAutoMapTerms.slice(0, 8).map(({ matchedText, entry }) => (
                  <div key={`${entry.id}-${matchedText}`} className="rounded-lg border border-rose-100 bg-rose-50/40 p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="font-medium text-rose-950">{matchedText}</div>
                      <span className="rounded-full border border-rose-200 bg-white px-2 py-0.5 text-[11px] font-medium text-rose-950">
                        {entry.formal_diagnosis}
                      </span>
                      <span className="rounded-full border border-rose-200 bg-white px-2 py-0.5 text-[11px] font-medium text-rose-950">
                        {entry.ambiguity_level} ambiguity
                      </span>
                    </div>
                    <div className="mt-2 text-xs text-rose-800">
                      Do not auto-map: {entry.terms_that_should_not_auto_map.join(', ')}
                    </div>
                    <WarningWhyThisAppeared
                      summary="This cue is coming from the diagnosis alias guide because the draft contains shorthand that is too ambiguous to auto-map safely."
                      toneClassName="border-rose-200 text-rose-900"
                      bullets={[
                        `Matched shorthand: ${matchedText}`,
                        `Formal diagnosis candidate: ${entry.formal_diagnosis}`,
                        `Ambiguity level: ${entry.ambiguity_level}`,
                        `Non-auto-map terms in this entry: ${entry.terms_that_should_not_auto_map.join(', ')}`,
                      ]}
                    />
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => focusDraftMatch(matchedText)}
                        className="rounded-full border border-rose-200 bg-white px-2.5 py-1 text-[11px] font-medium text-rose-950"
                      >
                        Focus in draft
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {draftDiagnosisAvoidTerms.length ? (
            <div className="mt-4 rounded-lg border border-rose-200 bg-white p-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-rose-900">Diagnosis wording to review before export</div>
              <div className="mt-3 space-y-3">
                {draftDiagnosisAvoidTerms.slice(0, 8).map(({ matchedText, entry }) => (
                  <div key={entry.id} className="rounded-lg border border-rose-100 bg-rose-50/40 p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="font-medium text-rose-950">{matchedText}</div>
                      <span className="rounded-full border border-rose-200 bg-white px-2 py-0.5 text-[11px] font-medium text-rose-950">
                        {formatDiagnosisAction(entry.product_action)}
                      </span>
                    </div>
                    <div className="mt-2 text-xs text-rose-900">{entry.why_risky}</div>
                    <div className="mt-2 text-xs text-rose-800">
                      Safer handling: {entry.safer_alternative_or_handling}
                    </div>
                    <WarningWhyThisAppeared
                      summary="This cue is coming from the diagnosis wording guidance because the draft uses a phrase marked as risky or overconfident."
                      toneClassName="border-rose-200 text-rose-900"
                      bullets={[
                        `Matched phrase: ${matchedText}`,
                        `Suggested product action: ${formatDiagnosisAction(entry.product_action)}`,
                        `Risk rationale: ${entry.why_risky}`,
                      ]}
                    />
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => focusDraftMatch(matchedText)}
                        className="rounded-full border border-rose-200 bg-white px-2.5 py-1 text-[11px] font-medium text-rose-950"
                      >
                        Focus in draft
                      </button>
                      <button
                        type="button"
                        onClick={() => replaceFirstDraftMatch(matchedText, entry.safer_alternative_or_handling)}
                        className="rounded-full border border-rose-200 bg-white px-2.5 py-1 text-[11px] font-medium text-rose-950"
                      >
                        Replace with safer wording
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </CollapsibleReviewSection>
      ) : null}

      {(reviewFirstAbbreviations.length || draftAvoidTerms.length || draftRiskTerms.length || draftMseTermsNeedingReview.length) ? (
        <CollapsibleReviewSection
          id="terminology-warning-layer"
          title="Psych terminology review support"
          subtitle="Open this when you need a closer look at shorthand, discouraged wording, or MSE and risk-language cues."
          toneClassName="border-fuchsia-200 bg-fuchsia-50 text-fuchsia-950"
        >
          <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
            <div className="font-semibold">Psych terminology review support</div>
            <div className="flex flex-wrap gap-2">
              <ProvenanceChip label="Terminology reference" />
              <ProvenanceChip label="Abbreviation guide" />
              <ProvenanceChip label="MSE + risk guide" />
            </div>
          </div>
          <p className="mt-1 text-fuchsia-900">
            These cues come from the psychiatry terminology reference. They help you catch ambiguous shorthand, discouraged language, and high-risk wording drift, but they do not replace clinician judgment.
          </p>

          {reviewFirstAbbreviations.length ? (
            <div className="mt-4 rounded-lg border border-fuchsia-200 bg-white p-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-fuchsia-900">Ambiguous abbreviations in draft</div>
              <div className="mt-3 space-y-3">
                {reviewFirstAbbreviations.slice(0, 8).map(({ entry }) => (
                  <div key={entry.id} className="rounded-lg border border-fuchsia-100 bg-fuchsia-50/40 p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="font-medium text-fuchsia-950">{entry.abbreviation}</div>
                      <span className="rounded-full border border-fuchsia-300/40 bg-fuchsia-100/55 px-2 py-0.5 text-[11px] font-medium text-fuchsia-950 shadow-[0_2px_8px_rgba(79,22,46,0.05)]">
                        {entry.expansion}
                      </span>
                      <span className="rounded-full border border-fuchsia-300/40 bg-fuchsia-100/55 px-2 py-0.5 text-[11px] font-medium text-fuchsia-950 shadow-[0_2px_8px_rgba(79,22,46,0.05)]">
                        {entry.ambiguity_level} ambiguity
                      </span>
                    </div>
                    <div className="mt-2 text-xs text-fuchsia-900">{entry.psych_context_meaning}</div>
                    {entry.alternate_meanings_if_ambiguous.length ? (
                      <div className="mt-2 text-xs text-fuchsia-800">
                        Alternate meanings: {entry.alternate_meanings_if_ambiguous.join(', ')}
                      </div>
                    ) : null}
                    <WarningWhyThisAppeared
                      summary="This cue is coming from the abbreviation guide because the draft uses shorthand marked as ambiguous or review-first."
                      toneClassName="border-fuchsia-200 text-fuchsia-900"
                      bullets={[
                        `Abbreviation: ${entry.abbreviation}`,
                        `Expansion candidate: ${entry.expansion}`,
                        `Safe for auto expansion: ${entry.safe_for_auto_expansion ? 'Yes' : 'No'}`,
                        `Review warning required: ${entry.should_trigger_review_warning ? 'Yes' : 'No'}`,
                        entry.alternate_meanings_if_ambiguous.length ? `Alternate meanings: ${entry.alternate_meanings_if_ambiguous.join(', ')}` : 'Alternate meanings: none recorded',
                      ]}
                    />
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => focusDraftMatch(entry.abbreviation)}
                        className="rounded-full border border-fuchsia-300/40 bg-fuchsia-100/55 px-2.5 py-1 text-[11px] font-medium text-fuchsia-950 shadow-[0_2px_8px_rgba(79,22,46,0.05)]"
                      >
                        Focus in draft
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {draftAvoidTerms.length ? (
            <div className="mt-4 rounded-lg border border-fuchsia-200 bg-white p-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-fuchsia-900">Discouraged language in draft</div>
              <div className="mt-3 space-y-3">
                {draftAvoidTerms.slice(0, 8).map(({ entry, matchedText }) => (
                  <div key={entry.id} className="rounded-lg border border-fuchsia-100 bg-fuchsia-50/40 p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="font-medium text-fuchsia-950">{matchedText}</div>
                      <span className="rounded-full border border-fuchsia-300/40 bg-fuchsia-100/55 px-2 py-0.5 text-[11px] font-medium text-fuchsia-950 shadow-[0_2px_8px_rgba(79,22,46,0.05)]">
                        {entry.recommended_system_action.replace(/_/g, ' ')}
                      </span>
                    </div>
                    <div className="mt-2 text-xs text-fuchsia-900">{entry.why_risky}</div>
                    <div className="mt-2 text-xs text-fuchsia-800">
                      Safer alternative: {entry.safer_alternative}
                    </div>
                    <WarningWhyThisAppeared
                      summary="This cue is coming from the terminology guidance because the draft uses language marked as discouraged or misleading."
                      toneClassName="border-fuchsia-200 text-fuchsia-900"
                      bullets={[
                        `Matched term: ${matchedText}`,
                        `Recommended system action: ${entry.recommended_system_action.replace(/_/g, ' ')}`,
                        `Safer alternative: ${entry.safer_alternative}`,
                      ]}
                    />
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => focusDraftMatch(matchedText)}
                        className="rounded-full border border-fuchsia-300/40 bg-fuchsia-100/55 px-2.5 py-1 text-[11px] font-medium text-fuchsia-950 shadow-[0_2px_8px_rgba(79,22,46,0.05)]"
                      >
                        Focus in draft
                      </button>
                      <button
                        type="button"
                        onClick={() => replaceFirstDraftMatch(matchedText, entry.safer_alternative)}
                        className="rounded-full border border-fuchsia-300/40 bg-fuchsia-100/55 px-2.5 py-1 text-[11px] font-medium text-fuchsia-950 shadow-[0_2px_8px_rgba(79,22,46,0.05)]"
                      >
                        Replace with safer wording
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {draftRiskTerms.length ? (
            <div className="mt-4 rounded-lg border border-fuchsia-200 bg-white p-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-fuchsia-900">Risk-language terms in draft</div>
              <div className="mt-3 space-y-3">
                {draftRiskTerms.slice(0, 8).map(({ entry }) => {
                  const draftOnly = draftOnlyRiskTerms.some((item) => item.entry.id === entry.id);
                  return (
                    <div key={entry.id} className="rounded-lg border border-fuchsia-100 bg-fuchsia-50/40 p-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="font-medium text-fuchsia-950">{entry.term}</div>
                        <span className="rounded-full border border-fuchsia-300/40 bg-fuchsia-100/55 px-2 py-0.5 text-[11px] font-medium text-fuchsia-950 shadow-[0_2px_8px_rgba(79,22,46,0.05)]">
                          {formatRiskAction(entry.veranote_action)}
                        </span>
                        {draftOnly ? (
                          <span className="rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[11px] font-medium text-rose-900">
                            not clearly present in source
                          </span>
                        ) : null}
                      </div>
                      <div className="mt-2 text-xs text-fuchsia-900">{entry.meaning}</div>
                    {entry.common_misuse_risks.length ? (
                      <div className="mt-2 text-xs text-fuchsia-800">
                        Misuse risks: {entry.common_misuse_risks.join('; ')}
                      </div>
                    ) : null}
                    <WarningWhyThisAppeared
                      summary="This cue is coming from the risk-language guide because the draft contains a term that may need review for strengthening, softening, or unsupported introduction."
                      toneClassName="border-fuchsia-200 text-fuchsia-900"
                      bullets={[
                        `Risk term: ${entry.term}`,
                        `Suggested Veranote action: ${formatRiskAction(entry.veranote_action)}`,
                        draftOnly ? 'This risk term is not clearly detected in the source material.' : 'This risk term is also present in the source material.',
                        ...(entry.common_misuse_risks.length ? [`Misuse risks: ${entry.common_misuse_risks.join('; ')}`] : []),
                      ]}
                    />
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => focusDraftMatch(entry.term)}
                        className="rounded-full border border-fuchsia-300/40 bg-fuchsia-100/55 px-2.5 py-1 text-[11px] font-medium text-fuchsia-950 shadow-[0_2px_8px_rgba(79,22,46,0.05)]"
                      >
                        Focus in draft
                      </button>
                    </div>
                  </div>
                );
              })}
              </div>
            </div>
          ) : null}

          {draftMseTermsNeedingReview.length ? (
            <div className="mt-4 rounded-lg border border-fuchsia-200 bg-white p-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-fuchsia-900">MSE descriptors needing extra review</div>
              <div className="mt-3 space-y-3">
                {draftMseTermsNeedingReview.slice(0, 8).map(({ entry }) => (
                  <div key={entry.id} className="rounded-lg border border-fuchsia-100 bg-fuchsia-50/40 p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="font-medium text-fuchsia-950">{entry.term}</div>
                      <span className="rounded-full border border-fuchsia-300/40 bg-fuchsia-100/55 px-2 py-0.5 text-[11px] font-medium text-fuchsia-950 shadow-[0_2px_8px_rgba(79,22,46,0.05)]">
                        {entry.domain}
                      </span>
                    </div>
                    <div className="mt-2 text-xs text-fuchsia-900">{entry.concise_definition}</div>
                    {entry.important_distinctions_from_similar_terms.length ? (
                      <div className="mt-2 text-xs text-fuchsia-800">
                        Distinguish from: {entry.important_distinctions_from_similar_terms.join('; ')}
                      </div>
                    ) : null}
                    <WarningWhyThisAppeared
                      summary="This cue is coming from the MSE guide because the draft uses a descriptor that is easy to overstate or blur."
                      toneClassName="border-fuchsia-200 text-fuchsia-900"
                      bullets={[
                        `MSE term: ${entry.term}`,
                        `Domain: ${entry.domain}`,
                        ...(entry.important_distinctions_from_similar_terms.length
                          ? [`Important distinctions: ${entry.important_distinctions_from_similar_terms.join('; ')}`]
                          : []),
                      ]}
                    />
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </CollapsibleReviewSection>
      ) : null}

      {matchedMedicationEntries.length ? (
        <CollapsibleReviewSection
          id="medication-warning-layer"
          title="Medication review support"
          subtitle="Open this when you want a deeper look at detected medications and medication-specific review warnings."
          toneClassName="border-cyan-200 bg-cyan-50 text-cyan-950"
        >
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="font-semibold">Detected medications from source</div>
                <ProvenanceChip label="Medication reference" />
                <ProvenanceChip label="Matching support" />
              </div>
              <p className="mt-1 text-cyan-900">
                These medication matches came from the psych medication reference library. They are review support only, not proof that the regimen is complete, current, or clinically safe.
              </p>
            </div>
            <div className="rounded-full border border-cyan-200 bg-white px-3 py-1 text-xs font-medium text-cyan-900">
              {matchedMedicationEntries.length} med{matchedMedicationEntries.length === 1 ? '' : 's'} detected
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {medicationReviewHighlights.provisionalCount ? (
              <span className="rounded-full border border-cyan-200 bg-white px-3 py-1 text-xs font-medium text-cyan-900">
                {medicationReviewHighlights.provisionalCount} provisional reference entr{medicationReviewHighlights.provisionalCount === 1 ? 'y' : 'ies'}
              </span>
            ) : null}
            {medicationReviewHighlights.withSourceAnchors ? (
              <span className="rounded-full border border-cyan-200 bg-white px-3 py-1 text-xs font-medium text-cyan-900">
                {medicationReviewHighlights.withSourceAnchors} with source anchors
              </span>
            ) : null}
            {medicationReviewHighlights.laiCount ? (
              <span className="rounded-full border border-cyan-200 bg-white px-3 py-1 text-xs font-medium text-cyan-900">
                {medicationReviewHighlights.laiCount} LAI-sensitive
              </span>
            ) : null}
          </div>
          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            {matchedMedicationEntries.slice(0, 8).map((medication) => (
              <div key={medication.id} className="rounded-lg border border-cyan-200 bg-white p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="font-medium text-cyan-950">{medication.displayName}</div>
                  <span className="rounded-full border border-cyan-200 bg-cyan-100 px-2 py-0.5 text-[11px] font-medium text-cyan-950">
                    {medication.subclass || medication.classFamily}
                  </span>
                  {medication.isLai ? (
                    <span className="rounded-full border border-cyan-200 bg-cyan-100 px-2 py-0.5 text-[11px] font-medium text-cyan-950">
                      LAI
                    </span>
                  ) : null}
                </div>
                {medication.brandNames.length ? (
                  <div className="mt-1 text-xs text-cyan-900">
                    Brands: {medication.brandNames.slice(0, 3).join(', ')}
                  </div>
                ) : null}
                <div className="mt-2 text-xs text-cyan-800">
                  Source status: {formatMedicationSourceStatus(medication.sourceStatus)}
                  {medication.normalization.unresolvedGap ? `; gap: ${medication.normalization.unresolvedGap}` : ''}
                </div>
                {medication.highRiskFlags.length ? (
                  <div className="mt-3">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-cyan-800">Medication caution tags</div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {medication.highRiskFlags.slice(0, 4).map((flag) => (
                        <span key={`${medication.id}-${flag}`} className="rounded-full border border-cyan-200 bg-cyan-50 px-2 py-0.5 text-[11px] font-medium text-cyan-950">
                          {formatMedicationFlag(flag)}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
          {medicationReviewHighlights.highRiskFlags.length ? (
            <div className="mt-4 rounded-lg border border-cyan-200 bg-white p-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-cyan-900">High-risk tags in play</div>
              <div className="mt-2 flex flex-wrap gap-2">
                {medicationReviewHighlights.highRiskFlags.map((flag) => (
                  <span key={flag} className="rounded-full border border-cyan-200 bg-cyan-100 px-2 py-0.5 text-[11px] font-medium text-cyan-950">
                    {formatMedicationFlag(flag)}
                  </span>
                ))}
              </div>
              <p className="mt-2 text-xs text-cyan-800">
                These tags should raise review attention, but they are still early warning signals rather than final prescribing or interaction conclusions.
              </p>
            </div>
          ) : null}
          {(medicationProfileGapSummary.unresolvedEntries.length || medicationProfileGapSummary.missingRegimenEntries.length || medicationProfileGapSummary.missingRouteEntries.length) ? (
            <div className="mt-4 rounded-lg border border-cyan-200 bg-white p-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-cyan-900">Structured medication profile gaps</div>
              <p className="mt-1 text-xs text-cyan-800">
                These are conservative review prompts from the provider-entered medication profile. They help keep regimen detail honest when the structured profile itself is incomplete.
              </p>
              <div className="mt-3 space-y-2 text-sm text-cyan-900">
                {medicationProfileGapSummary.unresolvedEntries.length ? (
                  <div className="rounded-lg border border-cyan-100 bg-cyan-50/40 p-3">
                    Unresolved medication names: {medicationProfileGapSummary.unresolvedEntries.map((entry) => entry.rawName.trim()).join(', ')}.
                  </div>
                ) : null}
                {medicationProfileGapSummary.missingRegimenEntries.length ? (
                  <div className="rounded-lg border border-cyan-100 bg-cyan-50/40 p-3">
                    Missing dose or schedule detail for: {medicationProfileGapSummary.missingRegimenEntries.map((entry) => entry.normalizedDisplayName || entry.rawName.trim()).join(', ')}.
                  </div>
                ) : null}
                {medicationProfileGapSummary.missingRouteEntries.length ? (
                  <div className="rounded-lg border border-cyan-100 bg-cyan-50/40 p-3">
                    Route not recorded for: {medicationProfileGapSummary.missingRouteEntries.map((entry) => entry.normalizedDisplayName || entry.rawName.trim()).join(', ')}.
                  </div>
                ) : null}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {findSectionAnchorByPattern(draftSections, /(med|medication|plan)/i) ? (
                  <button
                    type="button"
                    onClick={() => handleSectionPressureNavigate({
                      sectionAnchor: findSectionAnchorByPattern(draftSections, /(med|medication|plan)/i) || draftSections[0]?.anchor || '',
                      warningFamily: 'medication-warning-layer',
                    })}
                    className="rounded-full border border-cyan-200 bg-white px-2.5 py-1 text-[11px] font-medium text-cyan-950"
                  >
                    Focus medication section
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}
          {medicationScaffoldWarnings.length ? (
            <div className="mt-4 rounded-lg border border-cyan-200 bg-white p-3">
              <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                <div className="text-xs font-semibold uppercase tracking-wide text-cyan-900">Medication review warnings</div>
                <div className="flex flex-wrap gap-2">
                  <ProvenanceChip label="Medication warning guide" />
                  <ProvenanceChip label="Review-only logic" />
                </div>
              </div>
              <p className="mt-1 text-xs text-cyan-800">
                These warnings come from the medication warning guide. They are review prompts, not autonomous compatibility decisions.
              </p>
              <div className="mt-3 space-y-3">
                {medicationScaffoldWarnings.map((warning) => (
                  <div key={warning.code} className="rounded-lg border border-cyan-100 bg-cyan-50/40 p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="font-medium text-cyan-950">{warning.title}</div>
                      <span className="rounded-full border border-cyan-200 bg-white px-2 py-0.5 text-[11px] font-medium text-cyan-950">
                        {formatWarningSeverity(warning.severity)}
                      </span>
                      <span className="rounded-full border border-cyan-200 bg-white px-2 py-0.5 text-[11px] font-medium text-cyan-950">
                        {warning.evidenceBasis.replace(/_/g, ' ')}
                      </span>
                    </div>
                    <div className="mt-2 text-sm text-cyan-900">{warning.summary}</div>
                    {warning.whyTriggered.length ? (
                      <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-cyan-900">
                        {warning.whyTriggered.map((item) => (
                          <li key={`${warning.code}-${item}`}>{item}</li>
                        ))}
                      </ul>
                    ) : null}
                    {warning.missingInputs.length ? (
                      <div className="mt-2 text-xs text-cyan-800">
                        Missing context keeps this warning conservative: {warning.missingInputs.join(', ')}.
                      </div>
                    ) : null}
                    {warning.medicationIds.length ? (
                      <div className="mt-2 text-xs text-cyan-800">
                        Triggered meds: {warning.medicationIds.join(', ')}
                      </div>
                    ) : null}
                    <WarningWhyThisAppeared
                      summary="This cue is coming from the medication warning guide."
                      toneClassName="border-cyan-200 text-cyan-900"
                      bullets={[
                        `Rule code: ${warning.code}`,
                        `Evidence basis: ${warning.evidenceBasis.replace(/_/g, ' ')}`,
                        ...(warning.whyTriggered.length ? warning.whyTriggered : []),
                        ...(warning.sourceDocumentIds.length ? [`Source documents: ${warning.sourceDocumentIds.join(', ')}`] : []),
                      ]}
                    />
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </CollapsibleReviewSection>
      ) : null}

      {psychReviewGuidance ? (
        <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-4 text-sm text-emerald-950">
          <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
            <div>
              <div className="font-semibold">{psychReviewGuidance.title}</div>
              <p className="mt-1 text-emerald-900">{psychReviewGuidance.intro}</p>
            </div>
            <div className="rounded-full border border-emerald-200 bg-white px-3 py-1 text-xs font-medium text-emerald-900">
              {psychReviewGuidance.careSetting}
            </div>
          </div>
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <div className="rounded-lg border border-emerald-200 bg-white p-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-emerald-900">Priority checks</div>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-emerald-900">
                {psychReviewGuidance.priorities.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
            <div className="rounded-lg border border-emerald-200 bg-white p-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-emerald-900">Section review emphasis</div>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-emerald-900">
                {psychReviewGuidance.sectionChecks.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      ) : null}

      {isDischargeNote ? (
        <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-4 text-sm text-rose-950">
          <div className="font-semibold">Discharge note review priorities</div>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-rose-900">
            {dischargeReviewCues.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          {medicationSignalSummary.mentionedChanges && (medicationSignalSummary.medicationNameCount === 0 || medicationSignalSummary.dosageSignalCount === 0) ? (
            <div className="mt-3 rounded-lg border border-rose-200 bg-white px-3 py-3 text-rose-900">
              The source mentions medication adjustment or optimization, but the discharge packet does not appear to include full regimen detail. Keep med wording conservative unless the exact discharge list is in source.
            </div>
          ) : null}
          {dischargeTimelineBuckets.length ? (
            <div className="mt-4 rounded-lg border border-rose-200 bg-white p-3">
              <div className="font-medium text-rose-950">Hospitalization timeline check</div>
              <p className="mt-1 text-xs text-rose-800">
                Review these source snippets before export so the discharge summary does not blur admission symptoms, recent events, and current discharge status into one flattened story.
              </p>
              <div className="mt-3 grid gap-3 lg:grid-cols-2">
                {dischargeTimelineBuckets.map((bucket) => (
                  <div key={bucket.id} className="rounded-lg border border-rose-100 bg-rose-50/40 p-3">
                    <div className="text-xs font-semibold uppercase tracking-wide text-rose-900">{bucket.label}</div>
                    <div className="mt-1 text-xs text-rose-800">{bucket.hint}</div>
                    <div className="mt-2 space-y-2">
                      {bucket.snippets.map((snippet, index) => (
                        <div key={`${bucket.id}-${index}`} className="rounded-md border border-rose-100 bg-white px-2 py-2">
                          <div className="text-[11px] font-medium uppercase tracking-wide text-rose-700">{snippet.sourceLabel}</div>
                          <div className="mt-1 text-xs text-ink whitespace-pre-wrap">{snippet.text}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {destinationConstraintActive ? (
        <div className="mb-4 rounded-xl border border-sky-200 bg-sky-50 px-4 py-4 text-sm text-sky-950">
          <div className="font-semibold">Destination / export constraint review</div>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sky-900">
            {destinationConstraintCues.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <CollapsibleReviewSection
        id="encounter-warning-layer"
        title="Encounter and documentation support"
        subtitle="Open this when you want a closer look at telehealth, psychotherapy, crisis, or documentation-support cues."
        toneClassName="border-amber-200 bg-amber-50 text-amber-950"
      >
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="font-semibold">{encounterSupportConfig.title}</div>
              <ProvenanceChip label="Encounter guide" />
              <ProvenanceChip label="Documentation support" />
            </div>
            <p className="mt-1 text-amber-900">
              This structured encounter layer is here to make the draft more reviewable. It supports documentation and export checks, but it is not a code assignment engine.
            </p>
          </div>
          <div className="rounded-full border border-amber-200 bg-white px-3 py-1 text-xs font-medium text-amber-900">
            Coding support only
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {encounterSupportConfig.codeFamilies.map((item) => (
            <span key={item} className="rounded-full border border-amber-200 bg-white px-3 py-1 text-xs font-medium text-amber-900">
              {item}
            </span>
          ))}
        </div>
        {encounterSupportSummary.length ? (
          <div className="mt-4 flex flex-wrap gap-2">
            {encounterSupportSummary.map((item) => (
              <span key={item} className="rounded-full border border-amber-200 bg-amber-100 px-3 py-1 text-xs font-medium text-amber-950">
                {item}
              </span>
            ))}
          </div>
        ) : (
          <div className="mt-4 rounded-lg border border-amber-200 bg-white px-3 py-3 text-sm text-amber-900">
            No structured encounter-support details were saved for this draft yet.
          </div>
        )}
        {encounterSupportWarnings.length ? (
          <div className="mt-4 rounded-lg border border-amber-200 bg-white p-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-amber-900">Encounter review cues</div>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-amber-900">
              {encounterSupportWarnings.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        ) : null}
        {encounterDocumentationChecks.length ? (
          <div className="mt-4 rounded-lg border border-amber-200 bg-white p-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-amber-900">Time-sensitive documentation checks</div>
            <div className="mt-3 space-y-2 text-sm text-amber-900">
              {encounterDocumentationChecks.map((item) => (
                <div key={item.id} className="rounded-lg border border-amber-100 bg-amber-50/40 p-3">
                  <div className="font-medium text-amber-950">{item.label}</div>
                  <div className="mt-1">{item.detail}</div>
                </div>
              ))}
            </div>
          </div>
        ) : null}
        {medicalNecessitySupport.applies ? (
          <div className="mt-4 rounded-lg border border-amber-200 bg-white p-3">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-amber-900">Inpatient medical necessity support</div>
                <p className="mt-1 text-sm text-amber-900">
                  This layer checks for national inpatient-psych documentation anchors and Louisiana launch-specific cues. It supports review quality, not final payer certainty.
                </p>
              </div>
              <div className={`rounded-full border px-3 py-1 text-xs font-medium ${medicalNecessitySupport.statusToneClassName}`}>
                {medicalNecessitySupport.statusLabel} · score {medicalNecessitySupport.totalScore}
              </div>
            </div>
            <div className="mt-4 grid gap-3 xl:grid-cols-2">
              <div className="rounded-lg border border-amber-100 bg-amber-50/40 p-3">
                <div className="text-xs font-semibold uppercase tracking-wide text-amber-900">National domains</div>
                <div className="mt-3 space-y-2 text-sm text-amber-900">
                  {medicalNecessitySupport.domainScores.map((item) => (
                    <div key={item.id} className="rounded-lg border border-amber-100 bg-white p-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="font-medium text-amber-950">{item.label}</div>
                        <div className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-900">
                          {item.score}/2
                        </div>
                      </div>
                      <div className="mt-1">{item.detail}</div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="rounded-lg border border-amber-100 bg-amber-50/40 p-3">
                <div className="text-xs font-semibold uppercase tracking-wide text-amber-900">Louisiana-specific cues</div>
                {medicalNecessitySupport.louisianaBoosts.length ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {medicalNecessitySupport.louisianaBoosts.map((item) => (
                      <span key={item} className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-900">
                        {item}
                      </span>
                    ))}
                  </div>
                ) : null}
                <div className="mt-3 space-y-2 text-sm text-amber-900">
                  {[...medicalNecessitySupport.nationalCues, ...medicalNecessitySupport.louisianaCues].length ? (
                    [...medicalNecessitySupport.nationalCues, ...medicalNecessitySupport.louisianaCues].map((item) => (
                      <div key={item.id} className="rounded-lg border border-amber-100 bg-white p-3">
                        <div className="font-medium text-amber-950">{item.label}</div>
                        <div className="mt-1">{item.detail}</div>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-emerald-900">
                      This draft already shows a strong first pass of acute risk, why-now timing, failed lower-level care, and 24-hour-care justification.
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </CollapsibleReviewSection>

      <CollapsibleReviewSection
        title="Active output profile"
        subtitle="Open this when you want to check destination formatting and export-shaping rules."
        toneClassName="border-sky-200 bg-sky-50 text-sky-950"
      >
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="font-semibold">Active Output Profile</div>
            <p className="mt-1 text-sky-900">
              This draft is currently being shaped for a specific output target. Keep this visible while reviewing so formatting cleanup does not quietly become a content change.
            </p>
          </div>
          <div className="rounded-full border border-sky-200 bg-white px-3 py-1 text-xs font-medium text-sky-900">
            Export layer only
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {activeOutputProfileHighlights.map((item) => (
            <span key={item} className="rounded-full border border-sky-200 bg-white px-3 py-1 text-xs font-medium text-sky-900">
              {item}
            </span>
          ))}
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <div className="rounded-lg border border-sky-200 bg-white p-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-sky-900">Provider-facing rule</div>
            <p className="mt-1 text-sm text-sky-900">
              Destination cleanup can simplify punctuation, structure, and formatting. It should not upgrade certainty, erase timeline nuance, or fill missing regimen details.
            </p>
          </div>
          <div className="rounded-lg border border-sky-200 bg-white p-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-sky-900">Current review emphasis</div>
            <p className="mt-1 text-sm text-sky-900">
              Check that the note still reads truthfully for the intended destination before trusting a clean export. If content feels more certain than source, fix the draft first and export second.
            </p>
          </div>
        </div>
      </CollapsibleReviewSection>

      <div className="mb-4 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <div className="rounded-xl border border-border bg-white p-4 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted">Template</div>
          <div className="mt-2 text-sm font-medium text-ink">{session.template}</div>
        </div>
        <div className="rounded-xl border border-border bg-white p-4 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted">Preset</div>
          <div className="mt-2 text-sm font-medium text-ink">{session.presetName || 'No saved preset'}</div>
          {session.selectedPresetId ? <div className="mt-1 text-xs text-muted">{session.selectedPresetId}</div> : null}
        </div>
        <div className="rounded-xl border border-border bg-white p-4 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted">Output scope</div>
          <div className="mt-2 text-sm font-medium text-ink">{session.outputScope || 'full-note'}</div>
        </div>
        <div className="rounded-xl border border-border bg-white p-4 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted">Output style</div>
          <div className="mt-2 text-sm font-medium text-ink">{session.outputStyle}</div>
        </div>
        <div className="rounded-xl border border-border bg-white p-4 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted">Format</div>
          <div className="mt-2 text-sm font-medium text-ink">{session.format}</div>
        </div>
        <div className="rounded-xl border border-border bg-white p-4 shadow-sm md:col-span-2 xl:col-span-3">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted">Planned sections</div>
          <div className="mt-2 text-sm font-medium text-ink">{sectionPlan.sections.length ? sectionPlan.sections.map((section) => SECTION_LABELS[section]).join(', ') : 'No explicit section plan recorded'}</div>
          <div className="mt-1 text-xs text-muted">Standalone MSE required for this scope: {sectionPlan.requiresStandaloneMse ? 'Yes' : 'No'}</div>
        </div>
        <div className="rounded-xl border border-border bg-white p-4 shadow-sm md:col-span-2 xl:col-span-2">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted">Source sections</div>
          <div className="mt-2 text-sm font-medium text-ink">{sourceSectionLabels.length ? sourceSectionLabels.join(', ') : 'None recorded'}</div>
        </div>
      </div>

      {session.customInstructions?.trim() ? (
        <div className="mb-4 rounded-xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm text-violet-900">
          <div className="font-semibold">Provider-specific saved preferences used for this draft</div>
          <div className="mt-1 whitespace-pre-wrap">{session.customInstructions.trim()}</div>
        </div>
      ) : null}

      {lanePreferenceSuggestion ? (
        <div className="aurora-panel mb-4 rounded-[24px] p-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <div className="text-sm font-semibold text-white">Review insight</div>
              <p className="mt-1 text-sm text-cyan-50/78">
                You have finalized this {session.noteType.toLowerCase()} lane with the same section setup {lanePreferenceSuggestion.count} times. If that is intentional, Veranote can send it back into compose as a reusable note preference instead of making you rebuild it each time.
              </p>
            </div>
            <div className="aurora-pill rounded-full px-3 py-1 text-xs font-medium">
              Finalized pattern
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <span className="rounded-full border border-cyan-200/12 bg-[rgba(13,30,50,0.74)] px-3 py-1.5 text-xs font-medium text-cyan-50">
              Scope: {lanePreferenceSuggestion.outputScope.replace('-', ' ')}
            </span>
            <span className="rounded-full border border-cyan-200/12 bg-[rgba(13,30,50,0.74)] px-3 py-1.5 text-xs font-medium text-cyan-50">
              Style: {lanePreferenceSuggestion.outputStyle}
            </span>
            <span className="rounded-full border border-cyan-200/12 bg-[rgba(13,30,50,0.74)] px-3 py-1.5 text-xs font-medium text-cyan-50">
              Format: {lanePreferenceSuggestion.format}
            </span>
            {lanePreferenceSuggestion.requestedSections.length ? (
              <span className="rounded-full border border-cyan-200/12 bg-[rgba(13,30,50,0.74)] px-3 py-1.5 text-xs font-medium text-cyan-50">
                Sections: {lanePreferenceSuggestion.requestedSections.map((section) => SECTION_LABELS[section as NoteSectionKey]).join(', ')}
              </span>
            ) : null}
          </div>
          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={handleDraftLanePreferenceFromReview}
              className="aurora-secondary-button rounded-xl px-4 py-2 text-sm font-medium"
            >
              Send setup to compose as preference
            </button>
            <button
              type="button"
              onClick={() => {
                dismissLanePreferenceSuggestion(session.noteType, lanePreferenceSuggestion.key);
                setLanePreferenceSuggestion(null);
              }}
              className="aurora-secondary-button rounded-xl px-4 py-2 text-sm font-medium"
            >
              Dismiss
            </button>
          </div>
        </div>
      ) : null}

      <div className="mb-6 grid gap-4 md:grid-cols-4 xl:grid-cols-5">
        <div className="rounded-xl border border-border bg-white p-4 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted">Source words</div>
          <div className="mt-2 text-2xl font-semibold text-ink">{sourceWordCount}</div>
        </div>
        <div className="rounded-xl border border-border bg-white p-4 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted">Draft words</div>
          <div className="mt-2 text-2xl font-semibold text-ink">{draftWordCount}</div>
        </div>
        <div className="rounded-xl border border-border bg-white p-4 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted">Draft sections</div>
          <div className="mt-2 text-2xl font-semibold text-ink">{draftSections.length || 1}</div>
        </div>
        <div className="rounded-xl border border-border bg-white p-4 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted">Approved sections</div>
          <div className="mt-2 text-2xl font-semibold text-ink">{reviewCounts.approved}</div>
        </div>
        <div className="rounded-xl border border-border bg-white p-4 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted">Needs review</div>
          <div className="mt-2 text-2xl font-semibold text-ink">{reviewCounts.needsReview}</div>
        </div>
        <div className="rounded-xl border border-border bg-white p-4 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted">Confirmed evidence links</div>
          <div className="mt-2 text-2xl font-semibold text-ink">{reviewCounts.confirmedEvidence}</div>
        </div>
        <div className="rounded-xl border border-border bg-white p-4 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted">Section reviewer notes</div>
          <div className="mt-2 text-2xl font-semibold text-ink">{reviewCounts.reviewerComments}</div>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_1.3fr_0.9fr]">
        <section id="source-evidence-layer" className="rounded-xl border border-border bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Source Evidence</h2>
              <p className="mt-1 text-sm text-muted">Suggested evidence only. The app highlights likely source blocks for the section you are reviewing; you still decide whether they truly support the draft and can mark reviewer-confirmed links.</p>
            </div>
            <div className="rounded-full bg-paper px-3 py-1 text-xs font-medium text-muted">Reference only</div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button onClick={() => setActiveSourceKey('combined')} className={`rounded-full px-3 py-1.5 text-xs font-medium ${activeSourceKey === 'combined' ? 'bg-accent text-white' : 'bg-paper text-muted'}`}>Combined</button>
            {sourcePanels.map((panel) => (
              <button
                key={panel.key}
                onClick={() => setActiveSourceKey(panel.key)}
                className={`rounded-full px-3 py-1.5 text-xs font-medium ${activeSourceKey === panel.key ? 'bg-accent text-white' : 'bg-paper text-muted'}`}
              >
                {panel.label}
              </button>
            ))}
          </div>
          <div className="mt-4 rounded-lg border border-border bg-paper p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-ink">{activeSourcePanel.label}</div>
                <p className="mt-1 text-xs text-muted">{activeSourcePanel.hint}</p>
              </div>
              {focusedSectionEvidence ? (
                <div className="max-w-[14rem] rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-[11px] text-sky-900">
                  <div className="font-semibold">Focused review section</div>
                  <div className="mt-1">{focusedSectionEvidence.sectionHeading}</div>
                </div>
              ) : null}
            </div>

            {activeSourceKey === 'combined' ? (
              <div className="mt-4 space-y-3 max-h-[540px] overflow-auto">
                {sourceBlocks.length ? sourceBlocks.map((block) => {
                  const matchingLink = focusedSectionEvidence?.links.find((link) => link.blockId === block.id);
                  const isFocused = focusedEvidenceBlockId === block.id;
                  const highlightParts = highlightTermsInText(block.text, matchingLink?.overlapTerms || []);

                  return (
                    <div
                      key={block.id}
                      className={`w-full rounded-lg border p-3 text-left ${isFocused ? 'border-sky-300 bg-sky-50' : 'border-border bg-white'}`}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          setFocusedEvidenceBlockId(block.id);
                          setActiveSourceKey(block.sourceKey);
                        }}
                        className="w-full text-left"
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="text-xs font-semibold uppercase tracking-wide text-muted">{block.sourceLabel}</div>
                          {matchingLink ? (
                            <div className={`rounded-full border px-2 py-1 text-[11px] font-medium ${evidenceSignalClasses[matchingLink.signal]}`}>
                              {getSignalLabel(matchingLink.signal)}
                            </div>
                          ) : null}
                        </div>
                        <div className="mt-2 text-sm text-ink whitespace-pre-wrap">
                          {highlightParts.map((part, index) => (
                            <span key={`${block.id}-${index}`} className={part.highlighted ? 'rounded bg-yellow-100 px-0.5' : ''}>{part.text}</span>
                          ))}
                        </div>
                        {matchingLink?.overlapTerms.length ? (
                          <div className="mt-2 text-xs text-muted">Matched terms: {matchingLink.overlapTerms.join(', ')}</div>
                        ) : null}
                      </button>
                      {focusedSectionAnchor ? (
                        <button
                          type="button"
                          onClick={() => handleConfirmedEvidenceToggle(focusedSectionAnchor, block.id)}
                          className={`mt-3 rounded-full border px-2 py-1 text-[11px] font-medium ${getConfirmedEvidenceBlockIds(session, focusedSectionAnchor).includes(block.id) ? 'border-violet-200 bg-violet-50 text-violet-800' : 'border-border bg-paper text-muted'}`}
                        >
                          {getConfirmedEvidenceBlockIds(session, focusedSectionAnchor).includes(block.id) ? 'Remove reviewer confirmation' : 'Mark reviewer-confirmed for focused section'}
                        </button>
                      ) : null}
                    </div>
                  );
                }) : <div className="text-sm text-muted">No content in this source section.</div>}
              </div>
            ) : (
              <div className="mt-4 space-y-3 max-h-[540px] overflow-auto">
                {sourceBlocks.filter((block) => block.sourceKey === activeSourceKey).length ? sourceBlocks.filter((block) => block.sourceKey === activeSourceKey).map((block) => {
                  const matchingLink = focusedSectionEvidence?.links.find((link) => link.blockId === block.id);
                  const isFocused = focusedEvidenceBlockId === block.id;
                  const highlightParts = highlightTermsInText(block.text, matchingLink?.overlapTerms || []);

                  return (
                    <div
                      key={block.id}
                      className={`w-full rounded-lg border p-3 text-left ${isFocused ? 'border-sky-300 bg-sky-50' : 'border-border bg-white'}`}
                    >
                      <button
                        type="button"
                        onClick={() => setFocusedEvidenceBlockId(block.id)}
                        className="w-full text-left"
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="text-xs font-semibold uppercase tracking-wide text-muted">{block.sourceLabel}</div>
                          {matchingLink ? (
                            <div className={`rounded-full border px-2 py-1 text-[11px] font-medium ${evidenceSignalClasses[matchingLink.signal]}`}>
                              {getSignalLabel(matchingLink.signal)}
                            </div>
                          ) : null}
                        </div>
                        <div className="mt-2 text-sm text-ink whitespace-pre-wrap">
                          {highlightParts.map((part, index) => (
                            <span key={`${block.id}-${index}`} className={part.highlighted ? 'rounded bg-yellow-100 px-0.5' : ''}>{part.text}</span>
                          ))}
                        </div>
                        {matchingLink?.overlapTerms.length ? (
                          <div className="mt-2 text-xs text-muted">Matched terms: {matchingLink.overlapTerms.join(', ')}</div>
                        ) : null}
                      </button>
                      {focusedSectionAnchor ? (
                        <button
                          type="button"
                          onClick={() => handleConfirmedEvidenceToggle(focusedSectionAnchor, block.id)}
                          className={`mt-3 rounded-full border px-2 py-1 text-[11px] font-medium ${getConfirmedEvidenceBlockIds(session, focusedSectionAnchor).includes(block.id) ? 'border-violet-200 bg-violet-50 text-violet-800' : 'border-border bg-paper text-muted'}`}
                        >
                          {getConfirmedEvidenceBlockIds(session, focusedSectionAnchor).includes(block.id) ? 'Remove reviewer confirmation' : 'Mark reviewer-confirmed for focused section'}
                        </button>
                      ) : null}
                    </div>
                  );
                }) : <div className="text-sm text-muted">No content in this source section.</div>}
              </div>
            )}
          </div>
        </section>

        <section className="rounded-xl border border-border bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold">Draft Note</h2>
              <p className="mt-1 text-sm text-muted">Review carefully before use. Click a section to pull up likely supporting source blocks, then decide whether the support is real, partial, or missing.</p>
            </div>
            <div className="rounded-full bg-paper px-3 py-1 text-xs font-medium text-muted">
              {session.mode === 'live' ? 'Live generation' : 'Draft output. Clinician review required before use.'}
            </div>
          </div>
          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            Do not let polished wording trick you into trusting unsupported content. If a detail is absent, uncertain, or contradictory in source, the draft should stay absent, uncertain, or clearly flagged.
          </div>
          <div className="mt-4 rounded-lg border border-border bg-paper p-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted">Draft section navigator</div>
            <div className="mt-3 flex flex-wrap gap-2">
              {draftSections.length ? draftSections.map((section) => {
                const reviewState = reconciledSectionReviewState[section.anchor];
                return (
                  <a
                    key={section.anchor}
                    href={`#${section.anchor}`}
                    onClick={() => setFocusedSectionAnchor(section.anchor)}
                    className={`rounded-full border px-3 py-1.5 text-xs font-medium ${reviewStatusClasses[reviewState?.status || 'unreviewed']} ${focusedSectionAnchor === section.anchor ? 'ring-2 ring-sky-200' : ''}`}
                  >
                    {section.heading}
                  </a>
                );
              }) : (
                <div className="text-sm text-muted">No section headings detected yet. The note is still fully editable below.</div>
              )}
            </div>
          </div>
          <textarea ref={draftTextareaRef} value={draftText} onChange={(event) => setDraftText(event.target.value)} className="mt-4 min-h-[520px] w-full rounded-lg border border-border p-4" />
          <div className="mt-4 rounded-lg border border-border bg-paper p-4">
            <div className="text-sm font-semibold text-ink">Section review cues</div>
            <div className="mt-3 space-y-3">
              {draftSections.length ? draftSections.map((section) => {
                const reviewState = reconciledSectionReviewState[section.anchor];
                const evidence = sectionEvidenceMap[section.anchor];
                const sectionClaimSupportCues = buildSectionClaimSupportCues({
                  sectionHeading: section.heading,
                  sectionBody: section.body,
                  evidenceLinks: evidence?.links || [],
                  sourceBlocks,
                });
                return (
                  <div key={section.anchor} id={section.anchor} className={`rounded-lg border bg-white p-3 ${focusedSectionAnchor === section.anchor ? 'border-sky-300 shadow-sm' : 'border-border'}`}>
                    <div className="flex items-center justify-between gap-3">
                      <button type="button" onClick={() => setFocusedSectionAnchor(section.anchor)} className="text-left font-medium text-ink">{section.heading}</button>
                      <div className="flex items-center gap-2">
                        <div className={`rounded-full border px-2 py-1 text-[11px] font-medium ${reviewStatusClasses[reviewState?.status || 'unreviewed']}`}>
                          {(reviewState?.status || 'unreviewed').replace('-', ' ')}
                        </div>
                        <div className="text-xs text-muted">{countWords(section.body)} words</div>
                      </div>
                    </div>
                    <p className="mt-2 text-sm text-muted">
                      Verify this section against source before finalizing. Keep only facts, uncertainty, and timing the source actually supports.
                    </p>
                    <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
                      <div className="text-xs font-semibold uppercase tracking-wide text-muted">Suggested evidence links</div>
                      <p className="mt-1 text-xs text-muted">Heuristic suggestions only. Use these to review faster, then explicitly confirm the links you actually checked.</p>
                      {evidence?.links.length ? (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {evidence.links.map((link) => {
                            const block = sourceBlocks.find((item) => item.id === link.blockId);
                            if (!block) {
                              return null;
                            }

                            return (
                              <div
                                key={link.blockId}
                                className={`rounded-lg border px-3 py-2 text-left text-xs ${evidenceSignalClasses[link.signal]} ${focusedEvidenceBlockId === link.blockId ? 'ring-2 ring-sky-200' : ''}`}
                              >
                                <button
                                  type="button"
                                  onClick={() => {
                                    setFocusedSectionAnchor(section.anchor);
                                    setFocusedEvidenceBlockId(link.blockId);
                                    setActiveSourceKey(block.sourceKey);
                                  }}
                                  className="w-full text-left"
                                >
                                  <div className="font-semibold">{block.sourceLabel}</div>
                                  <div className="mt-1">{getSignalLabel(link.signal)}</div>
                                  {link.overlapTerms.length ? <div className="mt-1 opacity-80">Matches: {link.overlapTerms.join(', ')}</div> : null}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleConfirmedEvidenceToggle(section.anchor, link.blockId)}
                                  className={`mt-2 rounded-full border px-2 py-1 font-medium ${getConfirmedEvidenceBlockIds(session, section.anchor).includes(link.blockId) ? 'border-violet-200 bg-violet-50 text-violet-800' : 'border-white/70 bg-white/70 text-slate-700'}`}
                                >
                                  {getConfirmedEvidenceBlockIds(session, section.anchor).includes(link.blockId) ? 'Remove reviewer confirmation' : 'Mark reviewer-confirmed'}
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="mt-2 text-sm text-muted">No obvious lexical support found yet. Treat this as a prompt to inspect the source manually, not proof that the section is unsupported.</div>
                      )}
                    </div>
                    {sectionClaimSupportCues.length ? (
                      <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="text-xs font-semibold uppercase tracking-wide text-muted">Claim support snapshot</div>
                          <ProvenanceChip label="Section evidence map" />
                        </div>
                        <p className="mt-1 text-xs text-muted">
                          This is a quick source-backing read for the strongest sentences in this section, not a proof engine.
                        </p>
                        <div className="mt-2 grid gap-2">
                          {sectionClaimSupportCues.map((cue) => (
                            <div key={cue.id} className={`rounded-lg border px-3 py-2 text-xs ${cue.toneClassName}`}>
                              <div className="font-semibold">{cue.statusLabel}</div>
                              <div className="mt-1 text-sm">{cue.claimText}</div>
                              <div className="mt-1">{cue.detail}</div>
                              <div className="mt-2 rounded-lg border border-white/70 bg-white/70 px-2.5 py-2 text-xs">
                                <div className="font-semibold">Revision help</div>
                                <div className="mt-1">{cue.revisionHint}</div>
                              </div>
                              <div className="mt-2 flex flex-wrap gap-2">
                                <button
                                  type="button"
                                  onClick={() => focusDraftSentence(cue.claimText)}
                                  className="rounded-full border border-current/20 bg-white/80 px-2.5 py-1 font-medium"
                                >
                                  Focus sentence in draft
                                </button>
                                {cue.statusLabel !== 'Better visible support' ? (
                                  <button
                                    type="button"
                                    onClick={() => replaceDraftSentence(cue.claimText, buildCautiousClaimReplacement(section.heading, cue))}
                                    className="rounded-full border border-current/20 bg-white/80 px-2.5 py-1 font-medium"
                                  >
                                    Replace with cautious wording
                                  </button>
                                ) : null}
                              {cue.topSourceBlockId && cue.topSourceKey ? (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setFocusedSectionAnchor(section.anchor);
                                    setFocusedEvidenceBlockId(cue.topSourceBlockId);
                                    setActiveSourceKey(cue.topSourceKey);
                                  }}
                                  className="rounded-full border border-current/20 bg-white/80 px-2.5 py-1 font-medium"
                                >
                                  Focus best supporting source block
                                </button>
                              ) : null}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}
                    {(() => {
                      const topSourceBlock = evidence?.links[0]
                        ? sourceBlocks.find((item) => item.id === evidence.links[0]?.blockId)
                        : null;
                      const sectionPressureCues = buildSectionPressureCues({
                        sectionHeading: section.heading,
                        objectiveCount: objectiveReview.sourceSignals.length + objectiveReview.conflictBullets.length,
                        highRiskCount: highRiskWarnings.length,
                        diagnosisCount: draftOnlyDiagnoses.length + diagnosisTimeframeGaps.length + diagnosisNonAutoMapTerms.length + draftDiagnosisAvoidTerms.length,
                        terminologyCount: reviewFirstAbbreviations.length + draftAvoidTerms.length + draftRiskTerms.length + draftMseTermsNeedingReview.length,
                        medicationCount: matchedMedicationEntries.length + medicationScaffoldWarnings.length,
                        encounterCount: encounterSupportWarnings.length + encounterDocumentationChecks.length + medicalNecessitySupport.nationalCues.length + medicalNecessitySupport.louisianaCues.length,
                        topSourceLabel: topSourceBlock ? `${topSourceBlock.sourceLabel} (${topSourceBlock.id})` : undefined,
                      });

                      if (!sectionPressureCues.length) {
                        return null;
                      }

                      return (
                        <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
                          <div className="text-xs font-semibold uppercase tracking-wide text-muted">Warning pressure for this section</div>
                          <div className="mt-2 grid gap-2">
                            {sectionPressureCues.map((cue) => (
                              <button
                                key={`${section.anchor}-${cue.id}`}
                                type="button"
                                onClick={() => handleSectionPressureNavigate({
                                  sectionAnchor: section.anchor,
                                  warningFamily: cue.warningFamily,
                                  sourceBlockId: topSourceBlock?.id,
                                  sourceKey: topSourceBlock?.sourceKey,
                                })}
                                className={`rounded-lg border px-3 py-2 text-left text-xs transition hover:shadow-sm ${cue.toneClassName}`}
                              >
                                <div className="font-semibold">{cue.label}</div>
                                <div className="mt-1">{cue.detail}</div>
                                <div className="mt-2 font-medium underline underline-offset-2">Jump to related warning layer</div>
                              </button>
                            ))}
                          </div>
                        </div>
                      );
                    })()}
                    <div className="mt-3 rounded-lg border border-violet-200 bg-violet-50 p-3">
                      <div className="text-xs font-semibold uppercase tracking-wide text-violet-900">Reviewer-confirmed evidence</div>
                      <p className="mt-1 text-xs text-violet-800">This records which source blocks the reviewer chose as relevant support for this section. It documents review work; it does not prove the section is medically correct.</p>
                      {getConfirmedEvidenceBlockIds(session, section.anchor).length ? (
                        <div className="mt-2 space-y-2">
                          {getConfirmedEvidenceBlockIds(session, section.anchor).map((blockId) => {
                            const block = sourceBlocks.find((item) => item.id === blockId);
                            if (!block) {
                              return null;
                            }

                            return (
                              <div key={blockId} className="rounded-lg border border-violet-200 bg-white px-3 py-2">
                                <div className="flex items-start justify-between gap-3">
                                  <div>
                                    <div className="text-xs font-semibold uppercase tracking-wide text-violet-900">{block.sourceLabel}</div>
                                    <div className="mt-1 text-sm text-ink whitespace-pre-wrap">{block.text}</div>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => handleConfirmedEvidenceToggle(section.anchor, blockId)}
                                    className="rounded-full border border-violet-200 bg-violet-50 px-2 py-1 text-[11px] font-medium text-violet-800"
                                  >
                                    Remove
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="mt-2 text-sm text-violet-900">No reviewer-confirmed evidence recorded for this section yet.</div>
                      )}
                    </div>
                    <div className="mt-3 rounded-lg border border-border bg-paper p-3">
                      <div className="text-xs font-semibold uppercase tracking-wide text-muted">Reviewer note / comment</div>
                      <p className="mt-1 text-xs text-muted">Use this for section-specific concerns, rationale, or what still needs manual confirmation.</p>
                      <textarea
                        value={reviewState?.reviewerComment || ''}
                        onChange={(event) => handleReviewerCommentChange(section.anchor, event.target.value)}
                        className="mt-2 min-h-[90px] w-full rounded-lg border border-border p-3 text-sm"
                        placeholder="Example: wording okay, but med-list conflict still needs explicit mention in final note."
                      />
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button onClick={() => handleSectionStatusChange(section.anchor, 'unreviewed')} className="rounded-full border border-border bg-white px-3 py-1.5 text-xs font-medium text-ink">Mark unreviewed</button>
                      <button onClick={() => handleSectionStatusChange(section.anchor, 'approved')} className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-800">Approve section</button>
                      <button onClick={() => handleSectionStatusChange(section.anchor, 'needs-review')} className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-900">Needs review</button>
                    </div>
                    {reviewState?.updatedAt ? (
                      <div className="mt-2 text-xs text-muted">Updated {new Date(reviewState.updatedAt).toLocaleString()}</div>
                    ) : null}
                  </div>
                );
              }) : (
                <div className="rounded-lg bg-white p-3 text-sm text-muted">Add labeled headings if you want section-by-section review anchors here.</div>
              )}
            </div>
          </div>
        </section>

        <section className="grid gap-6">
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-amber-950">Missing / Unclear Items</h2>
            <p className="mt-1 text-sm text-amber-900">These are review prompts, not completed documentation. They are here to keep uncertainty visible instead of letting polished wording hide what the source never actually said.</p>
            <ul className="mt-4 space-y-3 text-sm text-ink">
              {missingInfoFlags.length ? missingInfoFlags.map((flag) => (
                <li key={flag} className="rounded-lg border border-amber-200 bg-white p-3">{flag}</li>
              )) : <li className="rounded-lg border border-amber-200 bg-white p-3 text-muted">No missing/unclear prompts were generated from this source set.</li>}
            </ul>
            <div id="rewrite-tools-layer" className="mt-6 border-t border-amber-200 pt-4">
              <h3 className="font-medium text-amber-950">Rewrite Tools</h3>
              <p className="mt-1 text-sm text-amber-900">Use rewrite tools to reduce wording drift, not to make the note sound more complete, certain, or clinically tidy than the source supports.</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button onClick={() => handleRewrite('more-concise')} disabled={isRewriting !== null} className="rounded-lg border border-border bg-white px-3 py-2 text-sm disabled:opacity-60">{isRewriting === 'more-concise' ? 'Rewriting...' : 'More concise'}</button>
                <button onClick={() => handleRewrite('more-formal')} disabled={isRewriting !== null} className="rounded-lg border border-border bg-white px-3 py-2 text-sm disabled:opacity-60">{isRewriting === 'more-formal' ? 'Rewriting...' : 'More formal'}</button>
                <button onClick={() => handleRewrite('closer-to-source')} disabled={isRewriting !== null} className="rounded-lg border border-border bg-white px-3 py-2 text-sm disabled:opacity-60">{isRewriting === 'closer-to-source' ? 'Rewriting...' : 'Closer to source'}</button>
                <button onClick={() => handleRewrite('regenerate-full-note')} disabled={isRewriting !== null} className="rounded-lg border border-border bg-white px-3 py-2 text-sm disabled:opacity-60">{isRewriting === 'regenerate-full-note' ? 'Rewriting...' : 'Regenerate full note'}</button>
              </div>
            </div>
          </div>

          <CollapsibleReviewSection
            title="Review checklist"
            subtitle="Use this as a final manual check before finishing the note."
            toneClassName="border-border bg-white text-ink"
          >
            <h2 className="text-lg font-semibold">Review Checklist</h2>
            <div className="mt-4 space-y-3 text-sm text-ink">
              <label className="flex items-start gap-3"><input type="checkbox" checked={reviewCounts.unreviewed === 0} readOnly /> All detected sections were reviewed before export.</label>
              <label className="flex items-start gap-3"><input type="checkbox" /> Dates and timelines match source wording.</label>
              <label className="flex items-start gap-3"><input type="checkbox" /> Medications, doses, routes, frequencies, refill language, and objective data were verified against source.</label>
              <label className="flex items-start gap-3"><input type="checkbox" /> Abnormal labs, positive screens, vitals, and observed objective findings stayed visible when they mattered to assessment or plan.</label>
              <label className="flex items-start gap-3"><input type="checkbox" /> Any med-list vs patient-report conflict stayed explicit instead of being silently reconciled.</label>
              <label className="flex items-start gap-3"><input type="checkbox" /> Risk wording, MSE language, and quoted patient statements stayed faithful to the source rather than being strengthened by style.</label>
              <label className="flex items-start gap-3"><input type="checkbox" /> Uncertainty stayed uncertain and missing facts were not filled in.</label>
              <label className="flex items-start gap-3"><input type="checkbox" /> Contradictions and missing-item prompts were reviewed before export.</label>
              {isDischargeNote ? <label className="flex items-start gap-3"><input type="checkbox" /> Discharge language did not turn “improved” into “fully resolved,” and current discharge status stayed separate from earlier admission symptoms.</label> : null}
              {destinationConstraintActive ? <label className="flex items-start gap-3"><input type="checkbox" /> Destination formatting or ASCII-safe cleanup did not change meaning, certainty, or symptom timeline.</label> : null}
            </div>
          </CollapsibleReviewSection>

          <div className="rounded-xl border border-border bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold">Finish Review and Export</h2>
            <div className="mt-4 flex items-center gap-3">
              <span className={`rounded-full border px-3 py-1 text-xs font-medium ${exportReadiness.ready ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-amber-200 bg-amber-50 text-amber-900'}`}>
                {exportReadiness.ready ? 'ready to export' : 'review still open'}
              </span>
              <span className="small-muted">
                Final note copy/export stays locked until detected sections are either approved or intentionally sent back for more review.
              </span>
            </div>
            <div className="mt-4 space-y-3 text-sm text-ink">
              {exportReadiness.blockers.length ? (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                  <div className="font-medium text-amber-950">Blockers</div>
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-amber-900">
                    {exportReadiness.blockers.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              ) : (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-emerald-900">
                  All detected sections have been reviewed. Final note copy/export is available.
                </div>
              )}

              {exportReadiness.warnings.length ? (
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <div className="font-medium text-slate-900">Still worth checking</div>
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-slate-800">
                    {exportReadiness.warnings.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>

            <div className="mt-5 grid gap-4">
              <div className="rounded-lg border border-border bg-paper p-4">
                <div className="text-xs font-semibold uppercase tracking-wide text-muted">Finish actions</div>
                <p className="mt-1 text-sm text-muted">
                  Use these only after the section review work feels complete and the note still reads truthfully against source.
                </p>
                <div className="mt-3 flex flex-wrap gap-3">
                  <button onClick={handleCopy} disabled={!exportReadiness.ready} className="rounded-lg bg-accent px-5 py-3 font-medium text-white disabled:cursor-not-allowed disabled:opacity-60">Copy Note</button>
                  <button onClick={handleExportNote} disabled={!exportReadiness.ready} className="rounded-lg border border-border bg-white px-5 py-3 font-medium disabled:cursor-not-allowed disabled:opacity-60">Export .txt</button>
                </div>
              </div>

              <div className="rounded-lg border border-border bg-paper p-4">
                <div className="text-xs font-semibold uppercase tracking-wide text-muted">Secondary actions</div>
                <p className="mt-1 text-sm text-muted">
                  These help you preserve work or move between views, but they are not the main finish path.
                </p>
                <div className="mt-3 flex flex-wrap gap-3">
                  <button onClick={handleSaveDraft} className="rounded-lg border border-border bg-white px-5 py-3 font-medium">Save Draft</button>
                  <button onClick={handleExportReviewBundle} className="rounded-lg border border-border bg-white px-5 py-3 font-medium">Export Review Bundle</button>
                  {embedded ? (
                    <>
                      <button onClick={onBackToEdit} className="rounded-lg border border-border bg-white px-5 py-3 font-medium">Back to Edit</button>
                      <Link href="/dashboard/review" className="rounded-lg border border-border bg-white px-5 py-3 font-medium">Open Full Review Page</Link>
                    </>
                  ) : (
                    <>
                      <Link href="/dashboard/new-note" className="rounded-lg border border-border bg-white px-5 py-3 font-medium">Back to Edit</Link>
                      <Link href="/dashboard/new-note" className="rounded-lg border border-border bg-white px-5 py-3 font-medium">Start New Note</Link>
                    </>
                  )}
                </div>
              </div>

              {(copyMessage || exportMessage || rewriteMessage || saveMessage) ? (
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-800">
                  <div className="text-xs font-semibold uppercase tracking-wide text-muted">Recent actions</div>
                  <div className="mt-2 space-y-1">
                    {copyMessage ? <div>{copyMessage}</div> : null}
                    {exportMessage ? <div>{exportMessage}</div> : null}
                    {rewriteMessage ? <div>{rewriteMessage}</div> : null}
                    {saveMessage ? <div>{saveMessage}</div> : null}
                  </div>
                </div>
              ) : null}
            </div>
          </div>

          <div className="rounded-xl border border-sky-200 bg-sky-50 p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-sky-950">Export Profile Preview</h2>
            <p className="mt-1 text-sm text-sky-900">
              This is the export layer, not the clinical-truth layer. Review how destination cleanup will shape the note before you copy or export it.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {exportConstraintList.map((item) => (
                <span key={item} className="rounded-full border border-sky-200 bg-white px-3 py-1 text-xs font-medium text-sky-900">
                  {item}
                </span>
              ))}
            </div>
            <div className="mt-4 rounded-lg border border-sky-200 bg-white p-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-sky-900">Preview excerpt</div>
              <p className="mt-1 text-xs text-sky-800">
                This preview shows formatting cleanup such as ASCII-safe conversion and destination-friendly presentation. It should never silently improve certainty or add missing detail.
              </p>
              <pre className="mt-3 max-h-[280px] overflow-auto whitespace-pre-wrap rounded-lg border border-sky-100 bg-slate-50 p-3 text-xs text-slate-900">
                {exportPreviewText || 'No draft text available yet.'}
              </pre>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold">Copilot / Reminder Panel</h2>
            <p className="mt-1 text-sm text-muted">Documentation nudges based on the current source material. They are intentionally suggestive, not authoritative.</p>
            <div className="mt-4 space-y-3">
              {copilotSuggestions.length ? (
                copilotSuggestions.map((suggestion) => (
                  <div key={`${suggestion.title}-${suggestion.detail}`} className={`rounded-lg border p-3 text-sm ${severityClasses[suggestion.severity]}`}>
                    <div className="font-semibold">{suggestion.title}</div>
                    <p className="mt-1">{suggestion.detail}</p>
                    {suggestion.basedOn?.length ? <div className="mt-2 text-xs font-medium opacity-80">Based on: {suggestion.basedOn.join(' • ')}</div> : null}
                  </div>
                ))
              ) : (
                <div className="rounded-lg bg-paper p-3 text-sm text-muted">No extra copilot nudges were triggered from the current source material.</div>
              )}
            </div>
          </div>
        </section>
      </div>
    </>
  );
}
