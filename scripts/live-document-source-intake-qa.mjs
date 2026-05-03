#!/usr/bin/env node

/**
 * Browser-level QA for the document source intake MVP.
 *
 * This verifies the provider-reviewed document text path:
 * reviewed OCR/summary text -> Source documents card -> Pre-Visit Data.
 */

import { spawn } from 'node:child_process';
import http from 'node:http';
import https from 'node:https';
import fs from 'node:fs/promises';
import path from 'node:path';

const APP_URL = process.env.LIVE_DOCUMENT_INTAKE_URL || 'http://localhost:3001/dashboard/new-note?fresh=document-source-intake';
const AUTH_COOKIE = process.env.LIVE_DOCUMENT_INTAKE_AUTH_COOKIE || 'veranote-provider-token';
const QA_EMAIL = process.env.LIVE_DOCUMENT_INTAKE_QA_EMAIL || 'daniel.hale@veranote-beta.local';
const OUTPUT_DIR = process.env.LIVE_DOCUMENT_INTAKE_OUTPUT_DIR || 'test-results';
const SHOULD_START_SERVER = process.env.LIVE_DOCUMENT_INTAKE_START_SERVER !== '0';

async function readLocalEnvValue(key) {
  if (process.env[key]) {
    return process.env[key];
  }

  try {
    const contents = await fs.readFile(path.resolve('.env.local'), 'utf8');
    const line = contents
      .split(/\r?\n/)
      .find((entry) => entry.trim().startsWith(`${key}=`));
    if (!line) {
      return null;
    }

    return line.slice(line.indexOf('=') + 1).trim().replace(/^['"]|['"]$/g, '') || null;
  } catch {
    return null;
  }
}

function requestUrl(url) {
  return new Promise((resolve) => {
    const client = url.startsWith('https:') ? https : http;
    const request = client.get(url, (response) => {
      response.resume();
      resolve(response.statusCode && response.statusCode < 500);
    });
    request.on('error', () => resolve(false));
    request.setTimeout(1500, () => {
      request.destroy();
      resolve(false);
    });
  });
}

async function waitForUrl(url, timeoutMs = 60000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await requestUrl(url)) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  return false;
}

function listPortPids(port) {
  return new Promise((resolve) => {
    const child = spawn('lsof', ['-ti', `tcp:${port}`], { stdio: ['ignore', 'pipe', 'ignore'] });
    let output = '';
    child.stdout.on('data', (chunk) => {
      output += chunk.toString();
    });
    child.on('close', () => {
      resolve(output.split(/\s+/).map((pid) => pid.trim()).filter(Boolean));
    });
    child.on('error', () => resolve([]));
  });
}

async function stopUnresponsivePortProcesses(port) {
  const pids = await listPortPids(port);
  if (!pids.length) {
    return;
  }

  console.log(`Stopping unresponsive local dev server process(es) on port ${port}: ${pids.join(', ')}`);
  for (const pid of pids) {
    try {
      process.kill(Number(pid), 'SIGTERM');
    } catch {
      // Ignore processes that exit between lsof and kill.
    }
  }
  await new Promise((resolve) => setTimeout(resolve, 2000));
}

async function ensureServer(url, shouldStartServer) {
  if (await requestUrl(url)) {
    return null;
  }

  if (await waitForUrl(url, 5000)) {
    return null;
  }

  if (!shouldStartServer) {
    throw new Error(`App is not reachable at ${url}. Start it with npm run dev:test or rerun without LIVE_DOCUMENT_INTAKE_START_SERVER=0.`);
  }

  const appUrl = new URL(url);
  const appOrigin = appUrl.origin;
  const appPort = appUrl.port || (appUrl.protocol === 'https:' ? '443' : '80');
  await stopUnresponsivePortProcesses(appPort);
  if (await waitForUrl(url, 5000)) {
    return null;
  }

  const child = spawn('npm', ['run', 'dev', '--', '--port', appPort], {
    stdio: 'inherit',
    env: {
      ...process.env,
      VERANOTE_ALLOW_MOCK_AUTH: process.env.VERANOTE_ALLOW_MOCK_AUTH || 'true',
      NEXTAUTH_URL: process.env.NEXTAUTH_URL || appOrigin,
      AUTH_URL: process.env.AUTH_URL || appOrigin,
    },
  });

  const ready = await waitForUrl(url);
  if (!ready) {
    child.kill('SIGTERM');
    throw new Error(`Timed out waiting for ${url} after starting Next dev on port ${appPort}.`);
  }

  return child;
}

async function signInForQa(page, appUrl) {
  const accessCode = process.env.LIVE_DOCUMENT_INTAKE_ACCESS_CODE || await readLocalEnvValue('VERANOTE_BETA_ACCESS_CODE');
  if (!accessCode) {
    throw new Error('Document source intake QA reached sign-in. Set LIVE_DOCUMENT_INTAKE_ACCESS_CODE or VERANOTE_BETA_ACCESS_CODE.');
  }

  await page.locator('input[type="email"]').first().waitFor({ state: 'visible', timeout: 15000 });
  await page.locator('input[type="password"]').first().waitFor({ state: 'visible', timeout: 15000 });
  await page.locator('input[type="email"]').first().fill(QA_EMAIL);
  await page.locator('input[type="password"]').first().fill(accessCode);
  await page.getByRole('button', { name: /sign in/i }).click();
  await page.waitForURL((url) => !url.pathname.includes('/sign-in'), { timeout: 30000 });
  await page.goto(appUrl, { waitUntil: 'domcontentloaded' });
}

async function waitForVisible(locator, timeout = 2500) {
  try {
    await locator.waitFor({ state: 'visible', timeout });
    return true;
  } catch {
    return false;
  }
}

async function ensureComposeSourceVisible(page) {
  const backToCompose = page.getByText('Back to Compose', { exact: true }).first();
  if (await waitForVisible(backToCompose, 3000)) {
    await backToCompose.click();
  }

  await page.getByTestId('document-source-review-text').waitFor({ state: 'visible', timeout: 30000 });
  await page.locator('#source-field-intakeCollateral textarea').first().waitFor({ state: 'visible', timeout: 30000 });
  await page.getByTestId('document-source-commit-button').waitFor({ state: 'visible', timeout: 30000 });
  await page.waitForFunction(() => (
    document.querySelector('[data-testid="document-source-commit-button"]')?.getAttribute('data-hydrated') === 'true'
  ), null, { timeout: 30000 });
}

async function waitForMarkerInPreVisitData(page, marker, timeout = 4000) {
  await page.waitForFunction((expectedMarker) => (
    Array.from(document.querySelectorAll('#source-field-intakeCollateral textarea'))
      .some((element) => element instanceof HTMLTextAreaElement && element.value.includes(expectedMarker))
  ), marker, { timeout });
}

async function commitReviewedDocumentText(page, reviewedDocumentText, qaMarker) {
  let lastError = null;

  for (let attempt = 1; attempt <= 5; attempt += 1) {
    try {
      await ensureComposeSourceVisible(page);
      await page.getByTestId('document-source-review-text').fill(reviewedDocumentText);
      await page.getByTestId('document-source-commit-button').scrollIntoViewIfNeeded();
      await page.getByTestId('document-source-commit-button').click({ timeout: 8000 });
      await waitForMarkerInPreVisitData(page, qaMarker);
      return;
    } catch (error) {
      lastError = error;
      await page.waitForTimeout(1000 * attempt);
    }
  }

  throw lastError || new Error('Document source intake commit did not load reviewed text into Pre-Visit Data.');
}

async function main() {
  let devServer = null;
  let browser = null;

  try {
    devServer = await ensureServer(APP_URL, SHOULD_START_SERVER);

    let chromium;
    try {
      ({ chromium } = await import('playwright'));
    } catch {
      throw new Error('Playwright is not installed in this workspace. Run npm install first.');
    }

    browser = await chromium.launch({ headless: true });
    const appUrl = new URL(APP_URL);
    const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
    await context.addCookies([{
      name: 'veranote-auth',
      value: AUTH_COOKIE,
      domain: appUrl.hostname,
      path: '/',
      httpOnly: false,
      sameSite: 'Lax',
    }]);
    await context.addInitScript(() => {
      window.localStorage.clear();
      window.sessionStorage.clear();
    });
    const page = await context.newPage();

    await page.goto(APP_URL, { waitUntil: 'domcontentloaded' });
    if (page.url().includes('/sign-in')) {
      await signInForQa(page, APP_URL);
    }

    await ensureComposeSourceVisible(page);

    const qaMarker = `LIVE-DOC-INTAKE-${Date.now()}`;
    const reviewedDocumentText = [
      `QA marker: ${qaMarker}.`,
      'ER referral packet reviewed by provider.',
      'Lithium level ordered and still pending.',
      'Collateral from mother reports concern patient may stop medications after discharge.',
      'Do not state discharge readiness from this packet alone.',
    ].join('\n');

    await commitReviewedDocumentText(page, reviewedDocumentText, qaMarker);

    const intakeValues = await page.locator('#source-field-intakeCollateral textarea').evaluateAll((elements) => (
      elements.map((element) => element.value)
    ));
    const intakeValue = intakeValues.find((value) => /Reviewed Document Source/i.test(value)) || '';
    const checks = {
      cardVisible: await page.getByText('Upload or paste outside records for review').first().isVisible().catch(() => false),
      reviewedBlockLoaded: /Reviewed Document Source/i.test(intakeValue),
      qaMarkerPreserved: intakeValue.includes(qaMarker),
      pendingLithiumPreserved: /Lithium level ordered and still pending/i.test(intakeValue),
      collateralPreserved: /Collateral from mother/i.test(intakeValue),
      safetyInstructionPreserved: /preserve attribution and uncertainty/i.test(intakeValue),
    };
    const failedChecks = Object.entries(checks).filter(([, passed]) => !passed).map(([name]) => name);
    const report = {
      generatedAt: new Date().toISOString(),
      appUrl: APP_URL,
      checks,
      failedChecks,
      sourceCharacters: intakeValue.length,
    };

    await fs.mkdir(OUTPUT_DIR, { recursive: true });
    const date = new Date().toISOString().slice(0, 10);
    const jsonPath = path.join(OUTPUT_DIR, `live-document-source-intake-qa-${date}.json`);
    const markdownPath = path.join(OUTPUT_DIR, `live-document-source-intake-qa-${date}.md`);
    await fs.writeFile(jsonPath, JSON.stringify(report, null, 2));
    await fs.writeFile(markdownPath, [
      '# Live Document Source Intake QA',
      '',
      `- Generated: ${report.generatedAt}`,
      `- URL: ${APP_URL}`,
      `- Result: ${failedChecks.length ? 'fail' : 'pass'}`,
      `- Source characters after commit: ${report.sourceCharacters}`,
      '',
      '## Checks',
      '',
      ...Object.entries(checks).map(([name, passed]) => `- ${name}: ${passed ? 'pass' : 'fail'}`),
      '',
    ].join('\n'));

    console.log(JSON.stringify(report, null, 2));

    if (failedChecks.length) {
      process.exit(1);
    }
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
    if (devServer) {
      devServer.kill('SIGTERM');
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
