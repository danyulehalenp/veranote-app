#!/usr/bin/env node

/**
 * Browser-level multi-turn QA for the provider-facing Atlas assistant panel.
 *
 * Prereqs:
 * - Start the app on the target URL, or let this script start a mock-auth Next dev server.
 * - Install Playwright in the environment running this script.
 */

import { spawn } from 'node:child_process';
import http from 'node:http';
import https from 'node:https';
import fs from 'node:fs/promises';
import path from 'node:path';

const APP_URL = process.env.LIVE_ASSISTANT_QA_URL || 'http://localhost:3001/dashboard/new-note?fresh=atlas-live-conversation';
const AUTH_COOKIE = process.env.LIVE_ASSISTANT_QA_AUTH_COOKIE || 'veranote-provider-token';
const QA_EMAIL = process.env.LIVE_ASSISTANT_QA_EMAIL || 'daniel.hale@veranote-beta.local';
const SHOULD_START_SERVER = process.env.LIVE_ASSISTANT_QA_START_SERVER !== '0';
const STRICT = process.env.LIVE_ASSISTANT_QA_STRICT !== '0';
const SCENARIO_ID = process.env.LIVE_ASSISTANT_QA_SCENARIO || 'all';

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

function parseArgs(argv) {
  return argv.reduce((acc, arg) => {
    if (arg.startsWith('--scenario=')) {
      acc.scenarioId = arg.slice('--scenario='.length);
    } else if (arg === '--no-start-server') {
      acc.shouldStartServer = false;
    } else if (arg === '--no-strict') {
      acc.strict = false;
    } else if (arg.startsWith('--url=')) {
      acc.appUrl = arg.slice('--url='.length);
    }
    return acc;
  }, {
    scenarioId: SCENARIO_ID,
    shouldStartServer: SHOULD_START_SERVER,
    strict: STRICT,
    appUrl: APP_URL,
  });
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

async function ensureServer(url, shouldStartServer) {
  if (await requestUrl(url)) {
    return null;
  }

  if (!shouldStartServer) {
    throw new Error(`App is not reachable at ${url}. Start it with npm run dev:test or rerun without --no-start-server.`);
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

function toMarkdown(summary, results) {
  const lines = [
    '# Live Atlas Conversation QA',
    '',
    `- Total scenarios: ${summary.totalScenarios}`,
    `- Passed scenarios: ${summary.passedScenarios}`,
    `- Failed scenarios: ${summary.failedScenarios}`,
    `- Total turns: ${summary.totalTurns}`,
    `- Passed turns: ${summary.passedTurns}`,
    `- Failed turns: ${summary.failedTurns}`,
    '',
    '## Failures',
    '',
  ];

  const failures = results.filter((result) => !result.passed);
  if (!failures.length) {
    lines.push('No failures.');
  } else {
    for (const failure of failures) {
      lines.push(`### ${failure.id}`);
      lines.push('');
      for (const turn of failure.turnResults.filter((result) => !result.passed)) {
        lines.push(`- ${turn.turnId}: ${turn.failureReasons.join('; ')}`);
        lines.push(`  Prompt: ${turn.prompt}`);
        lines.push(`  Answer excerpt: ${turn.answer.slice(0, 260).replace(/\s+/g, ' ')}`);
      }
      lines.push('');
    }
  }

  return `${lines.join('\n')}\n`;
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
  if (await waitForVisible(openButton)) {
    await openButton.click();
    if (await waitForVisible(composerInput, 5000)) {
      return;
    }
    throw new Error('Assistant launcher opened, but the assistant composer did not become visible.');
  }

  const workspaceOpenButton = page.getByTestId('workspace-assistant-open-button');
  if (await waitForVisible(workspaceOpenButton)) {
    await workspaceOpenButton.click();
    if (await waitForVisible(composerInput, 5000)) {
      return;
    }
    throw new Error('Workspace assistant control opened, but the assistant composer did not become visible.');
  }

  const expandButton = page.getByTestId('assistant-expand-button');
  if (await waitForVisible(expandButton)) {
    await expandButton.click();
    if (await waitForVisible(composerInput, 5000)) {
      return;
    }
    throw new Error('Assistant expand control opened, but the assistant composer did not become visible.');
  }

  const fallbackOpenButtons = [
    page.getByRole('button', { name: /^(open|ask)\s+(assistant|atlas|precision)$/i }),
    page.getByRole('button', { name: /^review\s+(draft\s+)?with\s+(assistant|atlas|precision)$/i }),
    page.getByRole('button', { name: /^(assistant|atlas|precision)$/i }),
  ];
  for (const fallbackOpenButton of fallbackOpenButtons) {
    if (await clickFirstVisible(fallbackOpenButton, 700)) {
      if (await waitForVisible(composerInput, 5000)) {
        return;
      }
      throw new Error('Assistant fallback control clicked, but the assistant composer did not become visible.');
    }
  }

  throw new Error(
    `Assistant controls were not found on ${page.url()}. `
    + 'This usually means the page did not finish loading, the selector changed, or auth redirected away from the dashboard.',
  );
}

async function signInForQa(page, appUrl) {
  const accessCode = process.env.LIVE_ASSISTANT_QA_ACCESS_CODE || await readLocalEnvValue('VERANOTE_BETA_ACCESS_CODE');
  if (!accessCode) {
    throw new Error(
      'Live assistant QA reached sign-in and no beta access code was available. '
      + 'Set LIVE_ASSISTANT_QA_ACCESS_CODE or add VERANOTE_BETA_ACCESS_CODE to .env.local.',
    );
  }

  const emailInput = page.locator('input[type="email"]').first();
  const codeInput = page.locator('input[type="password"]').first();
  await emailInput.waitFor({ state: 'visible', timeout: 15000 });
  await codeInput.waitFor({ state: 'visible', timeout: 15000 });
  await emailInput.fill(QA_EMAIL);
  await codeInput.fill(accessCode);
  await page.getByRole('button', { name: /sign in/i }).click();
  await page.waitForURL((url) => !url.pathname.includes('/sign-in'), { timeout: 30000 });
  await page.goto(appUrl, { waitUntil: 'domcontentloaded' });
}

async function gotoWorkspace(page, appUrl) {
  await page.goto(appUrl, { waitUntil: 'domcontentloaded' });

  if (page.url().includes('/sign-in')) {
    await signInForQa(page, appUrl);
  }

  const assistantShellReady = await waitForAnyVisible([
    page.getByTestId('assistant-composer-input'),
    page.getByTestId('atlas-review-dock-ask-button'),
    page.getByTestId('assistant-open-button'),
    page.getByTestId('assistant-expand-button'),
    page.getByTestId('workspace-assistant-open-button'),
  ]);

  if (!assistantShellReady) {
    throw new Error(
      `Assistant entry point did not become visible on ${page.url()}. `
      + 'Expected the composer, review dock Ask control, or legacy assistant launcher.',
    );
  }
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
  try {
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
  } catch (error) {
    const safePrompt = prompt.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48) || 'turn';
    await page.screenshot({
      path: path.resolve('test-results', `live-assistant-timeout-${safePrompt}.png`),
      fullPage: true,
    });
    throw error;
  }

  const latestMessage = page.locator('[data-testid="assistant-message"][data-assistant-message-latest="true"]');
  await latestMessage.waitFor({ state: 'visible', timeout: 15000 });
  await latestMessage.scrollIntoViewIfNeeded();

  const latestBody = latestMessage.locator('[data-testid="assistant-message-body"]');
  await latestBody.waitFor({ state: 'visible', timeout: 15000 });
  const answer = await latestBody.innerText();
  const box = await latestMessage.boundingBox();
  const viewport = page.viewportSize();
  const visibleInViewport = Boolean(
    box
    && viewport
    && box.y < viewport.height
    && box.y + box.height > 0
  );

  return {
    prompt,
    answer,
    visibleInViewport,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const appUrl = args.appUrl;
  let chromium;
  try {
    ({ chromium } = await import('playwright'));
  } catch {
    console.error('Playwright is not installed in this workspace. Install it before running browser conversation QA, or run npm run atlas:live-conversation:route for the route-level fallback.');
    process.exit(2);
  }

  const [
    { LIVE_ASSISTANT_CONVERSATION_BANK },
    {
      evaluateLiveAssistantConversation,
      summarizeLiveAssistantConversationResults,
    },
  ] = await Promise.all([
    import('../lib/eval/live-assistant/live-assistant-conversation-bank.ts'),
    import('../lib/eval/live-assistant/evaluate-live-assistant-conversation.ts'),
  ]);

  const scenarios = args.scenarioId === 'all'
    ? LIVE_ASSISTANT_CONVERSATION_BANK
    : LIVE_ASSISTANT_CONVERSATION_BANK.filter((scenario) => scenario.id === args.scenarioId);
  if (!scenarios.length) {
    throw new Error(`Unknown live assistant conversation scenario: ${args.scenarioId}`);
  }

  const serverProcess = await ensureServer(appUrl, args.shouldStartServer);
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 940 },
  });
  const url = new URL(appUrl);
  await context.addCookies([{
    name: 'veranote-auth',
    value: AUTH_COOKIE,
    domain: url.hostname,
    path: '/',
    httpOnly: false,
    sameSite: 'Lax',
  }]);

  const results = [];
  try {
    for (const scenario of scenarios) {
      const page = await context.newPage();
      await gotoWorkspace(page, appUrl);
      await openAssistantPanel(page);

      const turns = [];
      for (const turn of scenario.turns) {
        const result = await askVisibleAssistantTurn(page, turn.prompt);
        turns.push(result);
      }

      const evaluated = evaluateLiveAssistantConversation(scenario, turns, { checkMetadata: false });
      for (const turnResult of evaluated.turnResults) {
        const visibleTurn = turns.find((turn) => turn.prompt === turnResult.prompt);
        if (!visibleTurn?.visibleInViewport) {
          turnResult.passed = false;
          turnResult.failureReasons.push('latest assistant answer was not visible in the panel viewport after scroll');
        }
      }
      evaluated.passed = evaluated.turnResults.every((turn) => turn.passed);
      results.push(evaluated);
      await page.close();
    }
  } finally {
    await browser.close();
    serverProcess?.kill('SIGTERM');
  }

  const summary = summarizeLiveAssistantConversationResults(results);
  const date = new Date().toISOString().slice(0, 10);
  const outputDir = path.resolve('test-results');
  await fs.mkdir(outputDir, { recursive: true });
  const jsonPath = path.join(outputDir, `live-assistant-conversation-ui-${date}.json`);
  const markdownPath = path.join(outputDir, `live-assistant-conversation-ui-${date}.md`);
  await fs.writeFile(jsonPath, JSON.stringify({ summary, results }, null, 2));
  await fs.writeFile(markdownPath, toMarkdown(summary, results));

  console.log(JSON.stringify({
    ...summary,
    jsonPath,
    markdownPath,
    failures: summary.failures.slice(0, 10),
  }, null, 2));

  if (args.strict && summary.failedTurns > 0) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
