import { describe, expect, it } from 'vitest';
import {
  AMBIENT_LISTENING_AUDIT_EVENT_NAMES,
  AMBIENT_LISTENING_FLAG_CATEGORIES,
  AMBIENT_LISTENING_UI_STATES,
  DEFAULT_AMBIENT_LISTENING_MODULE_CONFIG,
} from '@/lib/constants/ambient-listening';
import { normalizeAmbientListeningModuleConfig, summarizeAmbientListeningModuleConfig } from '@/lib/ambient-listening/config';
import { canStartAmbientRecording } from '@/types/ambient-listening';

describe('ambient listening module scaffold', () => {
  it('keeps ambient listening disabled and draft-only by default', () => {
    expect(DEFAULT_AMBIENT_LISTENING_MODULE_CONFIG.enabled).toBe(false);
    expect(DEFAULT_AMBIENT_LISTENING_MODULE_CONFIG.requireConsentGate).toBe(true);
    expect(DEFAULT_AMBIENT_LISTENING_MODULE_CONFIG.requireEvidenceAnchors).toBe(true);
    expect(DEFAULT_AMBIENT_LISTENING_MODULE_CONFIG.defaultRetentionPolicy.retainRawAudio).toBe(false);
    expect(DEFAULT_AMBIENT_LISTENING_MODULE_CONFIG.safety.autoFinalize).toBe(false);
  });

  it('normalizes partial ambient config safely', () => {
    const normalized = normalizeAmbientListeningModuleConfig({
      enabled: true,
      defaultProvider: 'vendor-x',
      allowedProviders: ['vendor-x', 'vendor-y'],
      defaultRetentionPolicy: {
        retainRawAudio: true,
        rawAudioTtlHours: 24,
        transcriptRetention: 'short_ttl',
      },
    });

    expect(normalized.enabled).toBe(true);
    expect(normalized.defaultProvider).toBe('vendor-x');
    expect(normalized.allowedProviders).toEqual(['vendor-x', 'vendor-y']);
    expect(normalized.defaultRetentionPolicy.retainRawAudio).toBe(true);
    expect(normalized.defaultRetentionPolicy.rawAudioTtlHours).toBe(24);
    expect(normalized.defaultRetentionPolicy.transcriptRetention).toBe('short_ttl');
    expect(normalized.safety.autoFinalize).toBe(false);
  });

  it('exposes the expected states, flag categories, and audit events', () => {
    expect(AMBIENT_LISTENING_UI_STATES).toContain('consent_pending');
    expect(AMBIENT_LISTENING_UI_STATES).toContain('needs_review');
    expect(AMBIENT_LISTENING_FLAG_CATEGORIES).toContain('speaker_attribution');
    expect(AMBIENT_LISTENING_FLAG_CATEGORIES).toContain('process_note_boundary');
    expect(AMBIENT_LISTENING_AUDIT_EVENT_NAMES).toContain('ambient_consent_granted');
    expect(AMBIENT_LISTENING_AUDIT_EVENT_NAMES).toContain('ambient_draft_generated');
  });

  it('blocks recording when consent or retention constraints are unsafe', () => {
    const blocked = canStartAmbientRecording({
      id: 'ambient-1',
      tenantId: 'local-prototype',
      encounterId: 'enc-1',
      providerUserId: 'provider-1',
      mode: 'ambient_in_room',
      careSetting: 'outpatient_psychiatry',
      state: 'ready_to_record',
      jurisdictionContext: {
        recordingConsentModel: 'unknown',
      },
      participants: [
        {
          participantId: 'p1',
          role: 'patient',
          displayLabel: 'Patient',
          consentStatus: 'pending',
          minorOrDependent: false,
        },
      ],
      consentPolicy: {
        policyId: 'consent-policy',
        requiresAllAudibleParticipants: true,
        allowVerbalConsent: true,
        blockIfUnknownJurisdiction: true,
      },
      retentionPolicy: {
        policyId: 'retention-policy',
        retainRawAudio: false,
        transcriptRetention: 'until_note_finalized',
        evidenceSnippetRetention: 'accepted_assertions_only',
      },
      createdAt: new Date().toISOString(),
    });

    expect(blocked.ok).toBe(false);
    expect(blocked.reason).toContain('Recording jurisdiction unknown');
  });

  it('summarizes ambient config in a product-readable way', () => {
    const lines = summarizeAmbientListeningModuleConfig(DEFAULT_AMBIENT_LISTENING_MODULE_CONFIG);
    expect(lines.join(' ')).toContain('Enabled: No');
    expect(lines.join(' ')).toContain('Consent gate: Required');
    expect(lines.join(' ')).toContain('Raw audio retention: Off');
  });
});
