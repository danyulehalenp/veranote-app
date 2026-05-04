#!/usr/bin/env node

/**
 * Production durable-storage smoke test.
 *
 * This writes only synthetic nonclinical QA markers, then restores mutable
 * provider settings/presets so the test proves persistence without changing a
 * provider's working setup.
 */

import fs from 'node:fs/promises';
import path from 'node:path';

const APP_ORIGIN = (process.env.PRODUCTION_DURABLE_QA_URL || 'https://app.veranote.org').replace(/\/+$/, '');
const QA_EMAIL = process.env.PRODUCTION_DURABLE_QA_EMAIL || 'daniel.hale@veranote-beta.local';
const OUTPUT_DIR = process.env.PRODUCTION_DURABLE_QA_OUTPUT_DIR || 'test-results';

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

async function signInForQa(page, targetUrl) {
  const accessCode = process.env.PRODUCTION_DURABLE_QA_ACCESS_CODE || await readLocalEnvValue('VERANOTE_BETA_ACCESS_CODE');
  if (!accessCode) {
    throw new Error('Production durable QA reached sign-in. Set PRODUCTION_DURABLE_QA_ACCESS_CODE or VERANOTE_BETA_ACCESS_CODE.');
  }

  await page.locator('input[type="email"]').first().waitFor({ state: 'visible', timeout: 15000 });
  await page.locator('input[type="password"]').first().waitFor({ state: 'visible', timeout: 15000 });
  await page.locator('input[type="email"]').first().fill(QA_EMAIL);
  await page.locator('input[type="password"]').first().fill(accessCode);
  await page.getByRole('button', { name: /sign in/i }).click();
  await page.waitForURL((url) => !url.pathname.includes('/sign-in'), { timeout: 30000 });
  await page.goto(targetUrl, { waitUntil: 'domcontentloaded' });
}

async function ensureSignedIn(page) {
  const targetUrl = `${APP_ORIGIN}/dashboard/new-note?fresh=production-durable-storage-qa`;
  await page.goto(targetUrl, { waitUntil: 'domcontentloaded' });

  if (page.url().includes('/sign-in')) {
    await signInForQa(page, targetUrl);
  }

  const ready = await waitForVisible(page.locator('body'), 15000);
  if (!ready || page.url().includes('/sign-in')) {
    throw new Error(`Unable to authenticate production durable QA at ${APP_ORIGIN}.`);
  }
}

async function apiJson(page, routePath, options = {}) {
  return page.evaluate(async ({ routePath: requestPath, options: requestOptions }) => {
    const response = await fetch(requestPath, {
      method: requestOptions.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(requestOptions.headers || {}),
      },
      credentials: 'include',
      body: requestOptions.body === undefined ? undefined : JSON.stringify(requestOptions.body),
    });
    const text = await response.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }

    return {
      ok: response.ok,
      status: response.status,
      json,
      text,
    };
  }, { routePath, options });
}

function assertOk(result, label) {
  if (!result.ok) {
    throw new Error(`${label} failed with status ${result.status}: ${result.text.slice(0, 500)}`);
  }
}

function makeTestPreset(runId) {
  return {
    id: `qa-durable-${runId.toLowerCase()}`,
    name: `QA Durable ${runId}`,
    noteType: 'Outpatient Psych Follow-Up',
    outputScope: 'full-note',
    requestedSections: ['reasonForVisit', 'intervalHistory', 'mentalStatusExam', 'assessment', 'plan'],
    outputStyle: 'Concise',
    format: 'Labeled Sections',
    keepCloserToSource: true,
    flagMissingInfo: true,
    customInstructions: `Synthetic durable-storage regression marker ${runId}.`,
    isDefault: false,
    locked: false,
  };
}

function draftMatchesRun(draft, draftId, runId) {
  return draft?.id === draftId
    || draft?.draftId === draftId
    || draft?.sourceInput?.includes(runId)
    || draft?.note?.includes(runId);
}

