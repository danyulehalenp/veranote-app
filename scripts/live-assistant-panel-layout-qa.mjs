#!/usr/bin/env node

/**
 * Browser-level QA for the floating assistant panel.
 *
 * Verifies the provider-facing affordances that are easy to regress visually:
 * - open/minimize/expand all work
 * - the panel can be dragged around a desktop viewport
 * - resized dimensions persist after reload
 * - the minimized dock can be moved and reopened
 */

import fs from 'node:fs/promises';
import http from 'node:http';
import https from 'node:https';
import path from 'node:path';

const APP_URL = process.env.LIVE_ASSISTANT_PANEL_URL || 'http://localhost:3001/dashboard/new-note?fresh=assistant-panel-layout-qa';
const AUTH_COOKIE = process.env.LIVE_ASSISTANT_PANEL_AUTH_COOKIE || 'veranote-provider-token';
const QA_EMAIL = process.env.LIVE_ASSISTANT_PANEL_QA_EMAIL || 'daniel.hale@veranote-beta.local';
const OUTPUT_DIR = process.env.LIVE_ASSISTANT_PANEL_OUTPUT_DIR || 'test-results';
const TEST_PROVIDER_ID = 'provider-assistant-panel-qa';

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
      response.on('end', () => resolve({ ok: response.statusCode >= 200 && response.statusCode < 500, statusCode: response.statusCode }));
    });
    request.on('error', () => resolve({ ok: false, statusCode: 0 }));
    request.setTimeout(8000, () => {
      request.destroy();
      resolve({ ok: false, statusCode: 0 });
    });
  });
}

function assertState(condition, message, failures) {
  if (!condition) {
    failures.push(message);
  }
}

function distance(a, b) {
  return Math.abs(a - b);
}

async function getBox(locator) {
  return locator.evaluate((node) => {
    const rect = node.getBoundingClientRect();
    return {
      x: Math.round(rect.x),
      y: Math.round(rect.y),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
    };
  });
}

async function waitForVisible(locator, timeout = 2500) {
  await locator.waitFor({ state: 'visible', timeout });
  return true;
}

async function gotoWorkspace(page) {
  await page.goto(APP_URL, { waitUntil: 'domcontentloaded' });

  if (page.url().includes('/sign-in')) {
    const accessCode = await readLocalEnvValue('VERANOTE_BETA_ACCESS_CODE');
    if (!accessCode) {
      throw new Error('Production assistant panel QA reached sign-in and VERANOTE_BETA_ACCESS_CODE was not available.');
    }
    await page.locator('input[type="email"]').first().fill(QA_EMAIL);
    await page.locator('input[type="password"]').first().fill(accessCode);
    await page.getByRole('button', { name: /sign in/i }).click();
    await page.waitForURL((url) => !url.pathname.includes('/sign-in'), { timeout: 30000 });
    await page.goto(APP_URL, { waitUntil: 'domcontentloaded' });
  }

  await page.locator('.workspace-left-rail').waitFor({ state: 'visible', timeout: 30000 });
  await page.locator('.workspace-main-column').waitFor({ state: 'visible', timeout: 30000 });
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
}

