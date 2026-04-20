import { DEFAULT_PROVIDER_SETTINGS, type ProviderSettings } from '@/lib/constants/settings';
import type { ProviderProfile } from '@/types/provider-profile';

function buildSettings(overrides: Partial<ProviderSettings>): ProviderSettings {
  return {
    ...DEFAULT_PROVIDER_SETTINGS,
    ...overrides,
  };
}

export const PROVIDER_PROFILE_STORAGE_KEY = 'clinical-documentation-transformer:provider-profile';

export const providerProfiles: ProviderProfile[] = [
  {
    id: 'outpatient-psych-follow-up-heavy',
    name: 'Outpatient Psych Follow-Up Heavy',
    description: 'For providers whose psych work is mostly outpatient, with recurring med-management follow-up, telehealth visits, and longitudinal symptom/function tracking.',
    datasetScope: 'founder-seeded',
    customizationLayer: 'profile-defaults',
    workflowFocus: [
      'outpatient med-management follow-up',
      'telehealth psych follow-up',
      'longitudinal symptom and functioning review',
    ],
    reviewEmphasis: [
      'progress-literalism',
      'medication-fidelity',
      'risk-language-literalism',
      'objective-data-literalism',
    ],
    defaults: {
      roleDefault: 'Psychiatric NP',
      noteTypePriority: [
        'Outpatient Psych Follow-Up',
        'Outpatient Psych Telehealth Follow-Up',
        'Outpatient Psychiatric Evaluation',
      ],
      preferredOutputStyle: 'Standard',
      providerSettings: buildSettings({
        outputDestination: 'Generic',
        wellskyFriendly: false,
        asciiSafe: false,
        paragraphOnly: false,
        closerToSourceDefault: true,
      }),
      starterWorkflowIds: [],
      starterPresetIds: ['preset-outpatient-follow-up-longitudinal'],
    },
  },
  {
    id: 'psych-discharge-heavy',
    name: 'Psych Discharge Heavy',
    description: 'For providers who repeatedly need hospitalization chronology, discharge readiness, and med-change visibility to stay explicit.',
    datasetScope: 'founder-seeded',
    customizationLayer: 'profile-defaults',
    workflowFocus: [
      'inpatient psych discharge summaries',
      'hospital course continuity',
      'discharge-status clarity',
    ],
    reviewEmphasis: [
      'discharge-chronology',
      'medication-fidelity',
      'risk-language-literalism',
      'export-profile-constraints',
    ],
    defaults: {
      roleDefault: 'Psychiatric NP',
      noteTypePriority: [
        'Inpatient Psych Discharge Summary',
        'Inpatient Psych Progress Note',
      ],
      preferredOutputStyle: 'Polished',
      providerSettings: buildSettings({
        outputDestination: 'WellSky',
        wellskyFriendly: true,
        asciiSafe: true,
        paragraphOnly: true,
        closerToSourceDefault: true,
      }),
      starterWorkflowIds: ['psych-discharge'],
      starterPresetIds: ['preset-founder-discharge-continuity'],
    },
  },
  {
    id: 'acute-hpi-assessment-heavy',
    name: 'Acute HPI / Assessment Heavy',
    description: 'For providers who most often work from fragmented admission material, collateral conflict, and early psych risk framing.',
    datasetScope: 'founder-seeded',
    customizationLayer: 'profile-defaults',
    workflowFocus: [
      'acute psych admission',
      'HPI structuring',
      'assessment from messy intake',
    ],
    reviewEmphasis: [
      'risk-language-literalism',
      'collateral-attribution',
      'objective-data-literalism',
      'medication-fidelity',
    ],
    defaults: {
      roleDefault: 'Psychiatric NP',
      noteTypePriority: [
        'Inpatient Psych Initial Adult Evaluation',
        'Inpatient Psych Initial Adolescent Evaluation',
        'Psych Admission Medical H&P',
      ],
      preferredOutputStyle: 'Standard',
      providerSettings: buildSettings({
        outputDestination: 'Generic',
        wellskyFriendly: false,
        asciiSafe: false,
        paragraphOnly: false,
        closerToSourceDefault: true,
      }),
      starterWorkflowIds: ['acute-psych-admission'],
      starterPresetIds: ['preset-founder-acute-admission'],
    },
  },
  {
    id: 'progress-note-heavy',
    name: 'Progress Note Heavy',
    description: 'For providers focused on high-frequency daily psych follow-up, keeping unresolved symptoms and treatment response visible.',
    datasetScope: 'founder-seeded',
    customizationLayer: 'profile-defaults',
    workflowFocus: [
      'daily psych progress notes',
      'ongoing treatment response',
      'behavior and PRN-aware follow-up',
    ],
    reviewEmphasis: [
      'progress-literalism',
      'risk-language-literalism',
      'medication-fidelity',
    ],
    defaults: {
      roleDefault: 'Psychiatric NP',
      noteTypePriority: [
        'Inpatient Psych Progress Note',
        'Inpatient Psych Day Two Note',
      ],
      preferredOutputStyle: 'Standard',
      providerSettings: buildSettings({
        outputDestination: 'WellSky',
        wellskyFriendly: true,
        asciiSafe: true,
        paragraphOnly: false,
        closerToSourceDefault: true,
      }),
      starterWorkflowIds: ['psych-progress'],
      starterPresetIds: ['preset-founder-progress-literal'],
    },
  },
  {
    id: 'meds-labs-dx-review-heavy',
    name: 'Meds / Labs / DX Review Heavy',
    description: 'For providers who need medication, lab, and diagnosis-sensitive review to stay literal, bounded, and clearly reviewable.',
    datasetScope: 'founder-seeded',
    customizationLayer: 'profile-defaults',
    workflowFocus: [
      'medication-sensitive documentation',
      'labs and objective-data review',
      'bounded diagnosis framing',
    ],
    reviewEmphasis: [
      'medication-fidelity',
      'objective-data-literalism',
      'risk-language-literalism',
      'export-profile-constraints',
    ],
    defaults: {
      roleDefault: 'Psychiatric NP',
      noteTypePriority: [
        'Inpatient Psych Progress Note',
        'Medical Consultation Note',
        'General Medical SOAP/HPI',
      ],
      preferredOutputStyle: 'Concise',
      providerSettings: buildSettings({
        outputDestination: 'Generic',
        wellskyFriendly: false,
        asciiSafe: false,
        paragraphOnly: true,
        closerToSourceDefault: true,
      }),
      starterWorkflowIds: ['meds-labs-review'],
      starterPresetIds: ['preset-founder-meds-labs-review'],
    },
  },
  {
    id: 'mixed-inpatient-psych-medical-consult',
    name: 'Mixed Inpatient Psych + Medical Consult',
    description: 'For providers who move between inpatient psych context and inpatient medical H&Ps or consults, needing medication truth, lab fidelity, restrained assessment language, and problem-oriented medical structure.',
    datasetScope: 'founder-seeded',
    customizationLayer: 'profile-defaults',
    workflowFocus: [
      'inpatient medical consults',
      'medical H&P and problem-oriented SOAP structure',
      'psych-adjacent inpatient documentation with source-faithful medical relevance',
    ],
    reviewEmphasis: [
      'medication-fidelity',
      'objective-data-literalism',
      'risk-language-literalism',
      'export-profile-constraints',
    ],
    defaults: {
      roleDefault: 'PMHNP-BC / FNP-C',
      noteTypePriority: [
        'Medical Consultation Note',
        'General Medical SOAP/HPI',
        'Psych Admission Medical H&P',
      ],
      preferredOutputStyle: 'Concise',
      providerSettings: buildSettings({
        outputDestination: 'Generic',
        wellskyFriendly: false,
        asciiSafe: false,
        paragraphOnly: true,
        closerToSourceDefault: true,
      }),
      starterWorkflowIds: ['meds-labs-review'],
      starterPresetIds: ['preset-founder-meds-labs-review'],
    },
  },
];

export function findProviderProfile(profileId: string | null | undefined) {
  return providerProfiles.find((profile) => profile.id === profileId) ?? null;
}
