import { getAssistantLearningStorageKey, getCurrentProviderId } from '@/lib/veranote/provider-identity';
import type { VeraMemoryLedger } from '@/types/vera-memory';

type RewriteOptionTone = 'most-conservative' | 'balanced' | 'closest-to-source';

type RewritePreferenceCounts = Record<RewriteOptionTone, number>;

type RewritePreferenceTimestamps = Partial<Record<RewriteOptionTone, string>>;

type LanePreferenceRecord = {
  noteType: string;
  outputScope: string;
  outputStyle: string;
  format: string;
  requestedSections: string[];
  count: number;
  lastSeenAt?: string;
  lastUsedAt?: string;
};

type PromptPreferenceRecord = {
  noteType: string;
  patternKey: string;
  label: string;
  seedPrompt: string;
  count: number;
  lastSeenAt?: string;
  lastUsedAt?: string;
};

type ProfilePromptPreferenceRecord = {
  profileId: string;
  patternKey: string;
  label: string;
  seedPrompt: string;
  count: number;
  noteTypes: string[];
  lastSeenAt?: string;
  lastUsedAt?: string;
};

export type ConversationalMemoryFact = {
  key: string;
  fact: string;
  count: number;
  lastSeenAt?: string;
};

type RelationshipStats = {
  greetingCount: number;
  gratitudeCount: number;
  encouragementCount: number;
  lastSeenAt?: string;
};

export type AssistantLearningStore = {
  rewritePreferencesByNoteType: Record<string, RewritePreferenceCounts>;
  rewriteLastSeenByNoteType: Record<string, RewritePreferenceTimestamps>;
  rewriteLastUsedByNoteType: Record<string, RewritePreferenceTimestamps>;
  dismissedRewriteSuggestionsByNoteType: Record<string, RewriteOptionTone | null>;
  acceptedRewriteSuggestionsByNoteType: Record<string, RewriteOptionTone | null>;
  actedOnRewriteSuggestionsByNoteType: Record<string, RewriteOptionTone | null>;
  lanePreferencesByNoteType: Record<string, LanePreferenceRecord[]>;
  dismissedLanePreferenceKeysByNoteType: Record<string, string | null>;
  acceptedLanePreferenceKeysByNoteType: Record<string, string | null>;
  actedOnLanePreferenceKeysByNoteType: Record<string, string | null>;
  promptPreferencesByNoteType: Record<string, PromptPreferenceRecord[]>;
  dismissedPromptPreferenceKeysByNoteType: Record<string, string | null>;
  acceptedPromptPreferenceKeysByNoteType: Record<string, string | null>;
  actedOnPromptPreferenceKeysByNoteType: Record<string, string | null>;
  promptPreferencesByProfileId: Record<string, ProfilePromptPreferenceRecord[]>;
  dismissedPromptPreferenceKeysByProfileId: Record<string, string | null>;
  acceptedPromptPreferenceKeysByProfileId: Record<string, string | null>;
  actedOnPromptPreferenceKeysByProfileId: Record<string, string | null>;
  conversationalMemoryFacts: ConversationalMemoryFact[];
  relationshipStats: RelationshipStats;
};

export const ASSISTANT_LEARNING_KEY = 'veranote:assistant-learning';

const defaultCounts = (): RewritePreferenceCounts => ({
  'most-conservative': 0,
  balanced: 0,
  'closest-to-source': 0,
});

export function createEmptyAssistantLearningStore(): AssistantLearningStore {
  return {
    rewritePreferencesByNoteType: {},
    rewriteLastSeenByNoteType: {},
    rewriteLastUsedByNoteType: {},
    dismissedRewriteSuggestionsByNoteType: {},
    acceptedRewriteSuggestionsByNoteType: {},
    actedOnRewriteSuggestionsByNoteType: {},
    lanePreferencesByNoteType: {},
    dismissedLanePreferenceKeysByNoteType: {},
    acceptedLanePreferenceKeysByNoteType: {},
    actedOnLanePreferenceKeysByNoteType: {},
    promptPreferencesByNoteType: {},
    dismissedPromptPreferenceKeysByNoteType: {},
    acceptedPromptPreferenceKeysByNoteType: {},
    actedOnPromptPreferenceKeysByNoteType: {},
    promptPreferencesByProfileId: {},
    dismissedPromptPreferenceKeysByProfileId: {},
    acceptedPromptPreferenceKeysByProfileId: {},
    actedOnPromptPreferenceKeysByProfileId: {},
    conversationalMemoryFacts: [],
    relationshipStats: {
      greetingCount: 0,
      gratitudeCount: 0,
      encouragementCount: 0,
    },
  };
}

