import { describe, expect, it } from 'vitest';
import { DEFAULT_DICTATION_MODULE_CONFIG, DICTATION_AUDIT_EVENT_NAMES, DICTATION_HIGH_RISK_FLAG_TYPES, DICTATION_UI_STATES } from '@/lib/constants/dictation';
import { normalizeDictationModuleConfig, summarizeDictationModuleConfig } from '@/lib/dictation/config';

describe('dictation module scaffold', () => {
  it('keeps dictation disabled and review-first by default', () => {
    expect(DEFAULT_DICTATION_MODULE_CONFIG.enabled).toBe(false);
    expect(DEFAULT_DICTATION_MODULE_CONFIG.editor.commitMode).toBe('manual_accept');
    expect(DEFAULT_DICTATION_MODULE_CONFIG.retention.storeAudio).toBe(false);
    expect(DEFAULT_DICTATION_MODULE_CONFIG.safety.autoRewrite).toBe(false);
  });

  it('normalizes partial config safely', () => {
    const normalized = normalizeDictationModuleConfig({
      enabled: true,
      defaultSttProvider: 'azure-speech',
      allowedSttProviders: ['azure-speech', 'openai-realtime'],
      retention: {
        storeAudio: true,
        audioRetentionDays: 14,
      },
      editor: {
        commitMode: 'auto_insert_final_segments',
      },
    });

    expect(normalized.enabled).toBe(true);
    expect(normalized.defaultSttProvider).toBe('azure-speech');
    expect(normalized.allowedSttProviders).toEqual(['azure-speech', 'openai-realtime']);
    expect(normalized.retention.storeAudio).toBe(true);
    expect(normalized.retention.audioRetentionDays).toBe(14);
    expect(normalized.retention.storeInterimTranscripts).toBe(false);
    expect(normalized.editor.commitMode).toBe('auto_insert_final_segments');
    expect(normalized.safety.autoRewrite).toBe(false);
  });

  it('exposes the expected UI states, high-risk flags, and audit event names', () => {
    expect(DICTATION_UI_STATES).toContain('permission_needed');
    expect(DICTATION_UI_STATES).toContain('final_ready');
    expect(DICTATION_HIGH_RISK_FLAG_TYPES).toContain('negation');
    expect(DICTATION_HIGH_RISK_FLAG_TYPES).toContain('risk_language');
    expect(DICTATION_AUDIT_EVENT_NAMES).toContain('dictation_session_started');
    expect(DICTATION_AUDIT_EVENT_NAMES).toContain('dictation_segment_inserted');
  });

  it('summarizes config in a product-readable way', () => {
    const lines = summarizeDictationModuleConfig(DEFAULT_DICTATION_MODULE_CONFIG);
    expect(lines.join(' ')).toContain('Enabled: No');
    expect(lines.join(' ')).toContain('Commit mode: manual_accept');
    expect(lines.join(' ')).toContain('Audio retention: Off');
  });
});
