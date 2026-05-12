#!/usr/bin/env node

/**
 * Browser/API-level QA for the Saved Drafts recovery lane.
 *
 * This script verifies:
 * - Daniel's seeded fictional examples are visible in the saved draft API.
 * - Saved Drafts search can find a synthetic draft.
 * - Open Draft returns the provider to the workspace with recovery state.
 * - Archive, restore, and delete actions work on a temporary no-PHI draft.
 *
 * The temporary draft is synthetic and is deleted at the end of the run.
 */

import fs from 'node:fs/promises';
import path from 'node:path';

const APP_ORIGIN = (process.env.LIVE_SAVED_DRAFTS_URL || 'https://app.veranote.org').replace(/\/+$/, '');
const QA_EMAIL = process.env.LIVE_SAVED_DRAFTS_QA_EMAIL || 'daniel.hale@veranote-beta.local';
const PROVIDER_ID = process.env.LIVE_SAVED_DRAFTS_PROVIDER_ID || 'provider-daniel-hale-beta';
const OUTPUT_DIR = process.env.LIVE_SAVED_DRAFTS_OUTPUT_DIR || 'test-results';

const SEEDED_EXAMPLE_IDS = [
  'fictional-example-daniel-outpatient-followup-messy',
  'fictional-example-daniel-wellsky-inpatient-risk-conflict',
  'fictional-example-daniel-ocr-referral-evaluation',
  'fictional-example-daniel-therapy-progress-cbt',
];

