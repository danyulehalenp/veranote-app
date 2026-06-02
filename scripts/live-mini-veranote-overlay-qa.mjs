#!/usr/bin/env node

/**
 * Browser-level QA for the Mini Veranote overlay.
 *
 * Verifies the flagged always-on overlay can:
 * - render over the new-note workspace
 * - append scratch text into Live Visit Notes
 * - open dictation and ambient capture lanes
 * - summon the existing Atlas assistant shell
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import http from 'node:http';
import https from 'node:https';
import path from 'node:path';

const APP_URL = process.env.LIVE_MINI_VERANOTE_URL || 'http://localhost:3001/dashboard/new-note?fresh=mini-veranote-overlay-qa&mini=1';
const AUTH_COOKIE = process.env.LIVE_MINI_VERANOTE_AUTH_COOKIE || 'veranote-provider-token';
const QA_EMAIL = process.env.LIVE_MINI_VERANOTE_QA_EMAIL || 'daniel.hale@veranote-beta.local';
const OUTPUT_DIR = process.env.LIVE_MINI_VERANOTE_OUTPUT_DIR || 'test-results';
const SHOULD_START_SERVER = process.env.LIVE_MINI_VERANOTE_START_SERVER !== '0';
const TEST_PROVIDER_ID = 'provider-mini-veranote-overlay-qa';

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
      response.on('end', () => resolve(Boolean(response.statusCode && response.statusCode < 500)));
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
    throw new Error(`App is not reachable at ${url}. Start it with npm run dev:test or rerun without LIVE_MINI_VERANOTE_START_SERVER=0.`);
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
  const accessCode = process.env.LIVE_MINI_VERANOTE_ACCESS_CODE || await readLocalEnvValue('VERANOTE_BETA_ACCESS_CODE');
  if (!accessCode) {
    throw new Error('Mini Veranote QA reached sign-in. Set LIVE_MINI_VERANOTE_ACCESS_CODE or VERANOTE_BETA_ACCESS_CODE.');
  }

  await page.locator('input[type="email"]').first().waitFor({ state: 'visible', timeout: 15000 });
  await page.locator('input[type="password"]').first().waitFor({ state: 'visible', timeout: 15000 });
  await page.locator('input[type="email"]').first().fill(QA_EMAIL);
  await page.locator('input[type="password"]').first().fill(accessCode);
  await page.getByRole('button', { name: /sign in/i }).click();
  await page.waitForURL((url) => !url.pathname.includes('/sign-in'), { timeout: 30000 });
  await page.goto(appUrl, { waitUntil: 'domcontentloaded' });
}

async function gotoWorkspace(page, appUrl) {
  await page.goto(appUrl, { waitUntil: 'domcontentloaded' });

  if (page.url().includes('/sign-in')) {
    await signInForQa(page, appUrl);
  }

  await page.locator('.workspace-left-rail').waitFor({ state: 'visible', timeout: 30000 });
  await page.locator('.workspace-main-column').waitFor({ state: 'visible', timeout: 30000 });
  await page.getByTestId('mini-veranote-overlay').waitFor({ state: 'visible', timeout: 30000 });
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
}

function assertState(condition, message, failures) {
  if (!condition) {
    failures.push(message);
  }
}

async function run() {
  let chromium;
  try {
    ({ chromium } = await import('playwright'));
  } catch {
    console.error('Playwright is not installed in this workspace. Run npm install first.');
    process.exit(2);
  }

  const server = await ensureServer(APP_URL, SHOULD_START_SERVER);
  const appUrl = new URL(APP_URL);
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 860 },
    permissions: ['clipboard-read', 'clipboard-write'],
  });
  await context.addCookies([{
    name: 'veranote-auth',
    value: AUTH_COOKIE,
    domain: appUrl.hostname,
    path: '/',
    httpOnly: false,
    sameSite: 'Lax',
  }]);
  await context.addInitScript((providerId) => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    window.localStorage.setItem('veranote:current-provider-id', providerId);
  }, TEST_PROVIDER_ID);

  const page = await context.newPage();
  const failures = [];

  try {
    await gotoWorkspace(page, APP_URL);

    const overlayBox = await page.getByTestId('mini-veranote-overlay').boundingBox();
    assertState(Boolean(overlayBox), 'Mini Veranote overlay did not render', failures);
    assertState(Boolean(overlayBox && overlayBox.width >= 320 && overlayBox.height >= 420), `Mini Veranote overlay rendered at an unexpected size: ${JSON.stringify(overlayBox)}`, failures);

    const scratch = 'Mini overlay QA: patient reports improved sleep and denies suicidal ideation.';
    await page.getByTestId('mini-veranote-source-input').fill(scratch);
    await page.getByTestId('mini-veranote-send-source').click();
    await page.locator('#source-field-clinicianNotes textarea').first().waitFor({ state: 'visible', timeout: 10000 });
    const liveVisitValue = await page.locator('#source-field-clinicianNotes textarea').first().inputValue();
    assertState(liveVisitValue.includes('Mini overlay QA'), 'Mini Veranote did not append text into Live Visit Notes', failures);
    assertState(await page.getByText(/Mini Veranote added text/i).first().isVisible().catch(() => false), 'Mini Veranote append did not update the workspace status banner', failures);

    await page.getByTestId('mini-veranote-open-dictation').click();
    await page.getByText(/Dictation source mode/i).first().waitFor({ state: 'visible', timeout: 10000 });
    assertState(await page.getByText(/Dictation source mode/i).first().isVisible().catch(() => false), 'Mini Veranote did not open the dictation lane', failures);

    await page.getByTestId('mini-veranote-open-ambient').click();
    const ambientVisible = await page.getByText(/Ambient Transcript|Prepare consent|Ambient review/i).first().isVisible().catch(() => false);
    assertState(ambientVisible, 'Mini Veranote did not open the ambient lane', failures);

    await page.getByTestId('mini-veranote-open-atlas').click();
    const assistantVisible = await page.getByTestId('assistant-floating-panel').isVisible().catch(() => false);
    const dockVisible = await page.getByTestId('assistant-minimized-dock').isVisible().catch(() => false);
    assertState(assistantVisible || dockVisible, 'Mini Veranote did not open the Atlas assistant shell', failures);

    await page.getByTestId('mini-veranote-ask-input').fill('How should I organize messy source material here?');
    await page.getByTestId('mini-veranote-ask-button').click();
    const answerVisible = await page.getByTestId('mini-veranote-answer').waitFor({ state: 'visible', timeout: 30000 }).then(() => true).catch(() => false);
    assertState(answerVisible, 'Mini Veranote inline Atlas answer did not appear', failures);

    await page.getByTestId('mini-veranote-copy-ehr').click();
    await page.getByText(/copied for EHR/i).first().waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
    const copyStatusVisible = await page.getByText(/copied for EHR|Clipboard copy was not available/i).first().isVisible().catch(() => false);
    assertState(copyStatusVisible, 'Mini Veranote copy action did not report a status', failures);

    await page.getByText(/^Hide$/).click();
    assertState(await page.getByTestId('mini-veranote-dock').isVisible().catch(() => false), 'Mini Veranote did not minimize into a dock', failures);
  } finally {
    await browser.close();
    if (server) {
      server.kill('SIGTERM');
    }
  }

  const report = {
    generatedAt: new Date().toISOString(),
    appUrl: APP_URL,
    passed: failures.length === 0,
    failures,
  };

  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  const stamp = new Date().toISOString().slice(0, 10);
  await fs.writeFile(path.join(OUTPUT_DIR, `live-mini-veranote-overlay-qa-${stamp}.json`), JSON.stringify(report, null, 2));
  await fs.writeFile(path.join(OUTPUT_DIR, `live-mini-veranote-overlay-qa-${stamp}.md`), [
    '# Live Mini Veranote Overlay QA',
    '',
    `Generated: ${report.generatedAt}`,
    `URL: ${APP_URL}`,
    `Status: ${report.passed ? 'pass' : 'fail'}`,
    `Failures: ${report.failures.length ? report.failures.join('; ') : 'none'}`,
    '',
  ].join('\n'));

  console.log(JSON.stringify(report, null, 2));

  if (!report.passed) {
    process.exit(1);
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
