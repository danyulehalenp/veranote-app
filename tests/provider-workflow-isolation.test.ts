import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getLanePreferenceSuggestion,
  getPromptPreferenceSuggestion,
  getRewritePreferenceSuggestion,
  recordLanePreferenceSelection,
  recordPromptPreferenceSelection,
  recordRewritePreferenceSelection,
} from '@/lib/veranote/assistant-learning';
import {
  getAssistantPendingActionStorageKey,
  getAssistantLearningStorageKey,
  getDraftRecoveryStorageKey,
  getDraftSessionStorageKey,
  getNotePresetsStorageKey,
  getProviderSettingsStorageKey,
  getVeraCueUsageStorageKey,
  getVeraMemoryAckStorageKey,
} from '@/lib/veranote/provider-identity';

type StorageMap = Map<string, string>;

function createLocalStorage(map: StorageMap): Storage {
  return {
    get length() {
      return map.size;
    },
    clear() {
      map.clear();
    },
    getItem(key: string) {
      return map.has(key) ? map.get(key) ?? null : null;
    },
    key(index: number) {
      return [...map.keys()][index] ?? null;
    },
    removeItem(key: string) {
      map.delete(key);
    },
    setItem(key: string, value: string) {
      map.set(key, value);
    },
  };
}

describe('provider workflow isolation', () => {
  const originalWindow = (globalThis as typeof globalThis & { window?: Window & typeof globalThis }).window;
  const originalFetch = globalThis.fetch;
  const storageMap: StorageMap = new Map();

  beforeEach(() => {
    storageMap.clear();
    const mockWindow = {
      localStorage: createLocalStorage(storageMap),
      dispatchEvent: vi.fn(),
    } as unknown as Window & typeof globalThis;

    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: mockWindow,
    });

    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
  });

  afterEach(() => {
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: originalWindow,
    });
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('keeps learned Vera suggestions isolated between beta providers', () => {
    const danielProviderId = 'provider-daniel-hale-beta';
    const staceyProviderId = 'provider-stacey-creel-beta';
    const noteType = 'Outpatient Psych Follow-Up';

    recordRewritePreferenceSelection(noteType, 'balanced', danielProviderId);
    recordRewritePreferenceSelection(noteType, 'balanced', danielProviderId);

    recordLanePreferenceSelection({
      noteType,
      outputScope: 'full-note',
      outputStyle: 'concise',
      format: 'paragraph',
      requestedSections: ['intervalUpdate', 'plan'],
    }, danielProviderId);
    recordLanePreferenceSelection({
      noteType,
      outputScope: 'full-note',
      outputStyle: 'concise',
      format: 'paragraph',
      requestedSections: ['intervalUpdate', 'plan'],
    }, danielProviderId);

    recordPromptPreferenceSelection({
      noteType,
      request: 'make this more concise and easier to scan',
      draft: 'Follow-up draft',
      profileId: 'profile-daniel',
    }, danielProviderId);
    recordPromptPreferenceSelection({
      noteType,
      request: 'make this more concise and easier to scan',
      draft: 'Follow-up draft',
      profileId: 'profile-daniel',
    }, danielProviderId);

    recordRewritePreferenceSelection(noteType, 'balanced', staceyProviderId);
    recordLanePreferenceSelection({
      noteType,
      outputScope: 'hpi-only',
      outputStyle: 'detailed',
      format: 'bulleted',
      requestedSections: ['intervalUpdate'],
    }, staceyProviderId);
    recordPromptPreferenceSelection({
      noteType,
      request: 'keep it source-close',
      draft: 'Different follow-up draft',
      profileId: 'profile-stacey',
    }, staceyProviderId);

    expect(getRewritePreferenceSuggestion(noteType, danielProviderId)).toEqual({
      noteType,
      optionTone: 'balanced',
      count: 2,
    });
    expect(getRewritePreferenceSuggestion(noteType, staceyProviderId)).toBeNull();

    expect(getLanePreferenceSuggestion(noteType, danielProviderId)).toMatchObject({
      noteType,
      outputScope: 'full-note',
      outputStyle: 'concise',
      format: 'paragraph',
      count: 2,
    });
    expect(getLanePreferenceSuggestion(noteType, staceyProviderId)).toBeNull();

    expect(getPromptPreferenceSuggestion(noteType, danielProviderId)).toMatchObject({
      noteType,
      key: 'shorter-plan',
      count: 2,
    });
    expect(getPromptPreferenceSuggestion(noteType, staceyProviderId)).toBeNull();

    expect(storageMap.has(getAssistantLearningStorageKey(danielProviderId))).toBe(true);
    expect(storageMap.has(getAssistantLearningStorageKey(staceyProviderId))).toBe(true);
  });

  it('keeps provider-scoped note workflow browser storage separated', () => {
    const danielProviderId = 'provider-daniel-hale-beta';
    const staceyProviderId = 'provider-stacey-creel-beta';
    const localStorage = globalThis.window?.localStorage as Storage;

    const danielPresetKey = getNotePresetsStorageKey(danielProviderId);
    const staceyPresetKey = getNotePresetsStorageKey(staceyProviderId);
    const danielSettingsKey = getProviderSettingsStorageKey(danielProviderId);
    const staceySettingsKey = getProviderSettingsStorageKey(staceyProviderId);
    const danielDraftKey = getDraftSessionStorageKey(danielProviderId);
    const staceyDraftKey = getDraftSessionStorageKey(staceyProviderId);
    const danielDraftRecoveryKey = getDraftRecoveryStorageKey(danielProviderId);
    const staceyDraftRecoveryKey = getDraftRecoveryStorageKey(staceyProviderId);
    const danielPendingActionKey = getAssistantPendingActionStorageKey(danielProviderId);
    const staceyPendingActionKey = getAssistantPendingActionStorageKey(staceyProviderId);
    const danielCueKey = getVeraCueUsageStorageKey(danielProviderId);
    const staceyCueKey = getVeraCueUsageStorageKey(staceyProviderId);
    const danielAckKey = getVeraMemoryAckStorageKey(danielProviderId);
    const staceyAckKey = getVeraMemoryAckStorageKey(staceyProviderId);

    localStorage.setItem(danielPresetKey, JSON.stringify([{ id: 'preset-daniel', name: 'Daniel Follow-Up' }]));
    localStorage.setItem(staceyPresetKey, JSON.stringify([{ id: 'preset-stacey', name: 'Stacey Intake' }]));
    localStorage.setItem(danielSettingsKey, JSON.stringify({ providerProfileId: 'profile-daniel' }));
    localStorage.setItem(staceySettingsKey, JSON.stringify({ providerProfileId: 'profile-stacey' }));
    localStorage.setItem(danielDraftKey, JSON.stringify({ noteType: 'Follow-Up', note: 'Daniel draft' }));
    localStorage.setItem(staceyDraftKey, JSON.stringify({ noteType: 'Intake', note: 'Stacey draft' }));
    localStorage.setItem(danielDraftRecoveryKey, JSON.stringify({ draftId: 'draft-daniel' }));
    localStorage.setItem(staceyDraftRecoveryKey, JSON.stringify({ draftId: 'draft-stacey' }));
    localStorage.setItem(danielPendingActionKey, JSON.stringify({ type: 'append-preferences', instructions: 'Daniel instruction' }));
    localStorage.setItem(staceyPendingActionKey, JSON.stringify({ type: 'append-preferences', instructions: 'Stacey instruction' }));
    localStorage.setItem(danielCueKey, JSON.stringify({ 'lane:concise': 3 }));
    localStorage.setItem(staceyCueKey, JSON.stringify({ 'lane:detailed': 1 }));
    localStorage.setItem(danielAckKey, JSON.stringify(['accepted-lane:follow-up']));
    localStorage.setItem(staceyAckKey, JSON.stringify(['accepted-prompt:intake']));

    expect(danielPresetKey).not.toBe(staceyPresetKey);
    expect(danielSettingsKey).not.toBe(staceySettingsKey);
    expect(danielDraftKey).not.toBe(staceyDraftKey);
    expect(danielDraftRecoveryKey).not.toBe(staceyDraftRecoveryKey);
    expect(danielPendingActionKey).not.toBe(staceyPendingActionKey);
    expect(danielCueKey).not.toBe(staceyCueKey);
    expect(danielAckKey).not.toBe(staceyAckKey);

    expect(localStorage.getItem(danielPresetKey)).toContain('Daniel Follow-Up');
    expect(localStorage.getItem(staceyPresetKey)).toContain('Stacey Intake');
    expect(localStorage.getItem(danielSettingsKey)).toContain('profile-daniel');
    expect(localStorage.getItem(staceySettingsKey)).toContain('profile-stacey');
    expect(localStorage.getItem(danielDraftKey)).toContain('Daniel draft');
    expect(localStorage.getItem(staceyDraftKey)).toContain('Stacey draft');
    expect(localStorage.getItem(danielDraftRecoveryKey)).toContain('draft-daniel');
    expect(localStorage.getItem(staceyDraftRecoveryKey)).toContain('draft-stacey');
    expect(localStorage.getItem(danielPendingActionKey)).toContain('Daniel instruction');
    expect(localStorage.getItem(staceyPendingActionKey)).toContain('Stacey instruction');
    expect(localStorage.getItem(danielCueKey)).toContain('lane:concise');
    expect(localStorage.getItem(staceyCueKey)).toContain('lane:detailed');
    expect(localStorage.getItem(danielAckKey)).toContain('accepted-lane:follow-up');
    expect(localStorage.getItem(staceyAckKey)).toContain('accepted-prompt:intake');
  });
});
