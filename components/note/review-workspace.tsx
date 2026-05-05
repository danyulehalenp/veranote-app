'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { AtlasNudgeStrip, AtlasReviewDock } from '@/components/veranote/atlas-review/atlas-review-dock';
import { findProviderProfile } from '@/lib/constants/provider-profiles';
import { DEFAULT_PROVIDER_SETTINGS, type ProviderSettings } from '@/lib/constants/settings';
import { describePopulatedSourceSections, EMPTY_SOURCE_SECTIONS, normalizeSourceSections } from '@/lib/ai/source-sections';
import { countWords, parseDraftSections, reconcileSectionReviewState, type ParsedDraftSection } from '@/lib/note/review-sections';
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
import { ASSISTANT_ACTION_EVENT, publishAssistantContext } from '@/lib/veranote/assistant-context';
import { dismissLanePreferenceSuggestion, getLanePreferenceSuggestion, recordLanePreferenceSelection } from '@/lib/veranote/assistant-learning';
import { applyAssistantPersonaDefaults, resolveAssistantPersona } from '@/lib/veranote/assistant-persona';
import { buildDraftRecoveryState } from '@/lib/veranote/draft-recovery';
import {
  formatTextForOutputDestination,
  getOutputDestinationFieldTargets,
  getOutputDestinationMeta,
  getOutputNoteFocusLabel,
  inferOutputNoteFocus,
} from '@/lib/veranote/output-destinations';
import { evaluatePostNoteCptRecommendations } from '@/lib/veranote/defensibility/cpt-support';
import { buildLanePreferencePrompt } from '@/lib/veranote/preference-draft';
import { ATLAS_REVIEW_DOCK_ENABLED, buildAtlasNudges, buildAtlasReviewItems, type AtlasReviewItem } from '@/lib/veranote/atlas-review';
import {
  getAssistantPendingActionStorageKey,
  getCurrentProviderId,
  getDraftRecoveryStorageKey,
  getDraftSessionStorageKey,
} from '@/lib/veranote/provider-identity';
import {
  fetchProviderSettingsFromServer,
  readCachedProviderSettings,
  writeCachedProviderSettings,
} from '@/lib/veranote/provider-settings-client';
import { resolveVeraAddress } from '@/lib/veranote/vera-relationship';
import type { DraftRevision, DraftSession, PersistedDraftSession, ReviewStatus, SourceSections } from '@/types/session';
import type { DictationTargetSection } from '@/types/dictation';
import type { NoteSectionKey, OutputScope } from '@/lib/note/section-profiles';

const ASSISTANT_OPEN_EVENT = 'veranote-assistant-open';

type PostNoteCptRecommendations = ReturnType<typeof evaluatePostNoteCptRecommendations>;

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

function isDictationTargetSection(value: string): value is DictationTargetSection {
  return value === 'clinicianNotes' || value === 'intakeCollateral' || value === 'patientTranscript' || value === 'objectiveData';
}

function flattenDictationInsertions(insertions: DraftSession['dictationInsertions']) {
  return Object.values(insertions || {}).flatMap((records) => records || []);
}

function formatAmbientSourceLabel(sourceLabel: string, sourceKey: keyof SourceSections, ambientTranscriptHandoff?: DraftSession['ambientTranscriptHandoff']) {
  if (sourceKey === 'patientTranscript' && ambientTranscriptHandoff) {
    return 'Ambient transcript / patient conversation';
  }

  return sourceLabel;
}

function formatAmbientSourceHint(sourceKey: keyof SourceSections, fallbackHint: string, ambientTranscriptHandoff?: DraftSession['ambientTranscriptHandoff']) {
  if (sourceKey === 'patientTranscript' && ambientTranscriptHandoff) {
    return 'Reviewed ambient transcript handoff plus direct patient wording and interview chronology.';
  }

  return fallbackHint;
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

type ReviewSignalTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

function getReviewSignalClasses(tone: ReviewSignalTone) {
  switch (tone) {
    case 'success':
      return 'border-emerald-200 bg-emerald-50 text-emerald-900';
    case 'warning':
      return 'border-amber-200 bg-amber-50 text-amber-900';
    case 'danger':
      return 'border-rose-200 bg-rose-50 text-rose-900';
    case 'info':
      return 'border-sky-200 bg-sky-50 text-sky-950';
    case 'neutral':
    default:
      return 'border-slate-200 bg-slate-50 text-slate-900';
  }
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

function buildExportConstraintList(session: DraftSession | null, providerSettings: ProviderSettings) {
  const destinationMeta = getOutputDestinationMeta(providerSettings.outputDestination);
  const constraints = [
    `Destination: ${providerSettings.outputDestination}`,
    `Profile: ${destinationMeta.behavior}`,
    `ASCII-safe: ${providerSettings.asciiSafe ? 'On' : 'Off'}`,
    `Paragraph-only: ${providerSettings.paragraphOnly ? 'On' : 'Off'}`,
    `Format: ${session?.format || 'Unknown'}`,
  ];

  if (providerSettings.wellskyFriendly || destinationMeta.behavior === 'strict-template-safe') {
    constraints.push('Strict template-safe cleanup active');
  }

  if (session?.customInstructions?.trim()) {
    constraints.push('Custom provider instructions attached');
  }

  return constraints;
}

function buildExportPreviewText(draftText: string, session: DraftSession | null, providerSettings: ProviderSettings) {
  return formatTextForOutputDestination({
    text: draftText,
    destination: providerSettings.outputDestination,
    asciiSafe: providerSettings.asciiSafe,
    paragraphOnly: providerSettings.paragraphOnly || session?.format === 'Paragraph Style',
    preserveHeadings: session?.format !== 'Paragraph Style',
  });
}

function findSectionsForAliases(sections: ParsedDraftSection[], aliases: string[]) {
  const normalizedAliases = aliases.map((alias) => alias.toLowerCase());

  return sections.filter((section) => {
    const heading = section.heading.toLowerCase();
    return normalizedAliases.some((alias) => heading.includes(alias) || alias.includes(heading));
  });
}

function buildDestinationPasteTargets(
  sections: ParsedDraftSection[],
  draftText: string,
  providerSettings: ProviderSettings,
  session: DraftSession | null,
) {
  const noteFocus = providerSettings.outputNoteFocus || inferOutputNoteFocus(session?.noteType || '');
  const fieldTargets = getOutputDestinationFieldTargets(providerSettings.outputDestination, noteFocus);

  return fieldTargets.map((target) => {
    const matches = findSectionsForAliases(sections, target.aliases);
    const sectionText = matches
      .map((section) => `${section.heading}:\n${section.body}`.trim())
      .filter(Boolean)
      .join('\n\n')
      .trim();
    const text = formatTextForOutputDestination({
      text: sectionText || (target.id.endsWith('summary') || target.id.endsWith('narrative') ? draftText : ''),
      destination: providerSettings.outputDestination,
      asciiSafe: providerSettings.asciiSafe,
      paragraphOnly: providerSettings.paragraphOnly || session?.format === 'Paragraph Style',
      preserveHeadings: true,
    });

    return {
      ...target,
      text,
      matchedHeadings: matches.map((section) => section.heading),
    };
  }).filter((target) => target.text.trim().length > 0);
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
    <details className={`group aurora-soft-panel mt-3 rounded-[18px] border p-3 ${props.toneClassName}`}>
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
    <details id={props.id} open={props.defaultOpen} className={`group workspace-panel mb-4 rounded-[28px] px-5 py-5 text-sm ${props.toneClassName}`}>
      <summary className="cursor-pointer list-none">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-lg font-semibold">{props.title}</div>
            <p className="mt-2 max-w-3xl text-sm leading-7 opacity-90">{props.subtitle}</p>
          </div>
          <div className="workspace-chip inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-medium uppercase tracking-wide text-cyan-50 shadow-[0_8px_22px_rgba(4,12,24,0.18)]">
            <span className="transition-transform duration-150 group-open:rotate-90">›</span>
            <span>Open</span>
          </div>
        </div>
      </summary>
      <div className="mt-4">
        {props.children}
      </div>
    </details>
  );
}

function CompactMetric(props: {
  label: string;
  value: React.ReactNode;
  detail?: string;
}) {
  return (
    <div className="workspace-card-static rounded-[18px] px-4 py-3">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-cyan-100/62">{props.label}</div>
      <div className="mt-1 text-xl font-semibold text-white">{props.value}</div>
      {props.detail ? <div className="mt-0.5 text-xs text-cyan-50/66">{props.detail}</div> : null}
    </div>
  );
}

function InlineMetric(props: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="workspace-badge-static rounded-full px-3 py-1.5 text-xs font-medium text-cyan-50/76">
      <span className="text-white">{props.value}</span> {props.label}
    </div>
  );
}