async function run() {
  const health = await requestUrl(APP_URL);
  if (!health.ok) {
    throw new Error(`Local app is not reachable at ${APP_URL}`);
  }

  let chromium;
  try {
    ({ chromium } = await import('playwright'));
  } catch {
    throw new Error('Playwright is not installed in this workspace.');
  }

  const browser = await chromium.launch({ headless: true });
  const appUrl = new URL(APP_URL);
  const context = await browser.newContext({ viewport: { width: 1360, height: 900 } });
  await context.addCookies([{
    name: 'veranote-auth',
    value: AUTH_COOKIE,
    domain: appUrl.hostname,
    path: '/',
    httpOnly: false,
    sameSite: 'Lax',
  }]);
  await context.addInitScript((providerId) => {
    window.localStorage.setItem('veranote:current-provider-id', providerId);
  }, TEST_PROVIDER_ID);

  const page = await context.newPage();
  const failures = [];

  try {
    await gotoWorkspace(page);

    const openButton = page.getByTestId('assistant-open-button');
    assertState(await openButton.isVisible().catch(() => false), 'assistant launcher was not visible', failures);
    await openButton.click();

    const panel = page.getByTestId('assistant-floating-panel');
    await waitForVisible(panel, 2500).catch(async () => {
      const dock = page.getByTestId('assistant-minimized-dock');
      await waitForVisible(dock, 10000);
      await page.getByRole('button', { name: 'Open Assistant' }).click();
      await waitForVisible(panel, 10000);
    });
    const initialBox = await getBox(panel);
    assertState(initialBox.width >= 360, `assistant panel opened too narrow: ${initialBox.width}`, failures);
    assertState(initialBox.height >= 420, `assistant panel opened too short: ${initialBox.height}`, failures);

    const dragHandle = panel.locator('[data-assistant-drag-handle="true"]').first();
    const dragBox = await dragHandle.boundingBox();
    assertState(Boolean(dragBox), 'assistant drag handle was missing', failures);
    if (dragBox) {
      await page.mouse.move(dragBox.x + 80, dragBox.y + 20);
      await page.mouse.down();
      await page.mouse.move(dragBox.x - 240, dragBox.y + 110, { steps: 8 });
      await page.mouse.up();
    }
    const draggedBox = await getBox(panel);
    assertState(draggedBox.x < initialBox.x - 120, `assistant panel did not move left enough: before=${initialBox.x}, after=${draggedBox.x}`, failures);
    assertState(draggedBox.y > initialBox.y + 40, `assistant panel did not move down enough: before=${initialBox.y}, after=${draggedBox.y}`, failures);
    assertState(draggedBox.x >= 20 && draggedBox.y >= 20, `assistant panel moved partly offscreen: ${JSON.stringify(draggedBox)}`, failures);

    const resizeHandle = page.getByRole('button', { name: 'Resize assistant panel' });
    const resizeBox = await resizeHandle.boundingBox();
    assertState(Boolean(resizeBox), 'assistant resize handle was missing', failures);
    if (resizeBox) {
      await page.mouse.move(resizeBox.x + 8, resizeBox.y + 8);
      await page.mouse.down();
      await page.mouse.move(resizeBox.x + 168, resizeBox.y - 80, { steps: 8 });
      await page.mouse.up();
    }
    const resizedBox = await getBox(panel);
    assertState(resizedBox.width > draggedBox.width + 80, `assistant panel did not resize wider: before=${draggedBox.width}, after=${resizedBox.width}`, failures);
    assertState(resizedBox.height < draggedBox.height, `assistant panel did not resize shorter: before=${draggedBox.height}, after=${resizedBox.height}`, failures);

    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
    const restoredPanel = page.getByTestId('assistant-floating-panel');
    const restoredVisible = await waitForVisible(restoredPanel, 10000).then(() => true).catch(() => false);
    assertState(restoredVisible, 'assistant panel did not restore open after reload', failures);
    if (!restoredVisible) {
      throw new Error('assistant panel did not restore open after reload');
    }
    const restoredBox = await getBox(restoredPanel);
    assertState(distance(restoredBox.x, resizedBox.x) <= 8, `assistant x position did not persist: before=${resizedBox.x}, after=${restoredBox.x}`, failures);
    assertState(distance(restoredBox.y, resizedBox.y) <= 8, `assistant y position did not persist: before=${resizedBox.y}, after=${restoredBox.y}`, failures);
    assertState(distance(restoredBox.width, resizedBox.width) <= 8, `assistant width did not persist: before=${resizedBox.width}, after=${restoredBox.width}`, failures);
    assertState(distance(restoredBox.height, resizedBox.height) <= 8, `assistant height did not persist: before=${resizedBox.height}, after=${restoredBox.height}`, failures);

    await page.getByRole('button', { name: 'Minimize' }).click();
    const dock = page.getByTestId('assistant-minimized-dock');
    await waitForVisible(dock, 10000);
    const dockBox = await getBox(dock);
    const dockHandle = dock.locator('[data-assistant-drag-handle="true"]').first();
    const dockDragBox = await dockHandle.boundingBox();
    assertState(Boolean(dockDragBox), 'assistant minimized dock drag handle was missing', failures);
    if (dockDragBox) {
      await page.mouse.move(dockDragBox.x + 40, dockDragBox.y + 25);
      await page.mouse.down();
      await page.mouse.move(80, 120, { steps: 8 });
      await page.mouse.up();
    }
    const movedDockBox = await getBox(dock);
    assertState(movedDockBox.x < dockBox.x - 120, `assistant minimized dock did not move left: before=${dockBox.x}, after=${movedDockBox.x}`, failures);
    assertState(movedDockBox.y >= 20, `assistant minimized dock moved offscreen vertically: ${JSON.stringify(movedDockBox)}`, failures);

    const openDockButton = page.getByRole('button', { name: 'Open Assistant' });
    if (await openDockButton.count()) {
      await openDockButton.click();
    }
    const reopened = await waitForVisible(page.getByTestId('assistant-floating-panel'), 10000).then(() => true).catch(() => false);
    assertState(reopened, 'assistant minimized dock did not reopen the full panel', failures);
    if (!reopened) {
      throw new Error('assistant minimized dock did not reopen the full panel');
    }

    const finalPanel = await getBox(page.getByTestId('assistant-floating-panel'));
    assertState(finalPanel.x >= 20 && finalPanel.y >= 20, `assistant reopened partly offscreen: ${JSON.stringify(finalPanel)}`, failures);
  } finally {
    await context.close();
    await browser.close();
  }

  const report = {
    url: APP_URL,
    passed: failures.length === 0,
    failures,
    checkedAt: new Date().toISOString(),
  };

  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const reportPath = path.join(OUTPUT_DIR, `live-assistant-panel-layout-qa-${stamp}.json`);
  await fs.writeFile(reportPath, JSON.stringify(report, null, 2));

  if (failures.length) {
    console.error(JSON.stringify(report, null, 2));
    process.exit(1);
  }

  console.log(JSON.stringify(report, null, 2));
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
