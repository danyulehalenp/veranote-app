#!/usr/bin/env node

/**
 * Browser-level QA for the new-note workspace rail.
 *
 * Verifies the provider-facing layout concern that triggered this pass:
 * - the main navigation rail appears as a left column on laptop widths
 * - rail tab clicks do not jump the page to the bottom
 * - a recovered generated draft still lands the provider at source/setup first
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import http from 'node:http';
import https from 'node:https';
import path from 'node:path';

const APP_URL = process.env.LIVE_WORKSPACE_RAIL_URL || 'http://localhost:3001/dashboard/new-note?fresh=workspace-rail-qa';
const AUTH_COOKIE = process.env.LIVE_WORKSPACE_RAIL_AUTH_COOKIE || 'veranote-provider-token';
const QA_EMAIL = process.env.LIVE_WORKSPACE_RAIL_QA_EMAIL || 'daniel.hale@veranote-beta.local';
const OUTPUT_DIR = process.env.LIVE_WORKSPACE_RAIL_OUTPUT_DIR || 'test-results';
const SHOULD_START_SERVER = process.env.LIVE_WORKSPACE_RAIL_START_SERVER !== '0';
const TEST_PROVIDER_ID = 'provider-brandy-norris-beta';

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
      resolve(Boolean(response.statusCode && response.statusCode < 500));
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
    throw new Error(`App is not reachable at ${url}. Start it with npm run dev:test or rerun without LIVE_WORKSPACE_RAIL_START_SERVER=0.`);
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
  const accessCode = process.env.LIVE_WORKSPACE_RAIL_ACCESS_CODE || await readLocalEnvValue('VERANOTE_BETA_ACCESS_CODE');
  if (!accessCode) {
    throw new Error('Workspace rail QA reached sign-in. Set LIVE_WORKSPACE_RAIL_ACCESS_CODE or VERANOTE_BETA_ACCESS_CODE.');
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
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(1000);
}

async function createContext(browser, options = {}) {
  const appUrl = new URL(APP_URL);
  const context = await browser.newContext({
    viewport: options.viewport || { width: 900, height: 800 },
  });
  await context.addCookies([{
    name: 'veranote-auth',
    value: AUTH_COOKIE,
    domain: appUrl.hostname,
    path: '/',
    httpOnly: false,
    sameSite: 'Lax',
  }]);
  await context.addInitScript(({ withSavedDraft, providerId }) => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    window.localStorage.setItem('veranote:current-provider-id', providerId);

    if (withSavedDraft) {
      const draft = {
        draftId: 'workspace-rail-qa-draft',
        providerIdentityId: providerId,
        lastSavedAt: new Date().toISOString(),
        specialty: 'Psychiatry',
        role: 'Psychiatric NP',
        noteType: 'Outpatient Psych Follow-Up',
        template: 'Default Outpatient Psych Follow-Up',
        outputStyle: 'Standard',
        format: 'Labeled Sections',
        keepCloserToSource: true,
        flagMissingInfo: true,
        outputScope: 'full-note',
        requestedSections: [],
        selectedPresetId: '',
        presetName: '',
        customInstructions: '',
        sourceInput: 'Pre-Visit Data: saved intake source for rail regression.\\nLive Visit Notes: patient reports mood improved.',
        sourceSections: {
          intakeCollateral: 'Saved intake source for rail regression.',
          clinicianNotes: 'Patient reports mood improved.',
          patientTranscript: '',
          objectiveData: '',
        },
        note: 'Generated note text used only for workspace rail regression.',
        flags: [],
        copilotSuggestions: [],
        recoveryState: {
          workflowStage: 'review',
          composeLane: 'finish',
          recommendedStage: 'review',
          updatedAt: new Date().toISOString(),
          lastOpenedAt: new Date().toISOString(),
        },
        mode: 'fallback',
      };
      const draftSessionKey = `clinical-documentation-transformer:draft-session:${providerId}`;
      const draftRecoveryKey = `clinical-documentation-transformer:draft-recovery:${providerId}`;
      window.localStorage.setItem(draftSessionKey, JSON.stringify(draft));
      window.localStorage.setItem(draftRecoveryKey, JSON.stringify({
        draftId: draft.draftId,
        recoveryState: draft.recoveryState,
      }));
      window.localStorage.setItem(`${draftSessionKey}-stage`, 'review');
    }
  }, {
    withSavedDraft: Boolean(options.withSavedDraft),
    providerId: TEST_PROVIDER_ID,
  });
  return context;
}

async function captureWorkspaceState(page) {
  return page.evaluate(() => {
    const rail = document.querySelector('.workspace-left-rail')?.getBoundingClientRect();
    const main = document.querySelector('.workspace-main-column')?.getBoundingClientRect();
    const shell = document.querySelector('.workspace-left-shell');
    const active = document.querySelector('.workspace-rail-tab-active')?.textContent?.replace(/\\s+/g, ' ').trim() || '';
    const style = shell ? window.getComputedStyle(shell) : null;

    return {
      url: window.location.href,
      scrollY: Math.round(window.scrollY),
      active,
      columns: style?.gridTemplateColumns || '',
      rail: rail ? {
        x: Math.round(rail.x),
        y: Math.round(rail.y),
        width: Math.round(rail.width),
        height: Math.round(rail.height),
      } : null,
      main: main ? {
        x: Math.round(main.x),
        y: Math.round(main.y),
        width: Math.round(main.width),
        height: Math.round(main.height),
      } : null,
    };
  });
}

function assertState(condition, message, failures) {
  if (!condition) {
    failures.push(message);
  }
}

async function runLaptopRailScenario(browser) {
  const context = await createContext(browser, { viewport: { width: 900, height: 800 } });
  const page = await context.newPage();
  const failures = [];

  await gotoWorkspace(page, APP_URL);
  const initial = await captureWorkspaceState(page);
  assertState(Boolean(initial.rail && initial.main), 'workspace rail or main column did not render', failures);
  assertState(initial.rail && initial.main && initial.rail.x < initial.main.x, 'workspace rail was not positioned left of the main column at 900px', failures);
  assertState(/px/.test(initial.columns) && initial.columns.split(' ').length >= 2, `workspace shell did not expose two grid columns: ${initial.columns}`, failures);
  assertState(initial.scrollY <= 24, `workspace did not start near top; scrollY=${initial.scrollY}`, failures);
  assertState(await page.getByTestId('workspace-quick-find-input').isVisible().catch(() => false), 'workspace quick-find input was not visible in the rail', failures);

  await page.getByTestId('workspace-quick-find-input').fill('cpt');
  const cptResult = page.getByTestId('workspace-quick-find-result').filter({ hasText: /CPT Support/i });
  assertState(await cptResult.first().isVisible().catch(() => false), 'workspace quick-find did not surface CPT Support for cpt search', failures);
  await cptResult.first().click();
  await page.waitForTimeout(700);
  const afterQuickFind = await captureWorkspaceState(page);
  assertState(/Review Draft/i.test(afterQuickFind.active), `CPT quick-find did not jump to review lane; active=${afterQuickFind.active}`, failures);
  assertState(afterQuickFind.scrollY <= 180, `CPT quick-find scrolled too far down; scrollY=${afterQuickFind.scrollY}`, failures);

  await page.locator('.workspace-left-rail').getByRole('button', { name: /Review Draft/i }).first().click();
  await page.waitForTimeout(700);
  const afterReview = await captureWorkspaceState(page);
  assertState(/Review Draft/i.test(afterReview.active), `Review Draft tab did not become active; active=${afterReview.active}`, failures);
  assertState(afterReview.scrollY <= 180, `Review Draft click scrolled too far down; scrollY=${afterReview.scrollY}`, failures);

  await page.locator('.workspace-left-rail').getByRole('button', { name: /Source Packet/i }).first().click();
  await page.waitForTimeout(700);
  const afterSource = await captureWorkspaceState(page);
  assertState(/Source Packet/i.test(afterSource.active), `Source Packet tab did not become active; active=${afterSource.active}`, failures);
  assertState(afterSource.scrollY <= 180, `Source Packet click scrolled too far down; scrollY=${afterSource.scrollY}`, failures);

  await context.close();
  return {
    id: 'laptop-left-rail',
    passed: failures.length === 0,
    failures,
    initial,
    afterQuickFind,
    afterReview,
    afterSource,
  };
}

async function runRecoveredDraftScenario(browser) {
  const context = await createContext(browser, {
    viewport: { width: 900, height: 800 },
    withSavedDraft: true,
  });
  const page = await context.newPage();
  const failures = [];

  await gotoWorkspace(page, APP_URL);
  const initial = await captureWorkspaceState(page);
  assertState(initial.scrollY <= 24, `saved draft restore started down-page; scrollY=${initial.scrollY}`, failures);
  assertState(!/Review Draft/i.test(initial.active), `saved draft restore reopened Review Draft instead of source/setup; active=${initial.active}`, failures);
  assertState(Boolean(initial.rail && initial.main && initial.rail.x < initial.main.x), 'saved draft restore lost left rail layout', failures);
  assertState(await page.locator('#source-field-intakeCollateral textarea').first().isVisible().catch(() => false), 'saved draft restore did not show source field first', failures);

  await context.close();
  return {
    id: 'saved-draft-opens-source-first',
    passed: failures.length === 0,
    failures,
    initial,
  };
}

async function runCompactScenario(browser) {
  const context = await createContext(browser, { viewport: { width: 760, height: 800 } });
  const page = await context.newPage();
  const failures = [];

  await gotoWorkspace(page, APP_URL);
  const initial = await captureWorkspaceState(page);
  assertState(Boolean(initial.rail), 'compact rail did not render', failures);
  assertState(initial.scrollY <= 24, `compact workspace did not start near top; scrollY=${initial.scrollY}`, failures);
  assertState(await page.locator('.workspace-left-rail').getByRole('button', { name: /Paste Source/i }).first().isVisible().catch(() => false), 'compact rail primary action was not visible', failures);
  assertState(await page.getByTestId('workspace-quick-find-input').isVisible().catch(() => false), 'compact rail quick-find input was not visible', failures);

  await context.close();
  return {
    id: 'compact-rail-remains-usable',
    passed: failures.length === 0,
    failures,
    initial,
  };
}

async function main() {
  let chromium;
  try {
    ({ chromium } = await import('playwright'));
  } catch {
    console.error('Playwright is not installed in this workspace. Run npm install first.');
    process.exit(2);
  }

  const server = await ensureServer(APP_URL, SHOULD_START_SERVER);
  const browser = await chromium.launch({ headless: true });
  let results = [];

  try {
    results = [
      await runLaptopRailScenario(browser),
      await runRecoveredDraftScenario(browser),
      await runCompactScenario(browser),
    ];
  } finally {
    await browser.close();
    if (server) {
      server.kill('SIGTERM');
    }
  }

  const failed = results.filter((item) => !item.passed).length;
  const report = {
    generatedAt: new Date().toISOString(),
    appUrl: APP_URL,
    total: results.length,
    passed: results.length - failed,
    failed,
    results,
  };

  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  const stamp = new Date().toISOString().slice(0, 10);
  await fs.writeFile(path.join(OUTPUT_DIR, `live-workspace-rail-qa-${stamp}.json`), JSON.stringify(report, null, 2));
  await fs.writeFile(path.join(OUTPUT_DIR, `live-workspace-rail-qa-${stamp}.md`), [
    '# Live Workspace Rail QA',
    '',
    `Generated: ${report.generatedAt}`,
    `URL: ${APP_URL}`,
    `Result: ${report.passed}/${report.total} passed`,
    '',
    ...results.map((item) => [
      `## ${item.id}`,
      `- Status: ${item.passed ? 'pass' : 'fail'}`,
      `- Failures: ${item.failures.length ? item.failures.join('; ') : 'none'}`,
      `- Initial scrollY: ${item.initial?.scrollY ?? 'unknown'}`,
      `- Active rail tab: ${item.initial?.active || 'none'}`,
    ].join('\n')),
    '',
  ].join('\n\n'));

  console.log(JSON.stringify(report, null, 2));

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
