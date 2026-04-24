import { describe, expect, it, vi } from 'vitest';
import { assistantMemoryService } from '@/lib/veranote/assistant-memory-service';
import * as learning from '@/lib/veranote/assistant-learning';

describe('assistant memory service', () => {
  it('delegates rewrite selection recording to assistant learning', () => {
    const spy = vi.spyOn(learning, 'recordRewritePreferenceSelection').mockImplementation(() => {});

    assistantMemoryService.recordRewriteSelection('Inpatient Psych Progress Note', 'balanced', 'provider-123');

    expect(spy).toHaveBeenCalledWith('Inpatient Psych Progress Note', 'balanced', 'provider-123');
    spy.mockRestore();
  });

  it('delegates workflow insight retrieval to assistant learning', () => {
    const spy = vi.spyOn(learning, 'getProviderWorkflowInsights');

    assistantMemoryService.getWorkflowInsights({ profileId: 'profile-1', noteTypes: ['Progress Note'] }, 'provider-123');

    expect(spy).toHaveBeenCalledWith({ profileId: 'profile-1', noteTypes: ['Progress Note'] }, 'provider-123');
    spy.mockRestore();
  });

  it('reopens accepted ledger suggestions through the matching assistant learning helper', () => {
    const spy = vi.spyOn(learning, 'clearAcceptedPromptPreferenceSuggestion').mockImplementation(() => {});

    expect(
      assistantMemoryService.reopenAcceptedLedgerSuggestion('accepted-prompt:Inpatient Psych Progress Note:brevity-pattern', 'provider-123'),
    ).toBe(true);
    expect(spy).toHaveBeenCalledWith('Inpatient Psych Progress Note', 'brevity-pattern', 'provider-123');
    spy.mockRestore();
  });

  it('delegates provider-scoped profile prompt suggestions to assistant learning', () => {
    const spy = vi.spyOn(learning, 'getProfilePromptPreferenceSuggestion');

    assistantMemoryService.getProfilePromptSuggestion('profile-1', 'provider-123');

    expect(spy).toHaveBeenCalledWith('profile-1', 'provider-123');
    spy.mockRestore();
  });

  it('delegates conversational memory helpers to assistant learning', () => {
    const rememberSpy = vi.spyOn(learning, 'rememberConversationalFact').mockImplementation(() => null);
    const relationshipSpy = vi.spyOn(learning, 'recordRelationshipSignal').mockImplementation(() => {});

    assistantMemoryService.rememberFact('I prefer concise plans.', 'provider-123');
    assistantMemoryService.recordRelationshipSignal('gratitude', 'provider-123');

    expect(rememberSpy).toHaveBeenCalledWith('I prefer concise plans.', 'provider-123');
    expect(relationshipSpy).toHaveBeenCalledWith('gratitude', 'provider-123');
    rememberSpy.mockRestore();
    relationshipSpy.mockRestore();
  });
});
