const LOCAL_APP_HOST = 'localhost';
const LOCAL_APP_PORT = '3001';
const DEFAULT_MARKETING_URL = 'https://veranote.org';
const DEFAULT_APP_URL = 'https://app.veranote.org';

type EnvMap = Record<string, string | undefined>;
type HeaderMap =
  | Pick<Headers, 'get'>
  | Record<string, string | null | undefined>;

function normalizeUrl(value?: string | null) {
  const raw = value?.trim();
  if (!raw) {
    return null;
  }

  return raw.endsWith('/') ? raw.slice(0, -1) : raw;
}

function normalizeHostedUrl(value?: string | null) {
  const raw = value?.trim();
  if (!raw) {
    return null;
  }

  return normalizeUrl(raw.startsWith('http://') || raw.startsWith('https://') ? raw : `https://${raw}`);
}

function readHeader(headersLike: HeaderMap, name: string) {
  if (typeof (headersLike as Pick<Headers, 'get'>).get === 'function') {
    return (headersLike as Pick<Headers, 'get'>).get(name);
  }

  const record = headersLike as Record<string, string | null | undefined>;
  const lowerName = name.toLowerCase();
  const matchingKey = Object.keys(record).find((key) => key.toLowerCase() === lowerName);
  return matchingKey ? record[matchingKey] : null;
}

function getLocalAppUrl(env: EnvMap = process.env) {
  const host = env.LOCAL_APP_HOST?.trim() || LOCAL_APP_HOST;
  const port = env.PORT?.trim() || env.NEXT_PUBLIC_APP_PORT?.trim() || LOCAL_APP_PORT;
  return normalizeUrl(`http://${host}:${port}`) || `http://${LOCAL_APP_HOST}:${LOCAL_APP_PORT}`;
}

function getPreviewAppUrl(env: EnvMap = process.env) {
  if (env.VERCEL_ENV !== 'preview') {
    return null;
  }

  return normalizeHostedUrl(env.VERCEL_BRANCH_URL) || normalizeHostedUrl(env.VERCEL_URL);
}

export function getAppBaseUrl(env: EnvMap = process.env) {
  const previewAppUrl = getPreviewAppUrl(env);
  if (previewAppUrl) {
    return previewAppUrl;
  }

  return (
    normalizeUrl(env.NEXT_PUBLIC_APP_URL)
    || normalizeUrl(env.APP_BASE_URL)
    || normalizeUrl(env.NEXTAUTH_URL)
    || normalizeHostedUrl(env.VERCEL_PROJECT_PRODUCTION_URL)
    || (env.NODE_ENV === 'production' ? DEFAULT_APP_URL : getLocalAppUrl(env))
  );
}

export function getMarketingSiteUrl(env: EnvMap = process.env) {
  return (
    normalizeUrl(env.NEXT_PUBLIC_SITE_URL)
    || normalizeUrl(env.SITE_BASE_URL)
    || (env.VERCEL_ENV === 'preview' ? getAppBaseUrl(env) : null)
    || (env.NODE_ENV === 'production' ? DEFAULT_MARKETING_URL : getAppBaseUrl(env))
  );
}

export function getMetadataBase(env: EnvMap = process.env) {
  return new URL(getMarketingSiteUrl(env));
}

export function getRequestOrigin(headersLike: HeaderMap) {
  const host = readHeader(headersLike, 'x-forwarded-host') || readHeader(headersLike, 'host');
  if (!host) {
    return null;
  }

  const forwardedProto = readHeader(headersLike, 'x-forwarded-proto');
  const proto = forwardedProto?.split(',')[0]?.trim()
    || (/^(localhost|127\.0\.0\.1)(:\d+)?$/i.test(host) ? 'http' : 'https');

  return normalizeHostedUrl(`${proto}://${host}`);
}

export function getRuntimeAuthBaseUrl({
  baseUrl,
  headersLike,
  env = process.env,
}: {
  baseUrl?: string | null;
  headersLike?: HeaderMap | null;
  env?: EnvMap;
}) {
  const normalizedBaseUrl = normalizeUrl(baseUrl);
  const requestOrigin = headersLike ? getRequestOrigin(headersLike) : null;

  if (requestOrigin) {
    const requestHost = new URL(requestOrigin).host;
    const baseHost = normalizedBaseUrl ? new URL(normalizedBaseUrl).host : null;
    const shouldPreferRequestOrigin = (
      env.VERCEL_ENV === 'preview'
      || /^(localhost|127\.0\.0\.1)(:\d+)?$/i.test(requestHost)
      || (baseHost !== null && baseHost !== requestHost)
    );

    if (shouldPreferRequestOrigin) {
      return requestOrigin;
    }
  }

  return normalizedBaseUrl || getAppBaseUrl(env);
}
