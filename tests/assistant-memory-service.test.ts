import { describe, expect, it, vi } from 'vitest';
import { assistantMemoryService } from '@/lib/veranote/assistant-memory-service';
import * as learning from '@/lib/veranote/assistant-learning';

describe('assistant memory service', () => {
  it('delegates rewrite selection recording to assistant learning', () => {
    const spy = vi.spyOn(learning, 'recordRewritePreferenceSelection').mockImplementation(() => {});

    assistantMemoryService.recordRewriteSelection('Inpatient Psych Progress Note', 'balanced');

    expect(spy).toHaveBeenCalledWith('Inpatient Psych Progress Note', 'balanced');
    spy.mockRestore();
  });

  it('delegates workflow insight retrieval to assistant learning', () => {
    const spy = vi.spyOn(learning, 'getProviderWorkflowInsights');

    assistantMemoryService.getWorkflowInsights({ profileId: 'profile-1', noteTypes: ['Progress Note'] });

    expect(spy).toHaveBeenCalledWith({ profileId: 'profile-1', noteTypes: ['Progress Note'] });
    spy.mockRestore();
  });

  it('reopens accepted ledger suggestions through the matching assistant learning helper', () => {
    const spy = vi.spyOn(learning, 'clearAcceptedPromptPreferenceSuggestion').mockImplementation(() => {});

    expect(
      assistantMemoryService.reopenAcceptedLedgerSuggestion('accepted-prompt:Inpatient Psych Progress Note:brevity-pattern'),
    ).toBe(true);
    expect(spy).toHaveBeenCalledWith('Inpatient Psych Progress Note', 'brevity-pattern');
    spy.mockRestore();
  });
});
