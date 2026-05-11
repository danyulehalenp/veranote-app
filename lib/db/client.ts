import { promises as fs } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { DEFAULT_PROVIDER_SETTINGS, type ProviderSettings } from '@/lib/constants/settings';
import { DEFAULT_PROVIDER_ACCOUNT_ID } from '@/lib/constants/provider-accounts';
import { DEFAULT_PROVIDER_IDENTITY_ID, findProviderIdentity } from '@/lib/constants/provider-identities';
import { applyAssistantPersonaDefaults } from '@/lib/veranote/assistant-persona';
import { mergePresetCatalog, type NotePreset } from '@/lib/note/presets';
import { buildDraftRecoveryState, getDraftPriorityScore } from '@/lib/veranote/draft-recovery';
import { createEmptyAssistantLearningStore, type AssistantLearningStore } from '@/lib/veranote/assistant-learning';
import { buildVeraMemoryLedger } from '@/lib/veranote/vera-memory-ledger';
import type { DraftSession, PersistedDraftSession } from '@/types/session';
import { getSupabaseAdminClient } from '@/lib/db/supabase-client';
import type {
  BetaFeedbackCategory,
  BetaFeedbackItem,
  BetaFeedbackMetadata,
  BetaFeedbackStatus,
} from '@/types/beta-feedback';
import type { VeranoteBuildTask } from '@/types/task';
import type { VeraMemoryLedger } from '@/types/vera-memory';
import type { DictationAuditEvent } from '@/types/dictation';
import type { PatientContinuityRecord } from '@/types/patient-continuity';
import { normalizePatientContinuityRecord } from '@/lib/veranote/patient-continuity';

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
  patientContinuityByProviderId: Record<string, PatientContinuityRecord[]>;
  veranoteBuildTasks: VeranoteBuildTask[];
  betaFeedback: BetaFeedbackItem[];
};

export function resolvePrototypeDataDir(env: NodeJS.ProcessEnv = process.env, cwd = process.cwd()) {
  if (env.PROTOTYPE_DATA_DIR) {
    return path.resolve(env.PROTOTYPE_DATA_DIR);
  }

  if (env.VERCEL || env.AWS_LAMBDA_FUNCTION_NAME || env.NEXT_RUNTIME) {
    return path.join(tmpdir(), 'veranote-prototype-data');
  }

  return path.join(cwd, '.prototype-data');
}

export function resolvePrototypeDbPath(env: NodeJS.ProcessEnv = process.env, cwd = process.cwd()) {
  if (env.PROTOTYPE_DB_PATH) {
    return path.resolve(env.PROTOTYPE_DB_PATH);
  }

  return path.join(resolvePrototypeDataDir(env, cwd), 'prototype-db.json');
}

const DATA_DIR = resolvePrototypeDataDir();
const DB_PATH = resolvePrototypeDbPath();

export function shouldUseDurableSupabaseStorage(env: NodeJS.ProcessEnv = process.env) {
  if (env.VERANOTE_DB_BACKEND === 'prototype') {
    return false;
  }

  const explicitlyEnabled = env.VERANOTE_DB_BACKEND === 'supabase' || env.VERANOTE_USE_SUPABASE_DB === '1';

  if (!explicitlyEnabled) {
    return false;
  }

  return Boolean(env.SUPABASE_URL?.trim() && env.SUPABASE_SERVICE_ROLE_KEY?.trim());
}

