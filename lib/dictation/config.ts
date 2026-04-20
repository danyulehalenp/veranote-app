import { DEFAULT_DICTATION_MODULE_CONFIG } from '@/lib/constants/dictation';
import type { DictationModuleConfig } from '@/types/dictation';

export function normalizeDictationModuleConfig(value: unknown): DictationModuleConfig {
  const candidate = value && typeof value === 'object'
    ? value as Partial<DictationModuleConfig>
    : {};

  return {
    tenantId: typeof candidate.tenantId === 'string' && candidate.tenantId.trim()
      ? candidate.tenantId
      : DEFAULT_DICTATION_MODULE_CONFIG.tenantId,
    enabled: typeof candidate.enabled === 'boolean'
      ? candidate.enabled
      : DEFAULT_DICTATION_MODULE_CONFIG.enabled,
    defaultSttProvider: typeof candidate.defaultSttProvider === 'string' && candidate.defaultSttProvider.trim()
      ? candidate.defaultSttProvider
      : DEFAULT_DICTATION_MODULE_CONFIG.defaultSttProvider,
    allowedSttProviders: Array.isArray(candidate.allowedSttProviders) && candidate.allowedSttProviders.length
      ? candidate.allowedSttProviders.filter((item): item is string => typeof item === 'string' && Boolean(item.trim()))
      : DEFAULT_DICTATION_MODULE_CONFIG.allowedSttProviders,
    enableWebSpeechDevOnly: typeof candidate.enableWebSpeechDevOnly === 'boolean'
      ? candidate.enableWebSpeechDevOnly
      : DEFAULT_DICTATION_MODULE_CONFIG.enableWebSpeechDevOnly,
    retention: {
      storeAudio: typeof candidate.retention?.storeAudio === 'boolean'
        ? candidate.retention.storeAudio
        : DEFAULT_DICTATION_MODULE_CONFIG.retention.storeAudio,
      audioRetentionDays: typeof candidate.retention?.audioRetentionDays === 'number'
        ? Math.max(0, candidate.retention.audioRetentionDays)
        : DEFAULT_DICTATION_MODULE_CONFIG.retention.audioRetentionDays,
      storeInterimTranscripts: typeof candidate.retention?.storeInterimTranscripts === 'boolean'
        ? candidate.retention.storeInterimTranscripts
        : DEFAULT_DICTATION_MODULE_CONFIG.retention.storeInterimTranscripts,
      finalTranscriptRetention: candidate.retention?.finalTranscriptRetention || DEFAULT_DICTATION_MODULE_CONFIG.retention.finalTranscriptRetention,
    },
    safety: {
      flagNegation: typeof candidate.safety?.flagNegation === 'boolean'
        ? candidate.safety.flagNegation
        : DEFAULT_DICTATION_MODULE_CONFIG.safety.flagNegation,
      flagRiskLanguage: typeof candidate.safety?.flagRiskLanguage === 'boolean'
        ? candidate.safety.flagRiskLanguage
        : DEFAULT_DICTATION_MODULE_CONFIG.safety.flagRiskLanguage,
      flagMedications: typeof candidate.safety?.flagMedications === 'boolean'
        ? candidate.safety.flagMedications
        : DEFAULT_DICTATION_MODULE_CONFIG.safety.flagMedications,
      flagLegalStatus: typeof candidate.safety?.flagLegalStatus === 'boolean'
        ? candidate.safety.flagLegalStatus
        : DEFAULT_DICTATION_MODULE_CONFIG.safety.flagLegalStatus,
      autoRewrite: false,
    },
    editor: {
      commitMode: candidate.editor?.commitMode || DEFAULT_DICTATION_MODULE_CONFIG.editor.commitMode,
      dictationBoxFallback: typeof candidate.editor?.dictationBoxFallback === 'boolean'
        ? candidate.editor.dictationBoxFallback
        : DEFAULT_DICTATION_MODULE_CONFIG.editor.dictationBoxFallback,
      provenanceMarkers: typeof candidate.editor?.provenanceMarkers === 'boolean'
        ? candidate.editor.provenanceMarkers
        : DEFAULT_DICTATION_MODULE_CONFIG.editor.provenanceMarkers,
    },
  };
}

export function summarizeDictationModuleConfig(config: DictationModuleConfig) {
  return [
    `Enabled: ${config.enabled ? 'Yes' : 'No'}`,
    `Default STT provider: ${config.defaultSttProvider}`,
    `Commit mode: ${config.editor.commitMode}`,
    `Audio retention: ${config.retention.storeAudio ? `${config.retention.audioRetentionDays} day(s)` : 'Off'}`,
    `Interim transcript retention: ${config.retention.storeInterimTranscripts ? 'On' : 'Off'}`,
    `High-risk flagging: ${[
      config.safety.flagNegation ? 'negation' : '',
      config.safety.flagRiskLanguage ? 'risk' : '',
      config.safety.flagMedications ? 'medications' : '',
      config.safety.flagLegalStatus ? 'legal status' : '',
    ].filter(Boolean).join(', ') || 'none'}`,
  ];
}
