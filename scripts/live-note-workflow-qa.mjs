#!/usr/bin/env node

/**
 * Browser-level QA for the provider-facing note creation workflow.
 *
 * Prereqs:
 * - Start the app on http://localhost:3001 with `npm run dev:test`.
 * - The script uses an isolated Playwright browser context and a mock provider cookie.
 *
 * Defaults:
 * - Runs a small smoke subset through `/dashboard/new-note`.
 * - Set LIVE_NOTE_WORKFLOW_LIMIT=all to run every source-packet scenario through the browser.
 * - Set LIVE_NOTE_WORKFLOW_CASE_IDS=id1,id2 to target specific cases.
 */

import fs from 'node:fs/promises';
import path from 'node:path';

const APP_URL = process.env.LIVE_NOTE_WORKFLOW_URL || 'http://localhost:3001/dashboard/new-note?fresh=live-note-workflow-qa';
const AUTH_COOKIE = process.env.LIVE_NOTE_WORKFLOW_AUTH_COOKIE || 'veranote-provider-token';
const QA_EMAIL = process.env.LIVE_NOTE_WORKFLOW_QA_EMAIL || 'daniel.hale@veranote-beta.local';
const CASE_IDS = (process.env.LIVE_NOTE_WORKFLOW_CASE_IDS || '')
  .split(',')
  .map((item) => item.trim())
  .filter(Boolean);
const LIMIT = process.env.LIVE_NOTE_WORKFLOW_LIMIT || '3';
const OUTPUT_DIR = process.env.LIVE_NOTE_WORKFLOW_OUTPUT_DIR || 'test-results';