function getDurableSupabaseClient() {
  if (!shouldUseDurableSupabaseStorage()) {
    return null;
  }

  return getSupabaseAdminClient();
}

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
  patientContinuityByProviderId: {
    [DEFAULT_PROVIDER_IDENTITY_ID]: [],
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
      providerSettings: applyAssistantPersonaDefaults({
        ...DEFAULT_PROVIDER_SETTINGS,
        ...(parsed.providerSettings || {}),
      }),
      providerSettingsByProviderId: typeof parsed.providerSettingsByProviderId === 'object' && parsed.providerSettingsByProviderId
        ? Object.fromEntries(
            Object.entries(parsed.providerSettingsByProviderId).map(([providerId, settings]) => [
              providerId,
              applyAssistantPersonaDefaults({
                ...DEFAULT_PROVIDER_SETTINGS,
                ...(settings || {}),
              }),
            ]),
          )
        : {
            [DEFAULT_PROVIDER_IDENTITY_ID]: applyAssistantPersonaDefaults({
              ...DEFAULT_PROVIDER_SETTINGS,
              ...(parsed.providerSettings || {}),
            }),
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
      patientContinuityByProviderId: typeof parsed.patientContinuityByProviderId === 'object' && parsed.patientContinuityByProviderId
        ? Object.fromEntries(
            Object.entries(parsed.patientContinuityByProviderId).map(([providerId, records]) => [
              providerId,
              Array.isArray(records)
                ? records.map((record) => normalizePatientContinuityRecord(record as Partial<PatientContinuityRecord>, providerId))
                : [],
            ]),
          )
        : {
            [DEFAULT_PROVIDER_IDENTITY_ID]: [],
          },
      veranoteBuildTasks: Array.isArray(parsed.veranoteBuildTasks) ? parsed.veranoteBuildTasks : [],
      betaFeedback: Array.isArray(parsed.betaFeedback) ? parsed.betaFeedback.map((item) => normalizeBetaFeedbackItem(item as Partial<BetaFeedbackItem>)) : [],
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

function normalizeBetaFeedbackItem(rawFeedback: Partial<BetaFeedbackItem>): BetaFeedbackItem {
  return {
    id: typeof rawFeedback.id === 'string' && rawFeedback.id ? rawFeedback.id : createFeedbackId(),
    createdAt: typeof rawFeedback.createdAt === 'string' ? rawFeedback.createdAt : new Date().toISOString(),
    pageContext: typeof rawFeedback.pageContext === 'string' && rawFeedback.pageContext ? rawFeedback.pageContext : 'General feedback',
    category: typeof rawFeedback.category === 'string' ? rawFeedback.category as BetaFeedbackCategory : 'general',
    message: typeof rawFeedback.message === 'string' && rawFeedback.message ? rawFeedback.message : 'Beta feedback submitted.',
    status: typeof rawFeedback.status === 'string' ? rawFeedback.status as BetaFeedbackStatus : 'new',
    workflowArea: rawFeedback.workflowArea,
    noteType: rawFeedback.noteType,
    feedbackLabel: rawFeedback.feedbackLabel,
    severity: rawFeedback.severity,
    answerMode: rawFeedback.answerMode,
    builderFamily: rawFeedback.builderFamily,
    routeTaken: rawFeedback.routeTaken,
    model: rawFeedback.model,
    promptSummary: rawFeedback.promptSummary,
    responseSummary: rawFeedback.responseSummary,
    userComment: rawFeedback.userComment,
    desiredBehavior: rawFeedback.desiredBehavior,
    phiRiskFlag: rawFeedback.phiRiskFlag,
    adminNotes: rawFeedback.adminNotes,
    convertedToRegression: rawFeedback.convertedToRegression,
    regressionCaseId: rawFeedback.regressionCaseId,
    metadata: rawFeedback.metadata,
  };
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
    draftRevisions: Array.isArray(rawDraft.draftRevisions)
      ? rawDraft.draftRevisions
        .filter((item) => item && typeof item === 'object' && typeof item.note === 'string')
        .slice(-20)
      : undefined,
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
    || JSON.stringify(previous.draftRevisions || []) !== JSON.stringify(next.draftRevisions || [])
    || JSON.stringify(previous.flags || []) !== JSON.stringify(next.flags || []);
}

function assertDurableResult(error: unknown, action: string): asserts error is null {
  if (error) {
    const message = error instanceof Error ? error.message : JSON.stringify(error);
    throw new Error(`Unable to ${action} in durable storage: ${message}`);
  }
}

function isMissingPatientContinuityTableError(error: unknown) {
  if (!error) {
    return false;
  }

  const errorLike = error as { code?: unknown; message?: unknown; details?: unknown };
  const message = [
    errorLike.code,
    errorLike.message,
    errorLike.details,
    error instanceof Error ? error.message : '',
    JSON.stringify(error),
  ].filter(Boolean).join(' ').toLowerCase();

  return message.includes('42p01')
    || message.includes('veranote_patient_continuity')
    || message.includes('relation')
    || message.includes('does not exist');
}

type JsonRow<T> = {
  data: T;
};

type DraftRow = JsonRow<Partial<DraftRecord>> & {
  id: string;
  provider_id: string;
};

function buildIdentitySeedSettings(providerId: string) {
  const identity = findProviderIdentity(providerId);

  return {
    ...DEFAULT_PROVIDER_SETTINGS,
    providerProfileId: identity?.defaultProviderProfileId || DEFAULT_PROVIDER_SETTINGS.providerProfileId,
    providerFirstName: identity?.firstName || DEFAULT_PROVIDER_SETTINGS.providerFirstName,
    providerLastName: identity?.lastName || DEFAULT_PROVIDER_SETTINGS.providerLastName,
    veraPreferredAddress: identity?.displayName || DEFAULT_PROVIDER_SETTINGS.veraPreferredAddress,
  };
}

async function listDurableDraftRows(providerId: string, options?: { includeArchived?: boolean }) {
  const supabase = getDurableSupabaseClient();
  if (!supabase) {
    return null;
  }

  let query = supabase
    .from('veranote_drafts')
    .select('id, provider_id, data')
    .eq('provider_id', providerId)
    .order('updated_at', { ascending: false })
    .limit(100);

  if (!options?.includeArchived) {
    query = query.is('archived_at', null);
  }

  const { data, error } = await query;
  assertDurableResult(error, 'list drafts');

  return ((data || []) as DraftRow[]).map((row) => normalizeDraftRecord({
    ...row.data,
    id: row.id,
    providerIdentityId: row.provider_id,
  }));
}

async function getDurableDraftRecord(draftId: string, providerId: string, options?: { includeArchived?: boolean }) {
  const supabase = getDurableSupabaseClient();
  if (!supabase) {
    return null;
  }

  let query = supabase
    .from('veranote_drafts')
    .select('id, provider_id, data')
    .eq('id', draftId)
    .eq('provider_id', providerId)
    .limit(1);

  if (!options?.includeArchived) {
    query = query.is('archived_at', null);
  }

  const { data, error } = await query.maybeSingle();
  assertDurableResult(error, 'read draft');

  if (!data) {
    return null;
  }

  const row = data as DraftRow;
  return normalizeDraftRecord({
    ...row.data,
    id: row.id,
    providerIdentityId: row.provider_id,
  });
}

async function upsertDurableDraft(record: DraftRecord, providerId: string) {
  const supabase = getDurableSupabaseClient();
  if (!supabase) {
    return null;
  }

  const { error } = await supabase
    .from('veranote_drafts')
    .upsert({
      id: record.id,
      provider_id: providerId,
      version: record.version,
      data: record,
      created_at: record.createdAt,
      updated_at: record.updatedAt,
      last_saved_at: record.lastSavedAt || record.updatedAt,
      last_opened_at: record.lastOpenedAt || null,
      archived_at: record.archivedAt || null,
    }, { onConflict: 'id' });

  assertDurableResult(error, 'save draft');
  return record;
}

async function saveDraftDurable(draft: DraftSession, providerId: string) {
  const now = new Date().toISOString();
  const requestedDraftId = typeof draft.draftId === 'string' && draft.draftId ? draft.draftId : undefined;
  const activeDrafts = await listDurableDraftRows(providerId);
  const existingRecord = activeDrafts?.find((item) => (
    (requestedDraftId && item.id === requestedDraftId)
    || (
      !requestedDraftId
      && createDraftFingerprint(item) === createDraftFingerprint(draft)
    )
  )) || null;
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

  return upsertDurableDraft(record, providerId);
}

async function saveDictationAuditEventDurable(event: DictationAuditEvent, providerId: string) {
  const supabase = getDurableSupabaseClient();
  if (!supabase) {
    return null;
  }

  const normalizedEvent: DictationAuditEvent = {
    ...event,
    actorUserId: providerId,
  };

  const { error } = await supabase
    .from('veranote_dictation_audit_events')
    .upsert({
      id: normalizedEvent.id,
      provider_id: providerId,
      session_id: normalizedEvent.dictationSessionId,
      occurred_at: normalizedEvent.occurredAt,
      data: normalizedEvent,
    }, { onConflict: 'id' });

  assertDurableResult(error, 'save dictation audit event');
  return normalizedEvent;
}

async function listDictationAuditEventsDurable(input?: {
  providerId?: string;
  sessionId?: string;
  limit?: number;
}) {
  const supabase = getDurableSupabaseClient();
  if (!supabase) {
    return null;
  }

  const providerId = input?.providerId || DEFAULT_PROVIDER_IDENTITY_ID;
  let query = supabase
    .from('veranote_dictation_audit_events')
    .select('data')
    .eq('provider_id', providerId)
    .order('occurred_at', { ascending: false })
    .limit(input?.limit || 25);

  if (input?.sessionId) {
    query = query.eq('session_id', input.sessionId);
  }

  const { data, error } = await query;
  assertDurableResult(error, 'list dictation audit events');

  return ((data || []) as JsonRow<DictationAuditEvent>[]).map((row) => row.data);
}

async function saveProviderSettingsDurable(settings: ProviderSettings, providerId: string) {
  const supabase = getDurableSupabaseClient();
  if (!supabase) {
    return null;
  }

  const nextSettings = applyAssistantPersonaDefaults({
    ...DEFAULT_PROVIDER_SETTINGS,
    ...settings,
  });

  const { error } = await supabase
    .from('veranote_provider_settings')
    .upsert({
      provider_id: providerId,
      data: nextSettings,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'provider_id' });

  assertDurableResult(error, 'save provider settings');
  await saveVeraMemoryLedgerDurable(buildVeraMemoryLedger({
    providerId,
    settings: nextSettings,
    learningStore: await getAssistantLearning(providerId),
  }), providerId);

  return nextSettings;
}

async function getProviderSettingsDurable(providerId: string) {
  const supabase = getDurableSupabaseClient();
  if (!supabase) {
    return null;
  }

  const { data, error } = await supabase
    .from('veranote_provider_settings')
    .select('data')
    .eq('provider_id', providerId)
    .maybeSingle();

  assertDurableResult(error, 'read provider settings');

  return applyAssistantPersonaDefaults({
    ...buildIdentitySeedSettings(providerId),
    ...((data as JsonRow<Partial<ProviderSettings>> | null)?.data || {}),
  });
}

async function listNotePresetsDurable(providerId: string) {
  const supabase = getDurableSupabaseClient();
  if (!supabase) {
    return null;
  }

  const { data, error } = await supabase
    .from('veranote_note_presets')
    .select('data')
    .eq('provider_id', providerId)
    .maybeSingle();

  assertDurableResult(error, 'list note presets');

  return mergePresetCatalog(Array.isArray((data as JsonRow<NotePreset[]> | null)?.data)
    ? (data as JsonRow<NotePreset[]>).data
    : []);
}

async function saveNotePresetsDurable(presets: NotePreset[], providerId: string) {
  const supabase = getDurableSupabaseClient();
  if (!supabase) {
    return null;
  }

  const mergedPresets = mergePresetCatalog(presets);
  const { error } = await supabase
    .from('veranote_note_presets')
    .upsert({
      provider_id: providerId,
      data: mergedPresets,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'provider_id' });

  assertDurableResult(error, 'save note presets');
  return mergedPresets;
}

async function getAssistantLearningDurable(providerId: string) {
  const supabase = getDurableSupabaseClient();
  if (!supabase) {
    return null;
  }

  const { data, error } = await supabase
    .from('veranote_assistant_learning')
    .select('data')
    .eq('provider_id', providerId)
    .maybeSingle();

  assertDurableResult(error, 'read assistant learning');

  return {
    ...createEmptyAssistantLearningStore(),
    ...((data as JsonRow<AssistantLearningStore> | null)?.data || {}),
  };
}

async function saveAssistantLearningDurable(learningStore: AssistantLearningStore, providerId: string) {
  const supabase = getDurableSupabaseClient();
  if (!supabase) {
    return null;
  }

  const merged = {
    ...createEmptyAssistantLearningStore(),
    ...(learningStore || {}),
  };
  const { error } = await supabase
    .from('veranote_assistant_learning')
    .upsert({
      provider_id: providerId,
      data: merged,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'provider_id' });

  assertDurableResult(error, 'save assistant learning');
  await saveVeraMemoryLedgerDurable(buildVeraMemoryLedger({
    providerId,
    settings: await getProviderSettings(providerId),
    learningStore: merged,
  }), providerId);

  return merged;
}

async function getVeraMemoryLedgerDurable(providerId: string) {
  const supabase = getDurableSupabaseClient();
  if (!supabase) {
    return null;
  }

  const { data, error } = await supabase
    .from('veranote_memory_ledgers')
    .select('data')
    .eq('provider_id', providerId)
    .maybeSingle();

  assertDurableResult(error, 'read memory ledger');

  return (data as JsonRow<VeraMemoryLedger> | null)?.data
    || buildVeraMemoryLedger({
      providerId,
      settings: await getProviderSettings(providerId),
      learningStore: await getAssistantLearning(providerId),
    });
}

async function saveVeraMemoryLedgerDurable(ledger: VeraMemoryLedger, providerId: string) {
  const supabase = getDurableSupabaseClient();
  if (!supabase) {
    return null;
  }

  const { error } = await supabase
    .from('veranote_memory_ledgers')
    .upsert({
      provider_id: providerId,
      data: ledger,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'provider_id' });

  assertDurableResult(error, 'save memory ledger');
  return ledger;
}

async function listPatientContinuityDurable(providerId: string, options?: { includeArchived?: boolean }) {
  const supabase = getDurableSupabaseClient();
  if (!supabase) {
    return null;
  }

  let query = supabase
    .from('veranote_patient_continuity')
    .select('id, provider_id, data')
    .eq('provider_id', providerId)
    .order('updated_at', { ascending: false })
    .limit(200);

  if (!options?.includeArchived) {
    query = query.is('archived_at', null);
  }

  const { data, error } = await query;
  if (error && isMissingPatientContinuityTableError(error)) {
    return null;
  }
  assertDurableResult(error, 'list patient continuity');

  return ((data || []) as Array<JsonRow<Partial<PatientContinuityRecord>> & { id: string; provider_id: string }>).map((row) => (
    normalizePatientContinuityRecord({
      ...row.data,
      id: row.id,
      providerIdentityId: row.provider_id,
    }, row.provider_id)
  ));
}

async function upsertPatientContinuityDurable(record: PatientContinuityRecord, providerId: string) {
  const supabase = getDurableSupabaseClient();
  if (!supabase) {
    return null;
  }

  const { error } = await supabase
    .from('veranote_patient_continuity')
    .upsert({
      id: record.id,
      provider_id: providerId,
      patient_label: record.patientLabel,
      last_source_date: record.lastSourceDate || null,
      data: record,
      created_at: record.createdAt,
      updated_at: record.updatedAt,
      last_used_at: record.lastUsedAt || null,
      archived_at: record.archivedAt || null,
    }, { onConflict: 'id' });

  if (error && isMissingPatientContinuityTableError(error)) {
    return null;
  }
  assertDurableResult(error, 'save patient continuity');
  return record;
}

async function getPatientContinuityDurable(recordId: string, providerId: string, options?: { includeArchived?: boolean }) {
  const records = await listPatientContinuityDurable(providerId, { includeArchived: options?.includeArchived });
  if (!records) {
    return null;
  }

  return records.find((record) => record.id === recordId) || null;
}

async function listBetaFeedbackDurable() {
  const supabase = getDurableSupabaseClient();
  if (!supabase) {
    return null;
  }

  const { data, error } = await supabase
    .from('veranote_beta_feedback')
    .select('data')
    .order('created_at', { ascending: false })
    .limit(500);

  assertDurableResult(error, 'list beta feedback');

  return ((data || []) as JsonRow<Partial<BetaFeedbackItem>>[]).map((row) => normalizeBetaFeedbackItem(row.data));
}

async function saveBetaFeedbackDurable(feedback: {
  pageContext: string;
  category: BetaFeedbackCategory;
  message: string;
  workflowArea?: BetaFeedbackItem['workflowArea'];
  noteType?: string;
  feedbackLabel?: BetaFeedbackItem['feedbackLabel'];
  severity?: BetaFeedbackItem['severity'];
  answerMode?: string;
  builderFamily?: string;
  routeTaken?: string;
  model?: string;
  promptSummary?: string;
  responseSummary?: string;
  userComment?: string;
  desiredBehavior?: string;
  phiRiskFlag?: boolean;
  adminNotes?: string;
  convertedToRegression?: boolean;
  regressionCaseId?: string;
  metadata?: BetaFeedbackMetadata;
}) {
  const supabase = getDurableSupabaseClient();
  if (!supabase) {
    return null;
  }

  const record = normalizeBetaFeedbackItem({
    ...feedback,
    id: createFeedbackId(),
    createdAt: new Date().toISOString(),
    status: 'new',
  });
  const { error } = await supabase
    .from('veranote_beta_feedback')
    .insert({
      id: record.id,
      provider_id: record.metadata?.providerId || null,
      category: record.category,
      status: record.status,
      created_at: record.createdAt,
      data: record,
    });

  assertDurableResult(error, 'save beta feedback');
  return record;
}

async function updateBetaFeedbackDurable(id: string, patch: Partial<Pick<
  BetaFeedbackItem,
  'status' | 'adminNotes' | 'convertedToRegression' | 'regressionCaseId'
>>) {
  const supabase = getDurableSupabaseClient();
  if (!supabase) {
    return null;
  }

  const { data, error } = await supabase
    .from('veranote_beta_feedback')
    .select('data')
    .eq('id', id)
    .maybeSingle();
  assertDurableResult(error, 'read beta feedback');

  if (!data) {
    return null;
  }

  const current = normalizeBetaFeedbackItem((data as JsonRow<Partial<BetaFeedbackItem>>).data);
  const updated = {
    ...current,
    status: patch.status || current.status || 'new',
    adminNotes: patch.adminNotes ?? current.adminNotes,
    convertedToRegression: patch.convertedToRegression ?? current.convertedToRegression,
    regressionCaseId: patch.regressionCaseId ?? current.regressionCaseId,
  };
  const { error: updateError } = await supabase
    .from('veranote_beta_feedback')
    .update({
      status: updated.status,
      data: updated,
    })
    .eq('id', id);
  assertDurableResult(updateError, 'update beta feedback');

  return updated;
}

async function getAppStateValueDurable(key: string) {
  const supabase = getDurableSupabaseClient();
  if (!supabase) {
    return null;
  }

  const { data, error } = await supabase
    .from('veranote_app_state')
    .select('value')
    .eq('key', key)
    .maybeSingle();
  assertDurableResult(error, 'read app state');

  return typeof (data as { value?: unknown } | null)?.value === 'string'
    ? (data as { value: string }).value
    : null;
}

async function saveAppStateValueDurable(key: string, value: string) {
  const supabase = getDurableSupabaseClient();
  if (!supabase) {
    return null;
  }

  const { error } = await supabase
    .from('veranote_app_state')
    .upsert({
      key,
      value,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'key' });
  assertDurableResult(error, 'save app state');

  return value;
}

export async function saveDraft(draft: DraftSession, providerId = DEFAULT_PROVIDER_IDENTITY_ID) {
  const durableDraft = await saveDraftDurable(draft, providerId);
  if (durableDraft) {
    return durableDraft;
  }

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
  const durableEvent = await saveDictationAuditEventDurable(event, providerId);
  if (durableEvent) {
    return durableEvent;
  }

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
  const durableEvents = await listDictationAuditEventsDurable(input);
  if (durableEvents) {
    return durableEvents;
  }

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
  const durableDrafts = await listDurableDraftRows(providerId, options);
  if (durableDrafts) {
    return sortDrafts(durableDrafts)[0] ?? null;
  }

  const db = await readDb();
  const drafts = sortDrafts(db.drafts.filter((draft) => (
    draft.providerIdentityId === providerId && (options?.includeArchived ? true : !draft.archivedAt)
  )));
  return drafts[0] ?? null;
}

export async function listDrafts(providerId = DEFAULT_PROVIDER_IDENTITY_ID, options?: { includeArchived?: boolean }) {
  const durableDrafts = await listDurableDraftRows(providerId, options);
  if (durableDrafts) {
    return sortDrafts(durableDrafts);
  }

  const db = await readDb();
  return sortDrafts(db.drafts.filter((draft) => (
    draft.providerIdentityId === providerId && (options?.includeArchived ? true : !draft.archivedAt)
  )));
}

export async function getDraftById(draftId: string, providerId = DEFAULT_PROVIDER_IDENTITY_ID, options?: { includeArchived?: boolean }) {
  const durableDraft = await getDurableDraftRecord(draftId, providerId, options);
  if (durableDraft) {
    return durableDraft;
  }

  if (getDurableSupabaseClient()) {
    return null;
  }

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
  const durableDraft = await getDurableDraftRecord(draftId, providerId);
  if (durableDraft) {
    const now = new Date().toISOString();
    const next = normalizeDraftRecord({
      ...durableDraft,
      lastOpenedAt: now,
      updatedAt: durableDraft.updatedAt,
      recoveryState: buildDraftRecoveryState(durableDraft, {
        workflowStage: recoveryState?.workflowStage || durableDraft.recoveryState?.workflowStage,
        composeLane: recoveryState?.composeLane || durableDraft.recoveryState?.composeLane,
        lastOpenedAt: now,
        updatedAt: durableDraft.updatedAt,
      }),
    });

    return upsertDurableDraft(next, providerId);
  }

  if (getDurableSupabaseClient()) {
    return null;
  }

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
  const durableDraft = await getDurableDraftRecord(draftId, providerId);
  if (durableDraft) {
    const now = new Date().toISOString();
    return upsertDurableDraft(normalizeDraftRecord({
      ...durableDraft,
      archivedAt: now,
      updatedAt: now,
    }), providerId);
  }

  if (getDurableSupabaseClient()) {
    return null;
  }

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
  const durableDraft = await getDurableDraftRecord(draftId, providerId, { includeArchived: true });
  if (durableDraft) {
    const now = new Date().toISOString();
    return upsertDurableDraft(normalizeDraftRecord({
      ...durableDraft,
      archivedAt: undefined,
      updatedAt: now,
    }), providerId);
  }

  if (getDurableSupabaseClient()) {
    return null;
  }

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
  const supabase = getDurableSupabaseClient();
  if (supabase) {
    const existingDraft = await getDurableDraftRecord(draftId, providerId, { includeArchived: true });
    if (!existingDraft) {
      return false;
    }

    const { error } = await supabase
      .from('veranote_drafts')
      .delete()
      .eq('id', draftId)
      .eq('provider_id', providerId);
    assertDurableResult(error, 'delete draft');

    const remainingDraft = await getDurableDraftRecord(draftId, providerId, { includeArchived: true });
    return !remainingDraft;
  }

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
  const durableSettings = await saveProviderSettingsDurable(settings, providerId);
  if (durableSettings) {
    return durableSettings;
  }

  const db = await readDb();
  const nextSettings = applyAssistantPersonaDefaults({
    ...DEFAULT_PROVIDER_SETTINGS,
    ...settings,
  });
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
  const durableSettings = await getProviderSettingsDurable(providerId);
  if (durableSettings) {
    return durableSettings;
  }

  const db = await readDb();
  const scopedSettings = db.providerSettingsByProviderId?.[providerId];

  return applyAssistantPersonaDefaults({
    ...buildIdentitySeedSettings(providerId),
    ...(scopedSettings || db.providerSettings || {}),
  });
}

export async function getCurrentProviderIdentityId() {
  const durableValue = await getAppStateValueDurable('currentProviderId');
  if (durableValue) {
    return durableValue;
  }

  const db = await readDb();
  return db.currentProviderId || DEFAULT_PROVIDER_IDENTITY_ID;
}

export async function getCurrentProviderAccountId() {
  const durableValue = await getAppStateValueDurable('currentProviderAccountId');
  if (durableValue) {
    return durableValue;
  }

  const db = await readDb();
  return db.currentProviderAccountId || DEFAULT_PROVIDER_ACCOUNT_ID;
}

export async function saveCurrentProviderIdentityId(providerId: string) {
  const durableValue = await saveAppStateValueDurable('currentProviderId', providerId || DEFAULT_PROVIDER_IDENTITY_ID);
  if (durableValue) {
    return durableValue;
  }

  const db = await readDb();
  db.currentProviderId = providerId || DEFAULT_PROVIDER_IDENTITY_ID;
  await writeDb(db);
  return db.currentProviderId;
}

export async function saveCurrentProviderAccountId(providerAccountId: string) {
  const durableValue = await saveAppStateValueDurable('currentProviderAccountId', providerAccountId || DEFAULT_PROVIDER_ACCOUNT_ID);
  if (durableValue) {
    return durableValue;
  }

  const db = await readDb();
  db.currentProviderAccountId = providerAccountId || DEFAULT_PROVIDER_ACCOUNT_ID;
  await writeDb(db);
  return db.currentProviderAccountId;
}

export async function listNotePresets(providerId = DEFAULT_PROVIDER_IDENTITY_ID) {
  const durablePresets = await listNotePresetsDurable(providerId);
  if (durablePresets) {
    return durablePresets;
  }

  const db = await readDb();
  return mergePresetCatalog(db.notePresetsByProviderId?.[providerId] || db.notePresets);
}

export async function saveNotePresets(presets: NotePreset[], providerId = DEFAULT_PROVIDER_IDENTITY_ID) {
  const durablePresets = await saveNotePresetsDurable(presets, providerId);
  if (durablePresets) {
    return durablePresets;
  }

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
  const durableDrafts = await listDurableDraftRows(DEFAULT_PROVIDER_IDENTITY_ID, { includeArchived: true });
  if (durableDrafts) {
    return {
      status: 'supabase-durable',
      path: 'supabase:veranote_drafts',
      draftCount: durableDrafts.length,
      notePresetCount: (await listNotePresets(DEFAULT_PROVIDER_IDENTITY_ID)).length,
      veranoteBuildTaskCount: 0,
      assistantLearningProviderCount: 0,
    };
  }

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
  const durableFeedback = await listBetaFeedbackDurable();
  if (durableFeedback) {
    return durableFeedback;
  }

  const db = await readDb();
  return db.betaFeedback;
}

export async function saveBetaFeedback(feedback: {
  pageContext: string;
  category: BetaFeedbackCategory;
  message: string;
  workflowArea?: BetaFeedbackItem['workflowArea'];
  noteType?: string;
  feedbackLabel?: BetaFeedbackItem['feedbackLabel'];
  severity?: BetaFeedbackItem['severity'];
  answerMode?: string;
  builderFamily?: string;
  routeTaken?: string;
  model?: string;
  promptSummary?: string;
  responseSummary?: string;
  userComment?: string;
  desiredBehavior?: string;
  phiRiskFlag?: boolean;
  adminNotes?: string;
  convertedToRegression?: boolean;
  regressionCaseId?: string;
  metadata?: BetaFeedbackMetadata;
}) {
  const durableFeedback = await saveBetaFeedbackDurable(feedback);
  if (durableFeedback) {
    return durableFeedback;
  }

  const db = await readDb();
  const record: BetaFeedbackItem = {
    id: createFeedbackId(),
    createdAt: new Date().toISOString(),
    pageContext: feedback.pageContext,
    category: feedback.category,
    message: feedback.message,
    status: 'new',
    workflowArea: feedback.workflowArea,
    noteType: feedback.noteType,
    feedbackLabel: feedback.feedbackLabel,
    severity: feedback.severity,
    answerMode: feedback.answerMode,
    builderFamily: feedback.builderFamily,
    routeTaken: feedback.routeTaken,
    model: feedback.model,
    promptSummary: feedback.promptSummary,
    responseSummary: feedback.responseSummary,
    userComment: feedback.userComment,
    desiredBehavior: feedback.desiredBehavior,
    phiRiskFlag: feedback.phiRiskFlag,
    adminNotes: feedback.adminNotes,
    convertedToRegression: feedback.convertedToRegression,
    regressionCaseId: feedback.regressionCaseId,
    metadata: feedback.metadata,
  };

  db.betaFeedback = [record, ...db.betaFeedback].slice(0, 500);
  await writeDb(db);

  return record;
}

export async function updateBetaFeedbackStatus(id: string, status: BetaFeedbackItem['status']) {
  return updateBetaFeedback(id, { status });
}

export async function updateBetaFeedback(id: string, patch: Partial<Pick<
  BetaFeedbackItem,
  'status' | 'adminNotes' | 'convertedToRegression' | 'regressionCaseId'
>>) {
  const durableFeedback = await updateBetaFeedbackDurable(id, patch);
  if (durableFeedback) {
    return durableFeedback;
  }

  const db = await readDb();
  let updated: BetaFeedbackItem | null = null;

  db.betaFeedback = db.betaFeedback.map((item) => {
    if (item.id !== id) {
      return item;
    }

    updated = {
      ...item,
      status: patch.status || item.status || 'new',
      adminNotes: patch.adminNotes ?? item.adminNotes,
      convertedToRegression: patch.convertedToRegression ?? item.convertedToRegression,
      regressionCaseId: patch.regressionCaseId ?? item.regressionCaseId,
    };
    return updated;
  });

  await writeDb(db);
  return updated;
}

export async function getAssistantLearning(providerId = DEFAULT_PROVIDER_IDENTITY_ID) {
  const durableLearning = await getAssistantLearningDurable(providerId);
  if (durableLearning) {
    return durableLearning;
  }

  const db = await readDb();
  return {
    ...createEmptyAssistantLearningStore(),
    ...(db.assistantLearningByProviderId?.[providerId] || {}),
  };
}

export async function saveAssistantLearning(learningStore: AssistantLearningStore, providerId = DEFAULT_PROVIDER_IDENTITY_ID) {
  const durableLearning = await saveAssistantLearningDurable(learningStore, providerId);
  if (durableLearning) {
    return durableLearning;
  }

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
  const durableLedger = await getVeraMemoryLedgerDurable(providerId);
  if (durableLedger) {
    return durableLedger;
  }

  const db = await readDb();
  return db.veraMemoryLedgerByProviderId?.[providerId]
    || buildVeraMemoryLedger({
      providerId,
      settings: await getProviderSettings(providerId),
      learningStore: db.assistantLearningByProviderId?.[providerId] || createEmptyAssistantLearningStore(),
    });
}

export async function listPatientContinuityRecords(providerId = DEFAULT_PROVIDER_IDENTITY_ID, options?: { includeArchived?: boolean }) {
  const durableRecords = await listPatientContinuityDurable(providerId, options);
  if (durableRecords) {
    return durableRecords;
  }

  const db = await readDb();
  return (db.patientContinuityByProviderId?.[providerId] || [])
    .filter((record) => options?.includeArchived ? true : !record.archivedAt)
    .sort((left, right) => (
      new Date(right.lastUsedAt || right.updatedAt).getTime()
      - new Date(left.lastUsedAt || left.updatedAt).getTime()
    ));
}

export async function getPatientContinuityRecord(recordId: string, providerId = DEFAULT_PROVIDER_IDENTITY_ID, options?: { includeArchived?: boolean }) {
  const durableRecord = await getPatientContinuityDurable(recordId, providerId, options);
  if (durableRecord) {
    return durableRecord;
  }

  const records = await listPatientContinuityRecords(providerId, options);
  return records.find((record) => record.id === recordId) || null;
}

export async function savePatientContinuityRecord(record: PatientContinuityRecord, providerId = DEFAULT_PROVIDER_IDENTITY_ID) {
  const normalized = normalizePatientContinuityRecord({
    ...record,
    providerIdentityId: providerId,
    updatedAt: new Date().toISOString(),
  }, providerId);
  const durableRecord = await upsertPatientContinuityDurable(normalized, providerId);
  if (durableRecord) {
    return durableRecord;
  }

  const db = await readDb();
  const bucket = db.patientContinuityByProviderId?.[providerId] || [];
  db.patientContinuityByProviderId = {
    ...(db.patientContinuityByProviderId || {}),
    [providerId]: [
      normalized,
      ...bucket.filter((item) => item.id !== normalized.id),
    ].slice(0, 200),
  };
  await writeDb(db);
  return normalized;
}

export async function markPatientContinuityUsed(recordId: string, providerId = DEFAULT_PROVIDER_IDENTITY_ID) {
  const current = await getPatientContinuityRecord(recordId, providerId, { includeArchived: true });
  if (!current) {
    return null;
  }

  return savePatientContinuityRecord({
    ...current,
    lastUsedAt: new Date().toISOString(),
  }, providerId);
}

export async function archivePatientContinuityRecord(recordId: string, providerId = DEFAULT_PROVIDER_IDENTITY_ID) {
  const current = await getPatientContinuityRecord(recordId, providerId, { includeArchived: true });
  if (!current) {
    return null;
  }

  return savePatientContinuityRecord({
    ...current,
    archivedAt: new Date().toISOString(),
  }, providerId);
}