function mergeAssistantLearningStore(parsed?: Partial<AssistantLearningStore> | null): AssistantLearningStore {
  return {
    rewritePreferencesByNoteType: parsed?.rewritePreferencesByNoteType || {},
    rewriteLastSeenByNoteType: parsed?.rewriteLastSeenByNoteType || {},
    rewriteLastUsedByNoteType: parsed?.rewriteLastUsedByNoteType || {},
    dismissedRewriteSuggestionsByNoteType: parsed?.dismissedRewriteSuggestionsByNoteType || {},
    acceptedRewriteSuggestionsByNoteType: parsed?.acceptedRewriteSuggestionsByNoteType || {},
    actedOnRewriteSuggestionsByNoteType: parsed?.actedOnRewriteSuggestionsByNoteType || {},
    lanePreferencesByNoteType: parsed?.lanePreferencesByNoteType || {},
    dismissedLanePreferenceKeysByNoteType: parsed?.dismissedLanePreferenceKeysByNoteType || {},
    acceptedLanePreferenceKeysByNoteType: parsed?.acceptedLanePreferenceKeysByNoteType || {},
    actedOnLanePreferenceKeysByNoteType: parsed?.actedOnLanePreferenceKeysByNoteType || {},
    promptPreferencesByNoteType: parsed?.promptPreferencesByNoteType || {},
    dismissedPromptPreferenceKeysByNoteType: parsed?.dismissedPromptPreferenceKeysByNoteType || {},
    acceptedPromptPreferenceKeysByNoteType: parsed?.acceptedPromptPreferenceKeysByNoteType || {},
    actedOnPromptPreferenceKeysByNoteType: parsed?.actedOnPromptPreferenceKeysByNoteType || {},
    promptPreferencesByProfileId: parsed?.promptPreferencesByProfileId || {},
    dismissedPromptPreferenceKeysByProfileId: parsed?.dismissedPromptPreferenceKeysByProfileId || {},
    acceptedPromptPreferenceKeysByProfileId: parsed?.acceptedPromptPreferenceKeysByProfileId || {},
    actedOnPromptPreferenceKeysByProfileId: parsed?.actedOnPromptPreferenceKeysByProfileId || {},
    conversationalMemoryFacts: Array.isArray(parsed?.conversationalMemoryFacts) ? parsed?.conversationalMemoryFacts : [],
    relationshipStats: {
      greetingCount: parsed?.relationshipStats?.greetingCount || 0,
      gratitudeCount: parsed?.relationshipStats?.gratitudeCount || 0,
      encouragementCount: parsed?.relationshipStats?.encouragementCount || 0,
      lastSeenAt: parsed?.relationshipStats?.lastSeenAt,
    },
  };
}

function isAssistantLearningStoreEmpty(store: AssistantLearningStore) {
  return Object.keys(store.rewritePreferencesByNoteType).length === 0
    && Object.keys(store.lanePreferencesByNoteType).length === 0
    && Object.keys(store.promptPreferencesByNoteType).length === 0
    && Object.keys(store.promptPreferencesByProfileId).length === 0;
}

function readStore(providerId?: string): AssistantLearningStore {
  if (typeof window === 'undefined') {
    return createEmptyAssistantLearningStore();
  }

  try {
    const scopedProviderId = providerId || getCurrentProviderId();
    const raw = window.localStorage.getItem(getAssistantLearningStorageKey(scopedProviderId));

    if (!raw) {
      return createEmptyAssistantLearningStore();
    }

    const parsed = JSON.parse(raw) as Partial<AssistantLearningStore>;
    return mergeAssistantLearningStore(parsed);
  } catch {
    return createEmptyAssistantLearningStore();
  }
}

function writeStore(store: AssistantLearningStore, providerId?: string) {
  if (typeof window === 'undefined') {
    return;
  }

  const scopedProviderId = providerId || getCurrentProviderId();
  window.localStorage.setItem(getAssistantLearningStorageKey(scopedProviderId), JSON.stringify(store));
  void fetch('/api/assistant/memory', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ providerId: scopedProviderId, learningStore: store }),
  }).catch(() => {
    // Keep local provider-scoped memory available even if backend persistence is unavailable.
  });
}

export async function hydrateAssistantMemoryBundleFromServer(providerId = getCurrentProviderId()) {
  if (typeof window === 'undefined') {
    return {
      learningStore: createEmptyAssistantLearningStore(),
      veraMemoryLedger: null as VeraMemoryLedger | null,
    };
  }

  const response = await fetch(`/api/assistant/memory?providerId=${encodeURIComponent(providerId)}`, { cache: 'no-store' });
  const data = await response.json() as {
    learningStore?: Partial<AssistantLearningStore>;
    veraMemoryLedger?: VeraMemoryLedger;
  };
  const nextStore = mergeAssistantLearningStore(data.learningStore);

  if (!isAssistantLearningStoreEmpty(nextStore)) {
    window.localStorage.setItem(getAssistantLearningStorageKey(providerId), JSON.stringify(nextStore));
  }

  return {
    learningStore: nextStore,
    veraMemoryLedger: data.veraMemoryLedger || null,
  };
}

