#!/usr/bin/env node

/**
 * Browser-level QA for the provider-facing assistant panel.
 *
 * Prereqs:
 * - Start the app on http://localhost:3001, preferably with VERANOTE_ALLOW_MOCK_AUTH=true.
 * - Install Playwright in the environment running this script, or use the route-level Vitest fallback:
 *   npx vitest run --silent=true --maxWorkers=1 tests/live-assistant-answer-quality.test.ts
 */

import fs from 'node:fs/promises';
import path from 'node:path';

const APP_URL = process.env.LIVE_ASSISTANT_QA_URL || 'http://localhost:3001/dashboard/new-note';
const AUTH_COOKIE = process.env.LIVE_ASSISTANT_QA_AUTH_COOKIE || 'veranote-provider-token';
const QA_EMAIL = process.env.LIVE_ASSISTANT_QA_EMAIL || 'daniel.hale@veranote-beta.local';
const BANK_ID = process.env.LIVE_ASSISTANT_QA_BANK || 'core';

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

async function waitForVisible(locator, timeout = 2500) {
  try {
    await locator.waitFor({ state: 'visible', timeout });
    return true;
  } catch {
    return false;
  }
}

async function signInForQa(page, appUrl) {
  const accessCode = process.env.LIVE_ASSISTANT_QA_ACCESS_CODE || await readLocalEnvValue('VERANOTE_BETA_ACCESS_CODE');
  if (!accessCode) {
    throw new Error(
      'Live assistant webpage QA reached sign-in and no beta access code was available. '
      + 'Set LIVE_ASSISTANT_QA_ACCESS_CODE or add VERANOTE_BETA_ACCESS_CODE to .env.local.',
    );
  }

  await page.locator('input[type="email"]').first().waitFor({ state: 'visible', timeout: 15000 });
  await page.locator('input[type="password"]').first().waitFor({ state: 'visible', timeout: 15000 });
  await page.locator('input[type="email"]').first().fill(QA_EMAIL);
  await page.locator('input[type="password"]').first().fill(accessCode);
  await page.getByRole('button', { name: /sign in/i }).click();
  await page.waitForURL((url) => !url.pathname.includes('/sign-in'), { timeout: 30000 });
  await page.goto(appUrl, { waitUntil: 'domcontentloaded' });
}

async function openAssistantPanel(page) {
  const input = page.getByTestId('assistant-composer-input');
  if (await waitForVisible(input, 1000)) {
    return;
  }

  const candidates = [
    page.getByTestId('atlas-review-dock-ask-button'),
    page.getByTestId('assistant-open-button'),
    page.getByTestId('workspace-assistant-open-button'),
    page.getByTestId('assistant-expand-button'),
    page.getByRole('button', { name: /^(open|ask)\s+(assistant|atlas|precision)$/i }),
    page.getByRole('button', { name: /^review\s+(draft\s+)?with\s+(assistant|atlas|precision)$/i }),
  ];

  for (const candidate of candidates) {
    const count = await candidate.count().catch(() => 0);
    for (let index = 0; index < count; index += 1) {
      const target = candidate.nth(index);
      if (!(await target.isVisible().catch(() => false))) {
        continue;
      }

      await target.click();
      if (await waitForVisible(input, 5000)) {
        return;
      }
    }
  }

  throw new Error(`Assistant composer did not become visible on ${page.url()}.`);
}

async function main() {
  let chromium;
  try {
    ({ chromium } = await import('playwright'));
  } catch {
    console.error('Playwright is not installed in this workspace. Use the route-level fallback test or install Playwright before running browser QA.');
    process.exit(2);
  }

  const [{ evaluateLiveAssistantAnswer, summarizeLiveAssistantEvaluations }] = await Promise.all([
    import('../lib/eval/live-assistant/evaluate-live-assistant-answer.ts'),
  ]);
  const questionBank = BANK_ID === 'core'
    ? (await import('../lib/eval/live-assistant/live-assistant-question-bank.ts')).LIVE_ASSISTANT_QUESTION_BANK
    : BANK_ID === 'clinician-batch1'
      ? (await import('../lib/eval/live-assistant/clinician-live-assistant-question-bank.ts')).CLINICIAN_LIVE_ASSISTANT_BATCH_1
    : (await import('../lib/eval/live-assistant/staged-live-assistant-question-bank.ts')).getLiveAssistantStagedBatch(BANK_ID);

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

  const page = await context.newPage();
  await page.goto(APP_URL, { waitUntil: 'domcontentloaded' });
  if (page.url().includes('/sign-in')) {
    await signInForQa(page, APP_URL);
  }
  await page.waitForLoadState('networkidle').catch(() => {});
  await openAssistantPanel(page);

  const input = page.getByTestId('assistant-composer-input');
  const send = page.getByTestId('assistant-send-button');
  await input.waitFor({ state: 'visible', timeout: 10000 });

  const results = [];
  for (const testCase of questionBank) {
    const beforeCount = await page.getByTestId('assistant-message').count();
    await input.fill(testCase.question);
    await send.click();
    await page.waitForFunction(
      (count) => document.querySelectorAll('[data-testid="assistant-message"]').length > count,
      beforeCount,
      { timeout: 15000 },
    );
    const latestAnswer = await page
      .locator('[data-testid="assistant-message"][data-assistant-message-latest="true"] [data-testid="assistant-message-body"]')
      .innerText();
    const evaluation = evaluateLiveAssistantAnswer(testCase, latestAnswer);
    results.push({
      ...evaluation,
      question: testCase.question,
      answer: latestAnswer,
    });
  }

  await browser.close();

  const summary = summarizeLiveAssistantEvaluations(results);
  console.log(JSON.stringify({ bankId: BANK_ID, ...summary, results }, null, 2));

  if (summary.failed > 0) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
