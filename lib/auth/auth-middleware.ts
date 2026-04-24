import type { AuthenticatedRequestContext, User } from '@/lib/auth/auth-types';
import { findProviderAccount } from '@/lib/constants/provider-accounts';
import { DEFAULT_PROVIDER_IDENTITY_ID, findProviderIdentity } from '@/lib/constants/provider-identities';
import { getAuthorizedProviderContext } from '@/lib/veranote/provider-session';

function extractBearerToken(request: Request) {
  const authorization = request.headers.get('authorization') || request.headers.get('Authorization');
  if (!authorization) {
    return null;
  }

  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

function extractCookieToken(request: Request) {
  const cookieHeader = request.headers.get('cookie') || '';
  const match = cookieHeader.match(/(?:^|;\s*)veranote-auth=([^;]+)/i);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

function mockAuthAllowed() {
  return process.env.NODE_ENV === 'test' || process.env.VERANOTE_ALLOW_MOCK_AUTH === 'true';
}

function buildProviderUser(providerIdentityId: string, providerAccountId?: string): User {
  const account = findProviderAccount(providerAccountId || undefined);
  return {
    id: providerIdentityId,
    role: 'provider',
    email: account?.email || `${providerIdentityId}@veranote.local`,
  };
}

function validateMockToken(token: string | null): { user: User; providerAccountId?: string; providerIdentityId?: string } | null {
  if (!token || !mockAuthAllowed()) {
    return null;
  }

  if (token === 'veranote-admin-token' || token === process.env.VERANOTE_ADMIN_TOKEN) {
    return {
      user: {
        id: 'admin-user',
        role: 'admin',
        email: 'admin@veranote.local',
      },
    };
  }

  if (token.startsWith('provider:')) {
    const providerIdentityId = token.slice('provider:'.length).trim() || DEFAULT_PROVIDER_IDENTITY_ID;
    const providerIdentity = findProviderIdentity(providerIdentityId);
    const providerAccount = findProviderAccount(undefined);
    return {
      user: buildProviderUser(providerIdentity?.id || DEFAULT_PROVIDER_IDENTITY_ID, providerAccount?.id),
      providerAccountId: providerAccount?.id,
      providerIdentityId: providerIdentity?.id || DEFAULT_PROVIDER_IDENTITY_ID,
    };
  }

  if (token === 'veranote-provider-token' || token === process.env.VERANOTE_PROVIDER_TOKEN) {
    const providerAccount = findProviderAccount(undefined);
    return {
      user: buildProviderUser(providerAccount?.providerIdentityId || DEFAULT_PROVIDER_IDENTITY_ID, providerAccount?.id),
      providerAccountId: providerAccount?.id,
      providerIdentityId: providerAccount?.providerIdentityId || DEFAULT_PROVIDER_IDENTITY_ID,
    };
  }

  return null;
}

export async function requireAuth(request: Request): Promise<AuthenticatedRequestContext> {
  const headerToken = extractBearerToken(request);
  const cookieToken = extractCookieToken(request);
  const tokenAuth = validateMockToken(headerToken) || validateMockToken(cookieToken);

  if (tokenAuth) {
    return {
      user: tokenAuth.user,
      isAuthenticated: true,
      providerAccountId: tokenAuth.providerAccountId,
      providerIdentityId: tokenAuth.providerIdentityId,
      tokenSource: headerToken ? 'header' : 'cookie',
    };
  }

  const authorizedProvider = await getAuthorizedProviderContext();
  if (authorizedProvider) {
    return {
      user: buildProviderUser(authorizedProvider.providerIdentityId, authorizedProvider.providerAccountId),
      isAuthenticated: true,
      providerAccountId: authorizedProvider.providerAccountId,
      providerIdentityId: authorizedProvider.providerIdentityId,
      tokenSource: 'session',
    };
  }

  throw new Error('Unauthorized');
}