export async function hydrateAssistantLearningFromServer(providerId = getCurrentProviderId()) {
  const bundle = await hydrateAssistantMemoryBundleFromServer(providerId);
  return bundle.learningStore;
}

function nowIso() {
  return new Date().toISOString();
}

function timestampValue(value?: string) {
  if (!value) {
    return 0;
  }

  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
}

function freshnessScore(input: {
  lastUsedAt?: string;
  lastSeenAt?: string;
  count?: number;
}) {
  return (timestampValue(input.lastUsedAt) * 10) + (timestampValue(input.lastSeenAt) * 3) + (input.count || 0);
}

export function recordRewritePreferenceSelection(noteType: string, optionTone: RewriteOptionTone, providerId?: string) {
  if (!noteType.trim()) {
    return;
  }

  const store = readStore(providerId);
  const current = store.rewritePreferencesByNoteType[noteType] || defaultCounts();
  store.rewritePreferencesByNoteType[noteType] = {
    ...current,
    [optionTone]: current[optionTone] + 1,
  };
  store.rewriteLastSeenByNoteType[noteType] = {
    ...(store.rewriteLastSeenByNoteType[noteType] || {}),
    [optionTone]: nowIso(),
  };
  writeStore(store, providerId);
}

export function dismissRewritePreferenceSuggestion(noteType: string, optionTone: RewriteOptionTone, providerId?: string) {
  if (!noteType.trim()) {
    return;
  }

  const store = readStore(providerId);
  store.dismissedRewriteSuggestionsByNoteType[noteType] = optionTone;
  writeStore(store, providerId);
}

export function acceptRewritePreferenceSuggestion(noteType: string, optionTone: RewriteOptionTone, providerId?: string) {
  if (!noteType.trim()) {
    return;
  }

  const store = readStore(providerId);
  store.acceptedRewriteSuggestionsByNoteType[noteType] = optionTone;
  writeStore(store, providerId);
}

export function clearAcceptedRewritePreferenceSuggestion(noteType: string, optionTone: RewriteOptionTone, providerId?: string) {
  if (!noteType.trim()) {
    return;
  }

  const store = readStore(providerId);

  if (store.acceptedRewriteSuggestionsByNoteType[noteType] === optionTone) {
    delete store.acceptedRewriteSuggestionsByNoteType[noteType];
  }

  writeStore(store, providerId);
}

export function markRewritePreferenceUsed(noteType: string, optionTone: RewriteOptionTone, providerId?: string) {
  if (!noteType.trim()) {
    return;
  }

  const store = readStore(providerId);
  store.actedOnRewriteSuggestionsByNoteType[noteType] = optionTone;
  store.rewriteLastUsedByNoteType[noteType] = {
    ...(store.rewriteLastUsedByNoteType[noteType] || {}),
    [optionTone]: nowIso(),
  };
  writeStore(store, providerId);
}

export function getRewritePreferenceSuggestion(noteType?: string | null, providerId?: string) {
  if (!noteType?.trim()) {
    return null;
  }

  const store = readStore(providerId);
  const counts = store.rewritePreferencesByNoteType[noteType];

  if (!counts) {
    return null;
  }

  const ranked = (Object.entries(counts) as Array<[RewriteOptionTone, number]>)
    .sort((a, b) => b[1] - a[1]);

  const [topTone, topCount] = ranked[0];

  if (!topTone || topCount < 2) {
    return null;
  }

  if (store.dismissedRewriteSuggestionsByNoteType[noteType] === topTone || store.acceptedRewriteSuggestionsByNoteType[noteType] === topTone) {
    return null;
  }

  return {
    noteType,
    optionTone: topTone,
    count: topCount,
  };
}

function normalizeConversationalFactKey(fact: string) {
  return fact
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .slice(0, 80);
}

export function rememberConversationalFact(fact: string, providerId?: string) {
  const normalizedFact = fact.trim().replace(/\s+/g, ' ');

  if (!normalizedFact) {
    return null;
  }

  const store = readStore(providerId);
  const key = normalizeConversationalFactKey(normalizedFact);
  const existing = store.conversationalMemoryFacts.find((item) => item.key === key);

  if (existing) {
    existing.fact = normalizedFact;
    existing.count += 1;
    existing.lastSeenAt = nowIso();
  } else {
    store.conversationalMemoryFacts.unshift({
      key,
      fact: normalizedFact,
      count: 1,
      lastSeenAt: nowIso(),
    });
  }

  store.conversationalMemoryFacts = store.conversationalMemoryFacts
    .sort((left, right) => freshnessScore(right) - freshnessScore(left))
    .slice(0, 12);

  writeStore(store, providerId);
  return store.conversationalMemoryFacts[0] || null;
}

