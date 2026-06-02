import type { DictationInsertionWorkflowProfile } from '@/lib/dictation/ehr-insertion-profiles';

export type MiniVeranoteSourceTarget = 'intakeCollateral' | 'clinicianNotes' | 'patientTranscript' | 'objectiveData';

export type MiniVeranotePayloadMode = 'smart' | 'draft' | 'target-source' | 'scratch';

export type MiniVeranoteLayout = {
  x: number;
  y: number;
  minimized: boolean;
};

export type MiniVeranotePreferences = {
  targetSection: MiniVeranoteSourceTarget;
  ehrPayloadMode: MiniVeranotePayloadMode;
  selectedFieldTargetId: string;
};

export type MiniVeranoteDesktopHandoff = {
  providerIdentityId: string;
  createdAt: string;
  destination: string;
  destinationLabel: string;
  destinationMode: 'floating-source-box' | 'floating-field-box';
  fieldTargetId?: string;
  fieldTargetLabel?: string;
  sourceTarget: MiniVeranoteSourceTarget;
  sourceTargetLabel: string;
  payloadMode: MiniVeranotePayloadMode;
  text: string;
};

export const MINI_VERANOTE_LAYOUT_STORAGE_KEY = 'veranote-mini-overlay:layout';
export const MINI_VERANOTE_PREF_STORAGE_KEY_PREFIX = 'veranote-mini-overlay:prefs';
export const MINI_VERANOTE_PREF_FALLBACK_STORAGE_KEY = 'veranote-mini-overlay:prefs:fallback';
export const MINI_VERANOTE_HANDOFF_STORAGE_KEY_PREFIX = 'veranote-mini-overlay:desktop-handoff';

export const MINI_VERANOTE_SOURCE_TARGETS: Array<{
  id: MiniVeranoteSourceTarget;
  label: string;
}> = [
  { id: 'intakeCollateral', label: 'Pre-Visit' },
  { id: 'clinicianNotes', label: 'Live Visit' },
  { id: 'patientTranscript', label: 'Ambient' },
  { id: 'objectiveData', label: 'Add-On' },
];

export const DEFAULT_MINI_VERANOTE_PREFERENCES: MiniVeranotePreferences = {
  targetSection: 'clinicianNotes',
  ehrPayloadMode: 'smart',
  selectedFieldTargetId: '',
};

export function getMiniVeranoteProviderStorageKey(prefix: string, providerIdentityId: string) {
  return `${prefix}:${providerIdentityId || 'default-provider'}`;
}

export function getMiniVeranoteTargetLabel(target: MiniVeranoteSourceTarget) {
  return MINI_VERANOTE_SOURCE_TARGETS.find((item) => item.id === target)?.label || 'Live Visit';
}

export function isMiniVeranoteSourceTarget(value: unknown): value is MiniVeranoteSourceTarget {
  return MINI_VERANOTE_SOURCE_TARGETS.some((target) => target.id === value);
}

export function isMiniVeranotePayloadMode(value: unknown): value is MiniVeranotePayloadMode {
  return value === 'smart' || value === 'draft' || value === 'target-source' || value === 'scratch';
}

export function parseMiniVeranotePreferences(raw: string | null): MiniVeranotePreferences | null {
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<MiniVeranotePreferences>;
    return {
      targetSection: isMiniVeranoteSourceTarget(parsed.targetSection)
        ? parsed.targetSection
        : DEFAULT_MINI_VERANOTE_PREFERENCES.targetSection,
      ehrPayloadMode: isMiniVeranotePayloadMode(parsed.ehrPayloadMode)
        ? parsed.ehrPayloadMode
        : DEFAULT_MINI_VERANOTE_PREFERENCES.ehrPayloadMode,
      selectedFieldTargetId: typeof parsed.selectedFieldTargetId === 'string'
        ? parsed.selectedFieldTargetId
        : '',
    };
  } catch {
    return null;
  }
}

export function serializeMiniVeranotePreferences(preferences: MiniVeranotePreferences) {
  return JSON.stringify(preferences);
}

export function writeMiniVeranotePreferences(
  storageKey: string,
  preferences: MiniVeranotePreferences,
  storage: Pick<Storage, 'setItem'> | null | undefined = typeof window !== 'undefined' ? window.localStorage : null,
) {
  if (!storage) {
    return;
  }

  const serialized = serializeMiniVeranotePreferences(preferences);
  storage.setItem(storageKey, serialized);
  storage.setItem(MINI_VERANOTE_PREF_FALLBACK_STORAGE_KEY, serialized);
}

export function parseMiniVeranoteLayout(raw: string | null): MiniVeranoteLayout | null {
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<MiniVeranoteLayout>;
    if (typeof parsed.x !== 'number' || typeof parsed.y !== 'number') {
      return null;
    }

    return {
      x: parsed.x,
      y: parsed.y,
      minimized: typeof parsed.minimized === 'boolean' ? parsed.minimized : false,
    };
  } catch {
    return null;
  }
}

export function selectMiniVeranoteEhrPayload(input: {
  mode: MiniVeranotePayloadMode;
  currentDraftText: string;
  miniText: string;
  targetSourceText: string;
  sourceInput: string;
}) {
  if (input.mode === 'draft') {
    return input.currentDraftText.trim();
  }

  if (input.mode === 'target-source') {
    return input.targetSourceText.trim();
  }

  if (input.mode === 'scratch') {
    return input.miniText.trim();
  }

  return input.currentDraftText.trim()
    || input.miniText.trim()
    || input.targetSourceText.trim()
    || input.sourceInput.trim();
}

export function buildMiniVeranoteDesktopHandoff(input: {
  providerIdentityId: string;
  workflowProfile: Pick<DictationInsertionWorkflowProfile, 'destination' | 'destinationLabel' | 'speechBoxMode'>;
  selectedFieldTarget?: { id: string; label: string } | null;
  sourceTarget: MiniVeranoteSourceTarget;
  payloadMode: MiniVeranotePayloadMode;
  text: string;
  createdAt?: string;
}): MiniVeranoteDesktopHandoff {
  return {
    providerIdentityId: input.providerIdentityId,
    createdAt: input.createdAt || new Date().toISOString(),
    destination: input.workflowProfile.destination,
    destinationLabel: input.workflowProfile.destinationLabel,
    destinationMode: input.workflowProfile.speechBoxMode,
    fieldTargetId: input.selectedFieldTarget?.id,
    fieldTargetLabel: input.selectedFieldTarget?.label,
    sourceTarget: input.sourceTarget,
    sourceTargetLabel: getMiniVeranoteTargetLabel(input.sourceTarget),
    payloadMode: input.payloadMode,
    text: input.text,
  };
}
