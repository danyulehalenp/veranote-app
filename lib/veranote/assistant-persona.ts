export type AssistantAvatarId =
  | 'clinical-orbit'
  | 'logic-lattice'
  | 'friendly-silhouette'
  | 'signal-bridge'
  | 'steady-compass'
  | 'north-star'
  | 'care-frame'
  | 'calm-pulse';

export type AssistantPersonaShape = {
  userAiName?: string;
  userAiRole?: string;
  userAiAvatar?: string;
};

export const DEFAULT_ASSISTANT_NAME = 'Assistant';
export const DEFAULT_ASSISTANT_ROLE = 'Clinical Assistant';
export const DEFAULT_ASSISTANT_AVATAR: AssistantAvatarId = 'clinical-orbit';
export const ASSISTANT_NAME_MAX_LENGTH = 28;
export const ASSISTANT_ROLE_MAX_LENGTH = 32;

const CURATED_ASSISTANT_AVATAR_OPTIONS: Array<{
  id: AssistantAvatarId;
  label: string;
  description: string;
}> = [
  {
    id: 'clinical-orbit',
    label: 'Clinical Orbit',
    description: 'Minimal ring with a centered clinical core.',
  },
  {
    id: 'logic-lattice',
    label: 'Logic Lattice',
    description: 'Structured nodes for pattern review.',
  },
  {
    id: 'friendly-silhouette',
    label: 'Friendly Silhouette',
    description: 'Warm human-shaped outline without a photo.',
  },
  {
    id: 'signal-bridge',
    label: 'Signal Bridge',
    description: 'Links source signals to review context.',
  },
  {
    id: 'steady-compass',
    label: 'Steady Compass',
    description: 'Grounded navigation for next-best actions.',
  },
  {
    id: 'north-star',
    label: 'North Star',
    description: 'Clear focal marker for review.',
  },
  {
    id: 'care-frame',
    label: 'Care Frame',
    description: 'Balanced rectangular frame with a softer center.',
  },
  {
    id: 'calm-pulse',
    label: 'Calm Pulse',
    description: 'Measured signal wave in a contained badge.',
  },
];

const blockedTerms = [
  'fuck',
  'shit',
  'bitch',
  'asshole',
  'cunt',
  'dick',
  'penis',
  'vagina',
  'nigger',
  'faggot',
  'slut',
];

function normalizeAscii(value: string) {
  return value.normalize('NFKD').replace(/[^\x20-\x7E]/g, '');
}

function hasBlockedTerm(value: string) {
  const lowered = value.toLowerCase();
  return blockedTerms.some((term) => lowered.includes(term));
}

function collapseWhitespace(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}

function clampText(value: string, maxLength: number) {
  return value.slice(0, maxLength).trim();
}

export function listAssistantAvatarOptions() {
  return CURATED_ASSISTANT_AVATAR_OPTIONS;
}

export function sanitizeAssistantName(value?: string) {
  const ascii = normalizeAscii(value || '');
  const cleaned = clampText(
    collapseWhitespace(ascii.replace(/[^A-Za-z0-9' -]/g, '')),
    ASSISTANT_NAME_MAX_LENGTH,
  );

  if (!cleaned || hasBlockedTerm(cleaned)) {
    return DEFAULT_ASSISTANT_NAME;
  }

  return cleaned;
}

export function sanitizeAssistantRole(value?: string) {
  const ascii = normalizeAscii(value || '');
  const cleaned = clampText(
    collapseWhitespace(ascii.replace(/[^A-Za-z0-9/&' -]/g, '')),
    ASSISTANT_ROLE_MAX_LENGTH,
  );

  if (!cleaned) {
    return '';
  }

  if (hasBlockedTerm(cleaned)) {
    return DEFAULT_ASSISTANT_ROLE;
  }

  return cleaned;
}

export function sanitizeAssistantAvatar(value?: string): AssistantAvatarId {
  const match = CURATED_ASSISTANT_AVATAR_OPTIONS.find((option) => option.id === value);
  return match?.id || DEFAULT_ASSISTANT_AVATAR;
}

export function applyAssistantPersonaDefaults<T extends AssistantPersonaShape>(input: T): T & {
  userAiName: string;
  userAiRole: string;
  userAiAvatar: AssistantAvatarId;
} {
  const hasExplicitRole = typeof input.userAiRole === 'string';

  return {
    ...input,
    userAiName: sanitizeAssistantName(input.userAiName),
    userAiRole: hasExplicitRole ? sanitizeAssistantRole(input.userAiRole) : DEFAULT_ASSISTANT_ROLE,
    userAiAvatar: sanitizeAssistantAvatar(input.userAiAvatar),
  };
}

export function resolveAssistantPersona(input?: AssistantPersonaShape | null) {
  const sanitized = applyAssistantPersonaDefaults(input || {});

  return {
    name: sanitized.userAiName,
    role: sanitized.userAiRole,
    avatar: sanitized.userAiAvatar,
  };
}
