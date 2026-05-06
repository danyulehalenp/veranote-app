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
const EXPECTED_GENERATION_MODE = process.env.LIVE_NOTE_E2E_EXPECT_GENERATION_MODE || process.env.LIVE_NOTE_EXPECT_GENERATION_MODE || '';
const ALLOW_OPENAI_NOT_APPROVED_FALLBACK = process.env.LIVE_NOTE_E2E_ALLOW_APPROVAL_FALLBACK === '1'
  || process.env.LIVE_NOTE_ALLOW_APPROVAL_FALLBACK === '1';

function getGenerationModeIssue(meta) {
  const mode = meta?.pathUsed === 'live' ? 'live' : 'fallback';
  const reason = meta?.reason || 'unknown';

  if (EXPECTED_GENERATION_MODE && mode !== EXPECTED_GENERATION_MODE) {
    return `expected generation mode ${EXPECTED_GENERATION_MODE} but got ${mode}:${reason}`;
  }

  if (!ALLOW_OPENAI_NOT_APPROVED_FALLBACK && reason === 'openai_not_approved') {
    return 'live generation was disabled by approval guard; restart the dev server with VERANOTE_ALLOW_OPENAI=1 or VERANOTE_AI_PROVIDER=openai';
  }

  return '';
}

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

async function openMyNotePromptPanel(page) {
  const promptPanel = page.getByTestId('my-note-prompt-panel');
  if (await waitForVisible(promptPanel, 1000)) {
    return promptPanel;
  }

  const promptButton = await waitForAnyVisible([
    page.getByRole('button', { name: /My Note Prompt/i }),
  ], 5000);
  if (!promptButton) {
    throw new Error('My Note Prompt navigation control was not visible.');
  }

  await promptButton.click();
  await promptPanel.waitFor({ state: 'visible', timeout: 15000 });
  return promptPanel;
}

