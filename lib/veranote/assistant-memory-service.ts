import {
  acceptLanePreferenceSuggestion,
  acceptProfilePromptPreferenceSuggestion,
  acceptPromptPreferenceSuggestion,
  acceptRewritePreferenceSuggestion,
  clearAcceptedLanePreferenceSuggestion,
  clearAcceptedProfilePromptPreferenceSuggestion,
  clearAcceptedPromptPreferenceSuggestion,
  clearAcceptedRewritePreferenceSuggestion,
  createEmptyAssistantLearningStore,
  dismissLanePreferenceSuggestion,
  dismissProfilePromptPreferenceSuggestion,
  dismissPromptPreferenceSuggestion,
  dismissRewritePreferenceSuggestion,
  getProfilePromptPreferenceSuggestion,
  getProviderWorkflowInsights,
  getRewritePreferenceSuggestion,
  hydrateAssistantLearningFromServer,
  hydrateAssistantMemoryBundleFromServer,
  markLanePreferenceUsed,
  markProfilePromptPreferenceUsed,
  markPromptPreferenceUsed,
  markRewritePreferenceUsed,
  recordLanePreferenceSelection,
  recordPromptPreferenceSelection,
  recordRewritePreferenceSelection,
  resetAssistantLearningForProfile,
  type AssistantLearningStore,
} from '@/lib/veranote/assistant-learning';
import { resolveAcceptedLedgerReopenTarget } from '@/lib/veranote/vera-memory-ledger-service';
import type { VeraMemoryLedger } from '@/types/vera-memory';

export type AssistantMemoryService = {
  createEmptyLearningStore: () => AssistantLearningStore;
  hydrateLearning: (providerId?: string) => Promise<AssistantLearningStore>;
  hydrateMemoryBundle: (providerId?: string) => Promise<{
    learningStore: AssistantLearningStore;
    veraMemoryLedger: VeraMemoryLedger | null;
  }>;
  getRewriteSuggestion: (noteType?: string | null) => ReturnType<typeof getRewritePreferenceSuggestion>;
  recordRewriteSelection: (noteType: string, optionTone: Parameters<typeof recordRewritePreferenceSelection>[1]) => void;
  dismissRewriteSuggestion: (noteType: string, optionTone: Parameters<typeof dismissRewritePreferenceSuggestion>[1]) => void;
  acceptRewriteSuggestion: (noteType: string, optionTone: Parameters<typeof acceptRewritePreferenceSuggestion>[1]) => void;
  clearAcceptedRewriteSuggestion: (noteType: string, optionTone: Parameters<typeof clearAcceptedRewritePreferenceSuggestion>[1]) => void;
  markRewriteUsed: (noteType: string, optionTone: Parameters<typeof markRewritePreferenceUsed>[1]) => void;
  dismissLaneSuggestion: (noteType: string, key: string) => void;
  acceptLaneSuggestion: (noteType: string, key: string) => void;
  clearAcceptedLaneSuggestion: (noteType: string, key: string) => void;
  markLaneUsed: (noteType: string, key: string) => void;
  recordLaneSelection: (input: Parameters<typeof recordLanePreferenceSelection>[0]) => void;
  dismissPromptSuggestion: (noteType: string, key: string) => void;
  acceptPromptSuggestion: (noteType: string, key: string) => void;
  clearAcceptedPromptSuggestion: (noteType: string, key: string) => void;
  markPromptUsed: (noteType: string, key: string) => void;
  recordPromptSelection: (input: Parameters<typeof recordPromptPreferenceSelection>[0]) => void;
  getProfilePromptSuggestion: (profileId?: string | null) => ReturnType<typeof getProfilePromptPreferenceSuggestion>;
  dismissProfilePromptSuggestion: (profileId: string, key: string) => void;
  acceptProfilePromptSuggestion: (profileId: string, key: string) => void;
  clearAcceptedProfilePromptSuggestion: (profileId: string, key: string) => void;
  markProfilePromptUsed: (profileId: string, key: string) => void;
  getWorkflowInsights: (input: Parameters<typeof getProviderWorkflowInsights>[0]) => ReturnType<typeof getProviderWorkflowInsights>;
  reopenAcceptedLedgerSuggestion: (itemId: string) => boolean;
  resetLearningForProfile: (input: Parameters<typeof resetAssistantLearningForProfile>[0]) => void;
};

