import { promises as fs } from 'fs';
import path from 'path';
import { DEFAULT_PROVIDER_SETTINGS, type ProviderSettings } from '@/lib/constants/settings';
import { DEFAULT_PROVIDER_ACCOUNT_ID } from '@/lib/constants/provider-accounts';
import { DEFAULT_PROVIDER_IDENTITY_ID, findProviderIdentity } from '@/lib/constants/provider-identities';
import { mergePresetCatalog, type NotePreset } from '@/lib/note/presets';
import { buildDraftRecoveryState, getDraftPriorityScore } from '@/lib/veranote/draft-recovery';
import { createEmptyAssistantLearningStore, type AssistantLearningStore } from '@/lib/veranote/assistant-learning';
import { buildVeraMemoryLedger } from '@/lib/veranote/vera-memory-ledger';
import type { DraftSession, PersistedDraftSession } from '@/types/session';
import type { BetaFeedbackCategory, BetaFeedbackItem, BetaFeedbackMetadata } from '@/types/beta-feedback';
import type { VeranoteBuildTask } from '@/types/task';
import type { VeraMemoryLedger } from '@/types/vera-memory';
import type { DictationAuditEvent } from '@/types/dictation';

type DraftRecord = PersistedDraftSession;

type PrototypeDb = {
  drafts: DraftRecord[];
  dictationAuditEvents: DictationAuditEvent[];
  providerSettings: ProviderSettings;
  providerSettingsByProviderId: Record<string, ProviderSettings>;
  currentProviderAccountId: string;
  currentProviderId: string;
  notePresets: NotePreset[];
  notePresetsByProviderId: Record<string, NotePreset[]>;
  assistantLearningByProviderId: Record<string, AssistantLearningStore>;
  veraMemoryLedgerByProviderId: Record<string, VeraMemoryLedger>;
  veranoteBuildTasks: VeranoteBuildTask[];
  betaFeedback: BetaFeedbackItem[];
};

const DATA_DIR = path.join(process.cwd(), '.prototype-data');
const DB_PATH = path.join(DATA_DIR, 'prototype-db.json');

const defaultDb: PrototypeDb = {
  drafts: [],
  dictationAuditEvents: [],
  providerSettings: DEFAULT_PROVIDER_SETTINGS,
  providerSettingsByProviderId: {
    [DEFAULT_PROVIDER_IDENTITY_ID]: DEFAULT_PROVIDER_SETTINGS,
  },
  currentProviderAccountId: DEFAULT_PROVIDER_ACCOUNT_ID,
  currentProviderId: DEFAULT_PROVIDER_IDENTITY_ID,
  notePresets: mergePresetCatalog([]),
  notePresetsByProviderId: {
    [DEFAULT_PROVIDER_IDENTITY_ID]: mergePresetCatalog([]),
  },
  assistantLearningByProviderId: {
    [DEFAULT_PROVIDER_IDENTITY_ID]: createEmptyAssistantLearningStore(),
  },
  veraMemoryLedgerByProviderId: {
    [DEFAULT_PROVIDER_IDENTITY_ID]: buildVeraMemoryLedger({
      providerId: DEFAULT_PROVIDER_IDENTITY_ID,
      settings: DEFAULT_PROVIDER_SETTINGS,
      learningStore: createEmptyAssistantLearningStore(),
    }),
  },
  veranoteBuildTasks: [],
  betaFeedback: [],
};

async function ensureDbFile() {
  await fs.mkdir(DATA_DIR, { recursive: true });

  try {
    await fs.access(DB_PATH);
  } catch {
    await fs.writeFile(DB_PATH, JSON.stringify(defaultDb, null, 2), 'utf8');
  }
}