export function getConversationalMemoryFacts(providerId?: string) {
  const store = readStore(providerId);
  return [...store.conversationalMemoryFacts]
    .sort((left, right) => freshnessScore(right) - freshnessScore(left));
}

export function updateConversationalMemoryFact(key: string, fact: string, providerId?: string) {
  const normalizedKey = key.trim();
  const normalizedFact = fact.trim().replace(/\s+/g, ' ');

  if (!normalizedKey || !normalizedFact) {
    return null;
  }

  const store = readStore(providerId);
  const existing = store.conversationalMemoryFacts.find((item) => item.key === normalizedKey);

  if (!existing) {
    return null;
  }

  existing.fact = normalizedFact;
  existing.lastSeenAt = nowIso();
  writeStore(store, providerId);
  return existing;
}

export function removeConversationalMemoryFact(key: string, providerId?: string) {
  const normalizedKey = key.trim();

  if (!normalizedKey) {
    return false;
  }

  const store = readStore(providerId);
  const nextFacts = store.conversationalMemoryFacts.filter((item) => item.key !== normalizedKey);

  if (nextFacts.length === store.conversationalMemoryFacts.length) {
    return false;
  }

  store.conversationalMemoryFacts = nextFacts;
  writeStore(store, providerId);
  return true;
}

export function recordRelationshipSignal(
  signal: 'greeting' | 'gratitude' | 'encouragement',
  providerId?: string,
) {
  const store = readStore(providerId);
  const nextStats = {
    ...store.relationshipStats,
    lastSeenAt: nowIso(),
  };

  if (signal === 'greeting') {
    nextStats.greetingCount += 1;
  } else if (signal === 'gratitude') {
    nextStats.gratitudeCount += 1;
  } else {
    nextStats.encouragementCount += 1;
  }

  store.relationshipStats = nextStats;
  writeStore(store, providerId);
}

export function getRelationshipStats(providerId?: string) {
  return readStore(providerId).relationshipStats;
}

function lanePreferenceKey(input: {
  outputScope: string;
  outputStyle: string;
  format: string;
  requestedSections: string[];
}) {
  return JSON.stringify({
    outputScope: input.outputScope,
    outputStyle: input.outputStyle,
    format: input.format,
    requestedSections: [...input.requestedSections].sort(),
  });
}

export function recordLanePreferenceSelection(input: {
  noteType: string;
  outputScope: string;
  outputStyle: string;
  format: string;
  requestedSections: string[];
}, providerId?: string) {
  if (!input.noteType.trim()) {
    return;
  }

  const store = readStore(providerId);
  const current = store.lanePreferencesByNoteType[input.noteType] || [];
  const key = lanePreferenceKey(input);
  const existing = current.find((item) => lanePreferenceKey(item) === key);

  if (existing) {
    existing.count += 1;
    existing.lastSeenAt = nowIso();
  } else {
    current.push({
      noteType: input.noteType,
      outputScope: input.outputScope,
      outputStyle: input.outputStyle,
      format: input.format,
      requestedSections: [...input.requestedSections],
      count: 1,
      lastSeenAt: nowIso(),
    });
  }

  store.lanePreferencesByNoteType[input.noteType] = current;
  writeStore(store, providerId);
}

export function dismissLanePreferenceSuggestion(noteType: string, key: string, providerId?: string) {
  if (!noteType.trim()) {
    return;
  }

  const store = readStore(providerId);
  store.dismissedLanePreferenceKeysByNoteType[noteType] = key;
  writeStore(store, providerId);
}

export function acceptLanePreferenceSuggestion(noteType: string, key: string, providerId?: string) {
  if (!noteType.trim()) {
    return;
  }

  const store = readStore(providerId);
  store.acceptedLanePreferenceKeysByNoteType[noteType] = key;
  writeStore(store, providerId);
}

export function clearAcceptedLanePreferenceSuggestion(noteType: string, key: string, providerId?: string) {
  if (!noteType.trim()) {
    return;
  }

  const store = readStore(providerId);

  if (store.acceptedLanePreferenceKeysByNoteType[noteType] === key) {
    delete store.acceptedLanePreferenceKeysByNoteType[noteType];
  }

  writeStore(store, providerId);
}

export function markLanePreferenceUsed(noteType: string, key: string, providerId?: string) {
  if (!noteType.trim()) {
    return;
  }

  const store = readStore(providerId);
  store.actedOnLanePreferenceKeysByNoteType[noteType] = key;
  const existing = (store.lanePreferencesByNoteType[noteType] || []).find((item) => lanePreferenceKey(item) === key);
  if (existing) {
    existing.lastUsedAt = nowIso();
  }
  writeStore(store, providerId);
}

