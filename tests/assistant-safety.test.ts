import { describe, expect, it } from 'vitest';
import { applyAssistantSafety } from '@/lib/veranote/assistant-safety';

describe('assistant safety helper', () => {
  it('dedupes repeated suggestions and preserves only useful lines', () => {
    const payload = applyAssistantSafety({
      message: 'I drafted the revision for review.',
      suggestions: ['Check source first.', 'Check source first.', '  ', 'Keep wording literal.'],
    });

    expect(payload.suggestions).toEqual(['Check source first.', 'Keep wording literal.']);
  });

  it('rewrites claims of completed actions into draft language when actions are still pending', () => {
    const payload = applyAssistantSafety({
      message: 'I applied the revision to the note.',
      actions: [
        {
          type: 'apply-note-revision',
          label: 'Apply requested note revision',
          instructions: 'Apply it.',
          revisionText: 'Patient reports being off medications for 4 months.',
        },
      ],
    });

    expect(payload.message).toBe('I drafted the revision to the note.');
  });
});
