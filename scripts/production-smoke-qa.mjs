#!/usr/bin/env node

/**
 * Public production smoke check for Veranote.
 *
 * This intentionally avoids authenticated flows and secrets. It only verifies
 * that the production host responds, redirects anonymous users to sign-in, and
 * serves the expected sign-in shell.
 */

const baseUrl = process.env.VERANOTE_PRODUCTION_URL || 'https://app.veranote.org';

function fail(message, extra = {}) {
  console.error(JSON.stringify({
    passed: false,
    baseUrl,
    message,
    ...extra,
  }, null, 2));
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

async function main() {
  const rootResponse = await fetchWithTimeout(baseUrl, {
    method: 'GET',
    redirect: 'manual',
  });
  const rootLocation = rootResponse.headers.get('location') || '';
  const rootStatus = rootResponse.status;

  if (![200, 302, 303, 307, 308].includes(rootStatus)) {
    fail('Production root returned an unexpected status.', { rootStatus, rootLocation });
  }

  if (rootStatus !== 200 && !/\/sign-in\b/.test(rootLocation)) {
    fail('Anonymous production root did not redirect to sign-in.', { rootStatus, rootLocation });
  }

  const signInUrl = new URL('/sign-in', baseUrl).toString();
  const signInResponse = await fetchWithTimeout(signInUrl, {
    method: 'GET',
    redirect: 'follow',
  });
  const signInHtml = await signInResponse.text();

  if (signInResponse.status !== 200) {
    fail('Production sign-in page did not return HTTP 200.', {
      signInStatus: signInResponse.status,
    });
  }

  if (!/Provider beta sign in|Veranote/i.test(signInHtml)) {
    fail('Production sign-in page did not include expected Veranote sign-in copy.', {
      signInStatus: signInResponse.status,
      htmlExcerpt: signInHtml.replace(/\s+/g, ' ').slice(0, 240),
    });
  }

  const deploymentId = signInHtml.match(/data-dpl-id="([^"]+)"/)?.[1] || null;

  console.log(JSON.stringify({
    passed: true,
    baseUrl,
    rootStatus,
    rootLocation,
    signInStatus: signInResponse.status,
    deploymentId,
    checkedAt: new Date().toISOString(),
  }, null, 2));
}

main().catch((error) => {
  fail(error instanceof Error ? error.message : String(error));
});
