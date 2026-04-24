const LOCAL_APP_URL = 'http://localhost:3000';
const DEFAULT_MARKETING_URL = 'https://veranote.org';
const DEFAULT_APP_URL = 'https://app.veranote.org';

function normalizeUrl(value?: string | null) {
  const raw = value?.trim();
  if (!raw) {
    return null;
  }

  return raw.endsWith('/') ? raw.slice(0, -1) : raw;
}

export function getAppBaseUrl(env: Record<string, string | undefined> = process.env) {
  return (
    normalizeUrl(env.NEXT_PUBLIC_APP_URL)
    || normalizeUrl(env.APP_BASE_URL)
    || normalizeUrl(env.NEXTAUTH_URL)
    || (env.NODE_ENV === 'production' ? DEFAULT_APP_URL : LOCAL_APP_URL)
  );
}

export function getMarketingSiteUrl(env: Record<string, string | undefined> = process.env) {
  return (
    normalizeUrl(env.NEXT_PUBLIC_SITE_URL)
    || normalizeUrl(env.SITE_BASE_URL)
    || (env.NODE_ENV === 'production' ? DEFAULT_MARKETING_URL : getAppBaseUrl(env))
  );
}

export function getMetadataBase(env: Record<string, string | undefined> = process.env) {
  return new URL(getMarketingSiteUrl(env));
}
