import { describe, expect, it } from 'vitest';
import {
  DEFAULT_ASSISTANT_AVATAR,
  DEFAULT_ASSISTANT_NAME,
  DEFAULT_ASSISTANT_ROLE,
  applyAssistantPersonaDefaults,
  listAssistantAvatarOptions,
  resolveAssistantPersona,
  sanitizeAssistantName,
  sanitizeAssistantRole,
} from '@/lib/veranote/assistant-persona';

describe('assistant persona helpers', () => {
  it('falls back to safe defaults when values are missing', () => {
    expect(resolveAssistantPersona()).toEqual({
      name: DEFAULT_ASSISTANT_NAME,
      role: DEFAULT_ASSISTANT_ROLE,
      avatar: DEFAULT_ASSISTANT_AVATAR,
    });
  });

  it('sanitizes unsafe names and strips emoji', () => {
    expect(sanitizeAssistantName(' Precision 😊 ')).toBe('Precision');
    expect(sanitizeAssistantName('fuckbot')).toBe(DEFAULT_ASSISTANT_NAME);
  });

  it('allows an optional blank role but blocks inappropriate role text', () => {
    expect(sanitizeAssistantRole('')).toBe('');
    expect(sanitizeAssistantRole('Warm Guide')).toBe('Warm Guide');
    expect(sanitizeAssistantRole('shit helper')).toBe(DEFAULT_ASSISTANT_ROLE);
  });

  it('keeps only curated avatar ids', () => {
    const defaults = applyAssistantPersonaDefaults({
      userAiName: 'North',
      userAiRole: 'Clinical Assistant',
      userAiAvatar: 'not-real',
    });

    expect(defaults.userAiAvatar).toBe(DEFAULT_ASSISTANT_AVATAR);
    expect(listAssistantAvatarOptions()).toHaveLength(8);
  });
});
