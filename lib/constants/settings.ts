import type { OutputDestination } from '@/lib/veranote/output-destinations';
import type { OutputNoteFocus, OutputProfile } from '@/lib/veranote/output-destinations';
import type { DictationCommandDefinition, DictationVoiceProfile } from '@/types/dictation';

export type { OutputDestination } from '@/lib/veranote/output-destinations';
export type { OutputNoteFocus, OutputProfile } from '@/lib/veranote/output-destinations';
export type VeraAddressPreference = 'preferred-address' | 'first-name' | 'title-last-name' | 'provider-profile';
export type VeraInteractionStyle = 'warm-professional' | 'formal' | 'friendly';
export type VeraProactivityLevel = 'light' | 'balanced' | 'anticipatory';

export type ProviderSettings = {
  providerProfileId: string;
  providerFirstName: string;
  providerLastName: string;
  veraPreferredAddress: string;
  veraAddressPreference: VeraAddressPreference;
  veraInteractionStyle: VeraInteractionStyle;
  veraProactivityLevel: VeraProactivityLevel;
  veraMemoryNotes: string;
  asciiSafe: boolean;
  abbreviationsOkay: boolean;
  paragraphOnly: boolean;
  closerToSourceDefault: boolean;
  wellskyFriendly: boolean;
  outputDestination: OutputDestination;
  outputNoteFocus: OutputNoteFocus;
  activeOutputProfileId: string;
  outputProfiles: OutputProfile[];
  dictationCommands: DictationCommandDefinition[];
  dictationVoiceProfile: DictationVoiceProfile;
};

export const DEFAULT_PROVIDER_SETTINGS: ProviderSettings = {
  providerProfileId: '',
  providerFirstName: '',
  providerLastName: '',
  veraPreferredAddress: '',
  veraAddressPreference: 'provider-profile',
  veraInteractionStyle: 'warm-professional',
  veraProactivityLevel: 'balanced',
  veraMemoryNotes: '',
  asciiSafe: true,
  abbreviationsOkay: true,
  paragraphOnly: true,
  closerToSourceDefault: true,
  wellskyFriendly: true,
  outputDestination: 'WellSky',
  outputNoteFocus: 'inpatient-psych-follow-up',
  activeOutputProfileId: '',
  outputProfiles: [],
  dictationCommands: [],
  dictationVoiceProfile: {
    preferredPacing: 'measured',
    pronunciationHints: '',
    vocabularyBoost: [],
    starterPhrases: [
      'Follow-up visit, mood stable, no medication side effects reported.',
      'Mental status exam, alert and oriented, speech clear, thought process linear.',
      'Plan, continue current regimen and follow up in four weeks.',
    ],
    rescuePhrases: [
      'Medication reconciliation complete, no dose changes today.',
      'Patient denies suicidal ideation, homicidal ideation, or hallucinations.',
      'Assessment unchanged from prior visit with supportive therapy provided.',
    ],
    lowConfidencePromptThreshold: 2,
    promptWhenSystemStruggles: true,
  },
};

export const PROVIDER_SETTINGS_KEY = 'clinical-documentation-transformer:provider-settings';
