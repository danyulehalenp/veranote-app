import { getCurrentProviderAccountId, getCurrentProviderIdentityId } from '@/lib/db/client';
import { getAuthorizedProviderContext, type AuthorizedProviderContext } from '@/lib/veranote/provider-session';

function getDesktopBridgeKey() {
  return process.env.DICTATION_DESKTOP_BRIDGE_KEY?.trim() || '';
}

export function desktopBridgeEnabled() {
  return Boolean(getDesktopBridgeKey());
}

export async function getAuthorizedDesktopBridgeContext(
  request: Request,
  requestedProviderId?: string,
): Promise<AuthorizedProviderContext | null> {
  const authorizedProvider = await getAuthorizedProviderContext();
  if (authorizedProvider) {
    return authorizedProvider;
  }

  const desktopBridgeKey = getDesktopBridgeKey();
  if (!desktopBridgeKey) {
    return null;
  }

  const providedBridgeKey = request.headers.get('x-veranote-desktop-key') || '';
  if (!providedBridgeKey || providedBridgeKey !== desktopBridgeKey) {
    return null;
  }

  return {
    providerAccountId: await getCurrentProviderAccountId(),
    providerIdentityId: requestedProviderId || await getCurrentProviderIdentityId(),
  };
}
