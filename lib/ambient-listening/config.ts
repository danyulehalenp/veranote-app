import { DEFAULT_AMBIENT_LISTENING_MODULE_CONFIG } from '@/lib/constants/ambient-listening';
import type { AmbientListeningModuleConfig } from '@/types/ambient-listening';

export function normalizeAmbientListeningModuleConfig(value: unknown): AmbientListeningModuleConfig {
  const candidate = value && typeof value === 'object'
    ? value as Partial<AmbientListeningModuleConfig>
    : {};

  return {
    tenantId: typeof candidate.tenantId === 'string' && candidate.tenantId.trim()
      ? candidate.tenantId
      : DEFAULT_AMBIENT_LISTENING_MODULE_CONFIG.tenantId,
    enabled: typeof candidate.enabled === 'boolean'
      ? candidate.enabled
      : DEFAULT_AMBIENT_LISTENING_MODULE_CONFIG.enabled,
    defaultProvider: typeof candidate.defaultProvider === 'string' && candidate.defaultProvider.trim()
      ? candidate.defaultProvider
      : DEFAULT_AMBIENT_LISTENING_MODULE_CONFIG.defaultProvider,
    allowedProviders: Array.isArray(candidate.allowedProviders) && candidate.allowedProviders.length
      ? candidate.allowedProviders.filter((item): item is string => typeof item === 'string' && Boolean(item.trim()))
      : DEFAULT_AMBIENT_LISTENING_MODULE_CONFIG.allowedProviders,
    requireConsentGate: typeof candidate.requireConsentGate === 'boolean'
      ? candidate.requireConsentGate
      : DEFAULT_AMBIENT_LISTENING_MODULE_CONFIG.requireConsentGate,
    requireVisibleRecordingIndicator: typeof candidate.requireVisibleRecordingIndicator === 'boolean'
      ? candidate.requireVisibleRecordingIndicator
      : DEFAULT_AMBIENT_LISTENING_MODULE_CONFIG.requireVisibleRecordingIndicator,
    blockIfJurisdictionUnknown: typeof candidate.blockIfJurisdictionUnknown === 'boolean'
      ? candidate.blockIfJurisdictionUnknown
      : DEFAULT_AMBIENT_LISTENING_MODULE_CONFIG.blockIfJurisdictionUnknown,
    requireEvidenceAnchors: typeof candidate.requireEvidenceAnchors === 'boolean'
      ? candidate.requireEvidenceAnchors
      : DEFAULT_AMBIENT_LISTENING_MODULE_CONFIG.requireEvidenceAnchors,
    allowRawAudioRetention: typeof candidate.allowRawAudioRetention === 'boolean'
      ? candidate.allowRawAudioRetention
      : DEFAULT_AMBIENT_LISTENING_MODULE_CONFIG.allowRawAudioRetention,
    defaultRetentionPolicy: {
      policyId: typeof candidate.defaultRetentionPolicy?.policyId === 'string' && candidate.defaultRetentionPolicy.policyId.trim()
        ? candidate.defaultRetentionPolicy.policyId
        : DEFAULT_AMBIENT_LISTENING_MODULE_CONFIG.defaultRetentionPolicy.policyId,
      retainRawAudio: typeof candidate.defaultRetentionPolicy?.retainRawAudio === 'boolean'
        ? candidate.defaultRetentionPolicy.retainRawAudio
        : DEFAULT_AMBIENT_LISTENING_MODULE_CONFIG.defaultRetentionPolicy.retainRawAudio,
      rawAudioTtlHours: typeof candidate.defaultRetentionPolicy?.rawAudioTtlHours === 'number'
        ? Math.max(0, candidate.defaultRetentionPolicy.rawAudioTtlHours)
        : DEFAULT_AMBIENT_LISTENING_MODULE_CONFIG.defaultRetentionPolicy.rawAudioTtlHours,
      transcriptRetention: candidate.defaultRetentionPolicy?.transcriptRetention || DEFAULT_AMBIENT_LISTENING_MODULE_CONFIG.defaultRetentionPolicy.transcriptRetention,
      transcriptTtlHours: typeof candidate.defaultRetentionPolicy?.transcriptTtlHours === 'number'
        ? Math.max(0, candidate.defaultRetentionPolicy.transcriptTtlHours)
        : DEFAULT_AMBIENT_LISTENING_MODULE_CONFIG.defaultRetentionPolicy.transcriptTtlHours,
      evidenceSnippetRetention: candidate.defaultRetentionPolicy?.evidenceSnippetRetention || DEFAULT_AMBIENT_LISTENING_MODULE_CONFIG.defaultRetentionPolicy.evidenceSnippetRetention,
    },
    safety: {
      flagNegation: typeof candidate.safety?.flagNegation === 'boolean'
        ? candidate.safety.flagNegation
        : DEFAULT_AMBIENT_LISTENING_MODULE_CONFIG.safety.flagNegation,
      flagRiskLanguage: typeof candidate.safety?.flagRiskLanguage === 'boolean'
        ? candidate.safety.flagRiskLanguage
        : DEFAULT_AMBIENT_LISTENING_MODULE_CONFIG.safety.flagRiskLanguage,
      flagMedications: typeof candidate.safety?.flagMedications === 'boolean'
        ? candidate.safety.flagMedications
        : DEFAULT_AMBIENT_LISTENING_MODULE_CONFIG.safety.flagMedications,
      flagPsychosis: typeof candidate.safety?.flagPsychosis === 'boolean'
        ? candidate.safety.flagPsychosis
        : DEFAULT_AMBIENT_LISTENING_MODULE_CONFIG.safety.flagPsychosis,
      flagLegalStatus: typeof candidate.safety?.flagLegalStatus === 'boolean'
        ? candidate.safety.flagLegalStatus
        : DEFAULT_AMBIENT_LISTENING_MODULE_CONFIG.safety.flagLegalStatus,
      flagUnsupportedClaims: typeof candidate.safety?.flagUnsupportedClaims === 'boolean'
        ? candidate.safety.flagUnsupportedClaims
        : DEFAULT_AMBIENT_LISTENING_MODULE_CONFIG.safety.flagUnsupportedClaims,
      flagProcessNoteBoundary: typeof candidate.safety?.flagProcessNoteBoundary === 'boolean'
        ? candidate.safety.flagProcessNoteBoundary
        : DEFAULT_AMBIENT_LISTENING_MODULE_CONFIG.safety.flagProcessNoteBoundary,
      autoFinalize: false,
    },
  };
}

export function summarizeAmbientListeningModuleConfig(config: AmbientListeningModuleConfig) {
  return [
    `Enabled: ${config.enabled ? 'Yes' : 'No'}`,
    `Default provider: ${config.defaultProvider}`,
    `Consent gate: ${config.requireConsentGate ? 'Required' : 'Not required'}`,
    `Evidence anchors: ${config.requireEvidenceAnchors ? 'Required' : 'Optional'}`,
    `Raw audio retention: ${config.defaultRetentionPolicy.retainRawAudio ? 'On' : 'Off'}`,
    `Transcript retention: ${config.defaultRetentionPolicy.transcriptRetention}`,
    `High-risk flagging: ${[
      config.safety.flagNegation ? 'negation' : '',
      config.safety.flagRiskLanguage ? 'risk' : '',
      config.safety.flagMedications ? 'medications' : '',
      config.safety.flagPsychosis ? 'psychosis' : '',
      config.safety.flagLegalStatus ? 'legal status' : '',
      config.safety.flagUnsupportedClaims ? 'unsupported claims' : '',
      config.safety.flagProcessNoteBoundary ? 'process-note boundary' : '',
    ].filter(Boolean).join(', ') || 'none'}`,
  ];
}