async function readLocalEnvValue(key) {
  if (process.env[key]) {
    return process.env[key];
  }

  try {
    const contents = await fs.readFile(path.resolve('.env.local'), 'utf8');
    const line = contents
      .split(/\r?\n/)
      .find((entry) => entry.trim().startsWith(`${key}=`));
    if (!line) return null;

    return line
      .slice(line.indexOf('=') + 1)
      .trim()
      .replace(/^['"]|['"]$/g, '') || null;
  } catch {
    return null;
  }
}

async function signInForQa(page, appUrl) {
  const accessCode = process.env.LIVE_NOTE_WORKFLOW_ACCESS_CODE || await readLocalEnvValue('VERANOTE_BETA_ACCESS_CODE');
  if (!accessCode) {
    throw new Error('Live note workflow QA reached sign-in. Set LIVE_NOTE_WORKFLOW_ACCESS_CODE or VERANOTE_BETA_ACCESS_CODE.');
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

async function gotoWorkspace(page, appUrl) {
  await page.goto(appUrl, { waitUntil: 'domcontentloaded' });

  if (page.url().includes('/sign-in')) {
    await signInForQa(page, appUrl);
  }

  const clinicalFieldSelect = page.locator('select[aria-label="Select clinical field"]').first();
  const hasClinicalFieldSelect = await waitForVisible(clinicalFieldSelect, 5000);
  if (!hasClinicalFieldSelect) {
    const backToCompose = page.getByText('Back to Compose', { exact: true }).first();
    const hasBackToCompose = await waitForVisible(backToCompose, 5000);
    if (hasBackToCompose) {
      await backToCompose.click();
      await page.waitForTimeout(500);
    }
  }

  await clinicalFieldSelect.waitFor({ state: 'visible', timeout: 30000 });
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(1200);

  if (!await clinicalFieldSelect.isVisible().catch(() => false)) {
    const backToCompose = page.getByText('Back to Compose', { exact: true }).first();
    if (await waitForVisible(backToCompose, 5000)) {
      await backToCompose.click();
      await clinicalFieldSelect.waitFor({ state: 'visible', timeout: 30000 });
      await page.waitForTimeout(500);
    }
  }
}

async function selectFirstVisible(page, selector, value) {
  try {
    await page.locator(selector).first().waitFor({ state: 'attached', timeout: 30000 });
  } catch (error) {
    const selectCount = await page.locator('select').count().catch(() => 0);
    const bodyExcerpt = await page.locator('body').innerText().then((text) => text.slice(0, 1200)).catch(() => '');
    throw new Error([
      `No select attached for ${selector}`,
      `Current URL: ${page.url()}`,
      `Visible select count: ${selectCount}`,
      `Body excerpt: ${bodyExcerpt}`,
      `Original error: ${error instanceof Error ? error.message : String(error)}`,
    ].join('\n'));
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

  throw new Error(`No visible select found for ${selector}`);
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

async function latestVisibleDraftText(page, fallbackNote) {
  await page.getByRole('button', { name: 'Back to Compose' }).waitFor({ state: 'visible', timeout: 30000 });
  const textareas = page.locator('textarea');
  const count = await textareas.count();

  for (let index = 0; index < count; index += 1) {
    const value = await textareas.nth(index).inputValue().catch(() => '');
    if (value && value.includes(fallbackNote.slice(0, 80))) {
      return value;
    }
  }

  return fallbackNote;
}

async function main() {
  let chromium;
  try {
    ({ chromium } = await import('playwright'));
  } catch {
    console.error('Playwright is not installed in this workspace. Run npm install first, or use npm run note:gate for route-level note QA.');
    process.exit(2);
  }

  const [
    { buildSourceInputFromSections },
    { evaluateSourcePacketRegressionCase, sourcePacketRegressionCases },
  ] = await Promise.all([
    import('../lib/ai/source-sections.ts'),
    import('../lib/eval/note-generation/source-packet-regression.ts'),
  ]);

  const selected = CASE_IDS.length
    ? CASE_IDS.map((id) => {
      const item = sourcePacketRegressionCases.find((candidate) => candidate.id === id);
      if (!item) throw new Error(`Unknown live note workflow case: ${id}`);
      return item;
    })
    : LIMIT === 'all'
      ? sourcePacketRegressionCases
      : sourcePacketRegressionCases.slice(0, Number.parseInt(LIMIT, 10) || 3);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const url = new URL(APP_URL);
  await context.addCookies([{
    name: 'veranote-auth',
    value: AUTH_COOKIE,
    domain: url.hostname,
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
    await gotoWorkspace(page, APP_URL);
    console.log(`Live note workflow case: ${item.id} (${item.noteType})`);

    await selectFirstVisible(page, 'select[aria-label="Select clinical field"]', item.specialty || 'Psychiatry');
    await selectFirstVisible(page, 'select[aria-label="Select provider role"]', item.role || 'Psychiatric NP');
    await selectFirstVisible(page, 'select[aria-label="Select EHR destination"]', item.ehr || 'WellSky');
    await selectFirstVisible(page, 'select[aria-label="Select note type"]', item.noteType);

    await fillSourceField(page, 'source-field-intakeCollateral', item.sourceSections.intakeCollateral);
    await fillSourceField(page, 'source-field-clinicianNotes', item.sourceSections.clinicianNotes);
    await fillSourceField(page, 'source-field-patientTranscript', item.sourceSections.patientTranscript);
    await fillSourceField(page, 'source-field-objectiveData', item.sourceSections.objectiveData);

    const responsePromise = page.waitForResponse(
      (response) => response.url().includes('/api/generate-note') && response.request().method() === 'POST',
      { timeout: 60000 },
    );
    await clickFirstEnabledGenerate(page);
    const response = await responsePromise;
    const payload = await response.json();
    const uiNote = await latestVisibleDraftText(page, payload.note || '');
    const sourceInput = buildSourceInputFromSections(item.sourceSections);
    const result = evaluateSourcePacketRegressionCase(item, uiNote, payload.generationMeta?.pathUsed === 'live' ? 'live' : 'fallback', payload.generationMeta?.reason || 'browser-ui', Array.isArray(payload.flags) ? payload.flags.length : 0);

    results.push({
      ...result,
      status: response.status(),
      sourceCharacters: sourceInput.length,
      noteCharacters: uiNote.length,
      browserUrl: page.url(),
    });
  }

  await browser.close();

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
  const jsonPath = path.join(OUTPUT_DIR, `live-note-workflow-qa-${stamp}.json`);
  const markdownPath = path.join(OUTPUT_DIR, `live-note-workflow-qa-${stamp}.md`);
  await fs.writeFile(jsonPath, JSON.stringify(report, null, 2));
  await fs.writeFile(markdownPath, [
    '# Live Note Workflow QA',
    '',
    `Generated: ${report.generatedAt}`,
    `URL: ${APP_URL}`,
    `Result: ${report.passed}/${report.total} passed`,
    '',
    ...results.map((item) => [
      `## ${item.id}`,
      `- Status: ${item.passed ? 'pass' : 'fail'}`,
      `- Note type: ${item.noteType}`,
      `- Missing: ${item.missing.length ? item.missing.join('; ') : 'none'}`,
      `- Forbidden hits: ${item.forbiddenHits.length ? item.forbiddenHits.join('; ') : 'none'}`,
      `- Excerpt: ${item.noteExcerpt}`,
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
