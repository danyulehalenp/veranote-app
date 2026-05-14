#!/usr/bin/env node

/**
 * Browser-level QA for Assistant draft rewrite behavior.
 *
 * This validates the actual panel path:
 * - active draft context reaches the assistant
 * - a provider rewrite command gets chart-ready wording
 * - the Apply to Draft action publishes usable rewritten draft text
 */

import { spawn } from 'node:child_process';
import http from 'node:http';
import https from 'node:https';
import fs from 'node:fs/promises';
import path from 'node:path';

const APP_URL = process.env.LIVE_ASSISTANT_DRAFT_REWRITE_URL || 'http://localhost:3001/dashboard/new-note?fresh=assistant-draft-rewrite-live';
const AUTH_COOKIE = process.env.LIVE_ASSISTANT_QA_AUTH_COOKIE || 'veranote-provider-token';
const QA_EMAIL = process.env.LIVE_ASSISTANT_QA_EMAIL || 'daniel.hale@veranote-beta.local';
const SHOULD_START_SERVER = process.env.LIVE_ASSISTANT_QA_START_SERVER !== '0';
const IGNORE_HTTPS_ERRORS = process.env.LIVE_ASSISTANT_QA_IGNORE_HTTPS_ERRORS === '1'
  || process.env.VERANOTE_LIVE_IGNORE_HTTPS_ERRORS === '1';