async function openSourcePacketLane(page) {
  const sourceField = page.locator('#source-field-intakeCollateral textarea');
  if (await waitForVisible(sourceField, 1000)) {
    return;
  }

  const sourcePacketButton = await waitForAnyVisible([
    page.getByRole('button', { name: /Source Packet/i }),
    page.getByRole('button', { name: /Paste Source/i }),
  ], 5000);
  if (!sourcePacketButton) {
    throw new Error('Source Packet navigation control was not visible after prompt setup.');
  }

  await sourcePacketButton.click();
  await sourceField.waitFor({ state: 'visible', timeout: 15000 });
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

async function getVisibleCopyFinalNoteButton(page, timeout = 5000) {
  return waitForAnyVisible([
    page.getByRole('button', { name: /^Copy Final Note/i }),
  ], timeout);
}

function summarizeReviewStatuses(sectionReviewState) {
  return Object.values(sectionReviewState || {}).reduce((counts, entry) => {
    const status = entry?.status || 'missing';
    counts[status] = (counts[status] || 0) + 1;
    return counts;
  }, {});
}

async function readVisibleDraftSessionReviewSummary(page) {
  return page.evaluate(() => {
    return Object.keys(window.localStorage)
      .filter((key) => key.startsWith('clinical-documentation-transformer:draft-session:'))
      .map((key) => {
        try {
          const parsed = JSON.parse(window.localStorage.getItem(key) || '{}');
          const statuses = Object.values(parsed.sectionReviewState || {}).reduce((counts, entry) => {
            const status = entry?.status || 'missing';
            counts[status] = (counts[status] || 0) + 1;
            return counts;
          }, {});

          return {
            key,
            draftId: parsed.id || parsed.draftId || null,
            noteType: parsed.noteType || null,
            statuses,
          };
        } catch {
          return { key, error: 'unreadable' };
        }
      });
  }).catch(() => []);
}

async function openDedicatedReviewForReopenedDraft(page, appUrl, runId) {
  const dedicatedReviewLink = page.getByRole('link', { name: 'Open Dedicated Review' }).first();

  if (await waitForVisible(dedicatedReviewLink, 3000)) {
    await dedicatedReviewLink.click();
  } else {
    await page.goto(`${appUrl.origin}/dashboard/review?fresh=${encodeURIComponent(runId)}`, { waitUntil: 'domcontentloaded' });
  }

  await page.waitForURL((url) => url.pathname === '/dashboard/review', { timeout: 30000 });
}

async function copyFinalNoteFromCurrentReview(page) {
  const copyButton = await getVisibleCopyFinalNoteButton(page, 30000);
  if (!copyButton) {
    const bodyExcerpt = await page.locator('body').innerText().then((text) => text.slice(0, 1600)).catch(() => '');
    throw new Error([
      `Copy Final Note was not visible after reopening the saved draft on ${page.url()}.`,
      `Body excerpt: ${bodyExcerpt}`,
    ].join('\n'));
  }

  const copyEnabled = await copyButton.isEnabled();
  if (!copyEnabled) {
    throw new Error('Reopened saved draft did not preserve approved review state.');
  }

  await copyButton.click();
  return true;
}

async function openSavedDraftForReview(page, appUrl, runId, draftId) {
  await page.goto(`${appUrl.origin}/dashboard/drafts?fresh=${encodeURIComponent(runId)}`, { waitUntil: 'domcontentloaded' });
  if (page.url().includes('/sign-in')) {
    await signInForQa(page, `${appUrl.origin}/dashboard/drafts?fresh=${encodeURIComponent(runId)}`);
  }

  await page.getByPlaceholder('Search note type, source text, or draft text').waitFor({ state: 'visible', timeout: 30000 });
  await page.getByPlaceholder('Search note type, source text, or draft text').fill(runId);
  await page.waitForTimeout(500);

  if (draftId) {
    const targetDraftCard = page.locator(`[data-testid="saved-draft-card"][data-draft-id="${draftId}"]`);
    if (await waitForVisible(targetDraftCard, 10000)) {
      const targetReviewButton = await waitForAnyVisible([
        targetDraftCard.getByRole('button', { name: 'Review in workspace' }),
      ], 5000);

      if (targetReviewButton) {
        await targetReviewButton.click();
        await page.waitForURL((url) => url.pathname === '/dashboard/new-note', { timeout: 30000 });
        return 'saved-drafts-list';
      }
    }
  }

  const reviewButton = await waitForAnyVisible([
    page.getByRole('button', { name: 'Review in workspace' }),
  ], 10000);

  if (reviewButton) {
    await reviewButton.click();
    await page.waitForURL((url) => url.pathname === '/dashboard/new-note', { timeout: 30000 });
    return 'saved-drafts-list';
  }

  if (!draftId) {
    const bodyExcerpt = await page.locator('body').innerText().then((text) => text.slice(0, 1600)).catch(() => '');
    throw new Error([
      `Saved draft with marker ${runId} was not visible in the drafts list and no draft ID fallback was available.`,
      `Body excerpt: ${bodyExcerpt}`,
    ].join('\n'));
  }

  await page.goto(`${appUrl.origin}/dashboard/new-note?draftId=${encodeURIComponent(draftId)}#workspace`, { waitUntil: 'domcontentloaded' });
  if (page.url().includes('/sign-in')) {
    await signInForQa(page, `${appUrl.origin}/dashboard/new-note?draftId=${encodeURIComponent(draftId)}#workspace`);
  }
  await page.waitForURL((url) => url.pathname === '/dashboard/new-note', { timeout: 30000 });
  return 'direct-draft-url';
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
    const promptName = `QA reusable prompt ${runId}`;
    const promptInstruction = `QA live prompt instruction ${runId}: keep the note concise and never quote this QA prompt text in the clinical note.`;
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

    const promptPanel = await openMyNotePromptPanel(page);
    const promptPanelPresent = await promptPanel.count().then((count) => count > 0).catch(() => false);
    if (!promptPanelPresent) {
      throw new Error('My Note Prompt panel was not present in the note workspace.');
    }

    const promptNameInput = page.getByTestId('provider-prompt-name-input');
    const promptInstructionsTextarea = page.getByTestId('provider-prompt-instructions-textarea');
    await promptNameInput.scrollIntoViewIfNeeded();
    await promptNameInput.fill(promptName);
    await promptInstructionsTextarea.fill(promptInstruction);

    await openSourcePacketLane(page);

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
    const generationMode = generatePayload.generationMeta?.pathUsed === 'live' ? 'live' : 'fallback';
    const generationReason = generatePayload.generationMeta?.reason || 'browser-ui';
    const generationModeIssue = getGenerationModeIssue(generatePayload.generationMeta);
    const draftCreateResponse = await draftCreateResponsePromise;
    const draftCreatePayload = await draftCreateResponse.json().catch(() => ({}));

    await page.getByRole('button', { name: 'Back to Compose' }).waitFor({ state: 'visible', timeout: 30000 });
    const generatedNoteCharacters = typeof generatePayload.note === 'string' ? generatePayload.note.length : 0;
    if (!generatedNoteCharacters) {
      throw new Error('Generate note response did not include note text.');
    }

    const postNoteCptPanelVisible = await waitForVisible(page.getByTestId('post-note-cpt-support-panel'), 10000);
    const postNoteCptPanelText = postNoteCptPanelVisible
      ? await page.getByTestId('post-note-cpt-support-panel').innerText()
      : '';
    if (!postNoteCptPanelVisible || !/CPT support candidates|Coding support only/i.test(postNoteCptPanelText)) {
      throw new Error('Post-note CPT support panel did not render in the review workflow after draft generation.');
    }
    const postNoteCptGuardrailVisible = await waitForVisible(page.getByTestId('post-note-cpt-guardrail'), 5000);
    const postNoteCptGuardrailText = postNoteCptGuardrailVisible
      ? await page.getByTestId('post-note-cpt-guardrail').first().innerText()
      : '';
    if (!postNoteCptGuardrailVisible || !/not final billing advice|do not add facts/i.test(postNoteCptGuardrailText)) {
      throw new Error('Post-note CPT support guardrail did not render with conservative billing language.');
    }
    const postNoteCptCandidateVisible = await waitForVisible(page.getByTestId('post-note-cpt-candidate-card').first(), 5000);
    const postNoteCptCandidateText = postNoteCptCandidateVisible
      ? await page.getByTestId('post-note-cpt-candidate-card').first().innerText()
      : '';
    if (!postNoteCptCandidateVisible || !/family|E\/M|psychotherapy|diagnostic evaluation|telehealth|interactive complexity/i.test(postNoteCptCandidateText)) {
      throw new Error('Post-note CPT support did not show a visible candidate-family card.');
    }
    if (!/What to verify|Verify payer|current CPT|requirements/i.test(postNoteCptCandidateText)) {
      throw new Error('Post-note CPT support candidate did not show a visible verification cue.');
    }
    if (!/possible review|stronger documentation support|insufficient support/i.test(postNoteCptCandidateText)) {
      throw new Error('Post-note CPT support candidate did not show a conservative support-strength badge.');
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
    const savedDraftId = saveDraftPayload?.draft?.id || draftCreatePayload?.draft?.id || null;
    await page.getByText('Draft and section review state saved.').waitFor({ state: 'visible', timeout: 10000 });

    const reopenMethod = await openSavedDraftForReview(page, appUrl, runId, savedDraftId);

    const workspaceReopened = page.url().includes('/dashboard/new-note');
    let copySurface = 'workspace';
    let copyButton = await getVisibleCopyFinalNoteButton(page, 5000);
    if (!copyButton) {
      copySurface = 'dedicated-review';
      await openDedicatedReviewForReopenedDraft(page, appUrl, runId);
      copyButton = await getVisibleCopyFinalNoteButton(page, 30000);
    }

    const reopenedCopyEnabled = Boolean(copyButton && await copyButton.isEnabled());
    if (!reopenedCopyEnabled) {
      const reopenedReviewSummary = await readVisibleDraftSessionReviewSummary(page);
      throw new Error([
        'Reopened saved draft did not preserve approved review state.',
        `Saved draft ID: ${savedDraftId || 'unknown'}.`,
        `Saved response review statuses: ${JSON.stringify(summarizeReviewStatuses(saveDraftPayload?.draft?.sectionReviewState))}.`,
        `Visible local draft review statuses: ${JSON.stringify(reopenedReviewSummary)}.`,
        `URL: ${page.url()}.`,
      ].join('\n'));
    }

    await copyFinalNoteFromCurrentReview(page);
    await page.waitForTimeout(300);
    const clipboardText = await page.evaluate(() => navigator.clipboard.readText()).catch(() => '');
    if (!clipboardText || clipboardText.length < 120) {
      throw new Error('Copy Final Note did not place final note text on the clipboard.');
    }
    if (clipboardText.includes(runId) || clipboardText.includes(promptName) || clipboardText.includes('QA live prompt instruction')) {
      throw new Error('Final copied note leaked nonclinical QA marker or provider prompt text.');
    }

    if (!page.url().includes('/dashboard/review')) {
      await openDedicatedReviewForReopenedDraft(page, appUrl, runId);
    }
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
        generationMode,
        generationReason,
        generationModeGuard: generationModeIssue || 'none',
        generatedNoteCharacters,
        promptPanelPresent,
        providerPromptInstructionEntered: true,
        draftCreateStatus: draftCreateResponse.status(),
        draftCreateId: draftCreatePayload?.draft?.id || null,
        postNoteCptPanelVisible,
        postNoteCptPanelCharacters: postNoteCptPanelText.length,
        postNoteCptGuardrailVisible,
        assistantAnswerCharacters: assistantResult.answerCharacters,
        assistantAnswerVisible: assistantResult.visibleInViewport,
        copyBlockedBeforeApproval: !copyEnabledBeforeApproval,
        approvedSectionClicks,
        copyEnabledAfterApproval,
        saveDraftStatus: saveDraftResponse.status(),
        saveDraftId: saveDraftPayload?.draft?.id || null,
        reopenMethod,
        savedDraftReopened: workspaceReopened,
        reopenCopySurface: copySurface,
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
    if (generationModeIssue) {
      failedChecks.push('generationModeGuard');
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