export function getLanePreferenceSuggestion(noteType?: string | null, providerId?: string) {
  if (!noteType?.trim()) {
    return null;
  }

  const store = readStore(providerId);
  const current = store.lanePreferencesByNoteType[noteType] || [];

  if (!current.length) {
    return null;
  }

  const ranked = [...current].sort((a, b) => b.count - a.count);
  const top = ranked[0];

  if (!top || top.count < 2) {
    return null;
  }

  const key = lanePreferenceKey(top);

  if (
    store.dismissedLanePreferenceKeysByNoteType[noteType] === key
    || store.acceptedLanePreferenceKeysByNoteType[noteType] === key
  ) {
    return null;
  }

  return {
    ...top,
    key,
  };
}

function normalizePromptPattern(input: string) {
  return input.toLowerCase().replace(/\s+/g, ' ').trim();
}

function classifyPromptPreference(input: { noteType: string; request: string; draft: string }) {
  const combined = normalizePromptPattern(`${input.request} ${input.draft}`);
  const noteLabel = input.noteType.toLowerCase();

  const definitions = [
    {
      key: 'conservative-differential',
      match: /conservative|differential|uncertain|source-close|source close/,
      label: `Conservative ${noteLabel} wording`,
      seedPrompt: `For ${input.noteType}, keep the note conservative, differential-aware, and close to source. Preserve uncertainty instead of smoothing it over.`,
    },
    {
      key: 'shorter-plan',
      match: /plan shorter|shorter plan|easier to scan|brief plan|concise plan/,
      label: `Shorter ${noteLabel} plan style`,
      seedPrompt: `For ${input.noteType}, keep the plan shorter and easier to scan while staying clinically accurate.`,
    },
    {
      key: 'no-standalone-mse',
      match: /standalone mse|avoid a standalone mse|keep psych observations inside hpi/,
      label: `Source-supported MSE only for ${noteLabel}`,
      seedPrompt: `For ${input.noteType}, avoid a standalone MSE unless the source clearly supports it. Keep psych observations inside the note body when that fits better.`,
    },
    {
      key: 'destination-formatting',
      match: /destination|wellsky|format this cleanly|output destination|formatting/,
      label: `Destination-aware ${noteLabel} formatting`,
      seedPrompt: `For ${input.noteType}, format the note cleanly for my destination workflow without changing clinical meaning.`,
    },
    {
      key: 'concise-lane',
      match: /more concise|concise|shorter|faster to scan/,
      label: `Concise ${noteLabel} lane`,
      seedPrompt: `For ${input.noteType}, keep the note concise and easier to scan while staying close to source.`,
    },
  ];

  const matched = definitions.find((definition) => definition.match.test(combined));

  if (matched) {
    return matched;
  }

  if (!combined) {
    return null;
  }

  return {
    key: `custom:${combined.slice(0, 80)}`,
    label: `Custom ${noteLabel} preference pattern`,
    seedPrompt: input.request.trim() || `For ${input.noteType}, use the same preference style I have been applying repeatedly.`,
  };
}

export function recordPromptPreferenceSelection(input: {
  noteType: string;
  request: string;
  draft: string;
  profileId?: string | null;
}, providerId?: string) {
  if (!input.noteType.trim()) {
    return;
  }

  const classified = classifyPromptPreference(input);

  if (!classified) {
    return;
  }

  const store = readStore(providerId);
  const current = store.promptPreferencesByNoteType[input.noteType] || [];
  const existing = current.find((item) => item.patternKey === classified.key);

  if (existing) {
    existing.count += 1;
    existing.lastSeenAt = nowIso();
  } else {
    current.push({
      noteType: input.noteType,
      patternKey: classified.key,
      label: classified.label,
      seedPrompt: classified.seedPrompt,
      count: 1,
      lastSeenAt: nowIso(),
    });
  }

  store.promptPreferencesByNoteType[input.noteType] = current;

  if (input.profileId?.trim()) {
    const profileCurrent = store.promptPreferencesByProfileId[input.profileId] || [];
    const existingProfileRecord = profileCurrent.find((item) => item.patternKey === classified.key);

    if (existingProfileRecord) {
      existingProfileRecord.count += 1;
      existingProfileRecord.lastSeenAt = nowIso();
      if (!existingProfileRecord.noteTypes.includes(input.noteType)) {
        existingProfileRecord.noteTypes.push(input.noteType);
      }
    } else {
      profileCurrent.push({
        profileId: input.profileId,
        patternKey: classified.key,
        label: classified.label.replace(input.noteType.toLowerCase(), 'note'),
        seedPrompt: classified.seedPrompt,
        count: 1,
        noteTypes: [input.noteType],
        lastSeenAt: nowIso(),
      });
    }

    store.promptPreferencesByProfileId[input.profileId] = profileCurrent;
  }

  writeStore(store, providerId);
}

