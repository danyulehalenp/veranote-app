#!/usr/bin/env node

/**
 * Browser-level QA for the complete Veranote note workflow.
 *
 * Prereqs:
 * - Start the app on http://localhost:3001 with `npm run dev:test`, or let
 *   this script start a mock-auth dev server.
 * - Install Playwright in the workspace.
 *
 * This intentionally checks workflow plumbing, not note clinical quality:
 * source entry -> draft generation -> assistant visibility -> review approval
 * -> save -> reopen saved draft -> copy/export readiness.
 */

import { spawn } from 'node:child_process';
import http from 'node:http';
import https from 'node:https';
import fs from 'node:fs/promises';
import path from 'node:path';

const APP_URL = process.env.LIVE_NOTE_E2E_URL || 'http://localhost:3001/dashboard/new-note?fresh=live-note-e2e';
const AUTH_COOKIE = process.env.LIVE_NOTE_E2E_AUTH_COOKIE || 'veranote-provider-token';
const QA_EMAIL = process.env.LIVE_NOTE_E2E_QA_EMAIL || 'daniel.hale@veranote-beta.local';
const CASE_ID = process.env.LIVE_NOTE_E2E_CASE_ID || 'typo-heavy-outpatient-followup-preserves-med-adherence-side-effect-nuance';
const OUTPUT_DIR = process.env.LIVE_NOTE_E2E_OUTPUT_DIR || 'test-results';
const SHOULD_START_SERVER = process.env.LIVE_NOTE_E2E_START_SERVER !== '0';

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
    throw new Error(`App is not reachable at ${url}. Start it with npm run dev:test or rerun without LIVE_NOTE_E2E_START_SERVER=0.`);
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

async function waitForVisible(locator, timeout = 2500) {
  try {
    await locator.waitFor({ state: 'visible', timeout });
    return true;
  } catch {
    return false;
  }
}

