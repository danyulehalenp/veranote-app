import { providerAccounts } from '@/lib/constants/provider-accounts';
import { findProviderIdentity } from '@/lib/constants/provider-identities';

export type BetaProviderAuthUser = {
  id: string;
  email: string;
  name: string;
  providerAccountId: string;
  providerIdentityId: string;
  organizationName: string;
  roleLabel: string;
};

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

export function findProviderAccountByEmail(email?: string | null) {
  const normalized = normalizeEmail(email || '');
  return providerAccounts.find((account) => normalizeEmail(account.email) === normalized) || null;
}

export function parseProviderAccessCodeMap(raw?: string | null) {
  if (!raw?.trim()) {
    return {};
  }

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(parsed).flatMap(([key, value]) => {
        if (typeof value !== 'string' || !value.trim()) {
          return [];
        }

        return [[key.trim().toLowerCase(), value.trim()]];
      }),
    );
  } catch {
    return {};
  }
}

export function getConfiguredAccessCodeForAccount(accountIdOrEmail: string) {
  const normalizedKey = accountIdOrEmail.trim().toLowerCase();
  const account = providerAccounts.find((candidate) => (
    candidate.id.toLowerCase() === normalizedKey
      || candidate.email.toLowerCase() === normalizedKey
  )) || null;
  if (!account) {
    return null;
  }

  const codeMap = parseProviderAccessCodeMap(process.env.VERANOTE_BETA_ACCOUNT_CODES);
  const perAccountCode = codeMap[account.id.toLowerCase()] || codeMap[account.email.toLowerCase()];

  if (perAccountCode) {
    return perAccountCode;
  }

  const sharedCode = process.env.VERANOTE_BETA_ACCESS_CODE?.trim();
  return sharedCode || null;
}

export function authenticateProviderCredentials(email: string, accessCode: string): BetaProviderAuthUser | null {
  const account = findProviderAccountByEmail(email);
  if (!account || account.status !== 'active') {
    return null;
  }

  const expectedCode = getConfiguredAccessCodeForAccount(account.id);
  if (!expectedCode || accessCode.trim() !== expectedCode) {
    return null;
  }

  const identity = findProviderIdentity(account.providerIdentityId);
  if (!identity) {
    return null;
  }

  return {
    id: identity.id,
    email: account.email,
    name: identity.displayName,
    providerAccountId: account.id,
    providerIdentityId: identity.id,
    organizationName: account.organizationName,
    roleLabel: account.roleLabel,
  };
}
