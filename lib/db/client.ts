import { promises as fs } from 'fs';
import path from 'path';
import { DEFAULT_PROVIDER_SETTINGS, type ProviderSettings } from '@/lib/constants/settings';
import { DEFAULT_PROVIDER_ACCOUNT_ID } from '@/lib/constants/provider-accounts';
import { DEFAULT_PROVIDER_IDENTITY_ID, findProviderIdentity } from '@/lib/constants/provider-identities';
import { mergePresetCatalog, type NotePreset } from '@/lib/note/presets';
import { createEmptyAssistantLearningStore, type AssistantLearningStore } from '@/lib/veranote/assistant-learning';
import { buildVeraMemoryLedger } from '@/lib/veranote/vera-memory-ledger';
import type { DraftSession } from '@/types/session';
import type { BetaFeedbackCategory, BetaFeedbackItem, BetaFeedbackMetadata } from '@/types/beta-feedback';
import type { VeranoteBuildTask } from '@/types/task';
import type { VeraMemoryLedger } from '@/types/vera-memory';

type DraftRecord = DraftSession & {
  id: string;
  updatedAt: string;
};

type PrototypeDb = {
  drafts: DraftRecord[];
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
      drafts: Array.isArray(parsed.drafts) ? parsed.drafts : [],
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

export async function saveDraft(draft: DraftSession) {
  const db = await readDb();
  const record: DraftRecord = {
    ...draft,
    id: createDraftId(),
    updatedAt: new Date().toISOString(),
  };

  db.drafts = [record, ...db.drafts].slice(0, 50);
  await writeDb(db);

  return record;
}

export async function getLatestDraft() {
  const db = await readDb();
  return db.drafts[0] ?? null;
}

export async function listDrafts() {
  const db = await readDb();
  return db.drafts;
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