export function dismissPromptPreferenceSuggestion(noteType: string, key: string, providerId?: string) {
  if (!noteType.trim()) {
    return;
  }

  const store = readStore(providerId);
  store.dismissedPromptPreferenceKeysByNoteType[noteType] = key;
  writeStore(store, providerId);
}

export function acceptPromptPreferenceSuggestion(noteType: string, key: string, providerId?: string) {
  if (!noteType.trim()) {
    return;
  }

  const store = readStore(providerId);
  store.acceptedPromptPreferenceKeysByNoteType[noteType] = key;
  writeStore(store, providerId);
}

export function clearAcceptedPromptPreferenceSuggestion(noteType: string, key: string, providerId?: string) {
  if (!noteType.trim()) {
    return;
  }

  const store = readStore(providerId);

  if (store.acceptedPromptPreferenceKeysByNoteType[noteType] === key) {
    delete store.acceptedPromptPreferenceKeysByNoteType[noteType];
  }

  writeStore(store, providerId);
}

export function markPromptPreferenceUsed(noteType: string, key: string, providerId?: string) {
  if (!noteType.trim()) {
    return;
  }

  const store = readStore(providerId);
  store.actedOnPromptPreferenceKeysByNoteType[noteType] = key;
  const existing = (store.promptPreferencesByNoteType[noteType] || []).find((item) => item.patternKey === key);
  if (existing) {
    existing.lastUsedAt = nowIso();
  }
  writeStore(store, providerId);
}

export function getPromptPreferenceSuggestion(noteType?: string | null, providerId?: string) {
  if (!noteType?.trim()) {
    return null;
  }

  const store = readStore(providerId);
  const current = store.promptPreferencesByNoteType[noteType] || [];

  if (!current.length) {
    return null;
  }

  const ranked = [...current].sort((a, b) => b.count - a.count);
  const top = ranked[0];

  if (!top || top.count < 2) {
    return null;
  }

  if (
    store.dismissedPromptPreferenceKeysByNoteType[noteType] === top.patternKey
    || store.acceptedPromptPreferenceKeysByNoteType[noteType] === top.patternKey
  ) {
    return null;
  }

  return {
    ...top,
    key: top.patternKey,
  };
}

export function dismissProfilePromptPreferenceSuggestion(profileId: string, key: string, providerId?: string) {
  if (!profileId.trim()) {
    return;
  }

  const store = readStore(providerId);
  store.dismissedPromptPreferenceKeysByProfileId[profileId] = key;
  writeStore(store, providerId);
}

export function acceptProfilePromptPreferenceSuggestion(profileId: string, key: string, providerId?: string) {
  if (!profileId.trim()) {
    return;
  }

  const store = readStore(providerId);
  store.acceptedPromptPreferenceKeysByProfileId[profileId] = key;
  writeStore(store, providerId);
}

export function clearAcceptedProfilePromptPreferenceSuggestion(profileId: string, key: string, providerId?: string) {
  if (!profileId.trim()) {
    return;
  }

  const store = readStore(providerId);

  if (store.acceptedPromptPreferenceKeysByProfileId[profileId] === key) {
    delete store.acceptedPromptPreferenceKeysByProfileId[profileId];
  }

  writeStore(store, providerId);
}

export function markProfilePromptPreferenceUsed(profileId: string, key: string, providerId?: string) {
  if (!profileId.trim()) {
    return;
  }

  const store = readStore(providerId);
  store.actedOnPromptPreferenceKeysByProfileId[profileId] = key;
  const existing = (store.promptPreferencesByProfileId[profileId] || []).find((item) => item.patternKey === key);
  if (existing) {
    existing.lastUsedAt = nowIso();
  }
  writeStore(store, providerId);
}

export function getProfilePromptPreferenceSuggestion(profileId?: string | null, providerId?: string) {
  if (!profileId?.trim()) {
    return null;
  }

  const store = readStore(providerId);
  const current = store.promptPreferencesByProfileId[profileId] || [];

  if (!current.length) {
    return null;
  }

  const ranked = [...current].sort((a, b) => (
    freshnessScore({
      lastUsedAt: b.lastUsedAt,
      lastSeenAt: b.lastSeenAt,
      count: b.count,
    }) - freshnessScore({
      lastUsedAt: a.lastUsedAt,
      lastSeenAt: a.lastSeenAt,
      count: a.count,
    })
  ));
  const top = ranked[0];

  if (!top || top.count < 3 || top.noteTypes.length < 2) {
    return null;
  }

  if (
    store.dismissedPromptPreferenceKeysByProfileId[profileId] === top.patternKey
    || store.acceptedPromptPreferenceKeysByProfileId[profileId] === top.patternKey
  ) {
    return null;
  }

  return {
    ...top,
    key: top.patternKey,
  };
}

