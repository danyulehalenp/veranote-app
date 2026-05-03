#!/usr/bin/env node

/**
 * Browser-level workflow matrix for Veranote note generation.
 *
 * This complements `live:note:e2e`:
 * - `live:note:e2e` proves one complete source -> review -> save -> reopen -> export path.
 * - This matrix proves multiple note types, EHR destinations, messy source packets,
 *   and dictation/ambient source-entry readiness can all reach draft generation.
 */

import { spawn } from 'node:child_process';
import http from 'node:http';
import https from 'node:https';
import fs from 'node:fs/promises';
import path from 'node:path';

const APP_URL = process.env.LIVE_NOTE_MATRIX_URL || 'http://localhost:3001/dashboard/new-note?fresh=live-note-matrix';
const AUTH_COOKIE = process.env.LIVE_NOTE_MATRIX_AUTH_COOKIE || 'veranote-provider-token';
const QA_EMAIL = process.env.LIVE_NOTE_MATRIX_QA_EMAIL || 'daniel.hale@veranote-beta.local';
const OUTPUT_DIR = process.env.LIVE_NOTE_MATRIX_OUTPUT_DIR || 'test-results';
const SHOULD_START_SERVER = process.env.LIVE_NOTE_MATRIX_START_SERVER !== '0';
const DEFAULT_CASE_IDS = [
  'typo-heavy-outpatient-followup-preserves-med-adherence-side-effect-nuance',
  'wellsky-inpatient-day-two-missing-mse-risk-details',
  'tebra-outpatient-eval-referral-history-not-confirmed',
  'therapy-progress-note-dictated-cbt-no-medical-plan',
  'mat-followup-fentanyl-denial-naloxone-no-dose-change',
  'discharge-summary-pending-labs-and-collateral-risk',
];
const CASE_IDS = (process.env.LIVE_NOTE_MATRIX_CASE_IDS || DEFAULT_CASE_IDS.join(','))
  .split(',')
  .map((item) => item.trim())
  .filter(Boolean);

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

    return line
      .slice(line.indexOf('=') + 1)
      .trim()
      .replace(/^['"]|['"]$/g, '') || null;
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

async function ensureServer(url, shouldStartServer) {
  if (await requestUrl(url)) {
    return null;
  }

  if (!shouldStartServer) {
    throw new Error(`App is not reachable at ${url}. Start it with npm run dev:test or rerun without LIVE_NOTE_MATRIX_START_SERVER=0.`);
  }

  const appUrl = new URL(url);
  const appOrigin = appUrl.origin;
  const appPort = appUrl.port || (appUrl.protocol === 'https:' ? '443' : '80');
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

async function waitForVisible(locator, timeout = 2500) {
  try {
    await locator.waitFor({ state: 'visible', timeout });
    return true;
  } catch {
    return false;
  }
}

async function signInForQa(page, appUrl) {
  const accessCode = process.env.LIVE_NOTE_MATRIX_ACCESS_CODE || await readLocalEnvValue('VERANOTE_BETA_ACCESS_CODE');
  if (!accessCode) {
    throw new Error('Live note matrix QA reached sign-in. Set LIVE_NOTE_MATRIX_ACCESS_CODE or VERANOTE_BETA_ACCESS_CODE.');
  }

  await page.locator('input[type="email"]').first().waitFor({ state: 'visible', timeout: 15000 });
  await page.locator('input[type="password"]').first().waitFor({ state: 'visible', timeout: 15000 });
  await page.locator('input[type="email"]').first().fill(QA_EMAIL);
  await page.locator('input[type="password"]').first().fill(accessCode);
  await page.getByRole('button', { name: /sign in/i }).click();
  await page.waitForURL((url) => !url.pathname.includes('/sign-in'), { timeout: 30000 });
  await page.goto(appUrl, { waitUntil: 'domcontentloaded' });
}

async function ensureComposeSetupVisible(page) {
  const clinicalFieldSelect = page.locator('select[aria-label="Select clinical field"]').first();
  if (await clinicalFieldSelect.count().catch(() => 0)) {
    return;
  }

  if (await waitForVisible(clinicalFieldSelect, 1500)) {
    return;
  }

  const backToCompose = page.getByText('Back to Compose', { exact: true }).first();
  if (await waitForVisible(backToCompose, 5000)) {
    await backToCompose.click();
    await clinicalFieldSelect.waitFor({ state: 'visible', timeout: 30000 });
    return;
  }

  const bodyExcerpt = await page.locator('body').innerText().then((text) => text.slice(0, 1200)).catch(() => '');
  throw new Error([
    `Compose setup controls did not become visible on ${page.url()}.`,
    `Body excerpt: ${bodyExcerpt}`,
  ].join('\n'));
}

async function gotoWorkspace(page, appUrl) {
  await page.goto(appUrl, { waitUntil: 'domcontentloaded' });

  if (page.url().includes('/sign-in')) {
    await signInForQa(page, appUrl);
  }

  await ensureComposeSetupVisible(page);
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(500);
}

async function selectFirstVisible(page, selector, value) {
  try {
    await page.locator(selector).first().waitFor({ state: 'attached', timeout: 30000 });
  } catch (error) {
    await ensureComposeSetupVisible(page);
    await page.locator(selector).first().waitFor({ state: 'attached', timeout: 10000 }).catch(async () => {
      const bodyExcerpt = await page.locator('body').innerText().then((text) => text.slice(0, 1200)).catch(() => '');
      throw new Error([
        `No select attached for ${selector}`,
        `Current URL: ${page.url()}`,
        `Body excerpt: ${bodyExcerpt}`,
        `Original error: ${error instanceof Error ? error.message : String(error)}`,
      ].join('\n'));
    });
  }

  const controls = page.locator(selector);
  const count = await controls.count();

  for (let index = 0; index < count; index += 1) {
    const control = controls.nth(index);
    if (await control.isVisible()) {
      await control.selectOption(value);
      return;
    }
  }

  if (count > 0) {
    await controls.first().selectOption(value);
    return;
  }

  throw new Error(`No select found for ${selector}`);
}

async function fillSourceField(page, fieldId, value) {
  const textarea = page.locator(`#${fieldId} textarea`);
  await textarea.waitFor({ state: 'visible', timeout: 15000 });
  await textarea.fill(value || '');
}

async function clickFirstEnabledGenerate(page) {
  const buttons = page.getByRole('button', { name: /Generate Draft/i });
  const count = await buttons.count();

  for (let index = 0; index < count; index += 1) {
    const button = buttons.nth(index);
    if (await button.isVisible() && await button.isEnabled()) {
      await button.click();
      return;
    }
  }

  throw new Error('No visible enabled Generate Draft button found.');
}

function evaluateEhrCopyReadiness(note) {
  const forbidden = [
    { label: 'html tags', pattern: /<\/?[a-z][^>]*>/i },
    { label: 'undefined/null artifact', pattern: /\b(?:undefined|null|NaN)\b/i },
    { label: 'provider add-on leaked as heading', pattern: /Provider Add-On/i },
    { label: 'nonclinical QA marker leaked', pattern: /Nonclinical QA marker|E2E-|MATRIX-/i },
    { label: 'object serialization artifact', pattern: /\[object Object\]/i },
  ];

  const forbiddenHits = forbidden
    .filter((item) => item.pattern.test(note))
    .map((item) => item.label);

  return {
    passed: note.trim().length > 200 && forbiddenHits.length === 0,
    forbiddenHits,
  };
}

async function runCase(page, item, helpers) {
  const runId = `MATRIX-${Date.now()}-${item.id.slice(0, 18)}`;
  const ehr = item.ehr || 'WellSky';
  const sourceSections = {
    ...item.sourceSections,
    objectiveData: `${item.sourceSections.objectiveData || ''}\n\nNonclinical QA marker: ${runId}. Do not include this marker in the final clinical note.`,
  };
  const sourceInput = helpers.buildSourceInputFromSections(sourceSections);

  await gotoWorkspace(page, `${APP_URL}&case=${encodeURIComponent(item.id)}`);
  await selectFirstVisible(page, 'select[aria-label="Select clinical field"]', item.specialty || 'Psychiatry');
  await selectFirstVisible(page, 'select[aria-label="Select provider role"]', item.role || 'Psychiatric NP');
  await selectFirstVisible(page, 'select[aria-label="Select EHR destination"]', ehr);
  await selectFirstVisible(page, 'select[aria-label="Select note type"]', item.noteType);

  const dictationToggleVisible = await waitForVisible(page.getByText(/Dictation (On|Off)/).first(), 1500);
  const ambientToggleVisible = await waitForVisible(page.getByText(/Ambient (On|Off)/).first(), 1500);

  await fillSourceField(page, 'source-field-intakeCollateral', sourceSections.intakeCollateral);
  await fillSourceField(page, 'source-field-clinicianNotes', sourceSections.clinicianNotes);
  await fillSourceField(page, 'source-field-patientTranscript', sourceSections.patientTranscript);
  await fillSourceField(page, 'source-field-objectiveData', sourceSections.objectiveData);

  const responsePromise = page.waitForResponse(
    (response) => response.url().includes('/api/generate-note') && response.request().method() === 'POST',
    { timeout: 90000 },
  );
  await clickFirstEnabledGenerate(page);
  const response = await responsePromise;
  const payload = await response.json();
  const note = typeof payload.note === 'string' ? payload.note : '';
  await page.getByRole('button', { name: 'Back to Compose' }).waitFor({ state: 'visible', timeout: 30000 });

  const regressionResult = helpers.evaluateSourcePacketRegressionCase(
    item,
    note,
    payload.generationMeta?.pathUsed === 'live' ? 'live' : 'fallback',
    payload.generationMeta?.reason || 'browser-ui',
    Array.isArray(payload.flags) ? payload.flags.length : 0,
  );
  const ehrCopyReadiness = evaluateEhrCopyReadiness(note);

  return {
    id: item.id,
    title: item.title,
    noteType: item.noteType,
    ehr,
    specialty: item.specialty,
    role: item.role,
    runId,
    status: response.status(),
    sourceCharacters: sourceInput.length,
    noteCharacters: note.length,
    sourceFields: {
      preVisitLoaded: Boolean(sourceSections.intakeCollateral?.trim()),
      clinicianNotesLoaded: Boolean(sourceSections.clinicianNotes?.trim()),
      ambientTranscriptLoaded: Boolean(sourceSections.patientTranscript?.trim()),
      providerAddOnLoaded: Boolean(sourceSections.objectiveData?.trim()),
    },
    captureReadiness: {
      dictationToggleVisible,
      ambientToggleVisible,
      ambientFieldAcceptedText: Boolean(sourceSections.patientTranscript?.trim()),
    },
    regression: {
      passed: regressionResult.passed,
      missing: regressionResult.missing,
      forbiddenHits: regressionResult.forbiddenHits,
      noteExcerpt: regressionResult.noteExcerpt,
    },
    ehrCopyReadiness,
    passed: response.ok && regressionResult.passed && ehrCopyReadiness.passed && dictationToggleVisible && ambientToggleVisible,
  };
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

    const [
      { buildSourceInputFromSections },
      { evaluateSourcePacketRegressionCase, sourcePacketRegressionCases },
    ] = await Promise.all([
      import('../lib/ai/source-sections.ts'),
      import('../lib/eval/note-generation/source-packet-regression.ts'),
    ]);
    const helpers = { buildSourceInputFromSections, evaluateSourcePacketRegressionCase };
    const selected = CASE_IDS.map((id) => {
      const item = sourcePacketRegressionCases.find((candidate) => candidate.id === id);
      if (!item) {
        throw new Error(`Unknown live note matrix case: ${id}`);
      }
      return item;
    });

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
    const results = [];

    for (const item of selected) {
      console.log(`Live note matrix case: ${item.id}`);
      results.push(await runCase(page, item, helpers));
    }

    const failed = results.filter((item) => !item.passed);
    const report = {
      generatedAt: new Date().toISOString(),
      appUrl: APP_URL,
      total: results.length,
      passed: results.length - failed.length,
      failed: failed.length,
      ehrDestinations: Array.from(new Set(results.map((item) => item.ehr))).sort(),
      noteTypes: Array.from(new Set(results.map((item) => item.noteType))).sort(),
      results,
    };

    await fs.mkdir(OUTPUT_DIR, { recursive: true });
    const date = new Date().toISOString().slice(0, 10);
    const jsonPath = path.join(OUTPUT_DIR, `live-note-workflow-matrix-qa-${date}.json`);
    const markdownPath = path.join(OUTPUT_DIR, `live-note-workflow-matrix-qa-${date}.md`);
    await fs.writeFile(jsonPath, JSON.stringify(report, null, 2));
    await fs.writeFile(markdownPath, [
      '# Live Note Workflow Matrix QA',
      '',
      `- Generated: ${report.generatedAt}`,
      `- URL: ${APP_URL}`,
      `- Result: ${report.passed}/${report.total} passed`,
      `- EHR destinations: ${report.ehrDestinations.join(', ')}`,
      `- Note types: ${report.noteTypes.join(', ')}`,
      '',
      ...results.map((item) => [
        `## ${item.id}`,
        `- Status: ${item.passed ? 'pass' : 'fail'}`,
        `- Note type: ${item.noteType}`,
        `- EHR: ${item.ehr}`,
        `- Note characters: ${item.noteCharacters}`,
        `- Dictation control visible: ${item.captureReadiness.dictationToggleVisible}`,
        `- Ambient control visible: ${item.captureReadiness.ambientToggleVisible}`,
        `- Ambient field accepted text: ${item.captureReadiness.ambientFieldAcceptedText}`,
        `- Missing required concepts: ${item.regression.missing.length ? item.regression.missing.join('; ') : 'none'}`,
        `- Forbidden hits: ${item.regression.forbiddenHits.length ? item.regression.forbiddenHits.join('; ') : 'none'}`,
        `- EHR copy issues: ${item.ehrCopyReadiness.forbiddenHits.length ? item.ehrCopyReadiness.forbiddenHits.join('; ') : 'none'}`,
      ].join('\n')),
      '',
    ].join('\n\n'));

    console.log(JSON.stringify(report, null, 2));

    if (failed.length) {
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