export const assistantMemoryService: AssistantMemoryService = {
  createEmptyLearningStore() {
    return createEmptyAssistantLearningStore();
  },
  hydrateLearning(providerId) {
    return hydrateAssistantLearningFromServer(providerId);
  },
  hydrateMemoryBundle(providerId) {
    return hydrateAssistantMemoryBundleFromServer(providerId);
  },
  getRewriteSuggestion(noteType) {
    return getRewritePreferenceSuggestion(noteType);
  },
  recordRewriteSelection(noteType, optionTone) {
    recordRewritePreferenceSelection(noteType, optionTone);
  },
  dismissRewriteSuggestion(noteType, optionTone) {
    dismissRewritePreferenceSuggestion(noteType, optionTone);
  },
  acceptRewriteSuggestion(noteType, optionTone) {
    acceptRewritePreferenceSuggestion(noteType, optionTone);
  },
  clearAcceptedRewriteSuggestion(noteType, optionTone) {
    clearAcceptedRewritePreferenceSuggestion(noteType, optionTone);
  },
  markRewriteUsed(noteType, optionTone) {
    markRewritePreferenceUsed(noteType, optionTone);
  },
  dismissLaneSuggestion(noteType, key) {
    dismissLanePreferenceSuggestion(noteType, key);
  },
  acceptLaneSuggestion(noteType, key) {
    acceptLanePreferenceSuggestion(noteType, key);
  },
  clearAcceptedLaneSuggestion(noteType, key) {
    clearAcceptedLanePreferenceSuggestion(noteType, key);
  },
  markLaneUsed(noteType, key) {
    markLanePreferenceUsed(noteType, key);
  },
  recordLaneSelection(input) {
    recordLanePreferenceSelection(input);
  },
  dismissPromptSuggestion(noteType, key) {
    dismissPromptPreferenceSuggestion(noteType, key);
  },
  acceptPromptSuggestion(noteType, key) {
    acceptPromptPreferenceSuggestion(noteType, key);
  },
  clearAcceptedPromptSuggestion(noteType, key) {
    clearAcceptedPromptPreferenceSuggestion(noteType, key);
  },
  markPromptUsed(noteType, key) {
    markPromptPreferenceUsed(noteType, key);
  },
  recordPromptSelection(input) {
    recordPromptPreferenceSelection(input);
  },
  getProfilePromptSuggestion(profileId) {
    return getProfilePromptPreferenceSuggestion(profileId);
  },
  dismissProfilePromptSuggestion(profileId, key) {
    dismissProfilePromptPreferenceSuggestion(profileId, key);
  },
  acceptProfilePromptSuggestion(profileId, key) {
    acceptProfilePromptPreferenceSuggestion(profileId, key);
  },
  clearAcceptedProfilePromptSuggestion(profileId, key) {
    clearAcceptedProfilePromptPreferenceSuggestion(profileId, key);
  },
  markProfilePromptUsed(profileId, key) {
    markProfilePromptPreferenceUsed(profileId, key);
  },
  getWorkflowInsights(input) {
    return getProviderWorkflowInsights(input);
  },
  reopenAcceptedLedgerSuggestion(itemId) {
    const target = resolveAcceptedLedgerReopenTarget({ id: itemId });

    if (!target) {
      return false;
    }

    if (target.kind === 'rewrite') {
      clearAcceptedRewritePreferenceSuggestion(target.noteType, target.tone);
      return true;
    }

    if (target.kind === 'lane') {
      clearAcceptedLanePreferenceSuggestion(target.noteType, target.key);
      return true;
    }

    if (target.kind === 'prompt') {
      clearAcceptedPromptPreferenceSuggestion(target.noteType, target.key);
      return true;
    }

    clearAcceptedProfilePromptPreferenceSuggestion(target.profileId, target.key);
    return true;
  },
  resetLearningForProfile(input) {
    resetAssistantLearningForProfile(input);
  },
};