async function readDb(): Promise<PrototypeDb> {
  await ensureDbFile();

  try {
    const raw = await fs.readFile(DB_PATH, 'utf8');
    const parsed = JSON.parse(raw) as Partial<PrototypeDb>;

    return {
      drafts: Array.isArray(parsed.drafts) ? parsed.drafts.map((draft) => normalizeDraftRecord(draft as Partial<DraftRecord>)) : [],
      dictationAuditEvents: Array.isArray(parsed.dictationAuditEvents)
        ? parsed.dictationAuditEvents.filter((event): event is DictationAuditEvent => (
          Boolean(event)
          && typeof event === 'object'
          && typeof (event as DictationAuditEvent).id === 'string'
          && typeof (event as DictationAuditEvent).eventName === 'string'
        ))
        : [],
      providerSettings: {
        ...DEFAULT_PROVIDER_SETTINGS,
        ...(parsed.providerSettings || {}),
      },
      providerSettingsByProviderId: typeof parsed.providerSettingsByProviderId === 'object' && parsed.providerSettingsByProviderId
        ? Object.fromEntries(
            Object.entries(parsed.providerSettingsByProviderId).map(([providerId, settings]) => [
              providerId,
              {
                ...DEFAULT_PROVIDER_SETTINGS,
                ...(settings || {}),
              },
            ]),
          )
        : {
            [DEFAULT_PROVIDER_IDENTITY_ID]: {
              ...DEFAULT_PROVIDER_SETTINGS,
              ...(parsed.providerSettings || {}),
            },
          },
      currentProviderAccountId: typeof parsed.currentProviderAccountId === 'string' && parsed.currentProviderAccountId
        ? parsed.currentProviderAccountId
        : DEFAULT_PROVIDER_ACCOUNT_ID,
      currentProviderId: typeof parsed.currentProviderId === 'string' && parsed.currentProviderId
        ? parsed.currentProviderId
        : DEFAULT_PROVIDER_IDENTITY_ID,
      notePresets: mergePresetCatalog(Array.isArray(parsed.notePresets) ? parsed.notePresets : []),
      notePresetsByProviderId: typeof parsed.notePresetsByProviderId === 'object' && parsed.notePresetsByProviderId
        ? Object.fromEntries(
            Object.entries(parsed.notePresetsByProviderId).map(([providerId, presets]) => [
              providerId,
              mergePresetCatalog(Array.isArray(presets) ? presets : []),
            ]),
          )
        : {
            [DEFAULT_PROVIDER_IDENTITY_ID]: mergePresetCatalog(Array.isArray(parsed.notePresets) ? parsed.notePresets : []),
          },
      assistantLearningByProviderId: typeof parsed.assistantLearningByProviderId === 'object' && parsed.assistantLearningByProviderId
        ? Object.fromEntries(
            Object.entries(parsed.assistantLearningByProviderId).map(([providerId, learningStore]) => [
              providerId,
              {
                ...createEmptyAssistantLearningStore(),
                ...(learningStore || {}),
              },
            ]),
          )
        : {
            [DEFAULT_PROVIDER_IDENTITY_ID]: createEmptyAssistantLearningStore(),
          },
      veraMemoryLedgerByProviderId: typeof parsed.veraMemoryLedgerByProviderId === 'object' && parsed.veraMemoryLedgerByProviderId
        ? Object.fromEntries(
            Object.entries(parsed.veraMemoryLedgerByProviderId).map(([providerId, ledger]) => [
              providerId,
              ledger as VeraMemoryLedger,
            ]),
          )
        : {
            [DEFAULT_PROVIDER_IDENTITY_ID]: buildVeraMemoryLedger({
              providerId: DEFAULT_PROVIDER_IDENTITY_ID,
              settings: {
                ...DEFAULT_PROVIDER_SETTINGS,
                ...(parsed.providerSettings || {}),
              },
              learningStore: createEmptyAssistantLearningStore(),
            }),
          },
      veranoteBuildTasks: Array.isArray(parsed.veranoteBuildTasks) ? parsed.veranoteBuildTasks : [],
      betaFeedback: Array.isArray(parsed.betaFeedback) ? parsed.betaFeedback : [],
    };
  } catch {
    return defaultDb;
  }
}

