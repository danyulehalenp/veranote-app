import type { ProviderSettings } from '@/lib/constants/settings';

export type ProviderReviewEmphasis =
  | 'discharge-chronology'
  | 'risk-language-literalism'
  | 'collateral-attribution'
  | 'medication-fidelity'
  | 'objective-data-literalism'
  | 'progress-literalism'
  | 'export-profile-constraints';

export type ProviderCustomizationLayer =
  | 'profile-defaults'
  | 'workflow-presets'
  | 'output-profile-preferences'
  | 'style-controls';

export type ProviderProfileOutputStyle = 'Concise' | 'Standard' | 'Polished';

export type ProviderProfileDefaults = {
  roleDefault: string;
  noteTypePriority: string[];
  preferredOutputStyle: ProviderProfileOutputStyle;
  providerSettings: ProviderSettings;
  starterWorkflowIds: string[];
  starterPresetIds: string[];
};

export type ProviderProfile = {
  id: string;
  name: string;
  description: string;
  datasetScope: 'founder-seeded';
  customizationLayer: ProviderCustomizationLayer;
  workflowFocus: string[];
  reviewEmphasis: ProviderReviewEmphasis[];
  defaults: ProviderProfileDefaults;
};
