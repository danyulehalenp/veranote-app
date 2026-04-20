export type OutputDestination = 'Generic' | 'WellSky';
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
};

export const PROVIDER_SETTINGS_KEY = 'clinical-documentation-transformer:provider-settings';
