import type { ProviderIdentity } from '@/types/provider-identity';

export const providerIdentities: ProviderIdentity[] = [
  {
    id: 'provider-brandy-norris-beta',
    firstName: 'Brandy',
    lastName: 'Norris',
    displayName: 'Brandy Norris, PMHNP-BC',
    roleLabel: 'PMHNP-BC',
    defaultProviderProfileId: 'progress-note-heavy',
  },
  {
    id: 'provider-brandi-stalnaker-beta',
    firstName: 'Brandi',
    lastName: 'Stalnaker',
    displayName: 'Brandi Stalnaker, PMHNP-BC',
    roleLabel: 'PMHNP-BC',
    defaultProviderProfileId: 'psych-discharge-heavy',
  },
  {
    id: 'provider-stacey-creel-beta',
    firstName: 'Stacey',
    lastName: 'Creel',
    displayName: 'Stacey Creel, PMHNP-BC',
    roleLabel: 'PMHNP-BC',
    defaultProviderProfileId: 'acute-hpi-assessment-heavy',
  },
  {
    id: 'provider-tori-hogg-beta',
    firstName: 'Tori',
    lastName: 'Hogg',
    displayName: 'Tori Hogg, PMHNP-BC',
    roleLabel: 'PMHNP-BC',
    defaultProviderProfileId: 'outpatient-psych-follow-up-heavy',
  },
  {
    id: 'provider-daniel-hale-beta',
    firstName: 'Daniel',
    lastName: 'Hale',
    displayName: 'Daniel Hale, PMHNP-BC, FNP-C',
    roleLabel: 'PMHNP-BC, FNP-C',
    defaultProviderProfileId: 'mixed-inpatient-psych-medical-consult',
  },
];

export const DEFAULT_PROVIDER_IDENTITY_ID = providerIdentities[0]?.id || 'provider-default';

export function findProviderIdentity(providerId?: string | null) {
  return providerIdentities.find((identity) => identity.id === providerId) || providerIdentities[0] || null;
}