function DrawerJumpButton(props: {
  label: string;
  targetId: string;
}) {
  return (
    <button
      type="button"
      onClick={() => {
        const target = document.getElementById(props.targetId);
        if (target) {
          target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }}
      className="workspace-chip rounded-full px-3 py-1.5 text-xs font-medium text-cyan-50 transition hover:shadow-[0_14px_32px_rgba(2,8,18,0.2)]"
    >
      {props.label}
    </button>
  );
}

function ReviewItemDisclosure(props: {
  title: React.ReactNode;
  meta?: React.ReactNode;
  summary?: React.ReactNode;
  className: string;
  children: React.ReactNode;
}) {
  return (
    <details className={`group workspace-subpanel rounded-[18px] p-3 ${props.className}`}>
      <summary className="cursor-pointer list-none">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="font-medium">{props.title}</div>
            {props.summary ? <div className="mt-1 text-xs opacity-90">{props.summary}</div> : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {props.meta ? <div className="flex flex-wrap gap-2">{props.meta}</div> : null}
            <DisclosureAffordance />
          </div>
        </div>
      </summary>
      <div className="mt-3">
        {props.children}
      </div>
    </details>
  );
}

function formatCptStrength(value: string) {
  return value.replace(/-/g, ' ');
}

function PostNoteCptSupportPanel(props: {
  assessment: PostNoteCptRecommendations;
  variant: 'embedded' | 'review';
}) {
  const isEmbedded = props.variant === 'embedded';
  const assessment = props.assessment;
  const panelClassName = isEmbedded
    ? 'mt-4 rounded-[20px] border border-amber-300/20 bg-[rgba(146,98,18,0.16)] p-4 text-sm text-amber-50'
    : 'mt-4 rounded-lg border border-amber-200 bg-white p-3 text-sm text-amber-900';
  const headingClassName = isEmbedded
    ? 'text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-100/86'
    : 'text-xs font-semibold uppercase tracking-wide text-amber-900';
  const summaryClassName = isEmbedded ? 'mt-1 leading-6 text-amber-50/88' : 'mt-1 text-sm text-amber-900';
  const badgeClassName = isEmbedded
    ? 'rounded-full border border-amber-200/24 bg-amber-300/12 px-3 py-1 text-xs font-medium text-amber-50'
    : 'rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-900';
  const metricClassName = isEmbedded
    ? 'rounded-[14px] border border-amber-200/16 bg-[rgba(255,255,255,0.08)] px-3 py-2'
    : 'rounded-lg border border-amber-100 bg-amber-50/50 px-3 py-2';
  const metricLabelClassName = isEmbedded
    ? 'text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-100/70'
    : 'text-[10px] font-semibold uppercase tracking-wide text-amber-800/70';
  const metricValueClassName = isEmbedded ? 'mt-1 font-semibold text-white' : 'mt-1 font-semibold text-amber-950';
  const guardrailClassName = isEmbedded
    ? 'mt-3 rounded-[14px] border border-amber-200/18 bg-[rgba(255,255,255,0.08)] px-3 py-2 text-xs leading-5 text-amber-50/82'
    : 'mt-3 rounded-lg border border-amber-100 bg-amber-50/60 px-3 py-2 text-xs leading-5 text-amber-900';
  const candidateClassName = isEmbedded
    ? 'rounded-[14px] border border-amber-200/16 bg-[rgba(7,18,32,0.42)] p-3'
    : 'rounded-lg border border-amber-100 bg-amber-50/40 p-3 text-sm text-amber-900';
  const codeClassName = isEmbedded
    ? 'rounded-full border border-amber-200/20 bg-white/10 px-2.5 py-0.5 text-[11px] font-semibold text-amber-50'
    : 'rounded-full border border-amber-200 bg-white px-2.5 py-0.5 text-[11px] font-semibold text-amber-900';
  const strengthClassName = isEmbedded
    ? 'rounded-full border border-amber-200/24 bg-amber-300/12 px-2.5 py-0.5 text-[11px] font-semibold capitalize text-amber-50'
    : 'rounded-full border border-amber-200 bg-white px-2.5 py-0.5 text-[11px] font-semibold capitalize text-amber-900';
  const disclosureClassName = isEmbedded
    ? 'border-amber-200/16 bg-[rgba(255,255,255,0.08)] text-amber-50'
    : 'border-amber-100 bg-white text-amber-950';
  const listClassName = isEmbedded
    ? 'list-disc space-y-1 pl-5 text-amber-50/78'
    : 'list-disc space-y-1 pl-5 text-amber-900';
  const emptyClassName = isEmbedded
    ? 'mt-4 rounded-[14px] border border-amber-200/18 bg-[rgba(255,255,255,0.08)] px-3 py-3 text-sm text-amber-50/82'
    : 'mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-900';
  const timeSignalClassName = isEmbedded
    ? 'rounded-full border border-emerald-200/20 bg-emerald-300/12 px-3 py-1 text-xs font-medium text-emerald-50'
    : 'rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-900';
  const allVerificationGaps = assessment.candidates.reduce(
    (count, candidate) => count + candidate.missingElements.length,
    assessment.missingGlobalElements.length,
  );

  return (
    <div data-testid="post-note-cpt-support-panel" className={panelClassName}>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className={headingClassName}>Post-note CPT support candidates</div>
          <p className={summaryClassName}>{assessment.summary}</p>
        </div>
        <div className={badgeClassName}>Coding support only</div>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        <div className={metricClassName}>
          <div className={metricLabelClassName}>Candidate families</div>
          <div className={metricValueClassName}>{assessment.candidates.length}</div>
        </div>
        <div className={metricClassName}>
          <div className={metricLabelClassName}>Time cues</div>
          <div className={metricValueClassName}>{assessment.timeSignals.length}</div>
        </div>
        <div className={metricClassName}>
          <div className={metricLabelClassName}>Verify gaps</div>
          <div className={metricValueClassName}>{allVerificationGaps}</div>
        </div>
      </div>

      <p data-testid="post-note-cpt-guardrail" className={guardrailClassName}>
        Not final billing advice. Do not add facts just to support a code; verify current CPT, payer, facility, telehealth, and state-specific requirements before billing.
      </p>

      {assessment.candidates.length ? (
        <div className="mt-4 grid gap-3 xl:grid-cols-2">
          {assessment.candidates.map((candidate) => (
            <div key={candidate.family} data-testid="post-note-cpt-candidate-card" className={candidateClassName}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className={isEmbedded ? 'font-semibold text-white' : 'font-semibold text-amber-950'}>{candidate.family}</div>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {candidate.candidateCodes.map((code) => (
                      <span key={code} className={codeClassName}>
                        {code}
                      </span>
                    ))}
                  </div>
                </div>
                <span data-testid="post-note-cpt-strength" className={strengthClassName}>
                  {formatCptStrength(candidate.strength)}
                </span>
              </div>
              <div className="mt-3 space-y-2">
                <ReviewItemDisclosure
                  className={disclosureClassName}
                  title="Why this surfaced"
                  summary={candidate.why[0] || 'This family matched visible note or encounter-support signals.'}
                >
                  <ul className={listClassName}>
                    {candidate.why.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </ReviewItemDisclosure>
                <ReviewItemDisclosure
                  className={disclosureClassName}
                  title="What to verify"
                  summary={candidate.missingElements[0] || 'Verify payer, facility, and current CPT requirements.'}
                >
                  <ul data-testid="post-note-cpt-verify-item" className={listClassName}>
                    {(candidate.missingElements.length ? candidate.missingElements : ['Verify payer, facility, and current CPT requirements.']).map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </ReviewItemDisclosure>
                {candidate.cautions[0] ? (
                  <div className={isEmbedded ? 'rounded-[12px] border border-amber-200/14 bg-white/5 px-3 py-2 text-xs leading-5 text-amber-50/72' : 'rounded-lg border border-amber-100 bg-white px-3 py-2 text-xs leading-5 text-amber-900'}>
                    {candidate.cautions[0]}
                  </div>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className={emptyClassName}>
          {assessment.missingGlobalElements[0] || 'The completed note does not yet show enough documentation structure for CPT-support candidates.'}
        </div>
      )}

      {assessment.timeSignals.length ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {assessment.timeSignals.slice(0, 3).map((item) => (
            <span key={item} data-testid="post-note-cpt-time-signal" className={timeSignalClassName}>
              {item}
            </span>
          ))}
        </div>
      ) : null}

      <div className={isEmbedded ? 'mt-4 rounded-[14px] border border-amber-200/16 bg-[rgba(255,255,255,0.08)] p-3 text-xs text-amber-50/78' : 'mt-4 rounded-lg border border-amber-100 bg-amber-50/40 p-3 text-xs text-amber-900'}>
        <div className="font-semibold uppercase tracking-wide">Guardrails</div>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          {assessment.guardrails.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function OptionalBadge(props: {
  className?: string;
}) {
  return (
    <div className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium uppercase tracking-wide ${props.className || 'border-white/12 bg-white/8 text-cyan-50/74'}`}>
      <span className="transition-transform duration-150 group-open:rotate-90">›</span>
      <span>Optional</span>
    </div>
  );
}

function DisclosureAffordance(props: {
  label?: string;
  className?: string;
}) {
  return (
    <div className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium uppercase tracking-wide ${props.className || 'border-white/12 bg-white/8 text-cyan-50/74'}`}>
      <span className="transition-transform duration-150 group-open:rotate-90">›</span>
      <span>{props.label || 'Details'}</span>
    </div>
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

function buildReviewStageItems(input: {
  reviewCounts: { approved: number; needsReview: number; unreviewed: number };
  exportReady: boolean;
  focusedSectionHeading?: string;
}) {
  const reviewOpenCount = input.reviewCounts.unreviewed + input.reviewCounts.needsReview;

  return [
    {
      id: 'source-intake',
      label: 'Source intake',
      detail: 'Source and draft are already loaded into the review workspace.',
      status: 'complete',
    },
    {
      id: 'draft-shaping',
      label: 'Draft shaping',
      detail: input.focusedSectionHeading ? `${input.focusedSectionHeading} is currently in focus.` : 'Draft text is available for manual shaping.',
      status: 'complete',
    },
    {
      id: 'review',
      label: 'Review',
      detail: reviewOpenCount
        ? `${reviewOpenCount} section${reviewOpenCount === 1 ? '' : 's'} still need attention.`
        : 'All detected sections have been reviewed.',
      status: input.exportReady ? 'complete' : 'active',
    },
    {
      id: 'finish',
      label: 'Finish',
      detail: input.exportReady
        ? 'Copy and export are ready without leaving this workspace.'
        : 'Finish becomes active once the open review items are cleared.',
      status: input.exportReady ? 'active' : 'upcoming',
    },
  ] as const;
}

function getReviewStageTone(status: 'complete' | 'active' | 'upcoming') {
  if (status === 'complete') {
    return 'border-emerald-200/24 bg-[rgba(20,83,45,0.22)] text-emerald-100';
  }

  if (status === 'active') {
    return 'border-cyan-200/24 bg-[rgba(18,181,208,0.14)] text-cyan-50';
  }

  return 'border-cyan-200/10 bg-[rgba(13,30,50,0.56)] text-cyan-50/70';
}

function buildReviewReasonTags(input: {
  hasObjectiveConflict: boolean;
  hasTrustCues: boolean;
  hasDestinationConstraint: boolean;
  hasHighRiskWarnings: boolean;
  hasDiagnosisCues: boolean;
}) {
  const tags: Array<{ id: string; label: string; targetId: string }> = [];

  if (input.hasTrustCues || input.hasObjectiveConflict) {
    tags.push({ id: 'too-strong-for-source', label: 'Too strong for source', targetId: 'phase-two-trust-layer' });
  }

  if (input.hasObjectiveConflict) {
    tags.push({ id: 'needs-attribution', label: 'Needs attribution', targetId: 'objective-warning-layer' });
  }

  if (input.hasHighRiskWarnings || input.hasDiagnosisCues) {
    tags.push({ id: 'timeline-unclear', label: 'Timeline unclear', targetId: input.hasDiagnosisCues ? 'diagnosis-warning-layer' : 'high-risk-warning-layer' });
  }

  if (input.hasDestinationConstraint) {
    tags.push({ id: 'destination-fit', label: 'Destination fit', targetId: 'active-output-profile-layer' });
  }

  return tags.slice(0, 4);
}

function buildSectionReviewReasonTags(input: {
  sectionHeading: string;
  claimSupportCues: SectionClaimSupportCue[];
  pressureCues: SectionPressureCue[];
  hasEvidenceLinks: boolean;
}) {
  const tags: Array<{ id: string; label: string; toneClassName: string }> = [];
  const thinClaimCue = input.claimSupportCues.find((cue) => cue.statusLabel === 'Review support looks thin');
  const partialClaimCue = input.claimSupportCues.find((cue) => cue.statusLabel === 'Partial source support');
  const heading = input.sectionHeading.toLowerCase();

  if (thinClaimCue) {
    tags.push({
      id: 'thin-support',
      label: /assessment|diagnosis|impression|formulation/.test(heading) ? 'Diagnosis outruns evidence' : 'Support looks thin',
      toneClassName: 'border-amber-200 bg-amber-50 text-amber-950',
    });
  } else if (partialClaimCue) {
    tags.push({
      id: 'partial-support',
      label: 'Needs attribution',
      toneClassName: 'border-sky-200 bg-sky-50 text-sky-950',
    });
  }

  if (!input.hasEvidenceLinks) {
    tags.push({
      id: 'no-evidence',
      label: 'No linked source yet',
      toneClassName: 'border-slate-200 bg-slate-50 text-slate-900',
    });
  }

  input.pressureCues.forEach((cue) => {
    if (cue.warningFamily === 'objective-warning-layer') {
      tags.push({ id: 'objective', label: 'Objective facts need check', toneClassName: cue.toneClassName });
    }
    if (cue.warningFamily === 'diagnosis-warning-layer') {
      tags.push({ id: 'diagnosis', label: 'Diagnosis pressure', toneClassName: cue.toneClassName });
    }
    if (cue.warningFamily === 'terminology-warning-layer') {
      tags.push({ id: 'terminology', label: 'Timeline or wording unclear', toneClassName: cue.toneClassName });
    }
    if (cue.warningFamily === 'medication-warning-layer') {
      tags.push({ id: 'medication', label: 'Medication facts need check', toneClassName: cue.toneClassName });
    }
    if (cue.warningFamily === 'high-risk-warning-layer') {
      tags.push({ id: 'risk', label: 'High-risk wording', toneClassName: cue.toneClassName });
    }
    if (cue.warningFamily === 'encounter-warning-layer') {
      tags.push({ id: 'encounter', label: 'Encounter or destination fit', toneClassName: cue.toneClassName });
    }
  });

  return unique(tags.map((tag) => tag.id)).map((id) => tags.find((tag) => tag.id === id)!).slice(0, 4);
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
  const { data: authSession } = useSession();
  const [session, setSession] = useState<DraftSession | null>(initialSession);
  const [providerSettings, setProviderSettings] = useState<ProviderSettings>(DEFAULT_PROVIDER_SETTINGS);
  const [draftText, setDraftText] = useState(initialSession?.note || '');
  const [isHydrating, setIsHydrating] = useState(!initialSession);
  const [copyMessage, setCopyMessage] = useState('');
  const [exportMessage, setExportMessage] = useState('');
  const [rewriteMessage, setRewriteMessage] = useState('');
  const [saveMessage, setSaveMessage] = useState('');
  const [interactionMessage, setInteractionMessage] = useState('');
  const [activeSourceKey, setActiveSourceKey] = useState<keyof SourceSections | 'combined'>('combined');
  const [isRewriting, setIsRewriting] = useState<RewriteMode | null>(null);
  const [focusedSectionAnchor, setFocusedSectionAnchor] = useState<string | null>(null);
  const [focusedEvidenceBlockId, setFocusedEvidenceBlockId] = useState<string | null>(null);
  const reviewAutoFocusSeedRef = useRef<string | null>(null);
  const [lanePreferenceSuggestion, setLanePreferenceSuggestion] = useState<ReturnType<typeof getLanePreferenceSuggestion>>(null);
  const draftTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const latestSessionRef = useRef<DraftSession | null>(initialSession);
  const resolvedProviderIdentityId = authSession?.user?.providerIdentityId || getCurrentProviderId();
  const draftSessionStorageKey = getDraftSessionStorageKey(resolvedProviderIdentityId);
  const draftRecoveryStorageKey = getDraftRecoveryStorageKey(resolvedProviderIdentityId);
  const assistantPendingActionStorageKey = getAssistantPendingActionStorageKey(resolvedProviderIdentityId);
  const activeProviderProfile = useMemo(() => findProviderProfile(providerSettings.providerProfileId), [providerSettings.providerProfileId]);
  const assistantPersona = useMemo(() => resolveAssistantPersona(providerSettings), [providerSettings]);
  const activeDestinationMeta = useMemo(
    () => getOutputDestinationMeta(providerSettings.outputDestination),
    [providerSettings.outputDestination],
  );
  const activeOutputProfile = useMemo(
    () => providerSettings.outputProfiles.find((profile) => profile.id === providerSettings.activeOutputProfileId) || null,
    [providerSettings.activeOutputProfileId, providerSettings.outputProfiles],
  );
  const draftSections = useMemo(() => parseDraftSections(draftText), [draftText]);
  const reconciledSectionReviewState = useMemo(
    () => reconcileSectionReviewState(draftSections, session?.sectionReviewState),
    [draftSections, session?.sectionReviewState],
  );

  async function handleApplyOutputProfile(profileId: string) {
    if (!profileId) {
      const nextSettings = applyAssistantPersonaDefaults({
        ...providerSettings,
        activeOutputProfileId: '',
      });

      setProviderSettings(nextSettings);
      writeCachedProviderSettings(resolvedProviderIdentityId, nextSettings);
      return;
    }

    const profile = providerSettings.outputProfiles.find((item) => item.id === profileId);
    if (!profile) {
      return;
    }

    const nextSettings = applyAssistantPersonaDefaults({
      ...providerSettings,
      outputDestination: profile.destination,
      outputNoteFocus: profile.noteFocus,
      asciiSafe: profile.asciiSafe,
      paragraphOnly: profile.paragraphOnly,
      wellskyFriendly: profile.wellskyFriendly,
      activeOutputProfileId: profile.id,
    });

    setProviderSettings(nextSettings);
    writeCachedProviderSettings(resolvedProviderIdentityId, nextSettings);

    try {
      await fetch('/api/settings/provider', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...nextSettings, providerId: resolvedProviderIdentityId }),
      });
    } catch {
      // Review can continue with local settings if backend persistence is unavailable.
    }
  }

  function persistDraftRecovery(nextSession: DraftSession, workflowStage: 'compose' | 'review' = 'review') {
    const recoveryState = buildDraftRecoveryState(nextSession, {
      workflowStage,
      composeLane: nextSession.recoveryState?.composeLane || 'finish',
      lastOpenedAt: new Date().toISOString(),
    });

    localStorage.setItem(draftRecoveryStorageKey, JSON.stringify({
      draftId: nextSession.draftId || null,
      recoveryState,
    }));
  }

  function cacheDraftSession(nextSession: DraftSession, workflowStage: 'compose' | 'review' = 'review') {
    latestSessionRef.current = nextSession;
    localStorage.setItem(draftSessionStorageKey, JSON.stringify(nextSession));
    persistDraftRecovery(nextSession, workflowStage);
  }

  function commitDraftSession(nextSession: DraftSession, workflowStage: 'compose' | 'review' = 'review') {
    latestSessionRef.current = nextSession;
    setSession(nextSession);
    cacheDraftSession(nextSession, workflowStage);
  }

  function buildLatestReviewSession() {
    const baseSession = latestSessionRef.current || session;
    if (!baseSession) {
      return null;
    }

    return {
      ...baseSession,
      note: draftText,
      sectionReviewState: reconcileSectionReviewState(draftSections, baseSession.sectionReviewState),
    } satisfies DraftSession;
  }

  useEffect(() => {
    if (!initialSession) {
      return;
    }

    latestSessionRef.current = initialSession;
    setSession(initialSession);
    setDraftText(initialSession.note || '');
    setIsHydrating(false);
  }, [initialSession]);

  useEffect(() => {
    if (initialSession) {
      return;
    }

    async function hydrateDraft() {
      const raw = localStorage.getItem(draftSessionStorageKey);

      if (raw) {
        try {
          const parsed = JSON.parse(raw) as DraftSession;
          if (parsed.providerIdentityId && parsed.providerIdentityId !== resolvedProviderIdentityId) {
            throw new Error('Mismatched provider draft session.');
          }
          latestSessionRef.current = parsed;
          setSession(parsed);
          setDraftText(parsed.note);
          setIsHydrating(false);
          return;
        } catch {
          localStorage.removeItem(draftSessionStorageKey);
          localStorage.removeItem(draftRecoveryStorageKey);
        }
      }

      try {
        const response = await fetch(`/api/drafts/latest?providerId=${encodeURIComponent(resolvedProviderIdentityId)}`, { cache: 'no-store' });
        const data = (await response.json()) as { draft?: PersistedDraftSession | null };
        const parsed = data?.draft;

        if (parsed) {
          latestSessionRef.current = parsed;
          setSession(parsed);
          setDraftText(parsed.note);
          localStorage.setItem(draftSessionStorageKey, JSON.stringify(parsed));
          localStorage.setItem(draftRecoveryStorageKey, JSON.stringify({
            draftId: parsed.id,
            recoveryState: parsed.recoveryState,
          }));
        }
      } catch {
        // Keep the review screen graceful if backend restore is unavailable.
      } finally {
        setIsHydrating(false);
      }
    }

    void hydrateDraft();
  }, [draftRecoveryStorageKey, draftSessionStorageKey, initialSession, resolvedProviderIdentityId]);

  useEffect(() => {
    setLanePreferenceSuggestion(getLanePreferenceSuggestion(session?.noteType, resolvedProviderIdentityId));
  }, [resolvedProviderIdentityId, session?.noteType]);

  useEffect(() => {
    let isActive = true;
    const controller = new AbortController();

    async function hydrateProviderSettings() {
      const cached = readCachedProviderSettings(resolvedProviderIdentityId);
      if (cached && isActive) {
        setProviderSettings(cached);
      }

      try {
        const merged = await fetchProviderSettingsFromServer(resolvedProviderIdentityId, controller.signal);
        writeCachedProviderSettings(resolvedProviderIdentityId, merged);
        if (isActive) {
          setProviderSettings(merged);
        }
      } catch {
        if (!cached && isActive) {
          // Leave defaults in place if provider settings are unavailable.
          setProviderSettings(DEFAULT_PROVIDER_SETTINGS);
        }
      }
    }

    void hydrateProviderSettings();

    return () => {
      isActive = false;
      controller.abort();
    };
  }, [resolvedProviderIdentityId]);

  useEffect(() => {
    publishAssistantContext({
      stage: 'review',
      userAiName: assistantPersona.name,
      userAiRole: assistantPersona.role,
      userAiAvatar: assistantPersona.avatar,
      noteType: session?.noteType,
      specialty: session?.specialty,
      currentDraftText: draftText ? draftText.slice(0, 4000) : undefined,
      currentDraftWordCount: draftText ? countWords(draftText) : undefined,
      currentDraftSectionHeadings: draftSections.map((section) => section.heading).slice(0, 12),
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
    assistantPersona.avatar,
    assistantPersona.name,
    assistantPersona.role,
    draftText,
    draftSections,
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
        type: 'replace-preferences' | 'append-preferences' | 'create-preset-draft' | 'jump-to-source-evidence' | 'run-review-rewrite' | 'apply-conservative-rewrite' | 'apply-note-revision' | 'apply-draft-rewrite';
        instructions: string;
        presetName?: string;
        rewriteMode?: RewriteMode;
        originalText?: string;
        replacementText?: string;
        revisionText?: string;
        targetSectionHeading?: string;
        draftText?: string;
        rewriteLabel?: string;
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

      if (nextEvent.detail.type === 'apply-draft-rewrite' && nextEvent.detail.draftText) {
        void applyAssistantDraftRewrite(nextEvent.detail.draftText, nextEvent.detail.rewriteLabel || 'Assistant rewrite');
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
  });

  useEffect(() => {
    if (!session) {
      return;
    }

    const updatedSession: DraftSession = {
      ...session,
      note: draftText,
      sectionReviewState: reconciledSectionReviewState,
    };

    latestSessionRef.current = updatedSession;
    localStorage.setItem(draftSessionStorageKey, JSON.stringify(updatedSession));
    persistDraftRecovery(updatedSession);
  }, [draftRecoveryStorageKey, draftSessionStorageKey, draftText, reconciledSectionReviewState, session]);

  async function persistDraft(nextSession: DraftSession) {
    try {
      const response = await fetch('/api/drafts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...nextSession,
          providerId: resolvedProviderIdentityId,
        }),
      });

      if (!response.ok) {
        return nextSession;
      }

      const data = await response.json() as { draft?: PersistedDraftSession };
      if (data.draft) {
        cacheDraftSession(data.draft);
        return data.draft;
      }
    } catch {
      // Prototype still works with local persistence if backend save fails.
    }

    return nextSession;
  }

  function buildDraftRevision(label: string, source: DraftRevision['source'], note: string): DraftRevision {
    return {
      id: `draft_revision_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      label,
      source,
      note,
      createdAt: new Date().toISOString(),
      wordCount: countWords(note),
    };
  }

  function appendDraftRevision(
    baseSession: DraftSession,
    previousNote: string,
    label: string,
    source: DraftRevision['source'],
  ) {
    const trimmedPrevious = previousNote.trim();
    if (!trimmedPrevious) {
      return baseSession.draftRevisions || [];
    }

    const existing = baseSession.draftRevisions || [];
    const latest = existing[existing.length - 1];
    if (latest?.note.trim() === trimmedPrevious) {
      return existing;
    }

    return [...existing, buildDraftRevision(label, source, previousNote)].slice(-20);
  }

  function buildDraftChangeSession(
    nextDraft: string,
    revisionLabel: string,
    revisionSource: DraftRevision['source'],
  ) {
    const baseSession = buildLatestReviewSession();
    if (!baseSession) {
      return null;
    }

    return {
      ...baseSession,
      note: nextDraft,
      draftRevisions: appendDraftRevision(baseSession, draftText, revisionLabel, revisionSource),
      sectionReviewState: reconcileSectionReviewState(parseDraftSections(nextDraft), baseSession.sectionReviewState),
    } satisfies DraftSession;
  }

  async function commitDraftTextChange(
    nextDraft: string,
    revisionLabel: string,
    revisionSource: DraftRevision['source'],
    successMessage: string,
  ) {
    const normalizedDraft = nextDraft.trim();
    if (!normalizedDraft) {
      setRewriteMessage('Unable to apply an empty draft update.');
      window.setTimeout(() => setRewriteMessage(''), 2500);
      return;
    }

    if (normalizedDraft === draftText.trim()) {
      setRewriteMessage('That rewrite already matches the current draft.');
      window.setTimeout(() => setRewriteMessage(''), 2500);
      return;
    }

    const nextSession = buildDraftChangeSession(normalizedDraft, revisionLabel, revisionSource);
    if (!nextSession) {
      setRewriteMessage('No active draft found to update.');
      window.setTimeout(() => setRewriteMessage(''), 2500);
      return;
    }

    setDraftText(normalizedDraft);
    commitDraftSession(nextSession);
    const persistedSession = await persistDraft(nextSession);
    commitDraftSession(persistedSession);
    setRewriteMessage(successMessage);
    window.setTimeout(() => setRewriteMessage(''), 3200);
  }

  async function applyAssistantDraftRewrite(rewrittenDraft: string, rewriteLabel: string) {
    await commitDraftTextChange(
      rewrittenDraft,
      `Before ${rewriteLabel}`,
      'assistant-rewrite',
      `Applied ${assistantPersona.name} rewrite to Draft. Prior version saved in history.`,
    );
  }

  async function handleRestoreDraftRevision(revision: DraftRevision) {
    await commitDraftTextChange(
      revision.note,
      `Before restoring ${revision.label}`,
      'manual-restore',
      `Restored "${revision.label}" into Draft. The replaced version was saved in history.`,
    );
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
    }, resolvedProviderIdentityId);
    setLanePreferenceSuggestion(getLanePreferenceSuggestion(session.noteType, resolvedProviderIdentityId));
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

    localStorage.setItem(assistantPendingActionStorageKey, JSON.stringify({
      type: 'append-preferences',
      instructions,
    }));

    if (embedded && onBackToEdit) {
      onBackToEdit();
      return;
    }

    router.push('/#workspace');
  }

  async function handleCopy(mode: 'ehr-safe' | 'plain-text' = 'ehr-safe') {
    if (!exportReadiness.ready) {
      setCopyMessage('Finish section review before copying the final note text.');
      window.setTimeout(() => setCopyMessage(''), 2500);
      return;
    }

    try {
      const textToCopy = mode === 'plain-text'
        ? draftText.trim()
        : exportPreviewText;

      await navigator.clipboard.writeText(textToCopy);
      rememberLanePreferenceFromReview();
      setCopyMessage(mode === 'plain-text' ? 'Plain text copied.' : `${activeDestinationMeta.summaryLabel} copy ready.`);
      window.setTimeout(() => setCopyMessage(''), 2000);
    } catch {
      setCopyMessage('Unable to copy note automatically on this browser.');
      window.setTimeout(() => setCopyMessage(''), 2500);
    }
  }

  async function handleCopyDestinationField(label: string, text: string) {
    if (!exportReadiness.ready) {
      setCopyMessage('Finish section review before copying destination fields.');
      window.setTimeout(() => setCopyMessage(''), 2500);
      return;
    }

    try {
      await navigator.clipboard.writeText(text);
      setCopyMessage(`${label} copied.`);
      window.setTimeout(() => setCopyMessage(''), 2000);
    } catch {
      setCopyMessage('Unable to copy destination field automatically on this browser.');
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
      const blob = new Blob([exportPreviewText], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      rememberLanePreferenceFromReview();
      setExportMessage(`${activeDestinationMeta.summaryLabel} export ready.`);
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
        draftRevisions: appendDraftRevision(session, draftText, `Before ${mode.replace(/-/g, ' ')} rewrite`, 'review-rewrite'),
        sectionReviewState: reconcileSectionReviewState(parseDraftSections(data.note), session.sectionReviewState),
        mode: data.mode ?? session.mode,
        warning: typeof data.warning === 'string' ? data.warning : session.warning,
      } as DraftSession;

      setDraftText(data.note);
      const persistedSession = await persistDraft(nextSession);
      commitDraftSession(persistedSession);

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

  function flashInteractionMessage(message: string, duration = 2200) {
    setInteractionMessage(message);
    window.setTimeout(() => setInteractionMessage(''), duration);
  }

  function handleAtlasAsk(item: AtlasReviewItem) {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(ASSISTANT_OPEN_EVENT));
    }

    flashInteractionMessage(`${assistantPersona.name} opened for ${item.group.toLowerCase()} review.`);
  }

  function handleAtlasShowSource(item: AtlasReviewItem) {
    if (!item.sourceReference?.targetId) {
      return;
    }

    jumpToElementById(item.sourceReference.targetId);
    flashInteractionMessage(`Opened ${item.sourceReference.label.toLowerCase()}.`);
  }

  function handleSectionStatusChange(anchor: string, status: ReviewStatus) {
    const baseSession = buildLatestReviewSession();
    if (!baseSession) {
      return;
    }

    const currentReviewState = baseSession.sectionReviewState || {};
    const nextSession: DraftSession = {
      ...baseSession,
      note: draftText,
      sectionReviewState: {
        ...currentReviewState,
        [anchor]: {
          heading: currentReviewState[anchor]?.heading || 'Section',
          status,
          updatedAt: new Date().toISOString(),
          confirmedEvidenceBlockIds: currentReviewState[anchor]?.confirmedEvidenceBlockIds || [],
          reviewerComment: currentReviewState[anchor]?.reviewerComment || '',
        },
      },
    };

    commitDraftSession(nextSession);
    const sectionHeading = draftSections.find((section) => section.anchor === anchor)?.heading || 'Section';
    flashInteractionMessage(`${sectionHeading} marked ${status.replace('-', ' ')}.`);
  }

  function jumpToElementById(id: string) {
    const node = document.getElementById(id);
    if (!node) {
      return;
    }

    node.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function handleJumpToFirstOpenSection() {
    const nextSection = draftSections.find((section) => {
      const status = reconciledSectionReviewState[section.anchor]?.status || 'unreviewed';
      return status === 'needs-review' || status === 'unreviewed';
    });

    if (!nextSection) {
      flashInteractionMessage('No open section review items found.');
      return;
    }

    setFocusedSectionAnchor(nextSection.anchor);
    jumpToElementById(nextSection.anchor);
    flashInteractionMessage(`Jumped to ${nextSection.heading}.`);
  }

  function handleJumpToFinishPriority() {
    if (reviewCounts.needsReview || reviewCounts.unreviewed) {
      handleJumpToFirstOpenSection();
      return;
    }

    if (phaseTwoTrustCues.length) {
      const priorityTarget = phaseTwoTrustCues[0]?.warningFamily || 'phase-two-trust-layer';
      const priorityAnchor = phaseTwoTrustCues[0]?.sectionAnchor;

      if (priorityAnchor) {
        setFocusedSectionAnchor(priorityAnchor);
      }

      jumpToElementById(priorityTarget);
      flashInteractionMessage('Jumped to the highest-priority finish cue.');
      return;
    }

    if (destinationConstraintActive) {
      jumpToElementById('active-output-profile-layer');
      flashInteractionMessage('Jumped to destination fit guidance.');
      return;
    }

    flashInteractionMessage('Finish lane is already clear.');
  }

  function handleConfirmedEvidenceToggle(anchor: string, blockId: string) {
    const baseSession = buildLatestReviewSession();
    if (!baseSession) {
      return;
    }

    const currentReviewState = baseSession.sectionReviewState || {};
    const currentIds = currentReviewState[anchor]?.confirmedEvidenceBlockIds || [];
    const confirmedEvidenceBlockIds = currentIds.includes(blockId)
      ? currentIds.filter((item) => item !== blockId)
      : unique([...currentIds, blockId]);

    const nextSession: DraftSession = {
      ...baseSession,
      note: draftText,
      sectionReviewState: {
        ...currentReviewState,
        [anchor]: {
          heading: currentReviewState[anchor]?.heading || 'Section',
          status: currentReviewState[anchor]?.status || 'unreviewed',
          updatedAt: new Date().toISOString(),
          confirmedEvidenceBlockIds,
          reviewerComment: currentReviewState[anchor]?.reviewerComment || '',
        },
      },
    };

    commitDraftSession(nextSession);
    const sectionHeading = draftSections.find((section) => section.anchor === anchor)?.heading || 'Section';
    const block = sourceBlocks.find((item) => item.id === blockId);
    const isAdding = confirmedEvidenceBlockIds.includes(blockId);
    flashInteractionMessage(
      isAdding
        ? `${sectionHeading}: confirmed ${block?.sourceLabel || 'source block'}.`
        : `${sectionHeading}: removed confirmed ${block?.sourceLabel || 'source block'}.`,
      2400,
    );
  }

  function handleReviewerCommentChange(anchor: string, reviewerComment: string) {
    const baseSession = buildLatestReviewSession();
    if (!baseSession) {
      return;
    }

    const currentReviewState = baseSession.sectionReviewState || {};
    const nextSession: DraftSession = {
      ...baseSession,
      note: draftText,
      sectionReviewState: {
        ...currentReviewState,
        [anchor]: {
          heading: currentReviewState[anchor]?.heading || 'Section',
          status: currentReviewState[anchor]?.status || 'unreviewed',
          updatedAt: new Date().toISOString(),
          confirmedEvidenceBlockIds: currentReviewState[anchor]?.confirmedEvidenceBlockIds || [],
          reviewerComment,
        },
      },
    };

    commitDraftSession(nextSession);
  }

  async function handleSaveDraft() {
    const nextSession = buildLatestReviewSession();
    if (!nextSession) {
      return;
    }

    const persistedSession = await persistDraft(nextSession);
    commitDraftSession(persistedSession);
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
    flashInteractionMessage('Focused the related sentence in the draft.');
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
    flashInteractionMessage('Focused the related text in the draft.');
  }

  function replaceDraftSentence(originalText: string, replacementText: string) {
    const start = draftText.indexOf(originalText);
    if (start < 0) {
      setRewriteMessage('Unable to find that exact sentence in the current draft.');
      window.setTimeout(() => setRewriteMessage(''), 2500);
      return;
    }

    const nextDraft = `${draftText.slice(0, start)}${replacementText}${draftText.slice(start + originalText.length)}`;
    void commitDraftTextChange(
      nextDraft,
      'Before focused conservative rewrite',
      'focused-revision',
      'Applied a more cautious revision. Prior version saved in history.',
    ).then(() => {
      window.setTimeout(() => focusDraftSentence(replacementText), 0);
    });
  }

  function replaceFirstDraftMatch(originalText: string, replacementText: string) {
    const start = draftText.toLowerCase().indexOf(originalText.toLowerCase());
    if (start < 0) {
      setRewriteMessage('Unable to find that exact term in the current draft.');
      window.setTimeout(() => setRewriteMessage(''), 2500);
      return;
    }

    const nextDraft = `${draftText.slice(0, start)}${replacementText}${draftText.slice(start + originalText.length)}`;
    void commitDraftTextChange(
      nextDraft,
      'Before safer wording replacement',
      'focused-revision',
      'Applied a safer wording replacement. Prior version saved in history.',
    ).then(() => {
      window.setTimeout(() => focusDraftMatch(replacementText), 0);
    });
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
        void commitDraftTextChange(
          nextDraft,
          `Before ${assistantPersona.name} section revision`,
          'focused-revision',
          `Applied ${assistantPersona.name} revision in ${targetSectionHeading}. Prior version saved in history.`,
        ).then(() => {
          window.setTimeout(() => focusDraftMatch(normalizedRevision), 0);
        });
        return;
      }
    }

    const nextDraft = `${draftText.trim()}\n\n${normalizedRevision}`.trim();
    void commitDraftTextChange(
      nextDraft,
      `Before ${assistantPersona.name} appended revision`,
      'focused-revision',
      `Applied ${assistantPersona.name} revision to Draft. Prior version saved in history.`,
    ).then(() => {
      window.setTimeout(() => focusDraftMatch(normalizedRevision), 0);
    });
  }

  const flagItems = useMemo(() => session?.flags ?? [], [session]);
  const { contradictionFlags, missingInfoFlags } = useMemo(() => splitFlags(flagItems), [flagItems]);
  const sourceSections = useMemo(() => normalizeSourceSections(session?.sourceSections || EMPTY_SOURCE_SECTIONS), [session]);
  const ambientTranscriptHandoff = useMemo(() => session?.ambientTranscriptHandoff || null, [session]);
  const dictationInsertions = useMemo(() => session?.dictationInsertions || {}, [session]);
  const totalDictationInsertionCount = useMemo(
    () => flattenDictationInsertions(dictationInsertions).length,
    [dictationInsertions],
  );
  const sourceSectionLabels = useMemo(() => describePopulatedSourceSections(sourceSections), [sourceSections]);
  const sourcePanels = useMemo(
    () => sourceSectionMeta.map((meta) => ({
      ...meta,
      label: formatAmbientSourceLabel(meta.label, meta.key, ambientTranscriptHandoff || undefined),
      hint: formatAmbientSourceHint(meta.key, meta.hint, ambientTranscriptHandoff || undefined),
      value: sourceSections[meta.key].trim(),
    })),
    [ambientTranscriptHandoff, sourceSections],
  );
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
  const sourceBlocks = useMemo(
    () => buildSourceBlocks(sourceSections).map((block) => ({
      ...block,
      sourceLabel: formatAmbientSourceLabel(block.sourceLabel, block.sourceKey, ambientTranscriptHandoff || undefined),
    })),
    [ambientTranscriptHandoff, sourceSections],
  );
  const activeDictationInsertions = useMemo(() => {
    if (activeSourceKey === 'combined') {
      return flattenDictationInsertions(dictationInsertions);
    }

    return isDictationTargetSection(activeSourceKey) ? dictationInsertions[activeSourceKey] || [] : [];
  }, [activeSourceKey, dictationInsertions]);
  const isDischargeNote = useMemo(() => looksLikeDischargeNote(session?.noteType || ''), [session?.noteType]);
  const dischargeTimelineBuckets = useMemo(
    () => (isDischargeNote ? buildDischargeTimelineBuckets(sourceBlocks) : []),
    [isDischargeNote, sourceBlocks],
  );
  const ambientTranscriptSummary = useMemo(() => {
    if (!ambientTranscriptHandoff) {
      return null;
    }

    return {
      transcriptEventCount: ambientTranscriptHandoff.transcriptEventCount,
      reviewFlagCount: ambientTranscriptHandoff.reviewFlagCount,
      unresolvedSpeakerTurnCount: ambientTranscriptHandoff.unresolvedSpeakerTurnCount,
      transcriptReadyForSource: ambientTranscriptHandoff.transcriptReadyForSource,
      committedAtLabel: new Date(ambientTranscriptHandoff.committedAt).toLocaleString(),
      sourceBlocks: sourceBlocks.filter((block) => block.sourceKey === 'patientTranscript').length,
    };
  }, [ambientTranscriptHandoff, sourceBlocks]);
  const sectionEvidenceMap = useMemo(() => buildSectionEvidenceMap(draftSections, sourceSections), [draftSections, sourceSections]);
  const focusedSectionEvidence = focusedSectionAnchor ? sectionEvidenceMap[focusedSectionAnchor] : null;
  const focusedEvidenceBlock = useMemo(
    () => focusedEvidenceBlockId ? sourceBlocks.find((block) => block.id === focusedEvidenceBlockId) || null : null,
    [focusedEvidenceBlockId, sourceBlocks],
  );
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
  const copilotSuggestions = session?.copilotSuggestions ?? [];
  const objectiveReview = useMemo(
    () => buildObjectiveReviewState({
      sourceBlocks,
      sourceSections,
      sourceInput: session?.sourceInput || '',
      draftText,
      contradictionFlags,
      highRiskWarnings,
      copilotSuggestions,
    }),
    [contradictionFlags, copilotSuggestions, draftText, highRiskWarnings, session?.sourceInput, sourceBlocks, sourceSections],
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
      `Paste profile: ${activeDestinationMeta.behavior}`,
      `Note focus: ${getOutputNoteFocusLabel(providerSettings.outputNoteFocus || inferOutputNoteFocus(session?.noteType || ''))}`,
    ];

    if (providerSettings.asciiSafe) {
      highlights.push('ASCII-safe cleanup');
    }

    if (providerSettings.paragraphOnly || session?.format === 'Paragraph Style') {
      highlights.push('Paragraph-only output');
    }

    if (providerSettings.wellskyFriendly || activeDestinationMeta.behavior === 'strict-template-safe') {
      highlights.push('Strict template-safe formatting');
    }

    if (session?.customInstructions?.trim()) {
      highlights.push('Provider-specific instructions attached');
    }

    highlights.push(activeDestinationMeta.pasteExpectation);

    return highlights;
  }, [activeDestinationMeta, providerSettings, session]);
  const exportPreviewText = useMemo(
    () => buildExportPreviewText(draftText, session, providerSettings),
    [draftText, providerSettings, session],
  );
  const destinationPasteTargets = useMemo(
    () => buildDestinationPasteTargets(draftSections, draftText, providerSettings, session),
    [draftSections, draftText, providerSettings, session],
  );
  const destinationPastePath = useMemo(() => {
    const noteFocusLabel = getOutputNoteFocusLabel(providerSettings.outputNoteFocus || inferOutputNoteFocus(session?.noteType || ''));

    if (activeDestinationMeta.behavior === 'section-paste') {
      return {
        label: 'Section-by-section paste path',
        detail: `${activeDestinationMeta.summaryLabel} often works best when providers paste into separate encounter fields instead of dropping one long note body.`,
        steps: [
          'Start with the main narrative field such as Subjective, HPI, or Follow Up.',
          'Paste MSE or observations next if the destination separates mental-status content.',
          'Finish with Assessment and Plan so the chart mirrors the EHR field order.',
        ],
      };
    }

    if (activeDestinationMeta.behavior === 'strict-template-safe') {
      return {
        label: 'Whole-note first paste path',
        detail: `${activeDestinationMeta.summaryLabel} is optimized for flatter, stricter templates, so the EHR-safe whole-note copy is usually the safest first move.`,
        steps: [
          'Use Copy EHR-safe first so punctuation, spacing, and headings stay template-safe.',
          'If the destination still splits fields, use the Narrative or Assessment/Plan copy targets below as a fallback.',
          'Do one last visual scan after paste to confirm cleanup did not flatten uncertainty or timing nuance.',
        ],
      };
    }

    if (activeDestinationMeta.behavior === 'psych-ehr-safe') {
      return {
        label: 'Hybrid paste path',
        detail: `${activeDestinationMeta.summaryLabel} can usually take the cleaned whole note, but field-level copy stays useful when the ${noteFocusLabel.toLowerCase()} template is split into sections.`,
        steps: [
          'Try Copy EHR-safe first when the note editor accepts a full narrative.',
          'Switch to the field targets below when the destination uses SOAP, DAP, or psychiatry-specific section blocks.',
          'Use Copy plain text only when you know you want to hand-edit inside the EHR after paste.',
        ],
      };
    }

    return {
      label: 'Flexible paste path',
      detail: `${activeDestinationMeta.summaryLabel} is not enforcing a brittle template profile, so the main decision is whether you want a whole-note paste or manual field-by-field entry.`,
      steps: [
        'Use Copy EHR-safe when you want the cleaned export profile as-is.',
        'Use Copy plain text when you plan to edit inside the destination before finalizing.',
        'Use field targets only if your local workflow or template still splits the note into sections.',
      ],
    };
  }, [activeDestinationMeta, providerSettings.outputNoteFocus, session?.noteType]);
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
  const postNoteCptRecommendations = useMemo(
    () => evaluatePostNoteCptRecommendations({
      completedNoteText: draftText,
      noteType: session?.noteType || '',
      encounterSupport,
    }),
    [draftText, encounterSupport, session?.noteType],
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
  const reviewStageFocusedSectionHeading = useMemo(
    () => draftSections.find((section) => section.anchor === focusedSectionAnchor)?.heading,
    [draftSections, focusedSectionAnchor],
  );
  const reviewStageItems = useMemo(
    () => buildReviewStageItems({
      reviewCounts,
      exportReady: exportReadiness.ready,
      focusedSectionHeading: reviewStageFocusedSectionHeading,
    }),
    [exportReadiness.ready, reviewStageFocusedSectionHeading, reviewCounts],
  );
  const reviewReasonTags = useMemo(
    () => buildReviewReasonTags({
      hasObjectiveConflict: objectiveReview.hasConflictRisk,
      hasTrustCues: phaseTwoTrustCues.length > 0,
      hasDestinationConstraint: destinationConstraintActive,
      hasHighRiskWarnings: highRiskWarnings.length > 0,
      hasDiagnosisCues: Boolean(draftOnlyDiagnoses.length || diagnosisTimeframeGaps.length || diagnosisNonAutoMapTerms.length || draftDiagnosisAvoidTerms.length),
    }),
    [
      destinationConstraintActive,
      diagnosisNonAutoMapTerms.length,
      diagnosisTimeframeGaps.length,
      draftDiagnosisAvoidTerms.length,
      draftOnlyDiagnoses.length,
      highRiskWarnings.length,
      objectiveReview.hasConflictRisk,
      phaseTwoTrustCues.length,
    ],
  );
  const finishRationaleCards = useMemo(() => {
    const cards: Array<{ id: string; label: string; detail: string; toneClassName: string }> = [];

    if (reviewCounts.needsReview > 0 || reviewCounts.unreviewed > 0) {
      cards.push({
        id: 'review-open',
        label: 'Review still open',
        detail: `${reviewCounts.needsReview + reviewCounts.unreviewed} section${reviewCounts.needsReview + reviewCounts.unreviewed === 1 ? '' : 's'} still need explicit clinician review before finish should feel settled.`,
        toneClassName: 'border-amber-200 bg-amber-50 text-amber-900',
      });
    }

    if (phaseTwoTrustCues.length) {
      cards.push({
        id: 'trust-cues',
        label: 'Trust cues still active',
        detail: 'These usually mean wording may be too strong for source, diagnosis framing may be outrunning evidence, or medication/risk truth still needs a closer pass.',
        toneClassName: 'border-rose-200 bg-rose-50 text-rose-900',
      });
    }

    if (destinationConstraintActive) {
      cards.push({
        id: 'destination',
        label: 'Destination fit matters',
        detail: 'Export cleanup is active, so verify that formatting changes did not smooth out uncertainty, chronology, or symptom meaning.',
        toneClassName: 'border-sky-200 bg-sky-50 text-sky-950',
      });
    }

    if (!cards.length) {
      cards.push({
        id: 'clear-to-finish',
        label: 'Finish lane is clear',
        detail: 'The remaining work is mostly final manual review, destination fit, and copy/export choices rather than major trust repair.',
        toneClassName: 'border-emerald-200 bg-emerald-50 text-emerald-900',
      });
    }

    return cards.slice(0, 3);
  }, [destinationConstraintActive, phaseTwoTrustCues.length, reviewCounts.needsReview, reviewCounts.unreviewed]);
  const firstOpenReviewSection = useMemo(() => {
    return draftSections.find((section) => {
      const status = reconciledSectionReviewState[section.anchor]?.status || 'unreviewed';
      return status === 'needs-review' || status === 'unreviewed';
    }) || draftSections[0] || null;
  }, [draftSections, reconciledSectionReviewState]);
  const hasOpenReviewSections = reviewCounts.needsReview + reviewCounts.unreviewed > 0;
  const finishGateSignals = useMemo(() => {
    const items: Array<{ id: string; label: string; detail: string; tone: ReviewSignalTone }> = [];
    const openReviewCount = reviewCounts.needsReview + reviewCounts.unreviewed;

    items.push({
      id: 'review-state',
      label: openReviewCount === 0 ? 'Review cleared' : 'Review still open',
      detail: openReviewCount === 0
        ? 'All detected sections have been explicitly reviewed.'
        : `${openReviewCount} section check${openReviewCount === 1 ? '' : 's'} still needs attention before finish should feel complete.`,
      tone: openReviewCount === 0 ? 'success' : 'warning',
    });

    if (phaseTwoTrustCues.length) {
      items.push({
        id: 'trust-cues',
        label: 'Trust cues still active',
        detail: 'At least one wording, diagnosis, medication, or risk cue still suggests a closer source pass before copy/export.',
        tone: 'danger',
      });
    }

    if (contradictionFlags.length) {
      items.push({
        id: 'contradictions',
        label: 'Contradiction prompts remain',
        detail: `${contradictionFlags.length} contradiction prompt${contradictionFlags.length === 1 ? '' : 's'} still relies on clinician judgment.`,
        tone: 'warning',
      });
    }

    if (destinationConstraintActive) {
      items.push({
        id: 'destination-fit',
        label: 'Destination fit is active',
        detail: `${activeDestinationMeta.summaryLabel} cleanup is active, so confirm that the final text still preserves uncertainty, timeline, and source nuance.`,
        tone: 'info',
      });
    }

    if (exportReadiness.ready && items.every((item) => item.tone !== 'danger' && item.tone !== 'warning')) {
      items.push({
        id: 'ready-copy',
        label: 'Ready to copy',
        detail: 'The remaining work is mostly a final clinician read for tone and destination fit.',
        tone: 'success',
      });
    }

    return items.slice(0, 4);
  }, [
    activeDestinationMeta.summaryLabel,
    contradictionFlags.length,
    destinationConstraintActive,
    exportReadiness.ready,
    phaseTwoTrustCues.length,
    reviewCounts.needsReview,
    reviewCounts.unreviewed,
  ]);
  const finishTargetCard = useMemo(() => {
    if (!firstOpenReviewSection) {
      return null;
    }

    const reviewState = reconciledSectionReviewState[firstOpenReviewSection.anchor];
    const evidence = sectionEvidenceMap[firstOpenReviewSection.anchor];
    const linkedEvidenceCount = evidence?.links.length ?? 0;
    const status = reviewState?.status || 'unreviewed';
    const detail = status === 'needs-review'
      ? 'This section is already flagged and should be tightened before finish clears.'
      : linkedEvidenceCount === 0
        ? 'This section is still open and does not yet show linked evidence in review.'
        : 'This is the first open section still holding finish open.';

    return {
      heading: firstOpenReviewSection.heading,
      detail,
      linkedEvidenceCount,
      statusLabel: status.replace('-', ' '),
    };
  }, [firstOpenReviewSection, reconciledSectionReviewState, sectionEvidenceMap]);
  const atlasReviewItems = useMemo(
    () => buildAtlasReviewItems({
      contradictionFlags,
      copilotSuggestions,
      draftMseTermsNeedingReview,
      encounterDocumentationChecks,
      highRiskWarnings,
      medicationScaffoldWarnings,
      objectiveConflictBullets: objectiveReview.conflictBullets,
      phaseTwoTrustCues,
      reviewCounts,
      destinationConstraintActive,
    }),
    [
      contradictionFlags,
      copilotSuggestions,
      destinationConstraintActive,
      draftMseTermsNeedingReview,
      encounterDocumentationChecks,
      highRiskWarnings,
      medicationScaffoldWarnings,
      objectiveReview.conflictBullets,
      phaseTwoTrustCues,
      reviewCounts,
    ],
  );
  const atlasNudgeItems = useMemo(() => buildAtlasNudges(atlasReviewItems), [atlasReviewItems]);
  const showAtlasReviewDock = ATLAS_REVIEW_DOCK_ENABLED && atlasReviewItems.length > 0;

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
      ambientSessionState: ambientTranscriptHandoff?.sessionState,
      ambientTranscriptEventCount: ambientTranscriptSummary?.transcriptEventCount,
      ambientReviewFlagCount: ambientTranscriptSummary?.reviewFlagCount,
      ambientUnresolvedSpeakerTurnCount: ambientTranscriptSummary?.unresolvedSpeakerTurnCount,
      ambientTranscriptReadyForSource: ambientTranscriptSummary?.transcriptReadyForSource,
    });
  }, [
    activeProviderProfile,
    ambientTranscriptHandoff?.sessionState,
    ambientTranscriptSummary?.reviewFlagCount,
    ambientTranscriptSummary?.transcriptEventCount,
    ambientTranscriptSummary?.transcriptReadyForSource,
    ambientTranscriptSummary?.unresolvedSpeakerTurnCount,
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
    if (!firstOpenReviewSection) {
      return;
    }

    const seed = `${session?.draftId || draftText.slice(0, 80)}:${embedded ? 'embedded' : 'full'}`;
    if (reviewAutoFocusSeedRef.current === seed) {
      return;
    }

    reviewAutoFocusSeedRef.current = seed;
    setFocusedSectionAnchor(firstOpenReviewSection.anchor);

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        jumpToElementById(embedded ? `embedded-${firstOpenReviewSection.anchor}` : firstOpenReviewSection.anchor);
      });
    });
  }, [draftText, embedded, firstOpenReviewSection, session?.draftId]);

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

  const renderRecentActions = () => (copyMessage || exportMessage || rewriteMessage || saveMessage || interactionMessage) ? (
    <div className="workspace-subpanel rounded-[20px] p-4 text-sm text-cyan-50/84">
      <div className="text-xs font-semibold uppercase tracking-wide text-cyan-100/62">Recent actions</div>
      <div className="mt-2 space-y-1">
        {copyMessage ? <div>{copyMessage}</div> : null}
        {exportMessage ? <div>{exportMessage}</div> : null}
        {rewriteMessage ? <div>{rewriteMessage}</div> : null}
        {saveMessage ? <div>{saveMessage}</div> : null}
        {interactionMessage ? <div>{interactionMessage}</div> : null}
      </div>
    </div>
  ) : null;

  const renderDraftEditorSection = () => {
    const currentSession = session!;

    return (
      <section className="workspace-panel workspace-shine rounded-[30px] p-5 shadow-[0_28px_70px_rgba(2,8,18,0.34)]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-100/62">Draft</div>
            <h2 className="mt-2 text-[1.4rem] font-semibold tracking-[-0.03em] text-white">Draft</h2>
            <p className="mt-1 max-w-2xl text-sm text-cyan-50/70">Edit first. Keep only the facts, uncertainty, and timing the source really supports.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <InlineMetric
              label={draftSections.length === 1 ? 'section' : 'sections'}
              value={draftSections.length || 1}
            />
            <InlineMetric label="approved" value={reviewCounts.approved} />
            <InlineMetric
              label="open"
              value={reviewCounts.unreviewed + reviewCounts.needsReview}
            />
            <div className="workspace-badge-static rounded-full px-3 py-1.5 text-xs font-medium text-cyan-50/74">
              {currentSession.mode === 'live' ? 'Live generation' : 'Draft output. Clinician review required before use.'}
            </div>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2 text-xs">
          <span className="rounded-full border border-amber-300/18 bg-amber-400/10 px-3 py-1 font-medium text-amber-100">
            Keep missing or uncertain facts visibly missing or uncertain.
          </span>
          {focusedSectionHeading ? (
            <span className="workspace-badge-static rounded-full px-3 py-1 font-medium text-cyan-50">
              Focus: {focusedSectionHeading}
            </span>
          ) : null}
        </div>
        {reviewReasonTags.length ? (
          <div className="mt-4 flex flex-wrap gap-2">
            {reviewReasonTags.map((tag) => (
              <DrawerJumpButton key={tag.id} label={tag.label} targetId={tag.targetId} />
            ))}
          </div>
        ) : null}
        {currentSession.draftRevisions?.length ? (
          <details className="workspace-subpanel mt-4 rounded-[22px] p-4">
            <summary className="cursor-pointer text-sm font-semibold text-cyan-50">
              Draft version history · {currentSession.draftRevisions.length}
            </summary>
            <div className="mt-2 text-xs leading-5 text-cyan-50/66">
              Atlas rewrites save the prior draft here before replacing the active Draft.
            </div>
            <div className="mt-3 grid max-h-56 gap-2 overflow-y-auto pr-1">
              {[...currentSession.draftRevisions].reverse().slice(0, 8).map((revision) => (
                <div key={revision.id} className="rounded-[14px] border border-cyan-200/10 bg-[rgba(13,30,50,0.48)] px-3 py-2.5">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <div className="text-xs font-semibold text-white">{revision.label}</div>
                      <div className="mt-0.5 text-[11px] text-cyan-50/58">
                        {new Date(revision.createdAt).toLocaleString()} · {revision.wordCount ?? countWords(revision.note)} words
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        void handleRestoreDraftRevision(revision);
                      }}
                      className="rounded-full border border-cyan-200/14 bg-[rgba(18,181,208,0.1)] px-3 py-1 text-[11px] font-medium text-cyan-50 transition hover:border-cyan-200/26 hover:bg-[rgba(18,181,208,0.16)]"
                    >
                      Restore
                    </button>
                  </div>
                  <div className="mt-2 line-clamp-2 text-[11px] leading-5 text-cyan-50/64">
                    {revision.note.replace(/\s+/g, ' ').slice(0, 260)}
                  </div>
                </div>
              ))}
            </div>
          </details>
        ) : null}
        <div className="workspace-subpanel mt-4 rounded-[22px] p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-xs font-semibold uppercase tracking-wide text-cyan-100/62">Section navigator</div>
            <div className="text-xs text-cyan-50/64">Jump to the section you are checking.</div>
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {draftSections.length ? draftSections.map((section) => {
              const reviewState = reconciledSectionReviewState[section.anchor];
              return (
                <a
                  key={section.anchor}
                  href={`#${section.anchor}`}
                  onClick={() => setFocusedSectionAnchor(section.anchor)}
                  className={`rounded-full border px-3 py-1.5 text-xs font-medium ${reviewStatusClasses[reviewState?.status || 'unreviewed']} ${focusedSectionAnchor === section.anchor ? 'ring-2 ring-sky-200 shadow-[0_10px_24px_rgba(2,8,18,0.16)]' : ''}`}
                >
                  {section.heading}
                </a>
              );
            }) : (
              <div className="text-sm text-cyan-50/64">No section headings detected yet. The note is still fully editable below.</div>
            )}
          </div>
        </div>
        {(focusedSectionHeading || focusedEvidenceBlock) ? (
          <div className="sticky top-2 z-10 mt-4 rounded-[20px] border border-sky-300/22 bg-[rgba(56,189,248,0.12)] p-3 backdrop-blur">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs font-semibold uppercase tracking-wide text-sky-100">Active review focus</div>
              <div className="flex flex-wrap gap-2">
                {focusedSectionHeading ? (
                  <span className="rounded-full border border-sky-200/20 bg-white/10 px-2.5 py-1 text-[11px] font-medium text-sky-50">
                    Section: {focusedSectionHeading}
                  </span>
                ) : null}
                {focusedEvidenceBlock ? (
                  <span className="rounded-full border border-sky-200/20 bg-white/10 px-2.5 py-1 text-[11px] font-medium text-sky-50">
                    Source: {focusedEvidenceBlock.sourceLabel}
                  </span>
                ) : null}
              </div>
            </div>
          </div>
        ) : null}
        <textarea ref={draftTextareaRef} value={draftText} onChange={(event) => setDraftText(event.target.value)} className="workspace-control mt-4 min-h-[500px] w-full rounded-[24px] p-4 text-sm leading-7" />
        <div className="workspace-subpanel mt-4 rounded-[24px] p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm font-semibold text-white">Section review cues</div>
            <div className="text-xs text-cyan-50/66">Approve, flag, or leave unreviewed as you work.</div>
          </div>
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
              const confirmedEvidenceIds = getConfirmedEvidenceBlockIds(currentSession, section.anchor);
              const isFirstOpenSection = firstOpenReviewSection?.anchor === section.anchor;
              const firstEvidenceLink = evidence?.links[0];
              const firstEvidenceBlock = firstEvidenceLink
                ? sourceBlocks.find((item) => item.id === firstEvidenceLink.blockId) ?? null
                : null;
              const sectionReasonTags = buildSectionReviewReasonTags({
                sectionHeading: section.heading,
                claimSupportCues: sectionClaimSupportCues,
                pressureCues: sectionPressureCues,
                hasEvidenceLinks: Boolean(evidence?.links.length),
              });
              const nextReviewPrompt = !evidence?.links.length
                ? "Start by checking the source support for this section before approving any wording."
                : sectionClaimSupportCues.length || sectionPressureCues.length
                  ? "Review the wording against source and soften anything the source does not fully support."
                  : "Do a quick source-aligned read, then approve if the phrasing matches the record."

              return (
                <div
                  key={section.anchor}
                  id={section.anchor}
                  className={`rounded-[20px] border p-3 ${focusedSectionAnchor === section.anchor
                    ? 'border-sky-300/30 bg-[rgba(56,189,248,0.08)] shadow-[0_18px_42px_rgba(2,8,18,0.22)]'
                    : isFirstOpenSection
                      ? 'border-amber-300/30 bg-[rgba(180,83,9,0.14)] shadow-[0_18px_42px_rgba(120,53,15,0.16)]'
                      : 'border-white/10 bg-[rgba(255,255,255,0.04)]'
                  }`}
                >
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <button type="button" onClick={() => setFocusedSectionAnchor(section.anchor)} className="text-left font-medium text-white">{section.heading}</button>
                        {isFirstOpenSection ? (
                          <span className="rounded-full border border-amber-300/30 bg-amber-500/18 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.22em] text-amber-100">
                            Start here
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-1 text-sm text-cyan-50/66">
                        Keep only the facts, uncertainty, and timing the source really supports.
                      </p>
                      {isFirstOpenSection ? (
                        <p className="mt-2 text-[11px] text-amber-100/90">
                          This is the first section that still needs review attention.
                        </p>
                      ) : null}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <div className={`rounded-full border px-2 py-1 text-[11px] font-medium ${reviewStatusClasses[reviewState?.status || 'unreviewed']}`}>
                        {(reviewState?.status || 'unreviewed').replace('-', ' ')}
                      </div>
                      <div className="text-xs text-cyan-50/62">{countWords(section.body)} words</div>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {isFirstOpenSection ? (
                      <span className="rounded-full border border-amber-300/30 bg-amber-500/12 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-amber-100">
                        Next action
                      </span>
                    ) : null}
                    <button
                      onClick={() => handleSectionStatusChange(section.anchor, 'approved')}
                      className={`rounded-full px-3 py-1.5 text-xs font-medium ${
                        isFirstOpenSection
                          ? 'border border-emerald-200 bg-emerald-100 text-emerald-900 shadow-[0_10px_24px_rgba(16,185,129,0.14)]'
                          : 'border border-emerald-200 bg-emerald-50 text-emerald-800'
                      }`}
                    >
                      Approve
                    </button>
                    <button
                      onClick={() => handleSectionStatusChange(section.anchor, 'needs-review')}
                      className={`rounded-full px-3 py-1.5 text-xs font-medium ${
                        isFirstOpenSection
                          ? 'border border-amber-200 bg-amber-100 text-amber-950 shadow-[0_10px_24px_rgba(245,158,11,0.16)]'
                          : 'border border-amber-200 bg-amber-50 text-amber-900'
                      }`}
                    >
                      Needs review
                    </button>
                    <button
                      onClick={() => handleSectionStatusChange(section.anchor, 'unreviewed')}
                      className={`rounded-full px-3 py-1.5 text-xs font-medium ${
                        isFirstOpenSection
                          ? 'border border-white/18 bg-white/12 text-white'
                          : 'border border-border bg-white text-ink'
                      }`}
                    >
                      Mark unreviewed
                    </button>
                  </div>
                  {isFirstOpenSection ? (
                    <div className="mt-3 rounded-[16px] border border-amber-300/24 bg-[rgba(120,53,15,0.16)] p-3">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-100/90">
                        Review task
                      </div>
                      <p className="mt-1 text-sm text-amber-50/92">{nextReviewPrompt}</p>
                      {sectionReasonTags.length ? (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {sectionReasonTags.map((tag) => (
                            <span key={tag.id} className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] ${tag.toneClassName}`}>
                              {tag.label}
                            </span>
                          ))}
                        </div>
                      ) : null}
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => setFocusedSectionAnchor(section.anchor)}
                          className="rounded-full border border-white/16 bg-white/10 px-3 py-1.5 text-xs font-medium text-white"
                        >
                          Focus section
                        </button>
                        {firstEvidenceBlock ? (
                          <button
                            type="button"
                            onClick={() => {
                              setFocusedSectionAnchor(section.anchor);
                              setFocusedEvidenceBlockId(firstEvidenceBlock.id);
                              setActiveSourceKey(firstEvidenceBlock.sourceKey);
                            }}
                            className="rounded-full border border-amber-200/26 bg-amber-500/16 px-3 py-1.5 text-xs font-medium text-amber-50"
                          >
                            Open first source
                          </button>
                        ) : null}
                      </div>
                    </div>
                  ) : null}
                  <div className="mt-3 text-xs text-cyan-50/62">
                    {evidence?.links.length ? `${evidence.links.length} evidence link${evidence.links.length === 1 ? '' : 's'}` : 'No evidence links yet'}
                    {' · '}
                    {sectionClaimSupportCues.length ? `${sectionClaimSupportCues.length} claim cue${sectionClaimSupportCues.length === 1 ? '' : 's'}` : 'No claim cue'}
                    {' · '}
                    {sectionPressureCues.length ? `${sectionPressureCues.length} warning cue${sectionPressureCues.length === 1 ? '' : 's'}` : 'No warning cue'}
                    {' · '}
                    {confirmedEvidenceIds.length ? `${confirmedEvidenceIds.length} confirmed source block${confirmedEvidenceIds.length === 1 ? '' : 's'}` : 'No confirmed evidence yet'}
                  </div>
                  {evidence?.links.length ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {evidence.links.slice(0, 3).map((link) => {
                        const block = sourceBlocks.find((item) => item.id === link.blockId);
                        if (!block) {
                          return null;
                        }

                        return (
                          <button
                            key={link.blockId}
                            type="button"
                            onClick={() => {
                              setFocusedSectionAnchor(section.anchor);
                              setFocusedEvidenceBlockId(link.blockId);
                              setActiveSourceKey(block.sourceKey);
                            }}
                            className={`rounded-lg border px-3 py-2 text-left text-xs ${evidenceSignalClasses[link.signal]} ${focusedEvidenceBlockId === link.blockId ? 'ring-2 ring-sky-200' : ''}`}
                          >
                            <div className="font-semibold">{block.sourceLabel}</div>
                            {ambientTranscriptSummary && block.sourceKey === 'patientTranscript' ? (
                              <div className="mt-1">Ambient transcript source</div>
                            ) : null}
                            <div className="mt-1">{getSignalLabel(link.signal)}</div>
                            {link.overlapTerms.length ? <div className="mt-1 opacity-80">Matches: {link.overlapTerms.join(', ')}</div> : null}
                          </button>
                        );
                      })}
                    </div>
                  ) : null}
                  {reviewState?.updatedAt ? (
                    <div className="mt-3 text-xs text-cyan-50/58">Updated {new Date(reviewState.updatedAt).toLocaleString()}</div>
                  ) : null}

                  <details className="group mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <summary className="cursor-pointer list-none">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <div className="text-xs font-semibold uppercase tracking-wide text-muted">Evidence and claim support</div>
                          <p className="mt-1 text-xs text-muted">Full evidence map and sentence-level support cues.</p>
                        </div>
                        <OptionalBadge className="border-slate-200 bg-white text-slate-700" />
                      </div>
                    </summary>
                    <div className="mt-3">
                      <div className="rounded-lg border border-slate-200 bg-white p-3">
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
                                    {ambientTranscriptSummary && block.sourceKey === 'patientTranscript' ? (
                                      <div className="mt-1">Ambient transcript source</div>
                                    ) : null}
                                    <div className="mt-1">{getSignalLabel(link.signal)}</div>
                                    {link.overlapTerms.length ? <div className="mt-1 opacity-80">Matches: {link.overlapTerms.join(', ')}</div> : null}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleConfirmedEvidenceToggle(section.anchor, link.blockId)}
                                    className={`mt-2 rounded-full border px-2 py-1 font-medium ${confirmedEvidenceIds.includes(link.blockId) ? 'border-violet-200 bg-violet-50 text-violet-800' : 'border-white/70 bg-white/70 text-slate-700'}`}
                                  >
                                    {confirmedEvidenceIds.includes(link.blockId) ? 'Remove reviewer confirmation' : 'Mark reviewer-confirmed'}
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
                        <div className="mt-3 rounded-lg border border-slate-200 bg-white p-3">
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
                    </div>
                  </details>

                  {sectionPressureCues.length ? (
                    <details className="group mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
                      <summary className="cursor-pointer list-none">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <div className="text-xs font-semibold uppercase tracking-wide text-muted">Warning pressure</div>
                            <p className="mt-1 text-xs text-muted">Jump into related deeper review layers.</p>
                          </div>
                          <OptionalBadge className="border-slate-200 bg-white text-slate-700" />
                        </div>
                      </summary>
                      <div className="mt-3 grid gap-2">
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
                    </details>
                  ) : null}

                  <details className="group mt-3 rounded-lg border border-violet-200 bg-violet-50 p-3">
                    <summary className="cursor-pointer list-none">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <div className="text-xs font-semibold uppercase tracking-wide text-violet-900">Reviewer-confirmed evidence</div>
                          <p className="mt-1 text-xs text-violet-800">
                            {confirmedEvidenceIds.length
                              ? `${confirmedEvidenceIds.length} source block${confirmedEvidenceIds.length === 1 ? '' : 's'} recorded for this section.`
                              : 'No reviewer-confirmed evidence recorded yet.'}
                          </p>
                        </div>
                        <OptionalBadge className="border-violet-200 bg-white text-violet-800" />
                      </div>
                    </summary>
                    {confirmedEvidenceIds.length ? (
                      <div className="mt-3 space-y-2">
                        {confirmedEvidenceIds.map((blockId) => {
                          const block = sourceBlocks.find((item) => item.id === blockId);
                          if (!block) {
                            return null;
                          }

                          return (
                            <div key={blockId} className="rounded-lg border border-violet-200 bg-white px-3 py-2">
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <div className="text-xs font-semibold uppercase tracking-wide text-violet-900">{block.sourceLabel}</div>
                                  {ambientTranscriptSummary && block.sourceKey === 'patientTranscript' ? (
                                    <div className="mt-1 text-[11px] font-medium text-sky-900">Ambient transcript source</div>
                                  ) : null}
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
                    ) : null}
                  </details>

                  <details className="group mt-3 rounded-lg border border-border bg-paper p-3">
                    <summary className="cursor-pointer list-none">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <div className="text-xs font-semibold uppercase tracking-wide text-muted">Reviewer note</div>
                          <p className="mt-1 text-xs text-muted">
                            {reviewState?.reviewerComment?.trim() ? 'Saved comment present for this section.' : 'Manual review note.'}
                          </p>
                        </div>
                        <OptionalBadge />
                      </div>
                    </summary>
                    <textarea
                      value={reviewState?.reviewerComment || ''}
                      onChange={(event) => handleReviewerCommentChange(section.anchor, event.target.value)}
                      className="mt-3 min-h-[90px] w-full rounded-lg border border-border p-3 text-sm"
                      placeholder="Example: wording okay, but med-list conflict still needs explicit mention in final note."
                    />
                  </details>
                </div>
              );
            }) : (
              <div className="rounded-[18px] border border-white/10 bg-[rgba(255,255,255,0.04)] p-3 text-sm text-cyan-50/64">Add labeled headings if you want section-by-section review anchors here.</div>
            )}
          </div>
        </div>
      </section>
    );
  };

  const renderFinishSection = () => (
    <div className="workspace-panel rounded-[28px] p-5 shadow-[0_24px_60px_rgba(2,8,18,0.28)]">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-100/62">Finish lane</div>
          <h2 className="mt-2 text-[1.3rem] font-semibold tracking-[-0.03em] text-white">Finish review</h2>
          <p className="mt-1 text-sm text-cyan-50/70">Finish only after the draft, warnings, and source checks feel clinically faithful.</p>
        </div>
        <span className={`rounded-full border px-3 py-1 text-xs font-medium ${exportReadiness.ready ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-amber-200 bg-amber-50 text-amber-900'}`}>
          {exportReadiness.ready ? 'ready to export' : 'review still open'}
        </span>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <CompactMetric label="Reviewed sections" value={reviewCounts.approved} detail="Approved and ready" />
        <CompactMetric label="Still open" value={reviewCounts.unreviewed + reviewCounts.needsReview} detail="Unreviewed or needs review" />
        <CompactMetric label="Reviewer evidence" value={reviewCounts.confirmedEvidence} detail="Confirmed source links" />
        <CompactMetric label="Draft size" value={draftWordCount} detail={`${sourceWordCount} source words`} />
      </div>
      <div className="mt-4 grid gap-3 lg:grid-cols-3">
        {finishRationaleCards.map((card) => (
          <div key={card.id} className={`rounded-[18px] border px-4 py-3 ${card.toneClassName}`}>
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em]">{card.label}</div>
            <div className="mt-2 text-sm leading-6">{card.detail}</div>
          </div>
        ))}
      </div>
      <div className="mt-4 rounded-[18px] border border-cyan-200/12 bg-[rgba(255,255,255,0.05)] p-4">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-cyan-100/62">Pre-copy gate</div>
            <div className="mt-1 text-sm leading-6 text-cyan-50/72">
              This replaces noisy finish popups with one visible checkpoint that stays in view while providers decide whether to copy.
            </div>
          </div>
          <div className="text-xs text-cyan-50/58">
            Red means stop-risk, amber means review it, blue is guidance, and green means operationally clear.
          </div>
        </div>
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          {finishGateSignals.map((item) => (
            <div key={item.id} className={`rounded-[16px] border px-4 py-3 ${getReviewSignalClasses(item.tone)}`}>
              <div className="text-[11px] font-semibold uppercase tracking-[0.14em]">{item.label}</div>
              <div className="mt-2 text-sm leading-6">{item.detail}</div>
            </div>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={handleJumpToFinishPriority}
            className="rounded-[14px] border border-cyan-200/18 bg-[rgba(8,27,44,0.9)] px-4 py-2.5 text-sm font-medium text-cyan-50"
          >
            Open next finish item
          </button>
          {reviewCounts.needsReview || reviewCounts.unreviewed ? (
            <button
              type="button"
              onClick={handleJumpToFirstOpenSection}
              className="rounded-[14px] border border-cyan-200/18 bg-[rgba(8,27,44,0.72)] px-4 py-2.5 text-sm font-medium text-cyan-50/86"
            >
              Jump to open section
            </button>
          ) : null}
          {destinationConstraintActive ? (
            <button
              type="button"
              onClick={() => jumpToElementById('active-output-profile-layer')}
              className="rounded-[14px] border border-cyan-200/18 bg-[rgba(8,27,44,0.72)] px-4 py-2.5 text-sm font-medium text-cyan-50/86"
            >
              Review destination fit
            </button>
          ) : null}
        </div>
        {finishTargetCard && !exportReadiness.ready ? (
          <div className="mt-4 rounded-[18px] border border-amber-300/24 bg-[rgba(120,53,15,0.16)] p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-100/90">Current blocker</div>
                <div className="mt-1 text-base font-semibold text-white">{finishTargetCard.heading}</div>
                <div className="mt-1 text-sm leading-6 text-amber-50/86">{finishTargetCard.detail}</div>
                <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-amber-100/78">
                  <span className="rounded-full border border-amber-300/22 bg-amber-500/10 px-2.5 py-1 uppercase tracking-[0.14em]">
                    Status: {finishTargetCard.statusLabel}
                  </span>
                  <span className="rounded-full border border-amber-300/22 bg-amber-500/10 px-2.5 py-1 uppercase tracking-[0.14em]">
                    Evidence links: {finishTargetCard.linkedEvidenceCount}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={handleJumpToFirstOpenSection}
                className="rounded-[14px] border border-amber-200/24 bg-amber-500/14 px-4 py-2.5 text-sm font-medium text-amber-50"
              >
                Open this section
              </button>
            </div>
          </div>
        ) : null}
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
      <div className="workspace-subpanel mt-5 rounded-[22px] p-4">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-cyan-100/62">Final checkpoint</div>
            <p className="mt-1 text-sm text-cyan-50/68">
              This is the last confidence check before copy or export.
            </p>
          </div>
          <div className="text-xs text-cyan-50/62">
            {exportReadiness.ready ? 'Content risk looks lower; finish decisions are now mostly operational.' : 'Finish is being held open by review-state or trust-state signals.'}
          </div>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-[16px] border border-cyan-200/10 bg-[rgba(13,30,50,0.48)] px-4 py-3">
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-cyan-100/62">Review state</div>
            <div className="mt-2 text-sm text-cyan-50">{reviewCounts.unreviewed + reviewCounts.needsReview === 0 ? 'All detected sections reviewed' : `${reviewCounts.unreviewed + reviewCounts.needsReview} section checks still open`}</div>
          </div>
          <div className="rounded-[16px] border border-cyan-200/10 bg-[rgba(13,30,50,0.48)] px-4 py-3">
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-cyan-100/62">Trust state</div>
            <div className="mt-2 text-sm text-cyan-50">{phaseTwoTrustCues.length ? `${phaseTwoTrustCues.length} trust cues still active` : 'No major trust cues are active'}</div>
          </div>
          <div className="rounded-[16px] border border-cyan-200/10 bg-[rgba(13,30,50,0.48)] px-4 py-3">
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-cyan-100/62">Destination fit</div>
            <div className="mt-2 text-sm text-cyan-50">{destinationConstraintActive ? `${activeDestinationMeta.summaryLabel} constraints are active and should be rechecked` : 'No strong destination cleanup pressure is active'}</div>
          </div>
          <div className="rounded-[16px] border border-cyan-200/10 bg-[rgba(13,30,50,0.48)] px-4 py-3">
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-cyan-100/62">Next best move</div>
            <div className="mt-2 text-sm text-cyan-50">
              {exportReadiness.ready
                ? 'Copy or export after a final read for tone and destination fit.'
                : exportReadiness.blockers[0] || exportReadiness.warnings[0] || 'Keep reviewing the highest-pressure section first.'}
            </div>
          </div>
        </div>
      </div>
      <div className="workspace-subpanel mt-5 rounded-[22px] p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-cyan-100/62">Finish actions</div>
            <p className="mt-1 text-sm text-cyan-50/66">
              {exportReadiness.ready
                ? 'The note is ready for paste. Copy stays primary; save and navigation stay quieter.'
                : 'Copy/export stay primary once review clears. Save and navigation stay quieter.'}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/dashboard/new-note" className="text-sm text-cyan-50/72 underline underline-offset-2">Back to edit</Link>
            <Link href="/dashboard/new-note" className="text-sm text-cyan-50/72 underline underline-offset-2">Start new note</Link>
          </div>
        </div>
        {exportReadiness.ready ? (
          <div className="mt-4 rounded-[18px] border border-emerald-200/28 bg-[rgba(20,83,45,0.26)] px-4 py-4 text-emerald-50 shadow-[0_18px_42px_rgba(6,78,59,0.18)]">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-100/82">Ready for EHR paste</div>
                <div className="mt-1 text-lg font-semibold text-white">Review is clear enough to copy into {activeDestinationMeta.summaryLabel} now.</div>
                <div className="mt-1 text-sm leading-6 text-emerald-50/86">
                  Copy the final note when review is complete. Use the main copy action first, then use plain text or field targets only if your workflow needs them.
                </div>
              </div>
              <button
                onClick={() => void handleCopy('ehr-safe')}
                className="rounded-[16px] bg-white px-5 py-3 font-semibold text-emerald-900 shadow-[0_16px_34px_rgba(255,255,255,0.16)]"
              >
                Copy Final Note
              </button>
            </div>
          </div>
        ) : null}
        <div className="mt-4 flex flex-wrap gap-3">
          <button
            onClick={() => void handleCopy('ehr-safe')}
            disabled={!exportReadiness.ready}
            className={`rounded-[16px] px-5 py-3 font-medium shadow-[0_16px_34px_rgba(18,181,208,0.2)] ${exportReadiness.ready ? 'bg-accent text-white ring-2 ring-emerald-300/32' : 'bg-accent text-white disabled:cursor-not-allowed disabled:opacity-60'}`}
          >
            {exportReadiness.ready ? 'Copy Final Note (Best Default)' : 'Copy Final Note'}
          </button>
          <button
            onClick={() => void handleCopy('plain-text')}
            disabled={!exportReadiness.ready}
            className="rounded-[16px] border border-cyan-200/20 bg-[rgba(8,27,44,0.9)] px-5 py-3 font-medium text-cyan-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Copy plain text
          </button>
          <button
            onClick={handleExportNote}
            disabled={!exportReadiness.ready}
            className="rounded-[16px] border border-cyan-200/20 bg-[rgba(8,27,44,0.82)] px-5 py-3 font-medium text-cyan-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Export .txt
          </button>
          <button onClick={handleSaveDraft} className="rounded-[16px] border border-border bg-white px-5 py-3 font-medium text-cyan-50/84">
            Save draft
          </button>
          <button onClick={handleExportReviewBundle} className="rounded-[16px] border border-border bg-white px-5 py-3 font-medium text-cyan-50/84">
            Export review bundle
          </button>
        </div>
        <div className="mt-4 grid gap-3 lg:grid-cols-3">
          <div className={`rounded-[16px] border px-4 py-3 text-sm ${exportReadiness.ready ? 'border-emerald-200/20 bg-[rgba(20,83,45,0.18)] text-emerald-50/92' : 'border-cyan-200/10 bg-[rgba(13,30,50,0.48)] text-cyan-50/78'}`}>
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-cyan-100/62">Copy Final Note</div>
            <div className="mt-2 leading-6">{exportReadiness.ready ? 'This is the main paste action for most users. It matches the selected destination profile and is the fastest path into the chart.' : 'Use this as the default copy action when the destination profile matters and formatting cleanup should match the selected EHR behavior.'}</div>
          </div>
          <div className="rounded-[16px] border border-cyan-200/10 bg-[rgba(13,30,50,0.48)] px-4 py-3 text-sm text-cyan-50/78">
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-cyan-100/62">Copy plain text</div>
            <div className="mt-2 leading-6">Use this when you want the note without destination cleanup, usually for manual editing before paste.</div>
          </div>
          <div className="rounded-[16px] border border-cyan-200/10 bg-[rgba(13,30,50,0.48)] px-4 py-3 text-sm text-cyan-50/78">
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-cyan-100/62">Copy field targets</div>
            <div className="mt-2 leading-6">Use the field-level copy buttons below when your EHR splits the note across multiple paste areas.</div>
          </div>
        </div>
        {!exportReadiness.ready ? (
          <div className="mt-4 rounded-[16px] border border-amber-200/24 bg-[rgba(146,98,18,0.18)] px-4 py-3 text-sm text-amber-50">
            Copy and export are intentionally held until review is clearer. Use <span className="font-semibold text-white">Open next finish item</span> to jump to the highest-priority blocker instead of guessing.
          </div>
        ) : null}
        {(copyMessage || exportMessage || rewriteMessage || saveMessage) ? (
          <div className="mt-4">
            {renderRecentActions()}
          </div>
        ) : null}
        <div className="mt-4 rounded-[16px] border border-cyan-200/10 bg-[rgba(13,30,50,0.38)] px-4 py-3 text-sm text-cyan-50/76">
          Feedback is now kept out of the main finish flow. If something is wrong or confusing, use the separate feedback surface so copy/export stays focused.
          <Link href="/dashboard/feedback" className="ml-2 font-semibold text-cyan-100 underline decoration-cyan-200/30 underline-offset-4">
            Open feedback
          </Link>
        </div>
        <div className="mt-4 rounded-[16px] border border-cyan-200/10 bg-[rgba(13,30,50,0.48)] px-4 py-3 text-sm text-cyan-50/78">
          Active paste profile: <span className="font-semibold text-cyan-50">{activeDestinationMeta.summaryLabel}</span>. {activeDestinationMeta.pasteExpectation}
        </div>
        {activeOutputProfile ? (
          <div className="mt-3 rounded-[16px] border border-cyan-200/10 bg-[rgba(7,18,32,0.72)] px-4 py-3 text-sm text-cyan-50/76">
            Active site preset: <span className="font-semibold text-cyan-50">{activeOutputProfile.name}</span> ({activeOutputProfile.siteLabel}) • {getOutputNoteFocusLabel(activeOutputProfile.noteFocus)}
          </div>
        ) : null}
        <div className="mt-3 rounded-[18px] border border-cyan-200/10 bg-[rgba(8,24,40,0.76)] p-4">
          <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-cyan-100/62">Recommended paste path</div>
              <div className="mt-1 text-sm font-semibold text-cyan-50">{destinationPastePath.label}</div>
              <div className="mt-2 text-sm leading-6 text-cyan-50/78">{destinationPastePath.detail}</div>
            </div>
            <div className="rounded-full border border-cyan-200/16 bg-[rgba(13,30,50,0.82)] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-cyan-100/72">
              {activeDestinationMeta.behavior}
            </div>
          </div>
          <div className="mt-4 grid gap-3 lg:grid-cols-3">
            {destinationPastePath.steps.map((step, index) => (
              <div key={step} className="rounded-[16px] border border-cyan-200/10 bg-[rgba(13,30,50,0.54)] p-4 text-sm text-cyan-50/78">
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-cyan-100/60">Step {index + 1}</div>
                <div className="mt-2 leading-6">{step}</div>
              </div>
            ))}
          </div>
        </div>
        {destinationPasteTargets.length ? (
          <div className="mt-4 rounded-[18px] border border-cyan-200/10 bg-[rgba(9,24,40,0.74)] p-4">
            <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-cyan-100/62">Suggested Paste Targets</div>
                <div className="mt-1 text-sm text-cyan-50/78">
                  {activeDestinationMeta.fieldGuideSummary || 'Use these field-level copy targets when your destination splits the note across multiple sections.'}
                </div>
              </div>
              <div className="text-xs text-cyan-50/58">
                Providers working across multiple sites can switch destinations in settings and come back here for the matching copy layout.
              </div>
            </div>
            <div className="mt-4 grid gap-3 lg:grid-cols-2">
              {destinationPasteTargets.map((target, index) => (
                <div key={target.id} className="rounded-[16px] border border-cyan-200/10 bg-[rgba(13,30,50,0.52)] p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full border border-cyan-200/18 bg-[rgba(8,27,44,0.9)] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-cyan-100/76">
                          {index + 1}
                        </span>
                        <div className="text-sm font-semibold text-cyan-50">{target.label}</div>
                      </div>
                      <div className="mt-1 text-xs leading-5 text-cyan-50/68">{target.note}</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => void handleCopyDestinationField(target.label, target.text)}
                      disabled={!exportReadiness.ready}
                      className="rounded-[14px] border border-cyan-200/18 bg-[rgba(8,27,44,0.9)] px-3 py-2 text-xs font-medium text-cyan-50 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Copy field
                    </button>
                  </div>
                  {target.matchedHeadings.length ? (
                    <div className="mt-3 text-[11px] uppercase tracking-[0.14em] text-cyan-100/50">
                      Mapped from: {target.matchedHeadings.join(' • ')}
                    </div>
                  ) : null}
                  <div className="mt-3 max-h-40 overflow-y-auto rounded-[14px] border border-cyan-200/10 bg-[rgba(5,16,28,0.74)] px-3 py-3 text-sm leading-6 text-cyan-50/82">
                    {target.text}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );

  if (isHydrating) {
    return (
      <div className="workspace-panel rounded-[30px] p-7">
        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-100/62">Review workspace</div>
        <h2 className="mt-2 text-lg font-semibold text-white">Loading draft...</h2>
        <p className="mt-2 text-sm text-cyan-50/70">Restoring the most recently saved draft for review.</p>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="workspace-panel rounded-[30px] p-7">
        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-100/62">Review workspace</div>
        <h2 className="mt-2 text-lg font-semibold text-white">No draft loaded yet</h2>
        <p className="mt-2 text-sm text-cyan-50/70">
          {embedded
            ? 'Generate a draft in the main note workspace first, then review will open here without leaving the page.'
            : 'Generate a draft from the main note workspace first, then come back here if you want a dedicated review screen.'}
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

  if (embedded) {
    return (
      <div className="grid h-full min-h-0 gap-4 overflow-y-auto pr-1">
        <section className="workspace-panel workspace-shine rounded-[30px] p-5 shadow-[0_28px_70px_rgba(2,8,18,0.34)]">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-100/62">Embedded review</div>
              <h2 className="mt-2 text-lg font-semibold text-white">Review Draft</h2>
              <p className="mt-1 text-sm text-cyan-50/70">
                Edit, copy, or open deeper review tools.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <button onClick={() => void handleCopy('ehr-safe')} disabled={!exportReadiness.ready} className="rounded-lg bg-accent px-5 py-3 font-medium text-white disabled:cursor-not-allowed disabled:opacity-60">Copy Final Note</button>
              <button onClick={handleSaveDraft} className="rounded-lg border border-border bg-white px-5 py-3 font-medium">Save Draft</button>
              {onBackToEdit ? (
                <button onClick={onBackToEdit} className="rounded-lg border border-border bg-white px-5 py-3 font-medium">Back to Edit</button>
              ) : null}
              <Link href="/dashboard/review" className="rounded-lg border border-border bg-white px-5 py-3 font-medium">Open Dedicated Review</Link>
            </div>
          </div>

          {firstOpenReviewSection ? (
            <div className="mt-4 rounded-[20px] border border-cyan-200/12 bg-[rgba(13,30,50,0.48)] p-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-cyan-100/62">Review starts here</div>
                  <div className="mt-1 text-base font-semibold text-white">{firstOpenReviewSection.heading}</div>
                  <div className="mt-1 text-sm text-cyan-50/72">
                    {hasOpenReviewSections
                      ? 'This is the first section still marked open, so it is the fastest place to resume review.'
                      : 'All sections are reviewed, but this remains the default anchor for a final read.'}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setFocusedSectionAnchor(firstOpenReviewSection.anchor);
                    jumpToElementById(`embedded-${firstOpenReviewSection.anchor}`);
                  }}
                  className="rounded-[14px] border border-cyan-200/18 bg-[rgba(8,27,44,0.9)] px-4 py-2.5 text-sm font-medium text-cyan-50"
                >
                  {hasOpenReviewSections ? 'Jump to first open section' : 'Jump to final read anchor'}
                </button>
              </div>
            </div>
          ) : null}

          {showAtlasReviewDock ? (
            <div className="mt-4 grid gap-4">
              <AtlasNudgeStrip
                items={atlasNudgeItems}
                onAskAtlas={handleAtlasAsk}
                onShowSource={handleAtlasShowSource}
                assistantName={assistantPersona.name}
              />
              <AtlasReviewDock
                items={atlasReviewItems}
                onAskAtlas={handleAtlasAsk}
                onShowSource={handleAtlasShowSource}
                assistantName={assistantPersona.name}
                assistantAvatar={assistantPersona.avatar}
              />
            </div>
          ) : null}

          <PostNoteCptSupportPanel assessment={postNoteCptRecommendations} variant="embedded" />

          <textarea ref={draftTextareaRef} value={draftText} onChange={(event) => setDraftText(event.target.value)} className="workspace-control mt-4 min-h-[780px] w-full rounded-[24px] p-4 text-sm leading-7" />

          {draftSections.length ? (
            <div className="workspace-subpanel mt-4 rounded-[22px] p-4">
              <div className="text-sm font-semibold text-white">Section review status</div>
              <div className="mt-3 grid gap-3">
                {draftSections.map((section) => {
                  const reviewState = reconciledSectionReviewState[section.anchor];
                  const isFirstOpenSection = firstOpenReviewSection?.anchor === section.anchor;
                  const isActiveReviewTarget = isFirstOpenSection && hasOpenReviewSections;
                  const embeddedReviewPrompt = !hasOpenReviewSections
                    ? "All sections are currently reviewed. Use this anchor for a final clinician read before copy."
                    : reviewState?.status === "needs-review"
                      ? "This section is still flagged. Tighten the wording before you move on."
                      : "This is the first open section. Review it before moving deeper into the draft.";
                  return (
                    <div
                      key={section.anchor}
                      id={`embedded-${section.anchor}`}
                      className={`rounded-[18px] border p-3 ${
                        isActiveReviewTarget
                          ? 'border-amber-300/30 bg-[rgba(180,83,9,0.14)] shadow-[0_14px_34px_rgba(120,53,15,0.16)]'
                          : 'border-white/10 bg-[rgba(255,255,255,0.04)]'
                      }`}
                    >
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <div className="font-medium text-white">{section.heading}</div>
                            {isActiveReviewTarget ? (
                              <span className="rounded-full border border-amber-300/30 bg-amber-500/18 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.22em] text-amber-100">
                                Start here
                              </span>
                            ) : isFirstOpenSection ? (
                              <span className="rounded-full border border-emerald-300/24 bg-emerald-500/14 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.22em] text-emerald-100">
                                Final read
                              </span>
                            ) : null}
                          </div>
                          {isActiveReviewTarget ? (
                            <p className="mt-1 text-[11px] text-amber-100/90">
                              Review this section first before moving deeper into the draft.
                            </p>
                          ) : isFirstOpenSection ? (
                            <p className="mt-1 text-[11px] text-emerald-100/88">
                              Review is cleared. Use this anchor for one last read before copy or export.
                            </p>
                          ) : null}
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          {isActiveReviewTarget ? (
                            <span className="rounded-full border border-amber-300/30 bg-amber-500/12 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-amber-100">
                              Next action
                            </span>
                          ) : isFirstOpenSection ? (
                            <span className="rounded-full border border-emerald-300/30 bg-emerald-500/12 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-emerald-100">
                              Final check
                            </span>
                          ) : null}
                          <button
                            onClick={() => handleSectionStatusChange(section.anchor, 'unreviewed')}
                            className={`rounded-full px-3 py-1.5 text-xs font-medium ${
                              isActiveReviewTarget
                                ? 'border border-white/18 bg-white/12 text-white'
                                : 'border border-border bg-white text-ink'
                            }`}
                          >
                            Unreviewed
                          </button>
                          <button
                            onClick={() => handleSectionStatusChange(section.anchor, 'approved')}
                            className={`rounded-full px-3 py-1.5 text-xs font-medium ${
                              isActiveReviewTarget
                                ? 'border border-emerald-200 bg-emerald-100 text-emerald-900 shadow-[0_10px_24px_rgba(16,185,129,0.14)]'
                                : 'border border-emerald-200 bg-emerald-50 text-emerald-800'
                            }`}
                          >
                            Approved
                          </button>
                          <button
                            onClick={() => handleSectionStatusChange(section.anchor, 'needs-review')}
                            className={`rounded-full px-3 py-1.5 text-xs font-medium ${
                              isActiveReviewTarget
                                ? 'border border-amber-200 bg-amber-100 text-amber-950 shadow-[0_10px_24px_rgba(245,158,11,0.16)]'
                                : 'border border-amber-200 bg-amber-50 text-amber-900'
                            }`}
                          >
                            Needs review
                          </button>
                        </div>
                      </div>
                      {isFirstOpenSection ? (
                        <div className={`mt-3 rounded-[14px] border p-3 ${hasOpenReviewSections ? 'border-amber-300/24 bg-[rgba(120,53,15,0.16)]' : 'border-emerald-300/24 bg-[rgba(20,83,45,0.18)]'}`}>
                          <div className={`text-[11px] font-semibold uppercase tracking-[0.18em] ${hasOpenReviewSections ? 'text-amber-100/90' : 'text-emerald-100/90'}`}>
                            {hasOpenReviewSections ? 'Review task' : 'Final read'}
                          </div>
                          <p className={`mt-1 text-sm ${hasOpenReviewSections ? 'text-amber-50/92' : 'text-emerald-50/92'}`}>{embeddedReviewPrompt}</p>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}
        </section>

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
      );
  }

  return (
    <>
      {session.warning ? (
        <div className="mb-4 rounded-[22px] border border-amber-300/20 bg-[rgba(245,158,11,0.12)] px-5 py-4 text-sm text-amber-100">
          Live generation was unavailable, so the app used a local fallback draft. Details: {session.warning}
        </div>
      ) : null}

      {contradictionFlags.length ? (
        <div className="mb-4 rounded-[24px] border border-rose-300/20 bg-[rgba(244,63,94,0.12)] px-5 py-4 text-sm text-rose-100">
          <div className="font-semibold">Possible contradictions to review</div>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {contradictionFlags.map((flag) => (
              <li key={flag}>{flag}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="workspace-command-bar mb-6 rounded-[28px] p-4 sm:p-5">
        <div className="grid gap-3 2xl:grid-cols-[minmax(0,1.48fr)_minmax(280px,0.52fr)]">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-cyan-100/64">Review workspace</div>
            <h1 className="mt-2 text-[1.55rem] font-semibold tracking-[-0.04em] text-white sm:text-[1.88rem]">
              Review wording, preserve uncertainty, and finish with less friction.
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-cyan-50/70">
              The top strip is only for orientation. The main work stays in the draft, section review, evidence, and finish controls below.
            </p>
            {firstOpenReviewSection ? (
              <div className="mt-4 inline-flex flex-wrap items-center gap-3 rounded-[18px] border border-cyan-200/12 bg-[rgba(13,30,50,0.48)] px-4 py-3 text-sm text-cyan-50/78">
                <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-cyan-100/62">Start with</span>
                <span className="font-semibold text-white">{firstOpenReviewSection.heading}</span>
                <button
                  type="button"
                  onClick={() => {
                    setFocusedSectionAnchor(firstOpenReviewSection.anchor);
                    jumpToElementById(firstOpenReviewSection.anchor);
                  }}
                  className="rounded-full border border-cyan-200/18 bg-[rgba(8,27,44,0.82)] px-3 py-1.5 text-xs font-medium text-cyan-50"
                >
                  Jump there
                </button>
              </div>
            ) : null}
            <div className="mt-4 flex flex-wrap gap-2">
              <div className="workspace-badge-static rounded-full px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-cyan-50">
                {session.noteType}
              </div>
              <div className="workspace-badge-static rounded-full px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-cyan-50">
                {session.specialty}
              </div>
              <div className="workspace-badge-static rounded-full px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-cyan-50">
                {activeDestinationMeta.summaryLabel}
              </div>
            </div>
          </div>
          <div className="grid gap-3">
            <div className="workspace-card-static rounded-[20px] p-4">
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-100/62">Session status</div>
              <div className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-white">
                {exportReadiness.ready ? 'Ready to finish' : 'Review in progress'}
              </div>
              <p className="mt-2 text-sm leading-6 text-cyan-50/70">
                {reviewCounts.unreviewed + reviewCounts.needsReview} section{reviewCounts.unreviewed + reviewCounts.needsReview === 1 ? '' : 's'} still open across this draft.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              <CompactMetric label="Approved" value={reviewCounts.approved} />
              <CompactMetric label="Needs review" value={reviewCounts.needsReview} />
              <CompactMetric label="Evidence" value={reviewCounts.confirmedEvidence} />
            </div>
          </div>
        </div>
        <div className="mt-4 grid gap-2 lg:grid-cols-4">
          {reviewStageItems.map((item, index) => (
            <div key={item.id} className={`rounded-[18px] border px-4 py-3 ${getReviewStageTone(item.status)}`}>
              <div className="flex items-center justify-between gap-2 text-[10px] font-semibold uppercase tracking-[0.14em]">
                <span>Step {index + 1}</span>
                <span>{item.status}</span>
              </div>
              <div className="mt-1.5 text-sm font-semibold">{item.label}</div>
              <div className="mt-1 text-xs leading-5 opacity-80">{item.detail}</div>
            </div>
          ))}
        </div>
        {providerSettings.outputProfiles.length ? (
          <label className="mt-4 grid gap-2 text-sm font-medium text-cyan-50/82 lg:max-w-md">
            <span>Switch site / EHR preset</span>
            <select
              value={providerSettings.activeOutputProfileId}
              onChange={(event) => void handleApplyOutputProfile(event.target.value)}
              className="rounded-[16px] border border-cyan-200/14 bg-[rgba(6,18,32,0.86)] p-3 text-sm text-cyan-50"
            >
              <option value="">No saved preset selected</option>
              {providerSettings.outputProfiles.map((profile) => (
                <option key={profile.id} value={profile.id}>
                  {profile.name} - {profile.siteLabel}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>

      {showAtlasReviewDock ? (
        <div className="mb-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px] xl:items-start">
          <div className="space-y-6">
            {atlasNudgeItems.length ? (
              <AtlasNudgeStrip
                items={atlasNudgeItems}
                onAskAtlas={handleAtlasAsk}
                onShowSource={handleAtlasShowSource}
                assistantName={assistantPersona.name}
              />
            ) : null}
            {renderDraftEditorSection()}
            {renderFinishSection()}
          </div>
          <div className="space-y-6">
            <AtlasReviewDock
              items={atlasReviewItems}
              onAskAtlas={handleAtlasAsk}
              onShowSource={handleAtlasShowSource}
              assistantName={assistantPersona.name}
              assistantAvatar={assistantPersona.avatar}
            />
          </div>
        </div>
      ) : (
        <div className="mb-6 space-y-6">
          {renderDraftEditorSection()}
          {renderFinishSection()}
        </div>
      )}

      <CollapsibleReviewSection
        title="Reference and deep review"
        subtitle="Open this when you want the heavier evidence, warning, preference, export, and support layers. The main draft review work now stays above."
        toneClassName="border-slate-300 bg-slate-50 text-slate-950"
      >
      <div className="mb-4 rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-muted">Deep review overview</div>
            <p className="mt-1 text-sm text-muted">
              Use this drawer only for targeted support. Start with the one layer you need instead of opening everything.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <InlineMetric label="source blocks" value={sourceBlocks.length} />
            <InlineMetric label="trust cues" value={phaseTwoTrustCues.length} />
            <InlineMetric label="missing items" value={missingInfoFlags.length} />
            <InlineMetric label="copilot nudges" value={copilotSuggestions.length} />
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {!embedded && objectiveReview.hasObjectiveData ? <DrawerJumpButton label="Objective data" targetId="objective-warning-layer" /> : null}
          {!embedded && highRiskWarnings.length ? <DrawerJumpButton label="High-risk cues" targetId="high-risk-warning-layer" /> : null}
          {!embedded && phaseTwoTrustCues.length ? <DrawerJumpButton label="Trust summary" targetId="phase-two-trust-layer" /> : null}
          {!embedded && (draftOnlyDiagnoses.length || diagnosisTimeframeGaps.length || diagnosisNonAutoMapTerms.length || draftDiagnosisAvoidTerms.length) ? <DrawerJumpButton label="Diagnosis" targetId="diagnosis-warning-layer" /> : null}
          {!embedded && (reviewFirstAbbreviations.length || draftAvoidTerms.length || draftRiskTerms.length || draftMseTermsNeedingReview.length) ? <DrawerJumpButton label="Terminology" targetId="terminology-warning-layer" /> : null}
          {!embedded && matchedMedicationEntries.length ? <DrawerJumpButton label="Medication" targetId="medication-warning-layer" /> : null}
          <DrawerJumpButton label="Encounter support" targetId="encounter-warning-layer" />
          <DrawerJumpButton label="Output profile" targetId="active-output-profile-layer" />
          <DrawerJumpButton label="Source evidence" targetId="source-evidence-layer" />
          <DrawerJumpButton label="Snapshot" targetId="draft-snapshot-layer" />
        </div>
      </div>

      {!embedded && objectiveReview.hasObjectiveData ? (
        <CollapsibleReviewSection
          id="objective-warning-layer"
          title="Objective data and lab review"
          subtitle="Open this when the narrative may be cleaner than the measured or observed source details."
          toneClassName="border-sky-200 bg-sky-50 text-sky-950"
        >
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
        </CollapsibleReviewSection>
      ) : null}

      {!embedded && highRiskWarnings.length ? (
        <CollapsibleReviewSection
          id="high-risk-warning-layer"
          title="High-risk warning cues"
          subtitle="Open this when you want the conservative distortion and review-risk cues."
          toneClassName="border-amber-200 bg-amber-50 text-amber-950"
        >
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
        </CollapsibleReviewSection>
      ) : null}

      {!embedded ? (
        <CollapsibleReviewSection
          title="Ground rules and recovery"
          subtitle="Quick reminders for trust review, plus reassurance that the latest draft can be resumed here."
          toneClassName="border-slate-300 bg-slate-50 text-slate-950"
        >
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
            The latest draft can be restored here so you can continue review without losing your place.
          </div>
          <ul className="mt-4 list-disc space-y-1 pl-5 text-sm text-slate-800">
            <li>This draft is a starting point, not a completed clinical note.</li>
            <li>Use the source panel to verify dates, meds, doses, routes, frequencies, timelines, quotes, and who is speaking.</li>
            <li>If the source is thin or conflicted, the honest answer may be sparse or explicitly uncertain wording.</li>
            <li>Suggested evidence and warning cues help triage review. They do not prove truth.</li>
            <li>Mark sections as approved or needs review before export so saved drafts preserve where review stopped.</li>
          </ul>
          {!embedded && session.specialty === 'Psychiatry' ? (
            <div className="mt-4 rounded-lg border border-violet-200 bg-violet-50 px-4 py-3 text-sm text-violet-900">
              <div className="font-semibold text-violet-950">Psych review emphasis</div>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                <li>Keep risk language literal and time-bound.</li>
                <li>Check MSE wording, quoted statements, collateral conflict, and medication details carefully.</li>
              </ul>
            </div>
          ) : null}
        </CollapsibleReviewSection>
      ) : null}

      {!embedded && phaseTwoTrustCues.length ? (
        <CollapsibleReviewSection
          id="phase-two-trust-layer"
          title="Phase 2 trust cues"
          subtitle="Open this for the highest-signal trust issues before using deeper specialty layers."
          toneClassName="border-sky-200 bg-sky-50 text-sky-950"
        >
          <div className="flex flex-wrap items-center gap-2">
            <div className="font-semibold">Highest-signal trust issues</div>
            <ProvenanceChip label="Core trust workflow" />
            <InlineMetric label="cue" value={phaseTwoTrustCues.length} />
          </div>
          <p className="mt-1 text-sky-900">
            Start here if the draft still feels off but you do not yet know which deeper review layer to open.
          </p>
          <div className="mt-3 space-y-2">
            {phaseTwoTrustCues.map((cue) => (
              <ReviewItemDisclosure
                key={cue.id}
                className={cue.toneClassName}
                title={cue.label}
                summary={cue.detail}
              >
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
              </ReviewItemDisclosure>
            ))}
          </div>
        </CollapsibleReviewSection>
      ) : null}

      {structuredMedicationProfile.length ? (
        <CollapsibleReviewSection
          title="Structured psychiatric medication profile"
          subtitle="Provider-entered medication details are available here as added review support."
          toneClassName="border-cyan-200 bg-cyan-50 text-cyan-950"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="font-semibold">Structured psychiatric medication profile</div>
            <InlineMetric label="summary item" value={structuredMedicationSummary.length} />
          </div>
          <p className="mt-1 text-cyan-900">
            This draft includes a provider-entered med profile. Veranote should treat these entries as review support, not as a fully reconciled final regimen unless the source packet clearly supports that.
          </p>
          <details className="group mt-3 rounded-lg border border-cyan-200 bg-white p-3">
            <summary className="cursor-pointer list-none">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-cyan-900">Profile summary</div>
                  <p className="mt-1 text-xs text-cyan-800">Provider-entered medication summary used as review support.</p>
                </div>
                <OptionalBadge className="border-cyan-200 bg-cyan-50 text-cyan-900" />
              </div>
            </summary>
            <div className="mt-3 flex flex-wrap gap-2">
              {structuredMedicationSummary.map((item) => (
                <span key={item} className="aurora-pill rounded-full border border-cyan-200 px-3 py-1 text-xs font-medium text-cyan-950">
                  {item}
                </span>
              ))}
            </div>
          </details>
        </CollapsibleReviewSection>
      ) : null}

      {structuredDiagnosisProfile.length ? (
        <CollapsibleReviewSection
          title="Structured diagnosis / assessment profile"
          subtitle="Provider-entered assessment framing is available here when you want to compare it against the draft."
          toneClassName="border-rose-200 bg-rose-50 text-rose-950"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="font-semibold">Structured diagnosis / assessment profile</div>
            <InlineMetric label="summary item" value={structuredDiagnosisSummary.length} />
          </div>
          <p className="mt-1 text-rose-900">
            This draft includes a provider-entered diagnosis profile. Veranote should treat these entries as assessment scaffolding, not as proof that the final draft is allowed to sound more certain than the source.
          </p>
          <details className="group mt-3 rounded-lg border border-rose-200 bg-white p-3">
            <summary className="cursor-pointer list-none">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-rose-900">Profile summary</div>
                  <p className="mt-1 text-xs text-rose-800">Provider-entered diagnosis framing for comparison against the draft.</p>
                </div>
                <OptionalBadge className="border-rose-200 bg-rose-50 text-rose-900" />
              </div>
            </summary>
            <div className="mt-3 flex flex-wrap gap-2">
              {structuredDiagnosisSummary.map((item) => (
                <span key={item} className="aurora-pill rounded-full border border-rose-200 px-3 py-1 text-xs font-medium text-rose-950">
                  {item}
                </span>
              ))}
            </div>
          </details>
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

      {!embedded && (draftOnlyDiagnoses.length || diagnosisTimeframeGaps.length || diagnosisNonAutoMapTerms.length || draftDiagnosisAvoidTerms.length) ? (
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
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-xs font-semibold uppercase tracking-wide text-rose-900">Diagnoses appearing in draft but not clearly in source</div>
                <span className="rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-[11px] font-medium text-rose-900">
                  {draftOnlyDiagnoses.length} cue{draftOnlyDiagnoses.length === 1 ? '' : 's'}
                </span>
              </div>
              <div className="mt-3 space-y-3">
                {draftOnlyDiagnoses.slice(0, 8).map(({ diagnosis, differentialCaution }) => (
                  <ReviewItemDisclosure
                    key={diagnosis.id}
                    className="border-rose-100 bg-rose-50/40 text-rose-950"
                    title={diagnosis.diagnosis_name}
                    meta={
                      <>
                        <span className="rounded-full border border-rose-200 bg-white px-2 py-0.5 text-[11px] font-medium text-rose-950">
                          {diagnosis.category}
                        </span>
                        {diagnosis.warn_before_upgrading_symptoms_to_diagnosis ? (
                          <span className="rounded-full border border-rose-200 bg-white px-2 py-0.5 text-[11px] font-medium text-rose-950">
                            review before upgrade
                          </span>
                        ) : null}
                      </>
                    }
                    summary={diagnosis.summary}
                  >
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
                  </ReviewItemDisclosure>
                ))}
              </div>
            </div>
          ) : null}

          {diagnosisTimeframeGaps.length ? (
            <div className="mt-4 rounded-lg border border-rose-200 bg-white p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-xs font-semibold uppercase tracking-wide text-rose-900">Timeframe-sensitive diagnoses needing review</div>
                <span className="rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-[11px] font-medium text-rose-900">
                  {diagnosisTimeframeGaps.length} cue{diagnosisTimeframeGaps.length === 1 ? '' : 's'}
                </span>
              </div>
              <div className="mt-3 space-y-3">
                {diagnosisTimeframeGaps.slice(0, 8).map(({ diagnosis, timeframeRule }) => (
                  <ReviewItemDisclosure
                    key={`${diagnosis.id}-timeframe`}
                    className="border-rose-100 bg-rose-50/40 text-rose-950"
                    title={diagnosis.diagnosis_name}
                    meta={<span className="rounded-full border border-rose-200 bg-white px-2 py-0.5 text-[11px] font-medium text-rose-950">timeframe-sensitive</span>}
                    summary={timeframeRule?.minimum_duration_timeframe}
                  >
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
                  </ReviewItemDisclosure>
                ))}
              </div>
            </div>
          ) : null}

          {diagnosisNonAutoMapTerms.length ? (
            <div className="mt-4 rounded-lg border border-rose-200 bg-white p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-xs font-semibold uppercase tracking-wide text-rose-900">Alias or shorthand needing diagnosis review</div>
                <span className="rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-[11px] font-medium text-rose-900">
                  {diagnosisNonAutoMapTerms.length} cue{diagnosisNonAutoMapTerms.length === 1 ? '' : 's'}
                </span>
              </div>
              <div className="mt-3 space-y-3">
                {diagnosisNonAutoMapTerms.slice(0, 8).map(({ matchedText, entry }) => (
                  <ReviewItemDisclosure
                    key={`${entry.id}-${matchedText}`}
                    className="border-rose-100 bg-rose-50/40 text-rose-950"
                    title={matchedText}
                    meta={
                      <>
                        <span className="rounded-full border border-rose-200 bg-white px-2 py-0.5 text-[11px] font-medium text-rose-950">
                          {entry.formal_diagnosis}
                        </span>
                        <span className="rounded-full border border-rose-200 bg-white px-2 py-0.5 text-[11px] font-medium text-rose-950">
                          {entry.ambiguity_level} ambiguity
                        </span>
                      </>
                    }
                    summary={`Do not auto-map: ${entry.terms_that_should_not_auto_map.join(', ')}`}
                  >
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
                  </ReviewItemDisclosure>
                ))}
              </div>
            </div>
          ) : null}

          {draftDiagnosisAvoidTerms.length ? (
            <div className="mt-4 rounded-lg border border-rose-200 bg-white p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-xs font-semibold uppercase tracking-wide text-rose-900">Diagnosis wording to review before export</div>
                <span className="rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-[11px] font-medium text-rose-900">
                  {draftDiagnosisAvoidTerms.length} cue{draftDiagnosisAvoidTerms.length === 1 ? '' : 's'}
                </span>
              </div>
              <div className="mt-3 space-y-3">
                {draftDiagnosisAvoidTerms.slice(0, 8).map(({ matchedText, entry }) => (
                  <ReviewItemDisclosure
                    key={entry.id}
                    className="border-rose-100 bg-rose-50/40 text-rose-950"
                    title={matchedText}
                    meta={<span className="rounded-full border border-rose-200 bg-white px-2 py-0.5 text-[11px] font-medium text-rose-950">{formatDiagnosisAction(entry.product_action)}</span>}
                    summary={entry.why_risky}
                  >
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
                  </ReviewItemDisclosure>
                ))}
              </div>
            </div>
          ) : null}
        </CollapsibleReviewSection>
      ) : null}

      {!embedded && (reviewFirstAbbreviations.length || draftAvoidTerms.length || draftRiskTerms.length || draftMseTermsNeedingReview.length) ? (
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
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-xs font-semibold uppercase tracking-wide text-fuchsia-900">Ambiguous abbreviations in draft</div>
                <span className="rounded-full border border-fuchsia-200 bg-fuchsia-50 px-2.5 py-1 text-[11px] font-medium text-fuchsia-900">
                  {reviewFirstAbbreviations.length} cue{reviewFirstAbbreviations.length === 1 ? '' : 's'}
                </span>
              </div>
              <div className="mt-3 space-y-3">
                {reviewFirstAbbreviations.slice(0, 8).map(({ entry }) => (
                  <ReviewItemDisclosure
                    key={entry.id}
                    className="border-fuchsia-100 bg-fuchsia-50/40 text-fuchsia-950"
                    title={entry.abbreviation}
                    meta={
                      <>
                        <span className="rounded-full border border-fuchsia-300/40 bg-fuchsia-100/55 px-2 py-0.5 text-[11px] font-medium text-fuchsia-950 shadow-[0_2px_8px_rgba(79,22,46,0.05)]">
                          {entry.expansion}
                        </span>
                        <span className="rounded-full border border-fuchsia-300/40 bg-fuchsia-100/55 px-2 py-0.5 text-[11px] font-medium text-fuchsia-950 shadow-[0_2px_8px_rgba(79,22,46,0.05)]">
                          {entry.ambiguity_level} ambiguity
                        </span>
                      </>
                    }
                    summary={entry.psych_context_meaning}
                  >
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
                  </ReviewItemDisclosure>
                ))}
              </div>
            </div>
          ) : null}

          {draftAvoidTerms.length ? (
            <div className="mt-4 rounded-lg border border-fuchsia-200 bg-white p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-xs font-semibold uppercase tracking-wide text-fuchsia-900">Discouraged language in draft</div>
                <span className="rounded-full border border-fuchsia-200 bg-fuchsia-50 px-2.5 py-1 text-[11px] font-medium text-fuchsia-900">
                  {draftAvoidTerms.length} cue{draftAvoidTerms.length === 1 ? '' : 's'}
                </span>
              </div>
              <div className="mt-3 space-y-3">
                {draftAvoidTerms.slice(0, 8).map(({ entry, matchedText }) => (
                  <ReviewItemDisclosure
                    key={entry.id}
                    className="border-fuchsia-100 bg-fuchsia-50/40 text-fuchsia-950"
                    title={matchedText}
                    meta={<span className="rounded-full border border-fuchsia-300/40 bg-fuchsia-100/55 px-2 py-0.5 text-[11px] font-medium text-fuchsia-950 shadow-[0_2px_8px_rgba(79,22,46,0.05)]">{entry.recommended_system_action.replace(/_/g, ' ')}</span>}
                    summary={entry.why_risky}
                  >
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
                  </ReviewItemDisclosure>
                ))}
              </div>
            </div>
          ) : null}

          {draftRiskTerms.length ? (
            <div className="mt-4 rounded-lg border border-fuchsia-200 bg-white p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-xs font-semibold uppercase tracking-wide text-fuchsia-900">Risk-language terms in draft</div>
                <span className="rounded-full border border-fuchsia-200 bg-fuchsia-50 px-2.5 py-1 text-[11px] font-medium text-fuchsia-900">
                  {draftRiskTerms.length} cue{draftRiskTerms.length === 1 ? '' : 's'}
                </span>
              </div>
              <div className="mt-3 space-y-3">
                {draftRiskTerms.slice(0, 8).map(({ entry }) => {
                  const draftOnly = draftOnlyRiskTerms.some((item) => item.entry.id === entry.id);
                  return (
                    <ReviewItemDisclosure
                      key={entry.id}
                      className="border-fuchsia-100 bg-fuchsia-50/40 text-fuchsia-950"
                      title={entry.term}
                      meta={
                        <>
                          <span className="rounded-full border border-fuchsia-300/40 bg-fuchsia-100/55 px-2 py-0.5 text-[11px] font-medium text-fuchsia-950 shadow-[0_2px_8px_rgba(79,22,46,0.05)]">
                            {formatRiskAction(entry.veranote_action)}
                          </span>
                          {draftOnly ? (
                            <span className="rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[11px] font-medium text-rose-900">
                              not clearly present in source
                            </span>
                          ) : null}
                        </>
                      }
                      summary={entry.meaning}
                    >
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
                    </ReviewItemDisclosure>
                  );
                })}
              </div>
            </div>
          ) : null}

          {draftMseTermsNeedingReview.length ? (
            <div className="mt-4 rounded-lg border border-fuchsia-200 bg-white p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-xs font-semibold uppercase tracking-wide text-fuchsia-900">MSE descriptors needing extra review</div>
                <span className="rounded-full border border-fuchsia-200 bg-fuchsia-50 px-2.5 py-1 text-[11px] font-medium text-fuchsia-900">
                  {draftMseTermsNeedingReview.length} cue{draftMseTermsNeedingReview.length === 1 ? '' : 's'}
                </span>
              </div>
              <div className="mt-3 space-y-3">
                {draftMseTermsNeedingReview.slice(0, 8).map(({ entry }) => (
                  <ReviewItemDisclosure
                    key={entry.id}
                    className="border-fuchsia-100 bg-fuchsia-50/40 text-fuchsia-950"
                    title={entry.term}
                    meta={<span className="rounded-full border border-fuchsia-300/40 bg-fuchsia-100/55 px-2 py-0.5 text-[11px] font-medium text-fuchsia-950 shadow-[0_2px_8px_rgba(79,22,46,0.05)]">{entry.domain}</span>}
                    summary={entry.concise_definition}
                  >
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
                  </ReviewItemDisclosure>
                ))}
              </div>
            </div>
          ) : null}
        </CollapsibleReviewSection>
      ) : null}

      {!embedded && matchedMedicationEntries.length ? (
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
              <ReviewItemDisclosure
                key={medication.id}
                className="border-cyan-200 bg-white text-cyan-950"
                title={medication.displayName}
                meta={
                  <>
                    <span className="rounded-full border border-cyan-200 bg-cyan-100 px-2 py-0.5 text-[11px] font-medium text-cyan-950">
                      {medication.subclass || medication.classFamily}
                    </span>
                    {medication.isLai ? (
                      <span className="rounded-full border border-cyan-200 bg-cyan-100 px-2 py-0.5 text-[11px] font-medium text-cyan-950">
                        LAI
                      </span>
                    ) : null}
                  </>
                }
                summary={`Source status: ${formatMedicationSourceStatus(medication.sourceStatus)}${medication.normalization.unresolvedGap ? `; gap: ${medication.normalization.unresolvedGap}` : ''}`}
              >
                {medication.brandNames.length ? (
                  <div className="text-xs text-cyan-900">
                    Brands: {medication.brandNames.slice(0, 3).join(', ')}
                  </div>
                ) : null}
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
              </ReviewItemDisclosure>
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
                  <ReviewItemDisclosure
                    key={warning.code}
                    className="border-cyan-100 bg-cyan-50/40 text-cyan-950"
                    title={warning.title}
                    meta={
                      <>
                        <span className="rounded-full border border-cyan-200 bg-white px-2 py-0.5 text-[11px] font-medium text-cyan-950">
                          {formatWarningSeverity(warning.severity)}
                        </span>
                        <span className="rounded-full border border-cyan-200 bg-white px-2 py-0.5 text-[11px] font-medium text-cyan-950">
                          {warning.evidenceBasis.replace(/_/g, ' ')}
                        </span>
                      </>
                    }
                    summary={warning.summary}
                  >
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
                  </ReviewItemDisclosure>
                ))}
              </div>
            </div>
          ) : null}
        </CollapsibleReviewSection>
      ) : null}

      {psychReviewGuidance ? (
        <CollapsibleReviewSection
          id="psych-review-guidance-layer"
          title={psychReviewGuidance.title}
          subtitle="Open this for psychiatry-specific review emphasis and priority checks."
          toneClassName="border-emerald-200 bg-emerald-50 text-emerald-950"
        >
          <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
            <div>
              <div className="font-semibold">{psychReviewGuidance.title}</div>
              <p className="mt-1 text-emerald-900">{psychReviewGuidance.intro}</p>
            </div>
            <div className="rounded-full border border-emerald-200 bg-white px-3 py-1 text-xs font-medium text-emerald-900">
              {psychReviewGuidance.careSetting}
            </div>
          </div>
          <div className="mt-4 space-y-3">
            <ReviewItemDisclosure
              className="border-emerald-200 bg-white text-emerald-950"
              title="Priority checks"
              summary={`${psychReviewGuidance.priorities.length} psychiatry-specific priority check${psychReviewGuidance.priorities.length === 1 ? '' : 's'}.`}
            >
              <ul className="list-disc space-y-1 pl-5 text-emerald-900">
                {psychReviewGuidance.priorities.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </ReviewItemDisclosure>
            <ReviewItemDisclosure
              className="border-emerald-200 bg-white text-emerald-950"
              title="Section review emphasis"
              summary={`${psychReviewGuidance.sectionChecks.length} section emphasis cue${psychReviewGuidance.sectionChecks.length === 1 ? '' : 's'}.`}
            >
              <ul className="list-disc space-y-1 pl-5 text-emerald-900">
                {psychReviewGuidance.sectionChecks.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </ReviewItemDisclosure>
          </div>
        </CollapsibleReviewSection>
      ) : null}

      {isDischargeNote ? (
        <CollapsibleReviewSection
          id="discharge-review-layer"
          title="Discharge note review priorities"
          subtitle="Open this when the draft needs extra timeline and discharge-status separation."
          toneClassName="border-rose-200 bg-rose-50 text-rose-950"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="font-semibold">Discharge note review priorities</div>
            <InlineMetric label="priority" value={dischargeReviewCues.length} />
          </div>
          <details className="group mt-3 rounded-lg border border-rose-200 bg-white p-3">
            <summary className="cursor-pointer list-none">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-rose-900">Priority checks</div>
                  <p className="mt-1 text-xs text-rose-800">Discharge-specific wording and status checks.</p>
                </div>
                <OptionalBadge className="border-rose-200 bg-rose-50 text-rose-900" />
              </div>
            </summary>
            <ul className="mt-3 list-disc space-y-1 pl-5 text-rose-900">
              {dischargeReviewCues.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </details>
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
        </CollapsibleReviewSection>
      ) : null}

      {destinationConstraintActive ? (
        <CollapsibleReviewSection
          id="destination-constraint-layer"
          title="Destination / export constraint review"
          subtitle="Open this when destination formatting rules could affect wording or certainty."
          toneClassName="border-sky-200 bg-sky-50 text-sky-950"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="font-semibold">Destination / export constraint review</div>
            <InlineMetric label="constraint" value={destinationConstraintCues.length} />
          </div>
          <details className="group mt-3 rounded-lg border border-sky-200 bg-white p-3">
            <summary className="cursor-pointer list-none">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-sky-900">Constraint checks</div>
                  <p className="mt-1 text-xs text-sky-800">Destination rules that could change wording, certainty, or formatting.</p>
                </div>
                <OptionalBadge className="border-sky-200 bg-sky-50 text-sky-900" />
              </div>
            </summary>
            <ul className="mt-3 list-disc space-y-1 pl-5 text-sky-900">
              {destinationConstraintCues.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </details>
        </CollapsibleReviewSection>
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
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs font-semibold uppercase tracking-wide text-amber-900">Encounter review cues</div>
              <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-medium text-amber-900">
                {encounterSupportWarnings.length} cue{encounterSupportWarnings.length === 1 ? '' : 's'}
              </span>
            </div>
            <div className="mt-3 space-y-2">
              {encounterSupportWarnings.map((item, index) => (
                <ReviewItemDisclosure
                  key={`${item}-${index}`}
                  className="border-amber-100 bg-amber-50/40 text-amber-950"
                  title={`Encounter cue ${index + 1}`}
                  summary={item}
                >
                  <div className="text-sm text-amber-900">{item}</div>
                </ReviewItemDisclosure>
              ))}
            </div>
          </div>
        ) : null}
        {encounterDocumentationChecks.length ? (
          <div className="mt-4 rounded-lg border border-amber-200 bg-white p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs font-semibold uppercase tracking-wide text-amber-900">Time-sensitive documentation checks</div>
              <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-medium text-amber-900">
                {encounterDocumentationChecks.length} check{encounterDocumentationChecks.length === 1 ? '' : 's'}
              </span>
            </div>
            <div className="mt-3 space-y-2 text-sm text-amber-900">
              {encounterDocumentationChecks.map((item) => (
                <ReviewItemDisclosure
                  key={item.id}
                  className="border-amber-100 bg-amber-50/40 text-amber-950"
                  title={item.label}
                  summary={item.detail}
                >
                  <div>{item.detail}</div>
                </ReviewItemDisclosure>
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
        <PostNoteCptSupportPanel assessment={postNoteCptRecommendations} variant="review" />
      </CollapsibleReviewSection>

      <CollapsibleReviewSection
        id="active-output-profile-layer"
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
          <div className="flex flex-wrap gap-2">
            <div className="rounded-full border border-sky-200 bg-white px-3 py-1 text-xs font-medium text-sky-900">
              Export layer only
            </div>
            <InlineMetric label="highlight" value={activeOutputProfileHighlights.length} />
          </div>
        </div>
        <details className="group mt-4 rounded-[18px] border border-sky-200/20 bg-[rgba(255,255,255,0.08)] p-3">
          <summary className="cursor-pointer list-none">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-sky-900">Profile highlights</div>
                <p className="mt-1 text-xs text-sky-800">Active output profile details and cleanup guidance.</p>
              </div>
              <OptionalBadge className="border-sky-200 bg-sky-50 text-sky-900" />
            </div>
          </summary>
          <div className="mt-3 flex flex-wrap gap-2">
            {activeOutputProfileHighlights.map((item) => (
              <span key={item} className="rounded-full border border-sky-200/30 bg-white/70 px-3 py-1 text-xs font-medium text-sky-900">
                {item}
              </span>
            ))}
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <div className="rounded-[18px] border border-sky-200/30 bg-white/60 p-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-sky-900">Provider-facing rule</div>
              <p className="mt-1 text-sm text-sky-900">
                Destination cleanup can simplify punctuation, structure, and formatting. It should not upgrade certainty, erase timeline nuance, or fill missing regimen details.
              </p>
            </div>
            <div className="rounded-[18px] border border-sky-200/30 bg-white/60 p-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-sky-900">Current review emphasis</div>
              <p className="mt-1 text-sm text-sky-900">
                Check that the note still reads truthfully for the intended destination before trusting a clean export. If content feels more certain than source, fix the draft first and export second.
              </p>
            </div>
          </div>
        </details>
      </CollapsibleReviewSection>

      <CollapsibleReviewSection
        id="draft-snapshot-layer"
        title="Draft snapshot"
        subtitle="Open this for the setup details and review counts behind the current draft."
        toneClassName="border-cyan-200/12 bg-[rgba(7,18,32,0.82)] text-cyan-50"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-sm font-semibold text-white">Draft snapshot</div>
          <div className="flex flex-wrap gap-2">
            <InlineMetric label="source words" value={sourceWordCount} />
            <InlineMetric label="draft words" value={draftWordCount} />
            <InlineMetric label="section" value={draftSections.length || 1} />
          </div>
        </div>
        <details className="group mt-4 rounded-[20px] border border-white/10 bg-[rgba(255,255,255,0.04)] p-3">
          <summary className="cursor-pointer list-none">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-cyan-100/62">Setup details</div>
                <p className="mt-1 text-xs text-cyan-50/62">Template, preset, output shape, and source-section setup.</p>
              </div>
              <OptionalBadge />
            </div>
          </summary>
          <div className="mt-3 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            <div className="workspace-subpanel rounded-[18px] p-4 shadow-[0_14px_34px_rgba(2,8,18,0.16)]">
              <div className="text-xs font-semibold uppercase tracking-wide text-cyan-100/62">Template</div>
              <div className="mt-2 text-sm font-medium text-white">{session.template}</div>
            </div>
            <div className="workspace-subpanel rounded-[18px] p-4 shadow-[0_14px_34px_rgba(2,8,18,0.16)]">
              <div className="text-xs font-semibold uppercase tracking-wide text-cyan-100/62">Preset</div>
              <div className="mt-2 text-sm font-medium text-white">{session.presetName || 'No saved preset'}</div>
              {session.selectedPresetId ? <div className="mt-1 text-xs text-cyan-50/60">{session.selectedPresetId}</div> : null}
            </div>
            <div className="workspace-subpanel rounded-[18px] p-4 shadow-[0_14px_34px_rgba(2,8,18,0.16)]">
              <div className="text-xs font-semibold uppercase tracking-wide text-cyan-100/62">Output scope</div>
              <div className="mt-2 text-sm font-medium text-white">{session.outputScope || 'full-note'}</div>
            </div>
            <div className="workspace-subpanel rounded-[18px] p-4 shadow-[0_14px_34px_rgba(2,8,18,0.16)]">
              <div className="text-xs font-semibold uppercase tracking-wide text-cyan-100/62">Output style</div>
              <div className="mt-2 text-sm font-medium text-white">{session.outputStyle}</div>
            </div>
            <div className="workspace-subpanel rounded-[18px] p-4 shadow-[0_14px_34px_rgba(2,8,18,0.16)]">
              <div className="text-xs font-semibold uppercase tracking-wide text-cyan-100/62">Format</div>
              <div className="mt-2 text-sm font-medium text-white">{session.format}</div>
            </div>
            <div className="workspace-subpanel rounded-[18px] p-4 shadow-[0_14px_34px_rgba(2,8,18,0.16)] md:col-span-2 xl:col-span-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-cyan-100/62">Planned sections</div>
              <div className="mt-2 text-sm font-medium text-white">{sectionPlan.sections.length ? sectionPlan.sections.map((section) => SECTION_LABELS[section]).join(', ') : 'No explicit section plan recorded'}</div>
              <div className="mt-1 text-xs text-cyan-50/60">Standalone MSE required for this scope: {sectionPlan.requiresStandaloneMse ? 'Yes' : 'No'}</div>
            </div>
            <div className="workspace-subpanel rounded-[18px] p-4 shadow-[0_14px_34px_rgba(2,8,18,0.16)] md:col-span-2 xl:col-span-2">
              <div className="text-xs font-semibold uppercase tracking-wide text-cyan-100/62">Source sections</div>
              <div className="mt-2 text-sm font-medium text-white">{sourceSectionLabels.length ? sourceSectionLabels.join(', ') : 'None recorded'}</div>
            </div>
          </div>
          {session.customInstructions?.trim() ? (
            <div className="mt-4 rounded-xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm text-violet-900">
              <div className="font-semibold">Provider-specific saved preferences used for this draft</div>
              <div className="mt-1 whitespace-pre-wrap">{session.customInstructions.trim()}</div>
            </div>
          ) : null}
        </details>
        <details className="group mt-4 rounded-[20px] border border-white/10 bg-[rgba(255,255,255,0.04)] p-3">
          <summary className="cursor-pointer list-none">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-cyan-100/62">Review counts</div>
                <p className="mt-1 text-xs text-cyan-50/62">Current review-status counts behind this draft.</p>
              </div>
              <OptionalBadge />
            </div>
          </summary>
          <div className="mt-3 grid gap-4 md:grid-cols-4 xl:grid-cols-5">
            <CompactMetric label="Source words" value={sourceWordCount} />
            <CompactMetric label="Draft words" value={draftWordCount} />
            <CompactMetric label="Draft sections" value={draftSections.length || 1} />
            <CompactMetric label="Approved sections" value={reviewCounts.approved} />
            <CompactMetric label="Needs review" value={reviewCounts.needsReview} />
            <CompactMetric label="Confirmed evidence" value={reviewCounts.confirmedEvidence} />
            <CompactMetric label="Reviewer notes" value={reviewCounts.reviewerComments} />
          </div>
        </details>
      </CollapsibleReviewSection>

      {lanePreferenceSuggestion ? (
        <CollapsibleReviewSection
          id="lane-preference-layer"
          title="Review insight"
          subtitle="Open this if you want to turn a repeated finalized setup back into a compose preference."
          toneClassName="border-cyan-200 bg-sky-950 text-cyan-50"
        >
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <div className="text-sm font-semibold text-white">Review insight</div>
              <p className="mt-1 text-sm text-cyan-50/78">
                You have finalized this {session.noteType.toLowerCase()} lane with the same section setup {lanePreferenceSuggestion.count} times. If that is intentional, Veranote can send it back into compose as a reusable note preference instead of making you rebuild it each time.
              </p>
            </div>
            <div className="workspace-badge-static rounded-full px-3 py-1 text-xs font-medium text-cyan-50">
              Finalized pattern
            </div>
          </div>
          <details className="group mt-4 rounded-lg border border-cyan-200/20 bg-[rgba(13,30,50,0.74)] p-3">
            <summary className="cursor-pointer list-none">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-cyan-50">Pattern details</div>
                  <p className="mt-1 text-xs text-cyan-50/78">Repeated finalized pattern before sending it back to compose.</p>
                </div>
                <OptionalBadge className="border-cyan-200/20 bg-[rgba(13,30,50,0.88)] text-cyan-50" />
              </div>
            </summary>
            <div className="mt-3 flex flex-wrap gap-2">
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
          </details>
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
                dismissLanePreferenceSuggestion(session.noteType, lanePreferenceSuggestion.key, resolvedProviderIdentityId);
                setLanePreferenceSuggestion(null);
              }}
              className="aurora-secondary-button rounded-xl px-4 py-2 text-sm font-medium"
            >
              Dismiss
            </button>
          </div>
        </CollapsibleReviewSection>
      ) : null}

      <CollapsibleReviewSection
        id="source-evidence-layer"
        title="Source evidence and finishing tools"
        subtitle="Open this when you want the source block browser, uncertainty tools, export preview, or snapshot panels."
        toneClassName="border-cyan-200/12 bg-[rgba(7,18,32,0.82)] text-cyan-50"
      >
      <div className="grid gap-6 2xl:grid-cols-[1.2fr_0.8fr]">
        <section className="workspace-subpanel rounded-[24px] p-5 shadow-[0_22px_54px_rgba(2,8,18,0.22)]">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-white">Source evidence</h2>
              <p className="mt-1 text-sm text-cyan-50/68">Suggested evidence only. Use this to inspect likely source blocks for the section you are reviewing.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <div className="workspace-badge-static rounded-full px-3 py-1 text-xs font-medium text-cyan-50/72">Reference only</div>
              <InlineMetric label="blocks" value={sourceBlocks.length} />
              {focusedSectionEvidence ? <InlineMetric label="focused links" value={focusedSectionEvidence.links.length} /> : null}
            </div>
          </div>
          <div className="workspace-panel mt-4 rounded-[22px] p-4">
            <div className="flex flex-col gap-3 border-b border-white/10 pb-3 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <div className="text-sm font-semibold text-white">{activeSourcePanel.label}</div>
                <p className="mt-1 text-xs text-cyan-50/62">{activeSourcePanel.hint}</p>
                {activeSourceKey === 'patientTranscript' && ambientTranscriptSummary ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    <ProvenanceChip label="Ambient transcript source" />
                    <span className="rounded-full border border-sky-300/18 bg-[rgba(56,189,248,0.12)] px-2.5 py-1 text-[11px] font-medium text-sky-50">
                      {ambientTranscriptSummary.transcriptEventCount} captured turn{ambientTranscriptSummary.transcriptEventCount === 1 ? '' : 's'}
                    </span>
                  </div>
                ) : null}
                <div className="mt-3 flex flex-wrap gap-2">
                  <button onClick={() => setActiveSourceKey('combined')} className={`rounded-full px-3 py-1.5 text-xs font-medium ${activeSourceKey === 'combined' ? 'bg-accent text-white shadow-[0_10px_24px_rgba(2,8,18,0.22)]' : 'workspace-chip text-cyan-50/74'}`}>Combined</button>
                  {sourcePanels.map((panel) => (
                    <button
                      key={panel.key}
                      onClick={() => setActiveSourceKey(panel.key)}
                      className={`rounded-full px-3 py-1.5 text-xs font-medium ${activeSourceKey === panel.key ? 'bg-accent text-white shadow-[0_10px_24px_rgba(2,8,18,0.22)]' : 'workspace-chip text-cyan-50/74'}`}
                    >
                      {panel.label}
                    </button>
                  ))}
                </div>
              </div>
              {focusedSectionEvidence ? (
                <div className="max-w-[14rem] rounded-[18px] border border-sky-300/20 bg-[rgba(56,189,248,0.12)] px-3 py-2 text-[11px] text-sky-50">
                  <div className="font-semibold">Focused review section</div>
                  <div className="mt-1">{focusedSectionEvidence.sectionHeading}</div>
                </div>
              ) : null}
            </div>
            {(focusedSectionHeading || focusedEvidenceBlock) ? (
              <div className="sticky top-2 z-10 mt-3 rounded-[18px] border border-sky-300/20 bg-[rgba(56,189,248,0.12)] px-3 py-2 backdrop-blur">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-sky-50">Focused context</div>
                  <div className="flex flex-wrap gap-2">
                    {focusedSectionHeading ? (
                      <span className="rounded-full border border-sky-200/20 bg-white/10 px-2.5 py-1 text-[11px] font-medium text-sky-50">
                        Section: {focusedSectionHeading}
                      </span>
                    ) : null}
                    {focusedEvidenceBlock ? (
                      <span className="rounded-full border border-sky-200/20 bg-white/10 px-2.5 py-1 text-[11px] font-medium text-sky-50">
                        Block: {focusedEvidenceBlock.sourceLabel}
                      </span>
                    ) : null}
                  </div>
                </div>
              </div>
            ) : null}

            {totalDictationInsertionCount ? (
              <div className="mt-3 rounded-[18px] border border-emerald-300/18 bg-[rgba(16,185,129,0.08)] p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-emerald-100/78">Dictation provenance</div>
                    <div className="mt-1 text-sm text-emerald-50">
                      {activeSourceKey === 'combined'
                        ? `${totalDictationInsertionCount} dictated source segment${totalDictationInsertionCount === 1 ? '' : 's'} carried into review.`
                        : `${activeDictationInsertions.length} dictated segment${activeDictationInsertions.length === 1 ? '' : 's'} inserted into this source lane.`}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <ProvenanceChip label="Dictation insertions" />
                    <InlineMetric label="dictated" value={activeSourceKey === 'combined' ? totalDictationInsertionCount : activeDictationInsertions.length} />
                  </div>
                </div>
                <div className="mt-3 space-y-2">
                  {(activeSourceKey === 'combined' ? flattenDictationInsertions(dictationInsertions) : activeDictationInsertions).slice(0, 4).map((record) => (
                    <div key={record.transactionId} className="rounded-[14px] border border-white/10 bg-white/5 p-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-semibold uppercase tracking-wide text-emerald-50/74">
                          {record.targetSection.replace(/([A-Z])/g, ' $1').trim()}
                        </span>
                        <span className="rounded-full border border-white/10 bg-white/8 px-2 py-1 text-[11px] font-medium text-cyan-50/74">
                          {record.provider}
                        </span>
                        {record.reviewFlags.map((flag) => (
                          <span key={`${record.transactionId}-${flag.flagType}`} className="rounded-full border border-rose-300/18 bg-[rgba(244,63,94,0.12)] px-2 py-1 text-[11px] font-medium text-rose-50">
                            {flag.flagType.replace(/_/g, ' ')}
                          </span>
                        ))}
                      </div>
                      <div className="mt-2 whitespace-pre-wrap text-sm text-white">{record.text}</div>
                      <div className="mt-2 text-xs text-cyan-50/60">
                        Inserted {new Date(record.insertedAt).toLocaleString()} • {record.transactionId}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {ambientTranscriptSummary ? (
              <div className="mt-3 rounded-[18px] border border-sky-300/18 bg-[rgba(56,189,248,0.1)] p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-sky-100/78">Ambient transcript provenance</div>
                    <div className="mt-1 text-sm text-sky-50">
                      Reviewed ambient transcript material was loaded into the patient conversation source lane before draft generation.
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <ProvenanceChip label="Ambient transcript handoff" />
                    <InlineMetric label="events" value={ambientTranscriptSummary.transcriptEventCount} />
                    <InlineMetric label="source blocks" value={ambientTranscriptSummary.sourceBlocks} />
                  </div>
                </div>
                <div className="mt-3 grid gap-2 lg:grid-cols-2">
                  <div className="rounded-[14px] border border-white/10 bg-white/5 p-3 text-sm text-cyan-50/78">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-sky-100/74">Trust state at handoff</div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <span className={`rounded-full border px-2 py-1 text-[11px] font-medium ${
                        ambientTranscriptSummary.transcriptReadyForSource
                          ? 'border-emerald-300/18 bg-[rgba(16,185,129,0.14)] text-emerald-50'
                          : 'border-amber-300/18 bg-[rgba(245,158,11,0.14)] text-amber-50'
                      }`}>
                        {ambientTranscriptSummary.transcriptReadyForSource ? 'Ready for source at handoff' : 'Transcript still constrained at handoff'}
                      </span>
                      {ambientTranscriptSummary.reviewFlagCount ? (
                        <span className="rounded-full border border-amber-300/18 bg-[rgba(245,158,11,0.14)] px-2 py-1 text-[11px] font-medium text-amber-50">
                          {ambientTranscriptSummary.reviewFlagCount} review flag{ambientTranscriptSummary.reviewFlagCount === 1 ? '' : 's'}
                        </span>
                      ) : null}
                      {ambientTranscriptSummary.unresolvedSpeakerTurnCount ? (
                        <span className="rounded-full border border-rose-300/18 bg-[rgba(244,63,94,0.12)] px-2 py-1 text-[11px] font-medium text-rose-50">
                          {ambientTranscriptSummary.unresolvedSpeakerTurnCount} unresolved speaker turn{ambientTranscriptSummary.unresolvedSpeakerTurnCount === 1 ? '' : 's'}
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-2 text-xs text-cyan-50/62">
                      Loaded into source on {ambientTranscriptSummary.committedAtLabel}.
                    </div>
                  </div>
                  <div className="rounded-[14px] border border-white/10 bg-white/5 p-3 text-sm text-cyan-50/78">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-sky-100/74">Review cue</div>
                    <div className="mt-2 leading-6">
                      Treat patient-transcript evidence as ambient-derived where it appears below. If draft wording feels too clean, jump back to the transcript-derived source blocks first.
                    </div>
                    <div className="mt-3">
                      <button
                        type="button"
                        onClick={() => setActiveSourceKey('patientTranscript')}
                        className="rounded-full border border-sky-300/18 bg-[rgba(56,189,248,0.16)] px-3 py-1.5 text-xs font-medium text-sky-50"
                      >
                        Focus transcript source blocks
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ) : null}

            {activeSourceKey === 'combined' ? (
              <div className="mt-3 space-y-3 max-h-[540px] overflow-auto">
                {sourceBlocks.length ? sourceBlocks.map((block) => {
                  const matchingLink = focusedSectionEvidence?.links.find((link) => link.blockId === block.id);
                  const isFocused = focusedEvidenceBlockId === block.id;
                  const highlightParts = highlightTermsInText(block.text, matchingLink?.overlapTerms || []);

                  return (
                    <div
                      key={block.id}
                      className={`w-full rounded-[18px] border p-3 text-left ${isFocused ? 'border-sky-300/30 bg-[rgba(56,189,248,0.1)]' : 'border-white/10 bg-[rgba(255,255,255,0.04)]'}`}
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
                          <div className="text-xs font-semibold uppercase tracking-wide text-cyan-50/62">{block.sourceLabel}</div>
                          {ambientTranscriptSummary && block.sourceKey === 'patientTranscript' ? (
                            <div className="rounded-full border border-sky-300/18 bg-[rgba(56,189,248,0.12)] px-2 py-1 text-[11px] font-medium text-sky-50">
                              Ambient transcript
                            </div>
                          ) : null}
                          {matchingLink ? (
                            <div className={`rounded-full border px-2 py-1 text-[11px] font-medium ${evidenceSignalClasses[matchingLink.signal]}`}>
                              {getSignalLabel(matchingLink.signal)}
                            </div>
                          ) : null}
                        </div>
                        <div className="mt-2 text-sm text-white whitespace-pre-wrap">
                          {highlightParts.map((part, index) => (
                            <span key={`${block.id}-${index}`} className={part.highlighted ? 'rounded bg-yellow-100 px-0.5' : ''}>{part.text}</span>
                          ))}
                        </div>
                        {matchingLink?.overlapTerms.length ? (
                          <div className="mt-2 text-xs text-cyan-50/60">Matched terms: {matchingLink.overlapTerms.join(', ')}</div>
                        ) : null}
                      </button>
                      {focusedSectionAnchor ? (
                        <button
                          type="button"
                          onClick={() => handleConfirmedEvidenceToggle(focusedSectionAnchor, block.id)}
                          className={`mt-3 rounded-full border px-2 py-1 text-[11px] font-medium ${getConfirmedEvidenceBlockIds(session, focusedSectionAnchor).includes(block.id) ? 'border-violet-200 bg-violet-50 text-violet-800' : 'border-white/10 bg-white/6 text-cyan-50/72'}`}
                        >
                          {getConfirmedEvidenceBlockIds(session, focusedSectionAnchor).includes(block.id) ? 'Remove reviewer confirmation' : 'Mark reviewer-confirmed for focused section'}
                        </button>
                      ) : null}
                    </div>
                  );
                }) : <div className="text-sm text-cyan-50/62">No content in this source section.</div>}
              </div>
            ) : (
              <div className="mt-3 space-y-3 max-h-[540px] overflow-auto">
                {sourceBlocks.filter((block) => block.sourceKey === activeSourceKey).length ? sourceBlocks.filter((block) => block.sourceKey === activeSourceKey).map((block) => {
                  const matchingLink = focusedSectionEvidence?.links.find((link) => link.blockId === block.id);
                  const isFocused = focusedEvidenceBlockId === block.id;
                  const highlightParts = highlightTermsInText(block.text, matchingLink?.overlapTerms || []);

                  return (
                    <div
                      key={block.id}
                      className={`w-full rounded-[18px] border p-3 text-left ${isFocused ? 'border-sky-300/30 bg-[rgba(56,189,248,0.1)]' : 'border-white/10 bg-[rgba(255,255,255,0.04)]'}`}
                    >
                      <button
                        type="button"
                        onClick={() => setFocusedEvidenceBlockId(block.id)}
                        className="w-full text-left"
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="text-xs font-semibold uppercase tracking-wide text-cyan-50/62">{block.sourceLabel}</div>
                          {ambientTranscriptSummary && block.sourceKey === 'patientTranscript' ? (
                            <div className="rounded-full border border-sky-300/18 bg-[rgba(56,189,248,0.12)] px-2 py-1 text-[11px] font-medium text-sky-50">
                              Ambient transcript
                            </div>
                          ) : null}
                          {matchingLink ? (
                            <div className={`rounded-full border px-2 py-1 text-[11px] font-medium ${evidenceSignalClasses[matchingLink.signal]}`}>
                              {getSignalLabel(matchingLink.signal)}
                            </div>
                          ) : null}
                        </div>
                        <div className="mt-2 text-sm text-white whitespace-pre-wrap">
                          {highlightParts.map((part, index) => (
                            <span key={`${block.id}-${index}`} className={part.highlighted ? 'rounded bg-yellow-100 px-0.5' : ''}>{part.text}</span>
                          ))}
                        </div>
                        {matchingLink?.overlapTerms.length ? (
                          <div className="mt-2 text-xs text-cyan-50/60">Matched terms: {matchingLink.overlapTerms.join(', ')}</div>
                        ) : null}
                      </button>
                      {focusedSectionAnchor ? (
                        <button
                          type="button"
                          onClick={() => handleConfirmedEvidenceToggle(focusedSectionAnchor, block.id)}
                          className={`mt-3 rounded-full border px-2 py-1 text-[11px] font-medium ${getConfirmedEvidenceBlockIds(session, focusedSectionAnchor).includes(block.id) ? 'border-violet-200 bg-violet-50 text-violet-800' : 'border-white/10 bg-white/6 text-cyan-50/72'}`}
                        >
                          {getConfirmedEvidenceBlockIds(session, focusedSectionAnchor).includes(block.id) ? 'Remove reviewer confirmation' : 'Mark reviewer-confirmed for focused section'}
                        </button>
                      ) : null}
                    </div>
                  );
                }) : <div className="text-sm text-cyan-50/62">No content in this source section.</div>}
              </div>
            )}
          </div>
        </section>

        <section className="grid gap-6">
          <CollapsibleReviewSection
            title="Missing or unclear items"
            subtitle="Open this only when you need uncertainty prompts or rewrite tools."
            toneClassName="border-amber-200 bg-amber-50 text-amber-950"
          >
            <ul className="space-y-3 text-sm text-ink">
              {missingInfoFlags.length ? missingInfoFlags.map((flag) => (
                <li key={flag} className="rounded-lg border border-amber-200 bg-white p-3">{flag}</li>
              )) : <li className="rounded-lg border border-amber-200 bg-white p-3 text-muted">No missing or unclear prompts were generated from this source set.</li>}
            </ul>
            <div id="rewrite-tools-layer" className="mt-6 border-t border-amber-200 pt-4">
              <h3 className="font-medium text-amber-950">Rewrite tools</h3>
              <p className="mt-1 text-sm text-amber-900">Use these to reduce wording drift, not to make the note sound more complete than the source.</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button onClick={() => handleRewrite('more-concise')} disabled={isRewriting !== null} className="rounded-lg border border-border bg-white px-3 py-2 text-sm disabled:opacity-60">{isRewriting === 'more-concise' ? 'Rewriting...' : 'More concise'}</button>
                <button onClick={() => handleRewrite('more-formal')} disabled={isRewriting !== null} className="rounded-lg border border-border bg-white px-3 py-2 text-sm disabled:opacity-60">{isRewriting === 'more-formal' ? 'Rewriting...' : 'More formal'}</button>
                <button onClick={() => handleRewrite('closer-to-source')} disabled={isRewriting !== null} className="rounded-lg border border-border bg-white px-3 py-2 text-sm disabled:opacity-60">{isRewriting === 'closer-to-source' ? 'Rewriting...' : 'Closer to source'}</button>
                <button onClick={() => handleRewrite('regenerate-full-note')} disabled={isRewriting !== null} className="rounded-lg border border-border bg-white px-3 py-2 text-sm disabled:opacity-60">{isRewriting === 'regenerate-full-note' ? 'Rewriting...' : 'Regenerate full note'}</button>
              </div>
            </div>
          </CollapsibleReviewSection>

          <CollapsibleReviewSection
            title="Review checklist"
            subtitle="Open this for a final manual check before finishing the note."
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

          <CollapsibleReviewSection
            title="Export profile preview"
            subtitle="Open this only if you want to inspect destination cleanup before export."
            toneClassName="border-sky-200 bg-sky-50 text-sky-950"
          >
            <div className="flex flex-wrap gap-2">
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
          </CollapsibleReviewSection>

          <CollapsibleReviewSection
            title="Copilot nudges"
            subtitle="Open this for optional documentation reminders from the current source material."
            toneClassName="border-border bg-white text-ink"
          >
            <div className="space-y-3">
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
          </CollapsibleReviewSection>
        </section>
      </div>
      </CollapsibleReviewSection>
      </CollapsibleReviewSection>
    </>
  );
}