function rewriteStatusFor(noteType: string, optionTone: RewriteOptionTone, store: AssistantLearningStore) {
  if (store.actedOnRewriteSuggestionsByNoteType[noteType] === optionTone) {
    return 'used' as const;
  }

  if (store.acceptedRewriteSuggestionsByNoteType[noteType] === optionTone) {
    return 'accepted' as const;
  }

  if (store.dismissedRewriteSuggestionsByNoteType[noteType] === optionTone) {
    return 'dismissed' as const;
  }

  return 'active' as const;
}

function buildRewriteReason(noteType: string, optionTone: RewriteOptionTone, count: number) {
  return `Atlas inferred this because you chose the ${optionTone.replace(/-/g, ' ')} rewrite style ${count} time${count === 1 ? '' : 's'} while reviewing ${noteType}.`;
}

function buildLaneReason(record: LanePreferenceRecord) {
  const sectionSummary = record.requestedSections.length
    ? `selected sections (${record.requestedSections.join(', ')})`
    : 'the default section plan';

  return `Atlas inferred this because you finalized ${record.noteType} with ${record.outputScope.replace('-', ' ')} scope, ${record.outputStyle} style, ${record.format} format, and ${sectionSummary} ${record.count} time${record.count === 1 ? '' : 's'}.`;
}

function buildPromptReason(record: PromptPreferenceRecord) {
  return `Atlas inferred this because you used the same prompt-builder preference pattern for ${record.noteType} ${record.count} time${record.count === 1 ? '' : 's'}.`;
}

function buildProfilePromptReason(record: ProfilePromptPreferenceRecord) {
  return `Atlas inferred this because the same preference pattern appeared ${record.count} time${record.count === 1 ? '' : 's'} across ${record.noteTypes.length} note types in this provider profile.`;
}

function laneStatusFor(noteType: string, key: string, store: AssistantLearningStore) {
  if (store.actedOnLanePreferenceKeysByNoteType[noteType] === key) {
    return 'used' as const;
  }

  if (store.acceptedLanePreferenceKeysByNoteType[noteType] === key) {
    return 'accepted' as const;
  }

  if (store.dismissedLanePreferenceKeysByNoteType[noteType] === key) {
    return 'dismissed' as const;
  }

  return 'active' as const;
}

function promptStatusFor(noteType: string, key: string, store: AssistantLearningStore) {
  if (store.actedOnPromptPreferenceKeysByNoteType[noteType] === key) {
    return 'used' as const;
  }

  if (store.acceptedPromptPreferenceKeysByNoteType[noteType] === key) {
    return 'accepted' as const;
  }

  if (store.dismissedPromptPreferenceKeysByNoteType[noteType] === key) {
    return 'dismissed' as const;
  }

  return 'active' as const;
}

function profilePromptStatusFor(profileId: string, key: string, store: AssistantLearningStore) {
  if (store.actedOnPromptPreferenceKeysByProfileId[profileId] === key) {
    return 'used' as const;
  }

  if (store.acceptedPromptPreferenceKeysByProfileId[profileId] === key) {
    return 'accepted' as const;
  }

  if (store.dismissedPromptPreferenceKeysByProfileId[profileId] === key) {
    return 'dismissed' as const;
  }

  return 'active' as const;
}

function topRewriteSuggestion(noteType: string, store: AssistantLearningStore) {
  const counts = store.rewritePreferencesByNoteType[noteType];

  if (!counts) {
    return null;
  }

  const ranked = (Object.entries(counts) as Array<[RewriteOptionTone, number]>)
    .map(([optionTone, count]) => ({
      noteType,
      optionTone,
      count,
      status: rewriteStatusFor(noteType, optionTone, store),
      reason: buildRewriteReason(noteType, optionTone, count),
      lastSeenAt: store.rewriteLastSeenByNoteType[noteType]?.[optionTone],
      lastUsedAt: store.rewriteLastUsedByNoteType[noteType]?.[optionTone],
    }))
    .sort((a, b) => (
      freshnessScore({
        lastUsedAt: b.lastUsedAt,
        lastSeenAt: b.lastSeenAt,
        count: b.count,
      }) - freshnessScore({
        lastUsedAt: a.lastUsedAt,
        lastSeenAt: a.lastSeenAt,
        count: a.count,
      })
    ));

  return ranked[0] || null;
}

function topLaneSuggestion(noteType: string, store: AssistantLearningStore) {
  const records = store.lanePreferencesByNoteType[noteType] || [];
  const top = [...records].sort((a, b) => (
    freshnessScore({
      lastUsedAt: b.lastUsedAt,
      lastSeenAt: b.lastSeenAt,
      count: b.count,
    }) - freshnessScore({
      lastUsedAt: a.lastUsedAt,
      lastSeenAt: a.lastSeenAt,
      count: a.count,
    })
  ))[0];

  return top ? {
    ...top,
    key: lanePreferenceKey(top),
    status: laneStatusFor(noteType, lanePreferenceKey(top), store),
    reason: buildLaneReason(top),
    lastSeenAt: top.lastSeenAt,
    lastUsedAt: top.lastUsedAt,
  } : null;
}

