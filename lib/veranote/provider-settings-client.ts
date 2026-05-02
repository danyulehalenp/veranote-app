import { DEFAULT_PROVIDER_SETTINGS, type ProviderSettings } from '@/lib/constants/settings';
import { applyAssistantPersonaDefaults } from '@/lib/veranote/assistant-persona';
import { getProviderSettingsStorageKey } from '@/lib/veranote/provider-identity';

export const PROVIDER_SETTINGS_STORAGE_VERSION = '2026-04-30';

export function getProviderSettingsStorageVersionKey(providerId: string) {
  return `${getProviderSettingsStorageKey(providerId)}:version`;
}

export function normalizeProviderSettings(input?: Partial<ProviderSettings> | null) {
  return applyAssistantPersonaDefaults({
    ...DEFAULT_PROVIDER_SETTINGS,
    ...(input || {}),
  });
}

export function readCachedProviderSettings(providerId: string) {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const version = window.localStorage.getItem(getProviderSettingsStorageVersionKey(providerId));
    if (version !== PROVIDER_SETTINGS_STORAGE_VERSION) {
      clearCachedProviderSettings(providerId);
      return null;
    }

    const raw = window.localStorage.getItem(getProviderSettingsStorageKey(providerId));
    if (!raw) {
      return null;
    }

    return normalizeProviderSettings(JSON.parse(raw) as ProviderSettings);
  } catch {
    clearCachedProviderSettings(providerId);
    return null;
  }
}

export function writeCachedProviderSettings(providerId: string, settings: Partial<ProviderSettings> | null | undefined) {
  if (typeof window === 'undefined') {
    return;
  }

  const normalized = normalizeProviderSettings(settings || {});
  window.localStorage.setItem(getProviderSettingsStorageKey(providerId), JSON.stringify(normalized));
  window.localStorage.setItem(getProviderSettingsStorageVersionKey(providerId), PROVIDER_SETTINGS_STORAGE_VERSION);
}

export function clearCachedProviderSettings(providerId: string) {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.removeItem(getProviderSettingsStorageKey(providerId));
  window.localStorage.removeItem(getProviderSettingsStorageVersionKey(providerId));
}

export async function fetchProviderSettingsFromServer(providerId: string, signal?: AbortSignal) {
  const response = await fetch(
    `/api/settings/provider?providerId=${encodeURIComponent(providerId)}`,
    {
      cache: 'no-store',
      signal,
    },
  );

  if (!response.ok) {
    throw new Error(`Unable to load provider settings for ${providerId}.`);
  }

  const data = (await response.json()) as { settings?: ProviderSettings };
  return normalizeProviderSettings(data?.settings || {});
}
