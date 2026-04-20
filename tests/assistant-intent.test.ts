import { describe, expect, it } from 'vitest';
import {
  buildAssistantIntentTrace,
  normalizeAssistantMessage,
  normalizeAssistantIntentText,
  resolveAssistantMode,
  resolveAssistantStage,
} from '@/lib/veranote/assistant-intent';

describe('assistant intent helpers', () => {
  it('resolves stage and mode safely', () => {
    expect(resolveAssistantStage('review')).toBe('review');
    expect(resolveAssistantStage(undefined)).toBe('compose');
    expect(resolveAssistantMode('prompt-builder')).toBe('prompt-builder');
    expect(resolveAssistantMode('reference-lookup')).toBe('reference-lookup');
    expect(resolveAssistantMode(undefined)).toBe('workflow-help');
  });

  it('normalizes empty and padded provider messages', () => {
    expect(normalizeAssistantMessage('  Hello Vera  ')).toBe('Hello Vera');
    expect(normalizeAssistantMessage(undefined)).toBe('');
  });

  it('normalizes common misspellings and provider abbreviations', () => {
    expect(normalizeAssistantIntentText('help me with a prog note for out paitent psych in Well Sky')).toBe(
      'help me with a progress note for outpatient psych in wellsky',
    );
    expect(normalizeAssistantIntentText('do you know icd10 dx for mdd')).toBe(
      'do you know icd 10 diagnosis for mdd',
    );
    expect(normalizeAssistantIntentText('what is the difference between presest and prompt prefences')).toBe(
      'what is the difference between preset and prompt preferences',
    );
  });

  it('builds a review-aware intent trace', () => {
    const trace = buildAssistantIntentTrace({
      stage: 'review',
      mode: 'workflow-help',
      normalizedMessage: 'why did this warning appear?',
      context: { topHighRiskWarningTitle: 'Timeline drift' },
      recentMessages: [{ role: 'provider', content: 'Please review this.' }],
    });

    expect(trace).toContain('direct-review');
    expect(trace).toContain('review-scenario');
    expect(trace).toContain('warning-aware-context');
    expect(trace).toContain('recent-thread-memory');
  });
});