function topPromptSuggestion(noteType: string, store: AssistantLearningStore) {
  const records = store.promptPreferencesByNoteType[noteType] || [];
  const top = [...records].sort((a, b) => (
    freshnessScore({
      lastUsedAt: b.lastUsedAt,
      lastSeenAt: b.lastSeenAt,
      count: b.count,
    }) - freshnessScore({
      lastUsedAt: a.lastUsedAt,
      lastSeenAt: a.lastSeenAt,
      count: a.count,
    })
  ))[0];

  return top ? {
    ...top,
    key: top.patternKey,
    status: promptStatusFor(noteType, top.patternKey, store),
    reason: buildPromptReason(top),
    lastSeenAt: top.lastSeenAt,
    lastUsedAt: top.lastUsedAt,
  } : null;
}

export function getProviderWorkflowInsights(input: {
  profileId?: string | null;
  noteTypes?: string[];
}, providerId?: string) {
  const store = readStore(providerId);
  const noteTypes = (input.noteTypes || []).filter((noteType) => noteType.trim());
  const uniqueNoteTypes = Array.from(new Set(noteTypes));
  const profileRecords = input.profileId?.trim() ? (store.promptPreferencesByProfileId[input.profileId] || []) : [];
  const topProfileRecord = [...profileRecords].sort((a, b) => (
    freshnessScore({
      lastUsedAt: b.lastUsedAt,
      lastSeenAt: b.lastSeenAt,
      count: b.count,
    }) - freshnessScore({
      lastUsedAt: a.lastUsedAt,
      lastSeenAt: a.lastSeenAt,
      count: a.count,
    })
  ))[0];

  const noteTypeInsights = uniqueNoteTypes.map((noteType) => ({
    noteType,
    rewriteSuggestion: topRewriteSuggestion(noteType, store),
    laneSuggestion: topLaneSuggestion(noteType, store),
    promptSuggestion: topPromptSuggestion(noteType, store),
  })).filter((item) => item.rewriteSuggestion || item.laneSuggestion || item.promptSuggestion)
    .sort((a, b) => {
      const aScore = Math.max(
        freshnessScore(a.rewriteSuggestion || {}),
        freshnessScore(a.laneSuggestion || {}),
        freshnessScore(a.promptSuggestion || {}),
      );
      const bScore = Math.max(
        freshnessScore(b.rewriteSuggestion || {}),
        freshnessScore(b.laneSuggestion || {}),
        freshnessScore(b.promptSuggestion || {}),
      );

      return bScore - aScore;
    });

  return {
    profilePromptSuggestion: topProfileRecord ? {
      ...topProfileRecord,
      key: topProfileRecord.patternKey,
      status: input.profileId ? profilePromptStatusFor(input.profileId, topProfileRecord.patternKey, store) : 'active' as const,
      reason: buildProfilePromptReason(topProfileRecord),
      lastSeenAt: topProfileRecord.lastSeenAt,
      lastUsedAt: topProfileRecord.lastUsedAt,
    } : null,
    noteTypeInsights,
  };
}

export function resetAssistantLearningForProfile(input: {
  profileId?: string | null;
  noteTypes?: string[];
}, providerId?: string) {
  const store = readStore(providerId);
  const noteTypes = (input.noteTypes || []).filter((noteType) => noteType.trim());

  noteTypes.forEach((noteType) => {
    delete store.rewritePreferencesByNoteType[noteType];
    delete store.rewriteLastSeenByNoteType[noteType];
    delete store.rewriteLastUsedByNoteType[noteType];
    delete store.dismissedRewriteSuggestionsByNoteType[noteType];
    delete store.acceptedRewriteSuggestionsByNoteType[noteType];
    delete store.actedOnRewriteSuggestionsByNoteType[noteType];
    delete store.lanePreferencesByNoteType[noteType];
    delete store.dismissedLanePreferenceKeysByNoteType[noteType];
    delete store.acceptedLanePreferenceKeysByNoteType[noteType];
    delete store.actedOnLanePreferenceKeysByNoteType[noteType];
    delete store.promptPreferencesByNoteType[noteType];
    delete store.dismissedPromptPreferenceKeysByNoteType[noteType];
    delete store.acceptedPromptPreferenceKeysByNoteType[noteType];
    delete store.actedOnPromptPreferenceKeysByNoteType[noteType];
  });

  if (input.profileId?.trim()) {
    delete store.promptPreferencesByProfileId[input.profileId];
    delete store.dismissedPromptPreferenceKeysByProfileId[input.profileId];
    delete store.acceptedPromptPreferenceKeysByProfileId[input.profileId];
    delete store.actedOnPromptPreferenceKeysByProfileId[input.profileId];
  }

  writeStore(store, providerId);
}