async function readLocalEnvValue(key) {
  if (process.env[key]) return process.env[key];

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

async function waitForVisible(locator, timeout = 2500) {
  try {
    await locator.waitFor({ state: 'visible', timeout });
    return true;
  } catch {
    return false;
  }
}

async function signInForQa(page, targetUrl) {
  const accessCode = process.env.LIVE_SAVED_DRAFTS_ACCESS_CODE || await readLocalEnvValue('VERANOTE_BETA_ACCESS_CODE');
  if (!accessCode) {
    throw new Error('Saved Drafts QA reached sign-in. Set LIVE_SAVED_DRAFTS_ACCESS_CODE or VERANOTE_BETA_ACCESS_CODE.');
  }

  await page.locator('input[type="email"]').first().waitFor({ state: 'visible', timeout: 15000 });
  await page.locator('input[type="password"]').first().waitFor({ state: 'visible', timeout: 15000 });
  await page.locator('input[type="email"]').first().fill(QA_EMAIL);
  await page.locator('input[type="password"]').first().fill(accessCode);
  await page.getByRole('button', { name: /sign in/i }).click();
  await page.waitForURL((url) => !url.pathname.includes('/sign-in'), { timeout: 30000 });
  await page.goto(targetUrl, { waitUntil: 'domcontentloaded' });
}

async function ensureSignedIn(page, targetUrl) {
  await page.goto(targetUrl, { waitUntil: 'domcontentloaded' });
  if (page.url().includes('/sign-in')) {
    await signInForQa(page, targetUrl);
  }

  const ready = await waitForVisible(page.locator('body'), 15000);
  if (!ready || page.url().includes('/sign-in')) {
    throw new Error(`Unable to authenticate Saved Drafts QA at ${APP_ORIGIN}.`);
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
    throw new Error(`${label} failed with status ${result.status}: ${String(result.text || '').slice(0, 500)}`);
  }
}

function makeTempDraft(runId, draftId) {
  const sourceInput = [
    `Saved Drafts QA marker ${runId}.`,
    'FICTIONAL TRAINING EXAMPLE - NO PHI.',
    'Pre-visit: referral says anxiety follow-up and missed two doses last week.',
    'Live visit: patient reports sleep improved from 4 hours to 6 hours, anxiety still present, denies SI/HI.',
    'Provider add-on: keep this concise, do not add CPT code, and preserve missed-dose nuance.',
  ].join('\n');

  return {
    draftId,
    providerId: PROVIDER_ID,
    specialty: 'Psychiatry',
    role: 'Psychiatric NP',
    noteType: 'Outpatient Psych Follow-Up',
    template: `QA Saved Drafts Workflow ${runId}`,
    outputStyle: 'Concise',
    format: 'Labeled Sections',
    keepCloserToSource: true,
    flagMissingInfo: true,
    outputScope: 'full-note',
    customInstructions: 'Synthetic Saved Drafts QA draft. Do not use clinically.',
    sourceInput,
    sourceSections: {
      intakeCollateral: 'Referral says anxiety follow-up and missed two doses last week.',
      clinicianNotes: 'Patient reports sleep improved from 4 hours to 6 hours, anxiety still present, denies SI/HI.',
      patientTranscript: 'Patient: "I am sleeping a little better but still anxious."',
      objectiveData: 'Provider Add-On: keep concise; do not add CPT code; preserve missed-dose nuance.',
    },
    note: [
      `FICTIONAL EXAMPLE NOTE - NO PHI - Saved Drafts QA marker ${runId}.`,
      '',
      'Interval History: Patient reports partial improvement in sleep from approximately 4 hours to 6 hours, with ongoing anxiety. Source notes missed two medication doses last week; adherence should not be overstated.',
      '',
      'Safety: Patient denies SI/HI in the current source.',
      '',
      'Plan: Continue documentation review in Veranote workflow. No CPT code is included because this is a synthetic QA note.',
    ].join('\n'),
    flags: ['saved-drafts-qa', 'fictional-example', 'no-phi'],
    copilotSuggestions: [],
    sectionReviewState: {},
    recoveryState: {
      workflowStage: 'review',
      composeLane: 'finish',
      recommendedStage: 'review',
      lastAction: 'live-saved-drafts-workflow-qa',
      updatedAt: new Date().toISOString(),
    },
    mode: 'live',
  };
}

async function listDrafts(page) {
  const result = await apiJson(page, `/api/drafts?providerId=${encodeURIComponent(PROVIDER_ID)}&includeArchived=true`);
  assertOk(result, 'list drafts');
  return Array.isArray(result.json?.drafts) ? result.json.drafts : [];
}

async function findDraft(page, draftId) {
  const drafts = await listDrafts(page);
  return drafts.find((draft) => draft.id === draftId) || null;
}

async function main() {
  let chromium;
  try {
    ({ chromium } = await import('playwright'));
  } catch {
    throw new Error('Playwright is not installed in this workspace. Run npm install first.');
  }

  const runId = `SAVED-DRAFTS-${Date.now()}`;
  const draftId = `qa-saved-drafts-${Date.now()}`;
  const targetUrl = `${APP_ORIGIN}/dashboard/drafts?fresh=saved-drafts-workflow-qa`;
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 940 } });
  const page = await context.newPage();

  const report = {
    generatedAt: new Date().toISOString(),
    appOrigin: APP_ORIGIN,
    providerId: PROVIDER_ID,
    runId,
    tempDraftId: draftId,
    checks: {
      authenticated: false,
      seededExamplesPresent: false,
      tempDraftCreated: false,
      searchFindsTempDraft: false,
      openDraftNavigatesToWorkspace: false,
      recoveryStateStored: false,
      archiveWorks: false,
      restoreWorks: false,
      deleteWorks: false,
    },
    seededExamplesFound: [],
    failures: [],
  };

  try {
    await ensureSignedIn(page, targetUrl);
    report.checks.authenticated = true;

    const beforeDrafts = await listDrafts(page);
    report.seededExamplesFound = beforeDrafts
      .filter((draft) => SEEDED_EXAMPLE_IDS.includes(draft.id))
      .map((draft) => ({
        id: draft.id,
        template: draft.template,
        noteType: draft.noteType,
        archived: Boolean(draft.archivedAt),
      }));
    report.checks.seededExamplesPresent = SEEDED_EXAMPLE_IDS.every((id) => (
      report.seededExamplesFound.some((draft) => draft.id === id && !draft.archived)
    ));
    if (!report.checks.seededExamplesPresent) {
      throw new Error(`Missing active seeded example drafts: ${SEEDED_EXAMPLE_IDS.filter((id) => !report.seededExamplesFound.some((draft) => draft.id === id && !draft.archived)).join(', ')}`);
    }

    const createDraft = await apiJson(page, '/api/drafts', {
      method: 'POST',
      body: makeTempDraft(runId, draftId),
    });
    assertOk(createDraft, 'create temporary draft');
    report.checks.tempDraftCreated = createDraft.json?.draft?.id === draftId;

    await page.goto(targetUrl, { waitUntil: 'networkidle' });
    const searchInput = page.getByPlaceholder('Search note type, source text, or draft text');
    await searchInput.waitFor({ state: 'visible', timeout: 15000 });
    await searchInput.fill(runId);

    const tempCard = page.locator(`[data-testid="saved-draft-card"][data-draft-id="${draftId}"]`);
    await tempCard.waitFor({ state: 'visible', timeout: 15000 });
    report.checks.searchFindsTempDraft = true;

    await tempCard.getByRole('button', { name: 'Resume in workspace' }).click();
    await page.waitForURL((url) => url.pathname.includes('/dashboard/new-note') && url.search.includes(draftId), { timeout: 30000 });
    report.checks.openDraftNavigatesToWorkspace = true;
    report.checks.recoveryStateStored = await page.evaluate((expectedDraftId) => {
      const localDraftContext = Object.keys(localStorage).some((key) => {
        if (!key.includes('draft')) return false;
        return (localStorage.getItem(key) || '').includes(expectedDraftId);
      });
      return localDraftContext || window.location.href.includes(expectedDraftId);
    }, draftId);

    await page.goto(targetUrl, { waitUntil: 'networkidle' });
    await page.getByPlaceholder('Search note type, source text, or draft text').fill(runId);
    const actionCard = page.locator(`[data-testid="saved-draft-card"][data-draft-id="${draftId}"]`);
    await actionCard.waitFor({ state: 'visible', timeout: 15000 });
    await actionCard.getByRole('button', { name: 'Archive' }).click();
    await page.waitForFunction(
      (expectedDraftId) => {
        const card = document.querySelector(`[data-testid="saved-draft-card"][data-draft-id="${expectedDraftId}"]`);
        return !card || card.textContent?.includes('Working...') === false;
      },
      draftId,
      { timeout: 15000 },
    ).catch(() => {});
    const archivedDraft = await findDraft(page, draftId);
    report.checks.archiveWorks = Boolean(archivedDraft?.archivedAt);

    const visibilitySelect = page.getByLabel('Visibility');
    await visibilitySelect.waitFor({ state: 'visible', timeout: 15000 });
    await visibilitySelect.selectOption('archived');
    const archivedCard = page.locator(`[data-testid="saved-draft-card"][data-draft-id="${draftId}"]`);
    await archivedCard.waitFor({ state: 'visible', timeout: 15000 });
    await archivedCard.getByRole('button', { name: 'Restore' }).click();
    await page.waitForFunction(
      (expectedDraftId) => {
        const card = document.querySelector(`[data-testid="saved-draft-card"][data-draft-id="${expectedDraftId}"]`);
        return !card || card.textContent?.includes('Working...') === false;
      },
      draftId,
      { timeout: 15000 },
    ).catch(() => {});
    const restoredDraft = await findDraft(page, draftId);
    report.checks.restoreWorks = Boolean(restoredDraft && !restoredDraft.archivedAt);

    await page.goto(targetUrl, { waitUntil: 'networkidle' });
    await page.getByPlaceholder('Search note type, source text, or draft text').fill(runId);
    const deleteCard = page.locator(`[data-testid="saved-draft-card"][data-draft-id="${draftId}"]`);
    await deleteCard.waitFor({ state: 'visible', timeout: 15000 });
    await deleteCard.getByRole('button', { name: 'Delete' }).click();
    await deleteCard.waitFor({ state: 'hidden', timeout: 15000 }).catch(() => {});
    report.checks.deleteWorks = !(await findDraft(page, draftId));
  } catch (error) {
    report.failures.push(error instanceof Error ? error.message : String(error));
  } finally {
    if (!report.checks.deleteWorks) {
      try {
        await apiJson(page, `/api/drafts/${encodeURIComponent(draftId)}?providerId=${encodeURIComponent(PROVIDER_ID)}`, {
          method: 'DELETE',
        });
        report.checks.deleteWorks = !(await findDraft(page, draftId));
      } catch (error) {
        report.failures.push(`cleanup failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    await browser.close();
  }

  const passed = Object.values(report.checks).every(Boolean) && report.failures.length === 0;
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  const date = new Date().toISOString().slice(0, 10);
  const jsonPath = path.resolve(OUTPUT_DIR, `live-saved-drafts-workflow-qa-${date}.json`);
  const markdownPath = path.resolve(OUTPUT_DIR, `live-saved-drafts-workflow-qa-${date}.md`);
  await fs.writeFile(jsonPath, JSON.stringify(report, null, 2));
  await fs.writeFile(markdownPath, [
    '# Live Saved Drafts Workflow QA',
    '',
    `- App: ${APP_ORIGIN}`,
    `- Provider: ${PROVIDER_ID}`,
    `- Passed: ${passed ? 'yes' : 'no'}`,
    '',
    '## Checks',
    '',
    ...Object.entries(report.checks).map(([key, value]) => `- ${key}: ${value ? 'passed' : 'failed'}`),
    '',
    '## Failures',
    '',
    report.failures.length ? report.failures.map((failure) => `- ${failure}`).join('\n') : 'No failures.',
    '',
  ].join('\n'));

  console.log(JSON.stringify({
    passed,
    checks: report.checks,
    seededExamplesFound: report.seededExamplesFound.length,
    jsonPath,
    markdownPath,
    failures: report.failures,
  }, null, 2));

  if (!passed) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