async function waitForAnyVisible(locators, timeout = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    for (const locator of locators) {
      const count = await locator.count().catch(() => 0);
      for (let index = 0; index < count; index += 1) {
        if (await locator.nth(index).isVisible().catch(() => false)) {
          return locator.nth(index);
        }
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  return null;
}

async function clickFirstVisible(locator, timeout = 2500) {
  const visibleLocator = await waitForAnyVisible([locator], timeout);
  if (!visibleLocator) {
    return false;
  }
  await visibleLocator.click();
  return true;
}

async function signInForQa(page, appUrl) {
  const accessCode = process.env.LIVE_NOTE_E2E_ACCESS_CODE || await readLocalEnvValue('VERANOTE_BETA_ACCESS_CODE');
  if (!accessCode) {
    throw new Error('Live note E2E QA reached sign-in. Set LIVE_NOTE_E2E_ACCESS_CODE or VERANOTE_BETA_ACCESS_CODE.');
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

  await ensureComposeSetupVisible(page);
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(750);
}

async function ensureComposeSetupVisible(page) {
  const clinicalFieldSelect = page.locator('select[aria-label="Select clinical field"]').first();
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

async function openAssistantPanel(page) {
  const composerInput = page.getByTestId('assistant-composer-input');
  if (await waitForVisible(composerInput, 1000)) {
    return;
  }

  const reviewDockAskButton = page.getByTestId('atlas-review-dock-ask-button');
  if (await clickFirstVisible(reviewDockAskButton)) {
    if (await waitForVisible(composerInput, 5000)) {
      return;
    }
    throw new Error('Review dock assistant control opened, but the assistant composer did not become visible.');
  }

  const openButton = page.getByTestId('assistant-open-button');
  if (await clickFirstVisible(openButton)) {
    if (await waitForVisible(composerInput, 5000)) {
      return;
    }
    throw new Error('Assistant launcher opened, but the assistant composer did not become visible.');
  }

  const workspaceOpenButton = page.getByTestId('workspace-assistant-open-button');
  if (await clickFirstVisible(workspaceOpenButton)) {
    if (await waitForVisible(composerInput, 5000)) {
      return;
    }
    throw new Error('Workspace assistant control opened, but the assistant composer did not become visible.');
  }

  const expandButton = page.getByTestId('assistant-expand-button');
  if (await clickFirstVisible(expandButton)) {
    if (await waitForVisible(composerInput, 5000)) {
      return;
    }
    throw new Error('Assistant expand control opened, but the assistant composer did not become visible.');
  }

  throw new Error(`Assistant controls were not found on ${page.url()}.`);
}

async function getAssistantThreadSnapshot(page) {
  return page.evaluate(() => {
    const messages = Array.from(document.querySelectorAll('[data-testid="assistant-message"]'));
    const latest = document.querySelector('[data-testid="assistant-message"][data-assistant-message-latest="true"]');
    const latestBody = latest?.querySelector('[data-testid="assistant-message-body"]');
    const earlierToggle = Array.from(document.querySelectorAll('button'))
      .map((button) => button.textContent || '')
      .find((text) => /Show earlier messages \(\d+\)/i.test(text));
    const earlierCount = Number(earlierToggle?.match(/\((\d+)\)/)?.[1] || 0);

    return {
      messageCount: messages.length,
      latestId: latest instanceof HTMLElement ? latest.dataset.assistantMessageId || null : null,
      latestText: latestBody?.textContent || '',
      earlierCount,
    };
  });
}

async function askVisibleAssistantTurn(page, prompt) {
  const input = page.getByTestId('assistant-composer-input');
  const send = page.getByTestId('assistant-send-button');
  await input.waitFor({ state: 'visible', timeout: 15000 });
  await send.waitFor({ state: 'visible', timeout: 15000 });

  const beforeSnapshot = await getAssistantThreadSnapshot(page);
  await input.scrollIntoViewIfNeeded();
  await input.fill(prompt);
  await page.waitForFunction(
    () => {
      const button = document.querySelector('[data-testid="assistant-send-button"]');
      return button instanceof HTMLButtonElement && !button.disabled;
    },
    undefined,
    { timeout: 5000 },
  );
  await send.click();

  await page.waitForFunction(
    (before) => {
      const messages = Array.from(document.querySelectorAll('[data-testid="assistant-message"]'));
      const latest = document.querySelector('[data-testid="assistant-message"][data-assistant-message-latest="true"]');
      const latestBody = latest?.querySelector('[data-testid="assistant-message-body"]');
      const earlierToggle = Array.from(document.querySelectorAll('button'))
        .map((button) => button.textContent || '')
        .find((text) => /Show earlier messages \(\d+\)/i.test(text));
      const earlierCount = Number(earlierToggle?.match(/\((\d+)\)/)?.[1] || 0);
      const latestId = latest instanceof HTMLElement ? latest.dataset.assistantMessageId || null : null;
      const latestText = latestBody?.textContent || '';

      return messages.length > before.messageCount
        || earlierCount > before.earlierCount
        || (latestId && latestId !== before.latestId)
        || (latestText && latestText !== before.latestText);
    },
    beforeSnapshot,
    { timeout: 30000 },
  );

  const latestMessage = page.locator('[data-testid="assistant-message"][data-assistant-message-latest="true"]');
  await latestMessage.waitFor({ state: 'visible', timeout: 15000 });
  await latestMessage.scrollIntoViewIfNeeded();
  const latestBody = latestMessage.locator('[data-testid="assistant-message-body"]');
  await latestBody.waitFor({ state: 'visible', timeout: 15000 });
  const answer = await latestBody.innerText();
  const box = await latestMessage.boundingBox();
  const viewport = page.viewportSize();

  return {
    answerCharacters: answer.length,
    visibleInViewport: Boolean(box && viewport && box.y < viewport.height && box.y + box.height > 0),
  };
}

async function approveAllVisibleSections(page) {
  const buttons = page.getByRole('button', { name: /^Approved$/ });
  const count = await buttons.count();
  let clicked = 0;

  for (let index = 0; index < count; index += 1) {
    const button = buttons.nth(index);
    if (await button.isVisible().catch(() => false) && await button.isEnabled().catch(() => false)) {
      await button.click();
      clicked += 1;
      await page.waitForTimeout(75);
    }
  }

  return clicked;
}

async function clickFirstVisibleButton(page, name) {
  const buttons = page.getByRole('button', { name });
  const count = await buttons.count();
  for (let index = 0; index < count; index += 1) {
    const button = buttons.nth(index);
    if (await button.isVisible().catch(() => false)) {
      await button.click();
      return;
    }
  }
  throw new Error(`No visible button found for ${name}`);
}

async function getFirstVisibleButtonEnabled(page, name) {
  const buttons = page.getByRole('button', { name });
  const count = await buttons.count();
  for (let index = 0; index < count; index += 1) {
    const button = buttons.nth(index);
    if (await button.isVisible().catch(() => false)) {
      return button.isEnabled();
    }
  }
  throw new Error(`No visible button found for ${name}`);
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
      { sourcePacketRegressionCases },
    ] = await Promise.all([
      import('../lib/ai/source-sections.ts'),
      import('../lib/eval/note-generation/source-packet-regression.ts'),
    ]);

    const item = sourcePacketRegressionCases.find((candidate) => candidate.id === CASE_ID);
    if (!item) {
      throw new Error(`Unknown live note E2E case: ${CASE_ID}`);
    }

    const runId = `E2E-${Date.now()}`;
    const sourceSections = {
      ...item.sourceSections,
      objectiveData: `${item.sourceSections.objectiveData || ''}\n\nNonclinical QA marker: ${runId}. Do not include this marker in the final clinical note.`,
    };
    const sourceInput = buildSourceInputFromSections(sourceSections);

    browser = await chromium.launch({ headless: true });
    const appUrl = new URL(APP_URL);
    const context = await browser.newContext({
      permissions: ['clipboard-read', 'clipboard-write'],
      viewport: { width: 1440, height: 960 },
    });
    await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: appUrl.origin }).catch(() => {});
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
    const consoleErrors = [];
    page.on('console', (message) => {
      if (message.type() === 'error') {
        consoleErrors.push(message.text());
      }
    });
    page.on('pageerror', (error) => {
      consoleErrors.push(error.message);
    });

    await gotoWorkspace(page, APP_URL);

    await selectFirstVisible(page, 'select[aria-label="Select clinical field"]', item.specialty || 'Psychiatry');
    await selectFirstVisible(page, 'select[aria-label="Select provider role"]', item.role || 'Psychiatric NP');
    await selectFirstVisible(page, 'select[aria-label="Select EHR destination"]', item.ehr || 'WellSky');
    await selectFirstVisible(page, 'select[aria-label="Select note type"]', item.noteType);

    await fillSourceField(page, 'source-field-intakeCollateral', sourceSections.intakeCollateral);
    await fillSourceField(page, 'source-field-clinicianNotes', sourceSections.clinicianNotes);
    await fillSourceField(page, 'source-field-patientTranscript', sourceSections.patientTranscript);
    await fillSourceField(page, 'source-field-objectiveData', sourceSections.objectiveData);

    const generateResponsePromise = page.waitForResponse(
      (response) => response.url().includes('/api/generate-note') && response.request().method() === 'POST',
      { timeout: 90000 },
    );
    const draftCreateResponsePromise = page.waitForResponse(
      (response) => response.url().includes('/api/drafts') && response.request().method() === 'POST',
      { timeout: 90000 },
    );
    await clickFirstEnabledGenerate(page);
    const generateResponse = await generateResponsePromise;
    const generatePayload = await generateResponse.json();
    const draftCreateResponse = await draftCreateResponsePromise;
    const draftCreatePayload = await draftCreateResponse.json().catch(() => ({}));

    await page.getByRole('button', { name: 'Back to Compose' }).waitFor({ state: 'visible', timeout: 30000 });
    const generatedNoteCharacters = typeof generatePayload.note === 'string' ? generatePayload.note.length : 0;
    if (!generatedNoteCharacters) {
      throw new Error('Generate note response did not include note text.');
    }

    await openAssistantPanel(page);
    const assistantResult = await askVisibleAssistantTurn(page, 'What should I check before copying this note?');
    if (!assistantResult.answerCharacters || !assistantResult.visibleInViewport) {
      throw new Error('Assistant did not produce a visible workflow answer.');
    }

    const copyEnabledBeforeApproval = await getFirstVisibleButtonEnabled(page, 'Copy Final Note');
    const approvedSectionClicks = await approveAllVisibleSections(page);
    await page.waitForTimeout(500);
    const copyEnabledAfterApproval = await getFirstVisibleButtonEnabled(page, 'Copy Final Note');
    if (copyEnabledBeforeApproval) {
      throw new Error('Copy Final Note was enabled before section review was complete.');
    }
    if (!copyEnabledAfterApproval) {
      throw new Error('Copy Final Note did not enable after section approvals.');
    }

    const saveDraftResponsePromise = page.waitForResponse(
      (response) => response.url().includes('/api/drafts') && response.request().method() === 'POST',
      { timeout: 30000 },
    );
    await clickFirstVisibleButton(page, 'Save Draft');
    const saveDraftResponse = await saveDraftResponsePromise;
    const saveDraftPayload = await saveDraftResponse.json().catch(() => ({}));
    await page.getByText('Draft and section review state saved.').waitFor({ state: 'visible', timeout: 10000 });

    await page.goto(`${appUrl.origin}/dashboard/drafts?fresh=${encodeURIComponent(runId)}`, { waitUntil: 'domcontentloaded' });
    if (page.url().includes('/sign-in')) {
      await signInForQa(page, `${appUrl.origin}/dashboard/drafts?fresh=${encodeURIComponent(runId)}`);
    }
    await page.getByPlaceholder('Search note type, source text, or draft text').waitFor({ state: 'visible', timeout: 30000 });
    await page.getByPlaceholder('Search note type, source text, or draft text').fill(runId);
    await page.waitForTimeout(500);
    const matchingDraftCard = page.locator('.aurora-panel')
      .filter({ hasText: 'Source excerpt' })
      .filter({ has: page.getByRole('button', { name: 'Review in workspace' }) })
      .first();
    await matchingDraftCard.waitFor({ state: 'visible', timeout: 30000 });
    await matchingDraftCard.getByRole('button', { name: 'Review in workspace' }).click();
    await page.waitForURL((url) => url.pathname === '/dashboard/new-note', { timeout: 30000 });
    await page.getByRole('button', { name: 'Copy Final Note' }).first().waitFor({ state: 'visible', timeout: 30000 });

    const reopenedCopyEnabled = await getFirstVisibleButtonEnabled(page, 'Copy Final Note');
    if (!reopenedCopyEnabled) {
      throw new Error('Reopened saved draft did not preserve approved review state.');
    }

    await clickFirstVisibleButton(page, 'Copy Final Note');
    await page.waitForTimeout(300);
    const clipboardText = await page.evaluate(() => navigator.clipboard.readText()).catch(() => '');
    if (!clipboardText || clipboardText.length < 120) {
      throw new Error('Copy Final Note did not place final note text on the clipboard.');
    }

    if (await waitForVisible(page.getByRole('link', { name: 'Open Dedicated Review' }).first(), 3000)) {
      await page.getByRole('link', { name: 'Open Dedicated Review' }).first().click();
    } else {
      await page.goto(`${appUrl.origin}/dashboard/review?fresh=${encodeURIComponent(runId)}`, { waitUntil: 'domcontentloaded' });
    }
    await page.waitForURL((url) => url.pathname === '/dashboard/review', { timeout: 30000 });
    const downloadPromise = page.waitForEvent('download', { timeout: 30000 });
    await page.getByRole('button', { name: 'Export .txt' }).click();
    const download = await downloadPromise;

    const report = {
      generatedAt: new Date().toISOString(),
      appUrl: APP_URL,
      caseId: item.id,
      noteType: item.noteType,
      runId,
      checks: {
        sourceEntered: sourceInput.length > 0,
        generateStatus: generateResponse.status(),
        generatedNoteCharacters,
        draftCreateStatus: draftCreateResponse.status(),
        draftCreateId: draftCreatePayload?.draft?.id || null,
        assistantAnswerCharacters: assistantResult.answerCharacters,
        assistantAnswerVisible: assistantResult.visibleInViewport,
        copyBlockedBeforeApproval: !copyEnabledBeforeApproval,
        approvedSectionClicks,
        copyEnabledAfterApproval,
        saveDraftStatus: saveDraftResponse.status(),
        saveDraftId: saveDraftPayload?.draft?.id || null,
        savedDraftReopened: page.url().includes('/dashboard/review'),
        reopenedCopyEnabled,
        clipboardCharacters: clipboardText.length,
        exportSuggestedFilename: download.suggestedFilename(),
      },
      consoleErrors: consoleErrors
        .filter((message) => !message.includes('data-new-gr-c-s'))
        .slice(0, 20),
    };

    const failedChecks = Object.entries(report.checks)
      .filter(([, value]) => value === false || value === 0 || value === null)
      .map(([key]) => key);
    if (report.checks.generateStatus >= 400 || report.checks.draftCreateStatus >= 400 || report.checks.saveDraftStatus >= 400) {
      failedChecks.push('apiStatus');
    }

    await fs.mkdir(OUTPUT_DIR, { recursive: true });
    const date = new Date().toISOString().slice(0, 10);
    const jsonPath = path.join(OUTPUT_DIR, `live-note-end-to-end-qa-${date}.json`);
    const markdownPath = path.join(OUTPUT_DIR, `live-note-end-to-end-qa-${date}.md`);
    await fs.writeFile(jsonPath, JSON.stringify({ ...report, failedChecks }, null, 2));
    await fs.writeFile(markdownPath, [
      '# Live Note End-to-End QA',
      '',
      `- Generated: ${report.generatedAt}`,
      `- URL: ${APP_URL}`,
      `- Case: ${report.caseId}`,
      `- Result: ${failedChecks.length ? 'fail' : 'pass'}`,
      '',
      '## Checks',
      '',
      ...Object.entries(report.checks).map(([key, value]) => `- ${key}: ${String(value)}`),
      '',
      failedChecks.length ? `Failed checks: ${failedChecks.join(', ')}` : 'No failed checks.',
      '',
    ].join('\n'));

    console.log(JSON.stringify({ ...report, failedChecks }, null, 2));

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