const ACTIVE_DRAFT = [
  'HPI:',
  'Patient reports panic is less intense but still leaves the grocery store when it becomes crowded. Patient reports sleep of about 5 hours and forgot escitalopram twice this week.',
  '',
  'Mental Status Exam:',
  'Casually dressed, cooperative, speech normal rate, mood stressed, affect anxious, thought process goal directed, no psychosis observed.',
  '',
  'Assessment:',
  'Anxiety symptoms appear partially improved, with ongoing avoidance and medication adherence concerns.',
  '',
  'Plan:',
  'Therapy referral is being considered. No final medication change is documented in the visible draft.',
].join('\n');

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

    const rawValue = line.slice(line.indexOf('=') + 1).trim();
    return rawValue.replace(/^['"]|['"]$/g, '') || null;
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

async function waitForUrl(url, timeoutMs = 45000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await requestUrl(url)) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  return false;
}

async function ensureServer(url) {
  if (await requestUrl(url)) {
    return null;
  }

  if (!SHOULD_START_SERVER) {
    throw new Error(`App is not reachable at ${url}. Start it with npm run dev:test or unset LIVE_ASSISTANT_QA_START_SERVER=0.`);
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
  const accessCode = process.env.LIVE_ASSISTANT_QA_ACCESS_CODE || await readLocalEnvValue('VERANOTE_BETA_ACCESS_CODE');
  if (!accessCode) {
    throw new Error('Live assistant draft rewrite QA reached sign-in and no beta access code was available.');
  }

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

  const ready = await waitForAnyVisible([
    page.getByTestId('assistant-composer-input'),
    page.getByTestId('atlas-review-dock-ask-button'),
    page.getByTestId('assistant-open-button'),
    page.getByTestId('assistant-expand-button'),
    page.getByTestId('workspace-assistant-open-button'),
  ]);
  if (!ready) {
    throw new Error(`Assistant entry point did not become visible on ${page.url()}.`);
  }
}

async function openAssistantPanel(page) {
  const composerInput = page.getByTestId('assistant-composer-input');
  if (await waitForVisible(composerInput, 1000)) {
    return;
  }

  const controls = [
    page.getByTestId('atlas-review-dock-ask-button'),
    page.getByTestId('assistant-open-button'),
    page.getByTestId('workspace-assistant-open-button'),
    page.getByTestId('assistant-expand-button'),
    page.getByRole('button', { name: /^(open|ask)\s+(assistant|atlas|precision)$/i }),
    page.getByRole('button', { name: /^review\s+(draft\s+)?with\s+(assistant|atlas|precision)$/i }),
  ];

  for (const control of controls) {
    if (await clickFirstVisible(control, 800)) {
      if (await waitForVisible(composerInput, 5000)) {
        return;
      }
    }
  }

  throw new Error('Unable to open assistant panel for draft rewrite QA.');
}

async function publishDraftContext(page, draftText = ACTIVE_DRAFT, overrides = {}) {
  await page.evaluate(({ text, contextOverrides }) => {
    window.dispatchEvent(new CustomEvent('veranote-assistant-context', {
      detail: {
        stage: 'review',
        userAiName: 'Assistant',
        userAiRole: 'Clinical Assistant',
        noteType: 'Outpatient Psych Follow-Up',
        specialty: 'Psychiatry',
        outputDestination: 'Tebra/Kareo',
        currentDraftText: text,
        currentDraftWordCount: text.split(/\s+/).filter(Boolean).length,
        currentDraftSectionHeadings: ['HPI', 'Mental Status Exam', 'Assessment', 'Plan'],
        ...contextOverrides,
      },
    }));
  }, { text: draftText, contextOverrides: overrides });
}

async function installActionCapture(page) {
  await page.evaluate(() => {
    window.__veranoteDraftRewriteActions = [];
    window.addEventListener('veranote-assistant-action', (event) => {
      window.__veranoteDraftRewriteActions.push(event.detail);
    });
  });
}

async function askAssistant(page, prompt) {
  const input = page.getByTestId('assistant-composer-input');
  const send = page.getByTestId('assistant-send-button');
  await input.waitFor({ state: 'visible', timeout: 15000 });
  await send.waitFor({ state: 'visible', timeout: 15000 });
  const beforeText = await page.locator('[data-testid="assistant-message"][data-assistant-message-latest="true"] [data-testid="assistant-message-body"]').innerText().catch(() => '');
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
    (previous) => {
      const latest = document.querySelector('[data-testid="assistant-message"][data-assistant-message-latest="true"] [data-testid="assistant-message-body"]');
      const text = latest?.textContent || '';
      return text && text !== previous;
    },
    beforeText,
    { timeout: 30000 },
  );
  const latest = page.locator('[data-testid="assistant-message"][data-assistant-message-latest="true"]');
  await latest.scrollIntoViewIfNeeded();
  return latest.locator('[data-testid="assistant-message-body"]').innerText();
}

function assertIncludes(text, pattern, label) {
  if (!pattern.test(text)) {
    throw new Error(`${label} missing. Expected ${pattern}; received: ${text.slice(0, 500)}`);
  }
}

function assertNotIncludes(text, pattern, label) {
  if (pattern.test(text)) {
    throw new Error(`${label} should not appear. Pattern ${pattern}; received: ${text.slice(0, 500)}`);
  }
}

async function clickLatestApplyToDraft(page) {
  const beforeCount = await page.evaluate(() => window.__veranoteDraftRewriteActions?.length || 0);
  const actionToggle = page.getByRole('button', { name: /^Actions \(\d+\)$/i });
  if (await waitForVisible(actionToggle, 2500)) {
    await actionToggle.click();
  }
  const buttons = page.getByRole('button', { name: /^Apply to Draft$/i });
  await buttons.last().waitFor({ state: 'visible', timeout: 15000 });
  await buttons.last().click();
  await page.waitForFunction(
    (count) => (window.__veranoteDraftRewriteActions?.length || 0) > count,
    beforeCount,
    { timeout: 5000 },
  );
  return page.evaluate(() => window.__veranoteDraftRewriteActions.at(-1));
}

async function main() {
  let chromium;
  try {
    ({ chromium } = await import('playwright'));
  } catch {
    console.error('Playwright is not installed. Run npm install or use route-level tests.');
    process.exit(2);
  }

  const serverProcess = await ensureServer(APP_URL);
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    ignoreHTTPSErrors: IGNORE_HTTPS_ERRORS,
    viewport: { width: 1440, height: 940 },
  });
  const appUrl = new URL(APP_URL);
  await context.addCookies([{
    name: 'veranote-auth',
    value: AUTH_COOKIE,
    domain: appUrl.hostname,
    path: '/',
    httpOnly: false,
    sameSite: 'Lax',
  }]);

  const page = await context.newPage();
  const results = [];

  try {
    await gotoWorkspace(page, APP_URL);
    await openAssistantPanel(page);
    await installActionCapture(page);

    await publishDraftContext(page);
    const oneParagraphAnswer = await askAssistant(page, 'make this into one paragraph without adding new facts');
    assertIncludes(oneParagraphAnswer, /one-paragraph format/i, 'one-paragraph format label');
    assertIncludes(oneParagraphAnswer, /forgot escitalopram twice/i, 'medication adherence fact');
    assertIncludes(oneParagraphAnswer, /therapy referral/i, 'plan fact');
    assertNotIncludes(oneParagraphAnswer, /safe Veranote answer|Get the source in cleanly|What should I focus on/i, 'workflow fallback');
    const oneParagraphAction = await clickLatestApplyToDraft(page);
    if (oneParagraphAction?.type !== 'apply-draft-rewrite') {
      throw new Error(`Expected apply-draft-rewrite action, received ${JSON.stringify(oneParagraphAction)}`);
    }
    assertIncludes(oneParagraphAction.draftText || '', /forgot escitalopram twice/i, 'one-paragraph action draft text');
    assertNotIncludes(oneParagraphAction.draftText || '', /\n\nPlan:/, 'section break in one-paragraph action');
    results.push({ step: 'one-paragraph', passed: true });

    await publishDraftContext(page);
    const shorterAnswer = await askAssistant(page, 'now make it shorter and concise but keep what matters');
    assertIncludes(shorterAnswer, /shorter concise format/i, 'shorter concise label');
    assertIncludes(shorterAnswer, /forgot escitalopram twice/i, 'shorter med adherence fact');
    assertIncludes(shorterAnswer, /therapy referral/i, 'shorter plan fact');
    const shorterAction = await clickLatestApplyToDraft(page);
    if ((shorterAction?.draftText || '').length >= ACTIVE_DRAFT.length) {
      throw new Error('Shorter action draft text was not shorter than the active draft.');
    }
    results.push({ step: 'shorter', passed: true });

    await publishDraftContext(page);
    const storyAnswer = await askAssistant(page, 'make this follow up note flow like a narritive story but do not add facts');
    assertIncludes(storyAnswer, /narrative story-flow format/i, 'narrative story-flow label');
    assertIncludes(storyAnswer, /forgot escitalopram twice/i, 'story med adherence fact');
    assertNotIncludes(storyAnswer, /safe Veranote answer|Get the source in cleanly|What should I focus on/i, 'story workflow fallback');
    const storyAction = await clickLatestApplyToDraft(page);
    if (storyAction?.rewriteLabel !== 'narrative story-flow format') {
      throw new Error(`Expected narrative story-flow rewrite label, received ${storyAction?.rewriteLabel}`);
    }
    assertNotIncludes(storyAction.draftText || '', /^HPI:/m, 'section heading in narrative story action');
    assertIncludes(storyAction.draftText || '', /forgot escitalopram twice/i, 'story action med adherence fact');
    results.push({ step: 'narrative-story-flow', passed: true });

    await publishDraftContext(page);
    const twoParagraphAnswer = await askAssistant(page, 'put HPI in the frist para and MSE/pln in the secnd pargraph');
    assertIncludes(twoParagraphAnswer, /two-paragraph HPI\/MSE\/Plan format/i, 'typo-heavy two-paragraph label');
    assertIncludes(twoParagraphAnswer, /forgot escitalopram twice/i, 'two-paragraph med adherence fact');
    const twoParagraphAction = await clickLatestApplyToDraft(page);
    if (twoParagraphAction?.rewriteLabel !== 'two-paragraph HPI/MSE/Plan format') {
      throw new Error(`Expected two-paragraph HPI/MSE/Plan rewrite label, received ${twoParagraphAction?.rewriteLabel}`);
    }
    if (((twoParagraphAction?.draftText || '').match(/\n\s*\n/g) || []).length !== 1) {
      throw new Error(`Expected exactly two paragraphs for typo-heavy two-paragraph action, received: ${twoParagraphAction?.draftText}`);
    }
    assertIncludes(twoParagraphAction.draftText || '', /forgot escitalopram twice/i, 'two-paragraph action med adherence fact');
    assertIncludes(twoParagraphAction.draftText || '', /therapy referral/i, 'two-paragraph action plan fact');
    results.push({ step: 'typo-heavy-two-paragraph', passed: true });

    await publishDraftContext(page, ACTIVE_DRAFT, { outputDestination: 'WellSky' });
    const ehrAnswer = await askAssistant(page, 'Make this draft EHR-ready for WellSky copy paste.');
    assertIncludes(ehrAnswer, /EHR-ready copy\/paste format/i, 'EHR-ready copy/paste label');
    assertIncludes(ehrAnswer, /forgot escitalopram twice/i, 'EHR med adherence fact');
    const ehrAction = await clickLatestApplyToDraft(page);
    if (ehrAction?.rewriteLabel !== 'EHR-ready copy/paste format') {
      throw new Error(`Expected EHR-ready rewrite label, received ${ehrAction?.rewriteLabel}`);
    }
    assertIncludes(ehrAction.draftText || '', /HPI:\nPatient reports/i, 'EHR HPI heading and body');
    assertIncludes(ehrAction.draftText || '', /Plan:\nTherapy referral/i, 'EHR plan heading and body');
    assertNotIncludes(ehrAction.draftText || '', /Provider Add-On|QA live prompt|Nonclinical QA/i, 'EHR nonclinical prompt leakage');
    results.push({ step: 'wellsky-ehr-ready', passed: true });

    const outputDir = path.resolve('test-results');
    await fs.mkdir(outputDir, { recursive: true });
    const date = new Date().toISOString().slice(0, 10);
    const screenshotPath = path.join(outputDir, `live-assistant-draft-rewrite-${date}.png`);
    const jsonPath = path.join(outputDir, `live-assistant-draft-rewrite-${date}.json`);
    await page.screenshot({ path: screenshotPath, fullPage: true });
    await fs.writeFile(jsonPath, JSON.stringify({
      appUrl: APP_URL,
      results,
      oneParagraphAction: {
        type: oneParagraphAction.type,
        rewriteLabel: oneParagraphAction.rewriteLabel,
        draftTextLength: oneParagraphAction.draftText?.length || 0,
      },
      shorterAction: {
        type: shorterAction.type,
        rewriteLabel: shorterAction.rewriteLabel,
        draftTextLength: shorterAction.draftText?.length || 0,
      },
      storyAction: {
        type: storyAction.type,
        rewriteLabel: storyAction.rewriteLabel,
        draftTextLength: storyAction.draftText?.length || 0,
      },
      twoParagraphAction: {
        type: twoParagraphAction.type,
        rewriteLabel: twoParagraphAction.rewriteLabel,
        draftTextLength: twoParagraphAction.draftText?.length || 0,
      },
      ehrAction: {
        type: ehrAction.type,
        rewriteLabel: ehrAction.rewriteLabel,
        draftTextLength: ehrAction.draftText?.length || 0,
      },
      screenshotPath,
    }, null, 2));

    console.log(JSON.stringify({
      passed: true,
      results,
      jsonPath,
      screenshotPath,
    }, null, 2));
  } finally {
    await browser.close();
    serverProcess?.kill('SIGTERM');
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