async function writeDb(data: PrototypeDb) {
  await ensureDbFile();
  await fs.writeFile(DB_PATH, JSON.stringify(data, null, 2), 'utf8');
}

function createDraftId() {
  return `draft_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function createFeedbackId() {
  return `feedback_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeDraftRecord(rawDraft: Partial<DraftRecord>): DraftRecord {
  const updatedAt = typeof rawDraft.updatedAt === 'string' ? rawDraft.updatedAt : new Date().toISOString();
  const providerIdentityId = typeof rawDraft.providerIdentityId === 'string' && rawDraft.providerIdentityId
    ? rawDraft.providerIdentityId
    : DEFAULT_PROVIDER_IDENTITY_ID;
  const draftId = typeof rawDraft.id === 'string' && rawDraft.id ? rawDraft.id : createDraftId();

  return {
    draftId,
    draftVersion: typeof rawDraft.version === 'number' && rawDraft.version > 0 ? rawDraft.version : 1,
    providerIdentityId,
    lastSavedAt: typeof rawDraft.lastSavedAt === 'string' ? rawDraft.lastSavedAt : updatedAt,
    specialty: typeof rawDraft.specialty === 'string' ? rawDraft.specialty : 'Psychiatry',
    role: typeof rawDraft.role === 'string' ? rawDraft.role : 'Psychiatric NP',
    noteType: typeof rawDraft.noteType === 'string' ? rawDraft.noteType : 'Inpatient Psych Progress Note',
    template: typeof rawDraft.template === 'string' ? rawDraft.template : 'Default Inpatient Psych Progress Note',
    outputStyle: typeof rawDraft.outputStyle === 'string' ? rawDraft.outputStyle : 'Standard',
    format: typeof rawDraft.format === 'string' ? rawDraft.format : 'Labeled Sections',
    keepCloserToSource: rawDraft.keepCloserToSource !== false,
    flagMissingInfo: rawDraft.flagMissingInfo !== false,
    outputScope: rawDraft.outputScope,
    requestedSections: Array.isArray(rawDraft.requestedSections) ? rawDraft.requestedSections : undefined,
    selectedPresetId: typeof rawDraft.selectedPresetId === 'string' ? rawDraft.selectedPresetId : undefined,
    presetName: typeof rawDraft.presetName === 'string' ? rawDraft.presetName : undefined,
    customInstructions: typeof rawDraft.customInstructions === 'string' ? rawDraft.customInstructions : undefined,
    encounterSupport: rawDraft.encounterSupport,
    medicationProfile: Array.isArray(rawDraft.medicationProfile) ? rawDraft.medicationProfile : undefined,
    diagnosisProfile: Array.isArray(rawDraft.diagnosisProfile) ? rawDraft.diagnosisProfile : undefined,
    sourceInput: typeof rawDraft.sourceInput === 'string' ? rawDraft.sourceInput : '',
    sourceSections: rawDraft.sourceSections,
    dictationInsertions: rawDraft.dictationInsertions && typeof rawDraft.dictationInsertions === 'object' ? rawDraft.dictationInsertions : undefined,
    note: typeof rawDraft.note === 'string' ? rawDraft.note : '',
    flags: Array.isArray(rawDraft.flags) ? rawDraft.flags.filter((item): item is string => typeof item === 'string') : [],
    copilotSuggestions: Array.isArray(rawDraft.copilotSuggestions) ? rawDraft.copilotSuggestions : [],
    sectionReviewState: rawDraft.sectionReviewState,
    recoveryState: rawDraft.recoveryState || buildDraftRecoveryState({
      sourceInput: typeof rawDraft.sourceInput === 'string' ? rawDraft.sourceInput : '',
      note: typeof rawDraft.note === 'string' ? rawDraft.note : '',
      sectionReviewState: rawDraft.sectionReviewState,
    }, { updatedAt }),
    mode: rawDraft.mode === 'fallback' ? 'fallback' : 'live',
    warning: typeof rawDraft.warning === 'string' ? rawDraft.warning : undefined,
    id: draftId,
    createdAt: typeof rawDraft.createdAt === 'string' ? rawDraft.createdAt : updatedAt,
    updatedAt,
    version: typeof rawDraft.version === 'number' && rawDraft.version > 0 ? rawDraft.version : 1,
    archivedAt: typeof rawDraft.archivedAt === 'string' ? rawDraft.archivedAt : undefined,
    lastOpenedAt: typeof rawDraft.lastOpenedAt === 'string' ? rawDraft.lastOpenedAt : rawDraft.recoveryState?.lastOpenedAt,
  };
}

function sortDrafts(drafts: DraftRecord[]) {
  return [...drafts].sort((left, right) => getDraftPriorityScore(right) - getDraftPriorityScore(left));
}

function createDraftFingerprint(draft: Pick<DraftSession, 'noteType' | 'template' | 'sourceInput' | 'note'>) {
  return JSON.stringify({
    noteType: draft.noteType || '',
    template: draft.template || '',
    sourceInput: draft.sourceInput?.trim() || '',
    note: draft.note?.trim() || '',
  });
}

function hasMeaningfulDraftChanges(previous: DraftRecord, next: DraftSession) {
  return createDraftFingerprint(previous) !== createDraftFingerprint(next)
    || JSON.stringify(previous.sectionReviewState || {}) !== JSON.stringify(next.sectionReviewState || {})
    || JSON.stringify(previous.copilotSuggestions || []) !== JSON.stringify(next.copilotSuggestions || [])
    || JSON.stringify(previous.dictationInsertions || {}) !== JSON.stringify(next.dictationInsertions || {})
    || JSON.stringify(previous.flags || []) !== JSON.stringify(next.flags || []);
}

export async function saveDraft(draft: DraftSession, providerId = DEFAULT_PROVIDER_IDENTITY_ID) {
  const db = await readDb();
  const now = new Date().toISOString();
  const requestedDraftId = typeof draft.draftId === 'string' && draft.draftId ? draft.draftId : undefined;
  const existingIndex = db.drafts.findIndex((item) => (
    item.providerIdentityId === providerId
    && !item.archivedAt
    && (
      (requestedDraftId && item.id === requestedDraftId)
      || (
        !requestedDraftId
        && createDraftFingerprint(item) === createDraftFingerprint(draft)
      )
    )
  ));
  const existingRecord = existingIndex >= 0 ? db.drafts[existingIndex] : null;
  const contentChanged = existingRecord ? hasMeaningfulDraftChanges(existingRecord, draft) : true;
  const version = existingRecord
    ? (contentChanged ? existingRecord.version + 1 : existingRecord.version)
    : 1;
  const record = normalizeDraftRecord({
    ...(existingRecord || {}),
    ...draft,
    id: existingRecord?.id || requestedDraftId || createDraftId(),
    draftId: existingRecord?.id || requestedDraftId,
    providerIdentityId: providerId,
    updatedAt: now,
    lastSavedAt: now,
    createdAt: existingRecord?.createdAt || now,
    version,
    draftVersion: version,
    archivedAt: undefined,
    recoveryState: buildDraftRecoveryState(draft, {
      workflowStage: draft.recoveryState?.workflowStage,
      composeLane: draft.recoveryState?.composeLane,
      lastOpenedAt: existingRecord?.lastOpenedAt || draft.recoveryState?.lastOpenedAt,
      updatedAt: now,
    }),
    lastOpenedAt: existingRecord?.lastOpenedAt || draft.recoveryState?.lastOpenedAt,
  });

  db.drafts = [record, ...db.drafts.filter((item) => item.id !== record.id)].slice(0, 100);
  await writeDb(db);

  return record;
}

export async function saveDictationAuditEvent(
  event: DictationAuditEvent,
  providerId = DEFAULT_PROVIDER_IDENTITY_ID,
) {
  const db = await readDb();
  const normalizedEvent: DictationAuditEvent = {
    ...event,
    actorUserId: providerId,
  };
  db.dictationAuditEvents = [
    normalizedEvent,
    ...db.dictationAuditEvents.filter((item) => item.id !== normalizedEvent.id),
  ].slice(0, 2000);
  await writeDb(db);
  return normalizedEvent;
}

export async function listDictationAuditEvents(input?: {
  providerId?: string;
  sessionId?: string;
  limit?: number;
}) {
  const providerId = input?.providerId || DEFAULT_PROVIDER_IDENTITY_ID;
  const db = await readDb();
  const events = db.dictationAuditEvents
    .filter((event) => (
      event.actorUserId === providerId
      && (!input?.sessionId || event.dictationSessionId === input.sessionId)
    ))
    .sort((left, right) => new Date(right.occurredAt).getTime() - new Date(left.occurredAt).getTime());

  return events.slice(0, input?.limit || 25);
}

export async function getLatestDraft(providerId = DEFAULT_PROVIDER_IDENTITY_ID, options?: { includeArchived?: boolean }) {
  const db = await readDb();
  const drafts = sortDrafts(db.drafts.filter((draft) => (
    draft.providerIdentityId === providerId && (options?.includeArchived ? true : !draft.archivedAt)
  )));
  return drafts[0] ?? null;
}

export async function listDrafts(providerId = DEFAULT_PROVIDER_IDENTITY_ID, options?: { includeArchived?: boolean }) {
  const db = await readDb();
  return sortDrafts(db.drafts.filter((draft) => (
    draft.providerIdentityId === providerId && (options?.includeArchived ? true : !draft.archivedAt)
  )));
}

export async function getDraftById(draftId: string, providerId = DEFAULT_PROVIDER_IDENTITY_ID, options?: { includeArchived?: boolean }) {
  const db = await readDb();
  return db.drafts.find((draft) => (
    draft.id === draftId
    && draft.providerIdentityId === providerId
    && (options?.includeArchived ? true : !draft.archivedAt)
  )) || null;
}

export async function markDraftOpened(
  draftId: string,
  providerId = DEFAULT_PROVIDER_IDENTITY_ID,
  recoveryState?: DraftSession['recoveryState'],
) {
  const db = await readDb();
  const index = db.drafts.findIndex((draft) => draft.id === draftId && draft.providerIdentityId === providerId);
  if (index < 0) {
    return null;
  }

  const now = new Date().toISOString();
  const current = db.drafts[index];
  const next = normalizeDraftRecord({
    ...current,
    lastOpenedAt: now,
    updatedAt: current.updatedAt,
    recoveryState: buildDraftRecoveryState(current, {
      workflowStage: recoveryState?.workflowStage || current.recoveryState?.workflowStage,
      composeLane: recoveryState?.composeLane || current.recoveryState?.composeLane,
      lastOpenedAt: now,
      updatedAt: current.updatedAt,
    }),
  });

  db.drafts = [next, ...db.drafts.filter((draft) => draft.id !== draftId)];
  await writeDb(db);
  return next;
}

export async function archiveDraft(draftId: string, providerId = DEFAULT_PROVIDER_IDENTITY_ID) {
  const db = await readDb();
  const index = db.drafts.findIndex((draft) => draft.id === draftId && draft.providerIdentityId === providerId);
  if (index < 0) {
    return null;
  }

  const now = new Date().toISOString();
  const current = db.drafts[index];
  const next = normalizeDraftRecord({
    ...current,
    archivedAt: now,
    updatedAt: now,
  });

  db.drafts[index] = next;
  await writeDb(db);
  return next;
}

export async function restoreDraft(draftId: string, providerId = DEFAULT_PROVIDER_IDENTITY_ID) {
  const db = await readDb();
  const index = db.drafts.findIndex((draft) => draft.id === draftId && draft.providerIdentityId === providerId);
  if (index < 0) {
    return null;
  }

  const now = new Date().toISOString();
  const current = db.drafts[index];
  const next = normalizeDraftRecord({
    ...current,
    archivedAt: undefined,
    updatedAt: now,
  });

  db.drafts = [next, ...db.drafts.filter((draft) => draft.id !== draftId)];
  await writeDb(db);
  return next;
}

export async function deleteDraft(draftId: string, providerId = DEFAULT_PROVIDER_IDENTITY_ID) {
  const db = await readDb();
  const beforeCount = db.drafts.length;
  db.drafts = db.drafts.filter((draft) => !(draft.id === draftId && draft.providerIdentityId === providerId));
  if (db.drafts.length === beforeCount) {
    return false;
  }

  await writeDb(db);
  return true;
}

export async function saveProviderSettings(settings: ProviderSettings, providerId = DEFAULT_PROVIDER_IDENTITY_ID) {
  const db = await readDb();
  const nextSettings = {
    ...DEFAULT_PROVIDER_SETTINGS,
    ...settings,
  };
  db.providerSettings = nextSettings;
  db.providerSettingsByProviderId = {
    ...(db.providerSettingsByProviderId || {}),
    [providerId]: nextSettings,
  };
  db.veraMemoryLedgerByProviderId = {
    ...(db.veraMemoryLedgerByProviderId || {}),
    [providerId]: buildVeraMemoryLedger({
      providerId,
      settings: nextSettings,
      learningStore: db.assistantLearningByProviderId?.[providerId] || createEmptyAssistantLearningStore(),
    }),
  };
  await writeDb(db);
  return nextSettings;
}

export async function getProviderSettings(providerId = DEFAULT_PROVIDER_IDENTITY_ID) {
  const db = await readDb();
  const identity = findProviderIdentity(providerId);
  const scopedSettings = db.providerSettingsByProviderId?.[providerId];
  const identitySeedSettings = {
    ...DEFAULT_PROVIDER_SETTINGS,
    providerProfileId: identity?.defaultProviderProfileId || DEFAULT_PROVIDER_SETTINGS.providerProfileId,
    providerFirstName: identity?.firstName || DEFAULT_PROVIDER_SETTINGS.providerFirstName,
    providerLastName: identity?.lastName || DEFAULT_PROVIDER_SETTINGS.providerLastName,
    veraPreferredAddress: identity?.displayName || DEFAULT_PROVIDER_SETTINGS.veraPreferredAddress,
  };

  return {
    ...identitySeedSettings,
    ...(scopedSettings || db.providerSettings || {}),
  };
}

export async function getCurrentProviderIdentityId() {
  const db = await readDb();
  return db.currentProviderId || DEFAULT_PROVIDER_IDENTITY_ID;
}

export async function getCurrentProviderAccountId() {
  const db = await readDb();
  return db.currentProviderAccountId || DEFAULT_PROVIDER_ACCOUNT_ID;
}

export async function saveCurrentProviderIdentityId(providerId: string) {
  const db = await readDb();
  db.currentProviderId = providerId || DEFAULT_PROVIDER_IDENTITY_ID;
  await writeDb(db);
  return db.currentProviderId;
}

export async function saveCurrentProviderAccountId(providerAccountId: string) {
  const db = await readDb();
  db.currentProviderAccountId = providerAccountId || DEFAULT_PROVIDER_ACCOUNT_ID;
  await writeDb(db);
  return db.currentProviderAccountId;
}

export async function listNotePresets(providerId = DEFAULT_PROVIDER_IDENTITY_ID) {
  const db = await readDb();
  return mergePresetCatalog(db.notePresetsByProviderId?.[providerId] || db.notePresets);
}

export async function saveNotePresets(presets: NotePreset[], providerId = DEFAULT_PROVIDER_IDENTITY_ID) {
  const db = await readDb();
  const mergedPresets = mergePresetCatalog(presets);
  db.notePresets = mergedPresets;
  db.notePresetsByProviderId = {
    ...(db.notePresetsByProviderId || {}),
    [providerId]: mergedPresets,
  };
  await writeDb(db);
  return mergedPresets;
}

export async function getDbStatus() {
  const db = await readDb();

  return {
    status: 'file-backed-prototype',
    path: DB_PATH,
    draftCount: db.drafts.length,
    notePresetCount: db.notePresets.length,
    veranoteBuildTaskCount: db.veranoteBuildTasks.length,
    assistantLearningProviderCount: Object.keys(db.assistantLearningByProviderId || {}).length,
  };
}

export async function listVeranoteBuildTasks() {
  const db = await readDb();
  return db.veranoteBuildTasks;
}

export async function saveVeranoteBuildTasks(tasks: VeranoteBuildTask[]) {
  const db = await readDb();
  db.veranoteBuildTasks = Array.isArray(tasks) ? tasks : [];
  await writeDb(db);
  return db.veranoteBuildTasks;
}

export async function listBetaFeedback() {
  const db = await readDb();
  return db.betaFeedback;
}

export async function saveBetaFeedback(feedback: {
  pageContext: string;
  category: BetaFeedbackCategory;
  message: string;
  metadata?: BetaFeedbackMetadata;
}) {
  const db = await readDb();
  const record: BetaFeedbackItem = {
    id: createFeedbackId(),
    createdAt: new Date().toISOString(),
    pageContext: feedback.pageContext,
    category: feedback.category,
    message: feedback.message,
    status: 'new',
    metadata: feedback.metadata,
  };

  db.betaFeedback = [record, ...db.betaFeedback].slice(0, 500);
  await writeDb(db);

  return record;
}

export async function updateBetaFeedbackStatus(id: string, status: BetaFeedbackItem['status']) {
  const db = await readDb();
  const nextStatus = status || 'new';
  let updated: BetaFeedbackItem | null = null;

  db.betaFeedback = db.betaFeedback.map((item) => {
    if (item.id !== id) {
      return item;
    }

    updated = {
      ...item,
      status: nextStatus,
    };
    return updated;
  });

  await writeDb(db);
  return updated;
}

export async function getAssistantLearning(providerId = DEFAULT_PROVIDER_IDENTITY_ID) {
  const db = await readDb();
  return {
    ...createEmptyAssistantLearningStore(),
    ...(db.assistantLearningByProviderId?.[providerId] || {}),
  };
}

export async function saveAssistantLearning(learningStore: AssistantLearningStore, providerId = DEFAULT_PROVIDER_IDENTITY_ID) {
  const db = await readDb();
  const merged = {
    ...createEmptyAssistantLearningStore(),
    ...(learningStore || {}),
  };
  db.assistantLearningByProviderId = {
    ...(db.assistantLearningByProviderId || {}),
    [providerId]: merged,
  };
  db.veraMemoryLedgerByProviderId = {
    ...(db.veraMemoryLedgerByProviderId || {}),
    [providerId]: buildVeraMemoryLedger({
      providerId,
      settings: await getProviderSettings(providerId),
      learningStore: merged,
    }),
  };
  await writeDb(db);
  return merged;
}

export async function getVeraMemoryLedger(providerId = DEFAULT_PROVIDER_IDENTITY_ID) {
  const db = await readDb();
  return db.veraMemoryLedgerByProviderId?.[providerId]
    || buildVeraMemoryLedger({
      providerId,
      settings: await getProviderSettings(providerId),
      learningStore: db.assistantLearningByProviderId?.[providerId] || createEmptyAssistantLearningStore(),
    });
}
