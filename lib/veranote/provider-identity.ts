import { DEFAULT_PROVIDER_IDENTITY_ID } from '@/lib/constants/provider-identities';

export const CURRENT_PROVIDER_ID_KEY = 'veranote:current-provider-id';
export const PROVIDER_IDENTITY_EVENT = 'veranote-provider-identity';

export function getCurrentProviderId() {
  if (typeof window === 'undefined') {
    return DEFAULT_PROVIDER_IDENTITY_ID;
  }

  return window.localStorage.getItem(CURRENT_PROVIDER_ID_KEY) || DEFAULT_PROVIDER_IDENTITY_ID;
}

export function setCurrentProviderId(providerId: string) {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(CURRENT_PROVIDER_ID_KEY, providerId);
  window.dispatchEvent(new CustomEvent(PROVIDER_IDENTITY_EVENT, { detail: { providerId } }));
}

export function getProviderSettingsStorageKey(providerId: string) {
  return `clinical-documentation-transformer:provider-settings:${providerId}`;
}

export function getNotePresetsStorageKey(providerId: string) {
  return `clinical-documentation-transformer:note-presets:${providerId}`;
}

export function getAssistantLearningStorageKey(providerId: string) {
  return `veranote:assistant-learning:${providerId}`;
}

export function getDraftSessionStorageKey(providerId: string) {
  return `clinical-documentation-transformer:draft-session:${providerId}`;
}

export function getDraftRecoveryStorageKey(providerId: string) {
  return `clinical-documentation-transformer:draft-recovery:${providerId}`;
}

export function getAssistantPendingActionStorageKey(providerId: string) {
  return `veranote:assistant-pending-action:${providerId}`;
}

export function getVeraCueUsageStorageKey(providerId: string) {
  return `veranote:vera-cue-usage:${providerId}`;
}

export function getVeraMemoryAckStorageKey(providerId: string) {
  return `veranote:vera-memory-acknowledged:${providerId}`;
}
