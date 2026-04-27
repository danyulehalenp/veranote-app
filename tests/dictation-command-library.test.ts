import { describe, expect, it } from 'vitest';
import { resolveDictationCommandMatch } from '@/lib/dictation/command-library';

describe('dictation command library', () => {
  it('matches stored source-building commands by spoken phrase', () => {
    const match = resolveDictationCommandMatch('insert safety check');

    expect(match).toMatchObject({
      commandId: 'safety-check-template',
      action: 'insert_template',
    });
    expect(match?.outputText).toContain('Safety check:');
  });

  it('returns null when no stored command matches', () => {
    expect(resolveDictationCommandMatch('patient says sleep is worse this week')).toBeNull();
  });
});
