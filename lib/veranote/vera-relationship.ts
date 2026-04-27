import type { ProviderSettings } from '@/lib/constants/settings';

export function resolveVeraAddress(settings: ProviderSettings, providerProfileName?: string | null) {
  const preferred = settings.veraPreferredAddress.trim();
  const firstName = settings.providerFirstName.trim();
  const lastName = settings.providerLastName.trim();

  if (settings.veraAddressPreference === 'preferred-address' && preferred) {
    return preferred;
  }

  if (settings.veraAddressPreference === 'first-name' && firstName) {
    return firstName;
  }

  if (settings.veraAddressPreference === 'title-last-name' && lastName) {
    return `Dr. ${lastName}`;
  }

  if (providerProfileName) {
    return providerProfileName;
  }

  if (preferred) {
    return preferred;
  }

  if (firstName) {
    return firstName;
  }

  return '';
}

export function veraInteractionStyleLabel(style: ProviderSettings['veraInteractionStyle']) {
  if (style === 'formal') {
    return 'Formal';
  }

  if (style === 'friendly') {
    return 'Friendly';
  }

  return 'Warm professional';
}

export function veraProactivityLabel(level: ProviderSettings['veraProactivityLevel']) {
  if (level === 'light') {
    return 'Light-touch';
  }

  if (level === 'anticipatory') {
    return 'Anticipatory';
  }

  return 'Balanced';
}

export function buildVeraIntro(input: {
  stage: 'compose' | 'review';
  address?: string;
  interactionStyle: ProviderSettings['veraInteractionStyle'];
  proactivityLevel: ProviderSettings['veraProactivityLevel'];
}) {
  const greeting = input.address
    ? input.interactionStyle === 'formal'
      ? `Hello ${input.address}.`
      : `Hi ${input.address},`
    : input.interactionStyle === 'formal'
      ? 'Hello.'
      : 'Hi,';

  const roleLine = input.stage === 'compose'
    ? 'I am Atlas. I can help you move through compose, shape prompt and note preferences, and keep your note lane aligned with how you like to work.'
    : 'I am Atlas. I can help you work through review, explain trust flags, and tighten note wording without losing source fidelity.';

  const proactivityLine = input.proactivityLevel === 'anticipatory'
    ? 'I will also surface patterns and next steps more proactively when I see them.'
    : input.proactivityLevel === 'light'
      ? 'I will stay lighter-touch unless you ask me to step in.'
      : 'I will stay supportive and surface the most useful next steps when they matter.';

  return `${greeting} ${roleLine} ${proactivityLine}`;
}
