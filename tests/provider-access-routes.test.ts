import { describe, expect, it, vi, beforeEach } from 'vitest';

const mockGetAuthorizedProviderContext = vi.fn();
const mockPrototypeSwitchingAllowed = vi.fn();

vi.mock('@/lib/veranote/provider-session', () => ({
  getAuthorizedProviderContext: mockGetAuthorizedProviderContext,
  prototypeSwitchingAllowed: mockPrototypeSwitchingAllowed,
}));

describe('provider access routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns only the signed-in provider account in external beta mode', async () => {
    mockGetAuthorizedProviderContext.mockResolvedValue({
      providerAccountId: 'account-stacey-creel-beta',
      providerIdentityId: 'provider-stacey-creel-beta',
    });
    mockPrototypeSwitchingAllowed.mockReturnValue(false);

    const { GET } = await import('@/app/api/provider-accounts/route');
    const response = await GET();
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.currentProviderAccountId).toBe('account-stacey-creel-beta');
    expect(payload.accounts).toHaveLength(1);
    expect(payload.accounts[0].id).toBe('account-stacey-creel-beta');
  }, 15000);

  it('returns only the signed-in provider identity in external beta mode', async () => {
    mockGetAuthorizedProviderContext.mockResolvedValue({
      providerAccountId: 'account-stacey-creel-beta',
      providerIdentityId: 'provider-stacey-creel-beta',
    });
    mockPrototypeSwitchingAllowed.mockReturnValue(false);

    const { GET } = await import('@/app/api/provider-identities/route');
    const response = await GET();
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.currentProviderId).toBe('provider-stacey-creel-beta');
    expect(payload.identities).toHaveLength(1);
    expect(payload.identities[0].id).toBe('provider-stacey-creel-beta');
  });

  it('keeps the full provider lists available in internal mode', async () => {
    mockGetAuthorizedProviderContext.mockResolvedValue({
      providerAccountId: 'account-stacey-creel-beta',
      providerIdentityId: 'provider-stacey-creel-beta',
    });
    mockPrototypeSwitchingAllowed.mockReturnValue(true);

    const accountsRoute = await import('@/app/api/provider-accounts/route');
    const identitiesRoute = await import('@/app/api/provider-identities/route');

    const accountsResponse = await accountsRoute.GET();
    const identitiesResponse = await identitiesRoute.GET();
    const accountsPayload = await accountsResponse.json();
    const identitiesPayload = await identitiesResponse.json();

    expect(accountsResponse.status).toBe(200);
    expect(identitiesResponse.status).toBe(200);
    expect(accountsPayload.accounts.length).toBeGreaterThan(1);
    expect(identitiesPayload.identities.length).toBeGreaterThan(1);
  });

  it('returns unauthorized when no provider session is available', async () => {
    mockGetAuthorizedProviderContext.mockResolvedValue(null);
    mockPrototypeSwitchingAllowed.mockReturnValue(false);

    const accountsRoute = await import('@/app/api/provider-accounts/route');
    const identitiesRoute = await import('@/app/api/provider-identities/route');

    const accountsResponse = await accountsRoute.GET();
    const identitiesResponse = await identitiesRoute.GET();

    expect(accountsResponse.status).toBe(401);
    expect(identitiesResponse.status).toBe(401);
  });
});
