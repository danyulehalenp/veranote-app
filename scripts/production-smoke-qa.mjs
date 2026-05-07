#!/usr/bin/env node

/**
 * Public production smoke check for Veranote.
 *
 * This intentionally avoids authenticated flows and secrets. It only verifies
 * that the production host responds, redirects anonymous users to sign-in, and
 * serves the expected sign-in shell.
 */

const primaryUrl = process.env.VERANOTE_PRODUCTION_URL || 'https://app.veranote.org';
const fallbackUrl = process.env.VERANOTE_PRODUCTION_FALLBACK_URL || 'https://veranote-app.vercel.app';

function uniqueUrls(urls) {
  return Array.from(new Set(urls.filter(Boolean).map((url) => url.replace(/\/+$/, ''))));
}

function serializeFetchError(error) {
  const cause = error && typeof error === 'object' && 'cause' in error ? error.cause : null;
  const causeCode = cause && typeof cause === 'object' && 'code' in cause ? cause.code : null;
  const causeMessage = cause && typeof cause === 'object' && 'message' in cause ? cause.message : null;
  const message = error instanceof Error ? error.message : String(error);
  const code = causeCode || (error && typeof error === 'object' && 'code' in error ? error.code : null);
  const combined = `${message} ${causeMessage || ''} ${code || ''}`.toLowerCase();

  const classification = /cert|certificate|self.?signed|tls|ssl|unable_to_verify|leaf|issuer|ca/.test(combined)
    ? 'tls_or_certificate_error'
    : /abort|timeout|timed out/.test(combined)
      ? 'timeout'
      : /fetch failed|econn|enotfound|eai_again|network/.test(combined)
        ? 'network_error'
        : 'unknown_fetch_error';

  return {
    message,
    causeMessage,
    code,
    classification,
  };
}

function emitFailure(report) {
  console.error(JSON.stringify(report, null, 2));
  process.exit(1);
}

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25_000);

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function checkProductionHost(baseUrl) {
  const rootResponse = await fetchWithTimeout(baseUrl, {
    method: 'GET',
    redirect: 'manual',
  });
  const rootLocation = rootResponse.headers.get('location') || '';
  const rootStatus = rootResponse.status;

  if (![200, 302, 303, 307, 308].includes(rootStatus)) {
    return {
      passed: false,
      baseUrl,
      message: 'Production root returned an unexpected status.',
      rootStatus,
      rootLocation,
      classification: 'unexpected_root_status',
    };
  }

  if (rootStatus !== 200 && !/\/sign-in\b/.test(rootLocation)) {
    return {
      passed: false,
      baseUrl,
      message: 'Anonymous production root did not redirect to sign-in.',
      rootStatus,
      rootLocation,
      classification: 'unexpected_root_redirect',
    };
  }

  const signInUrl = new URL('/sign-in', baseUrl).toString();
  const signInResponse = await fetchWithTimeout(signInUrl, {
    method: 'GET',
    redirect: 'follow',
  });
  const signInHtml = await signInResponse.text();

  if (signInResponse.status !== 200) {
    return {
      passed: false,
      baseUrl,
      message: 'Production sign-in page did not return HTTP 200.',
      rootStatus,
      rootLocation,
      signInStatus: signInResponse.status,
      classification: 'unexpected_sign_in_status',
    };
  }

  if (!/Provider beta sign in|Veranote/i.test(signInHtml)) {
    return {
      passed: false,
      baseUrl,
      message: 'Production sign-in page did not include expected Veranote sign-in copy.',
      rootStatus,
      rootLocation,
      signInStatus: signInResponse.status,
      htmlExcerpt: signInHtml.replace(/\s+/g, ' ').slice(0, 240),
      classification: 'missing_expected_sign_in_copy',
    };
  }

  const deploymentId = signInHtml.match(/data-dpl-id="([^"]+)"/)?.[1] || null;

  return {
    passed: true,
    baseUrl,
    rootStatus,
    rootLocation,
    signInStatus: signInResponse.status,
    deploymentId,
    checkedAt: new Date().toISOString(),
  };
}

async function safeCheckProductionHost(baseUrl) {
  try {
    return await checkProductionHost(baseUrl);
  } catch (error) {
    return {
      passed: false,
      baseUrl,
      message: error instanceof Error ? error.message : String(error),
      ...serializeFetchError(error),
      checkedAt: new Date().toISOString(),
    };
  }
}

async function main() {
  const urls = uniqueUrls([primaryUrl, fallbackUrl]);
  const checks = [];

  for (const url of urls) {
    checks.push(await safeCheckProductionHost(url));
  }

  const primary = checks[0];
  const fallback = checks.find((check) => check.baseUrl !== primary.baseUrl) || null;
  const fallbackHealthy = Boolean(fallback?.passed);
  const primaryHealthy = Boolean(primary?.passed);
  const passed = primaryHealthy || fallbackHealthy;
  const networkBlockLikely = !primaryHealthy
    && fallbackHealthy
    && ['tls_or_certificate_error', 'network_error', 'timeout', 'unknown_fetch_error'].includes(primary.classification);

  const report = {
    passed,
    primaryUrl,
    fallbackUrl: fallback?.baseUrl || null,
    primaryHealthy,
    fallbackHealthy,
    classification: primaryHealthy
      ? 'primary_healthy'
      : fallbackHealthy
        ? 'primary_unreachable_but_deployment_alias_healthy'
        : 'all_public_smoke_checks_failed',
    networkBlockLikely,
    guidance: networkBlockLikely
      ? 'Primary custom-domain smoke failed from this network, but the Vercel deployment alias is healthy. This usually means local/work-network TLS inspection, DNS filtering, or proxy interference rather than an app outage.'
      : primaryHealthy
        ? 'Primary production host is reachable and serving the expected Veranote sign-in shell.'
        : 'Both the primary production host and fallback deployment alias failed public smoke checks; inspect deployment, DNS, auth, and logs.',
    checks,
    checkedAt: new Date().toISOString(),
  };

  if (!passed) {
    emitFailure(report);
  }

  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  emitFailure({
    passed: false,
    primaryUrl,
    fallbackUrl,
    message: error instanceof Error ? error.message : String(error),
    ...serializeFetchError(error),
    checkedAt: new Date().toISOString(),
  });
});
