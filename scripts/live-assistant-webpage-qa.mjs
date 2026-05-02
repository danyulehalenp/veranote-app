#!/usr/bin/env node

/**
 * Browser-level QA for the provider-facing assistant panel.
 *
 * Prereqs:
 * - Start the app on http://localhost:3001, preferably with VERANOTE_ALLOW_MOCK_AUTH=true.
 * - Install Playwright in the environment running this script, or use the route-level Vitest fallback:
 *   npx vitest run --silent=true --maxWorkers=1 tests/live-assistant-answer-quality.test.ts
 */

const APP_URL = process.env.LIVE_ASSISTANT_QA_URL || 'http://localhost:3001/dashboard/new-note';
const AUTH_COOKIE = process.env.LIVE_ASSISTANT_QA_AUTH_COOKIE || 'veranote-provider-token';
const BANK_ID = process.env.LIVE_ASSISTANT_QA_BANK || 'core';

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
  await page.goto(APP_URL, { waitUntil: 'networkidle' });

  const openButton = page.getByTestId('assistant-open-button');
  if (await openButton.count()) {
    await openButton.click();
  } else if (await page.getByTestId('assistant-expand-button').count()) {
    await page.getByTestId('assistant-expand-button').click();
  }

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
