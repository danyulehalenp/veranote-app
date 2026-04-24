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
  getConversationalMemoryFacts,
  getRelationshipStats,
  getProviderWorkflowInsights,
  getRewritePreferenceSuggestion,
  hydrateAssistantLearningFromServer,
  hydrateAssistantMemoryBundleFromServer,
  markLanePreferenceUsed,
  markProfilePromptPreferenceUsed,
  markPromptPreferenceUsed,
  markRewritePreferenceUsed,
  recordRelationshipSignal,
  recordLanePreferenceSelection,
  recordPromptPreferenceSelection,
  recordRewritePreferenceSelection,
  rememberConversationalFact,
  removeConversationalMemoryFact,
  resetAssistantLearningForProfile,
  updateConversationalMemoryFact,
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
  getRewriteSuggestion: (noteType?: string | null, providerId?: string) => ReturnType<typeof getRewritePreferenceSuggestion>;
  recordRewriteSelection: (noteType: string, optionTone: Parameters<typeof recordRewritePreferenceSelection>[1], providerId?: string) => void;
  dismissRewriteSuggestion: (noteType: string, optionTone: Parameters<typeof dismissRewritePreferenceSuggestion>[1], providerId?: string) => void;
  acceptRewriteSuggestion: (noteType: string, optionTone: Parameters<typeof acceptRewritePreferenceSuggestion>[1], providerId?: string) => void;
  clearAcceptedRewriteSuggestion: (noteType: string, optionTone: Parameters<typeof clearAcceptedRewritePreferenceSuggestion>[1], providerId?: string) => void;
  markRewriteUsed: (noteType: string, optionTone: Parameters<typeof markRewritePreferenceUsed>[1], providerId?: string) => void;
  dismissLaneSuggestion: (noteType: string, key: string, providerId?: string) => void;
  acceptLaneSuggestion: (noteType: string, key: string, providerId?: string) => void;
  clearAcceptedLaneSuggestion: (noteType: string, key: string, providerId?: string) => void;
  markLaneUsed: (noteType: string, key: string, providerId?: string) => void;
  recordLaneSelection: (input: Parameters<typeof recordLanePreferenceSelection>[0], providerId?: string) => void;
  dismissPromptSuggestion: (noteType: string, key: string, providerId?: string) => void;
  acceptPromptSuggestion: (noteType: string, key: string, providerId?: string) => void;
  clearAcceptedPromptSuggestion: (noteType: string, key: string, providerId?: string) => void;
  markPromptUsed: (noteType: string, key: string, providerId?: string) => void;
  recordPromptSelection: (input: Parameters<typeof recordPromptPreferenceSelection>[0], providerId?: string) => void;
  getProfilePromptSuggestion: (profileId?: string | null, providerId?: string) => ReturnType<typeof getProfilePromptPreferenceSuggestion>;
  dismissProfilePromptSuggestion: (profileId: string, key: string, providerId?: string) => void;
  acceptProfilePromptSuggestion: (profileId: string, key: string, providerId?: string) => void;
  clearAcceptedProfilePromptSuggestion: (profileId: string, key: string, providerId?: string) => void;
  markProfilePromptUsed: (profileId: string, key: string, providerId?: string) => void;
  getWorkflowInsights: (input: Parameters<typeof getProviderWorkflowInsights>[0], providerId?: string) => ReturnType<typeof getProviderWorkflowInsights>;
  rememberFact: (fact: string, providerId?: string) => ReturnType<typeof rememberConversationalFact>;
  getRememberedFacts: (providerId?: string) => ReturnType<typeof getConversationalMemoryFacts>;
  updateRememberedFact: (key: string, fact: string, providerId?: string) => ReturnType<typeof updateConversationalMemoryFact>;
  removeRememberedFact: (key: string, providerId?: string) => ReturnType<typeof removeConversationalMemoryFact>;
  recordRelationshipSignal: (signal: Parameters<typeof recordRelationshipSignal>[0], providerId?: string) => void;
  getRelationshipStats: (providerId?: string) => ReturnType<typeof getRelationshipStats>;
  reopenAcceptedLedgerSuggestion: (itemId: string, providerId?: string) => boolean;
  resetLearningForProfile: (input: Parameters<typeof resetAssistantLearningForProfile>[0], providerId?: string) => void;
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
  getRewriteSuggestion(noteType, providerId) {
    return getRewritePreferenceSuggestion(noteType, providerId);
  },
  recordRewriteSelection(noteType, optionTone, providerId) {
    recordRewritePreferenceSelection(noteType, optionTone, providerId);
  },
  dismissRewriteSuggestion(noteType, optionTone, providerId) {
    dismissRewritePreferenceSuggestion(noteType, optionTone, providerId);
  },
  acceptRewriteSuggestion(noteType, optionTone, providerId) {
    acceptRewritePreferenceSuggestion(noteType, optionTone, providerId);
  },
  clearAcceptedRewriteSuggestion(noteType, optionTone, providerId) {
    clearAcceptedRewritePreferenceSuggestion(noteType, optionTone, providerId);
  },
  markRewriteUsed(noteType, optionTone, providerId) {
    markRewritePreferenceUsed(noteType, optionTone, providerId);
  },
  dismissLaneSuggestion(noteType, key, providerId) {
    dismissLanePreferenceSuggestion(noteType, key, providerId);
  },
  acceptLaneSuggestion(noteType, key, providerId) {
    acceptLanePreferenceSuggestion(noteType, key, providerId);
  },
  clearAcceptedLaneSuggestion(noteType, key, providerId) {
    clearAcceptedLanePreferenceSuggestion(noteType, key, providerId);
  },
  markLaneUsed(noteType, key, providerId) {
    markLanePreferenceUsed(noteType, key, providerId);
  },
  recordLaneSelection(input, providerId) {
    recordLanePreferenceSelection(input, providerId);
  },
  dismissPromptSuggestion(noteType, key, providerId) {
    dismissPromptPreferenceSuggestion(noteType, key, providerId);
  },
  acceptPromptSuggestion(noteType, key, providerId) {
    acceptPromptPreferenceSuggestion(noteType, key, providerId);
  },
  clearAcceptedPromptSuggestion(noteType, key, providerId) {
    clearAcceptedPromptPreferenceSuggestion(noteType, key, providerId);
  },
  markPromptUsed(noteType, key, providerId) {
    markPromptPreferenceUsed(noteType, key, providerId);
  },
  recordPromptSelection(input, providerId) {
    recordPromptPreferenceSelection(input, providerId);
  },
  getProfilePromptSuggestion(profileId, providerId) {
    return getProfilePromptPreferenceSuggestion(profileId, providerId);
  },
  dismissProfilePromptSuggestion(profileId, key, providerId) {
    dismissProfilePromptPreferenceSuggestion(profileId, key, providerId);
  },
  acceptProfilePromptSuggestion(profileId, key, providerId) {
    acceptProfilePromptPreferenceSuggestion(profileId, key, providerId);
  },
  clearAcceptedProfilePromptSuggestion(profileId, key, providerId) {
    clearAcceptedProfilePromptPreferenceSuggestion(profileId, key, providerId);
  },
  markProfilePromptUsed(profileId, key, providerId) {
    markProfilePromptPreferenceUsed(profileId, key, providerId);
  },
  getWorkflowInsights(input, providerId) {
    return getProviderWorkflowInsights(input, providerId);
  },
  rememberFact(fact, providerId) {
    return rememberConversationalFact(fact, providerId);
  },
  getRememberedFacts(providerId) {
    return getConversationalMemoryFacts(providerId);
  },
  updateRememberedFact(key, fact, providerId) {
    return updateConversationalMemoryFact(key, fact, providerId);
  },
  removeRememberedFact(key, providerId) {
    return removeConversationalMemoryFact(key, providerId);
  },
  recordRelationshipSignal(signal, providerId) {
    recordRelationshipSignal(signal, providerId);
  },
  getRelationshipStats(providerId) {
    return getRelationshipStats(providerId);
  },
  reopenAcceptedLedgerSuggestion(itemId, providerId) {
    const target = resolveAcceptedLedgerReopenTarget({ id: itemId });

    if (!target) {
      return false;
    }

    if (target.kind === 'rewrite') {
      clearAcceptedRewritePreferenceSuggestion(target.noteType, target.tone, providerId);
      return true;
    }

    if (target.kind === 'lane') {
      clearAcceptedLanePreferenceSuggestion(target.noteType, target.key, providerId);
      return true;
    }

    if (target.kind === 'prompt') {
      clearAcceptedPromptPreferenceSuggestion(target.noteType, target.key, providerId);
      return true;
    }

    clearAcceptedProfilePromptPreferenceSuggestion(target.profileId, target.key, providerId);
    return true;
  },
  resetLearningForProfile(input, providerId) {
    resetAssistantLearningForProfile(input, providerId);
  },
};