async function main() {
  let chromium;
  try {
    ({ chromium } = await import('playwright'));
  } catch {
    throw new Error('Playwright is not installed in this workspace. Run npm install first.');
  }

  const runId = `DURABLE-${Date.now()}`;
  const now = new Date().toISOString();
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1360, height: 900 } });
  const page = await context.newPage();

  const report = {
    generatedAt: now,
    appOrigin: APP_ORIGIN,
    runId,
    checks: {
      authenticated: false,
      draftCreated: false,
      draftFetchedById: false,
      draftListed: false,
      draftDeleted: false,
      settingsPersisted: false,
      settingsRestored: false,
      presetsPersisted: false,
      presetsRestored: false,
      dictationAuditPersisted: false,
      assistantLearningPersisted: false,
      assistantLearningRestored: false,
    },
  };

  let draftId = null;
  let originalSettings = null;
  let originalPresets = null;
  let originalLearningStore = null;

  try {
    await ensureSignedIn(page);
    report.checks.authenticated = true;

    const settingsGet = await apiJson(page, '/api/settings/provider');
    assertOk(settingsGet, 'read provider settings');
    originalSettings = settingsGet.json?.settings || null;

    const presetsGet = await apiJson(page, '/api/presets');
    assertOk(presetsGet, 'read note presets');
    originalPresets = Array.isArray(presetsGet.json?.presets) ? presetsGet.json.presets : [];

    const memoryGet = await apiJson(page, '/api/assistant/memory');
    assertOk(memoryGet, 'read assistant memory');
    originalLearningStore = memoryGet.json?.learningStore || null;

    const sourceInput = [
      `Synthetic durable-storage regression marker ${runId}.`,
      'No PHI. This is a production persistence smoke test only.',
      'Provider should not use this as a clinical note.',
    ].join('\n');
    const draftCreate = await apiJson(page, '/api/drafts', {
      method: 'POST',
      body: {
        specialty: 'Psychiatry',
        role: 'Psychiatric NP',
        noteType: 'Outpatient Psych Follow-Up',
        template: 'QA Durable Storage Regression',
        outputStyle: 'Concise',
        format: 'Labeled Sections',
        keepCloserToSource: true,
        flagMissingInfo: true,
        sourceInput,
        note: `QA durable storage generated note ${runId}.`,
        flags: ['qa-durable-storage'],
        mode: 'live',
        sectionReviewState: {
          sections: {},
          updatedAt: now,
        },
        recoveryState: {
          workflowStage: 'review',
          lastAction: 'production-durable-storage-qa',
          updatedAt: now,
        },
      },
    });
    assertOk(draftCreate, 'create draft');
    draftId = draftCreate.json?.draft?.id || null;
    report.checks.draftCreated = Boolean(draftId);

    const draftGet = await apiJson(page, `/api/drafts/${encodeURIComponent(draftId)}`);
    assertOk(draftGet, 'fetch draft by id');
    report.checks.draftFetchedById = draftGet.json?.draft?.sourceInput?.includes(runId) === true;

    const draftList = await apiJson(page, '/api/drafts?includeArchived=true');
    assertOk(draftList, 'list drafts');
    report.checks.draftListed = Array.isArray(draftList.json?.drafts)
      && draftList.json.drafts.some((draft) => draftMatchesRun(draft, draftId, runId));

    const settingsName = `QA${String(Date.now()).slice(-8)}`;
    const settingsWrite = await apiJson(page, '/api/settings/provider', {
      method: 'POST',
      body: {
        ...originalSettings,
        userAiName: settingsName,
        userAiRole: 'Clinical Assistant',
      },
    });
    assertOk(settingsWrite, 'write provider settings');
    const settingsVerify = await apiJson(page, '/api/settings/provider');
    assertOk(settingsVerify, 'verify provider settings');
    report.checks.settingsPersisted = settingsVerify.json?.settings?.userAiName === settingsName;

    const testPreset = makeTestPreset(runId);
    const presetsWrite = await apiJson(page, '/api/presets', {
      method: 'POST',
      body: {
        presets: [...originalPresets, testPreset],
      },
    });
    assertOk(presetsWrite, 'write note presets');
    const presetsVerify = await apiJson(page, '/api/presets');
    assertOk(presetsVerify, 'verify note presets');
    report.checks.presetsPersisted = Array.isArray(presetsVerify.json?.presets)
      && presetsVerify.json.presets.some((preset) => preset.id === testPreset.id);

    const dictationSessionId = `qa-durable-session-${runId}`;
    const auditWrite = await apiJson(page, '/api/dictation/audit', {
      method: 'POST',
      body: {
        id: `qa-durable-audit-${runId}`,
        eventName: 'production_durable_storage_qa',
        eventDomain: 'qa',
        occurredAt: now,
        encounterId: `qa-durable-encounter-${runId}`,
        noteId: draftId,
        dictationSessionId,
        mode: 'manual',
        payload: { marker: runId },
        containsPhi: false,
        retentionClass: 'audit_only',
      },
    });
    assertOk(auditWrite, 'write dictation audit event');
    const auditVerify = await apiJson(page, `/api/dictation/audit?sessionId=${encodeURIComponent(dictationSessionId)}&limit=5`);
    assertOk(auditVerify, 'verify dictation audit event');
    report.checks.dictationAuditPersisted = Array.isArray(auditVerify.json?.events)
      && auditVerify.json.events.some((event) => event.id === `qa-durable-audit-${runId}`);

    const learningStore = {
      ...(originalLearningStore || {}),
      conversationalMemoryFacts: [
        ...((originalLearningStore?.conversationalMemoryFacts || []).filter((fact) => fact.key !== runId)),
        {
          key: runId,
          fact: `Synthetic durable-storage assistant learning marker ${runId}.`,
          count: 1,
          lastSeenAt: now,
        },
      ],
    };
    const memoryWrite = await apiJson(page, '/api/assistant/memory', {
      method: 'POST',
      body: { learningStore },
    });
    assertOk(memoryWrite, 'write assistant learning');
    const memoryVerify = await apiJson(page, '/api/assistant/memory');
    assertOk(memoryVerify, 'verify assistant learning');
    report.checks.assistantLearningPersisted = Array.isArray(memoryVerify.json?.learningStore?.conversationalMemoryFacts)
      && memoryVerify.json.learningStore.conversationalMemoryFacts.some((fact) => fact.key === runId);
  } finally {
    if (originalLearningStore) {
      const restore = await apiJson(page, '/api/assistant/memory', {
        method: 'POST',
        body: { learningStore: originalLearningStore },
      }).catch((error) => ({ ok: false, status: 0, text: error instanceof Error ? error.message : String(error) }));
      report.checks.assistantLearningRestored = Boolean(restore.ok);
    }

    if (originalPresets) {
      const restore = await apiJson(page, '/api/presets', {
        method: 'POST',
        body: { presets: originalPresets },
      }).catch((error) => ({ ok: false, status: 0, text: error instanceof Error ? error.message : String(error) }));
      report.checks.presetsRestored = Boolean(restore.ok);
    }

    if (originalSettings) {
      const restore = await apiJson(page, '/api/settings/provider', {
        method: 'POST',
        body: originalSettings,
      }).catch((error) => ({ ok: false, status: 0, text: error instanceof Error ? error.message : String(error) }));
      report.checks.settingsRestored = Boolean(restore.ok);
    }

    if (draftId) {
      const deleted = await apiJson(page, `/api/drafts/${encodeURIComponent(draftId)}`, {
        method: 'DELETE',
      }).catch((error) => ({ ok: false, status: 0, text: error instanceof Error ? error.message : String(error) }));
      report.checks.draftDeleted = Boolean(deleted.ok);
    }

    await browser.close().catch(() => {});
  }

  const failedChecks = Object.entries(report.checks)
    .filter(([, value]) => value !== true)
    .map(([key]) => key);

  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  const date = new Date().toISOString().slice(0, 10);
  const jsonPath = path.join(OUTPUT_DIR, `production-durable-storage-qa-${date}.json`);
  const markdownPath = path.join(OUTPUT_DIR, `production-durable-storage-qa-${date}.md`);
  await fs.writeFile(jsonPath, JSON.stringify({ ...report, failedChecks }, null, 2));
  await fs.writeFile(markdownPath, [
    '# Production Durable Storage QA',
    '',
    `- Generated: ${report.generatedAt}`,
    `- App origin: ${report.appOrigin}`,
    `- Run ID: ${report.runId}`,
    `- Result: ${failedChecks.length ? 'fail' : 'pass'}`,
    '',
    '## Checks',
    '',
    ...Object.entries(report.checks).map(([key, value]) => `- ${key}: ${String(value)}`),
    '',
    failedChecks.length ? `Failed checks: ${failedChecks.join(', ')}` : 'No failed checks.',
    '',
  ].join('\n'));

  console.log(JSON.stringify({ ...report, failedChecks, jsonPath, markdownPath }, null, 2));

  if (failedChecks.length) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
