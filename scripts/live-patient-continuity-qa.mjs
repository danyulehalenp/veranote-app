#!/usr/bin/env node

/**
 * Live continuity workflow QA:
 * save prior snapshot -> search by patient/date/type/category -> load source block
 * -> generate a follow-up note -> archive snapshot.
 *
 * Uses synthetic non-PHI QA content only.
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';

const APP_ORIGIN = process.env.LIVE_PATIENT_CONTINUITY_ORIGIN || 'http://localhost:3001';
const OUTPUT_DIR = process.env.LIVE_PATIENT_CONTINUITY_OUTPUT_DIR || 'test-results';
const SHOULD_START_SERVER = process.env.LIVE_PATIENT_CONTINUITY_START_SERVER !== '0';

function requestUrl(url) {
  return new Promise((resolve) => {
    const request = http.get(url, (response) => {
      response.resume();
      resolve(Boolean(response.statusCode && response.statusCode < 500));
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
    child.on('close', () => resolve(output.split(/\s+/).filter(Boolean)));
    child.on('error', () => resolve([]));
  });
}

async function stopUnresponsivePortProcesses(port) {
  const pids = await listPortPids(port);
  for (const pid of pids) {
    try {
      process.kill(Number(pid), 'SIGTERM');
    } catch {
      // Process exited between lsof and kill.
    }
  }
  if (pids.length) {
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
}

async function ensureServer() {
  const healthUrl = `${APP_ORIGIN}/dashboard/new-note?fresh=live-patient-continuity-qa`;
  if (await waitForUrl(healthUrl, 5000)) {
    return null;
  }

  if (!SHOULD_START_SERVER) {
    throw new Error(`App is not reachable at ${healthUrl}. Start it with npm run dev:test or allow this script to start it.`);
  }

  const port = new URL(APP_ORIGIN).port || '3001';
  await stopUnresponsivePortProcesses(port);

  const child = spawn('npm', ['run', 'dev:test'], {
    stdio: 'inherit',
    env: {
      ...process.env,
      VERANOTE_ALLOW_MOCK_AUTH: process.env.VERANOTE_ALLOW_MOCK_AUTH || 'true',
      NEXTAUTH_URL: process.env.NEXTAUTH_URL || APP_ORIGIN,
      AUTH_URL: process.env.AUTH_URL || APP_ORIGIN,
    },
  });

  if (!await waitForUrl(healthUrl, 60000)) {
    child.kill('SIGTERM');
    throw new Error(`Timed out waiting for ${healthUrl}.`);
  }

  return child;
}

async function api(pathname, options = {}) {
  const response = await fetch(`${APP_ORIGIN}${pathname}`, {
    ...options,
    headers: {
      'content-type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { raw: text.slice(0, 240) };
  }

  return { response, body };
}

function requireCheck(checks, name, value, detail = '') {
  checks[name] = Boolean(value);
  if (!value && detail) {
    checks[`${name}Detail`] = detail;
  }
}

async function writeReport(report) {
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  const day = new Date().toISOString().slice(0, 10);
  const jsonPath = path.join(OUTPUT_DIR, `live-patient-continuity-qa-${day}.json`);
  const mdPath = path.join(OUTPUT_DIR, `live-patient-continuity-qa-${day}.md`);
  await fs.writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
  await fs.writeFile(mdPath, [
    '# Live Patient Continuity QA',
    '',
    `Generated: ${report.generatedAt}`,
    `Passed: ${report.failedChecks.length === 0}`,
    '',
    '## Checks',
    '',
    ...Object.entries(report.checks).map(([key, value]) => `- ${key}: ${JSON.stringify(value)}`),
    '',
    report.failedChecks.length ? `Failed checks: ${report.failedChecks.join(', ')}` : 'No failed checks.',
    '',
  ].join('\n'));

  return { jsonPath, mdPath };
}

async function main() {
  const server = await ensureServer();
  const now = new Date();
  const qaSuffix = now.getTime();
  const patientLabel = `QA continuity patient ${qaSuffix}`;
  const providerId = `provider-continuity-live-${qaSuffix}`;
  const priorDate = '2026-05-01T10:00:00.000Z';
  const checks = {};

  try {
    const save = await api('/api/patient-continuity', {
      method: 'POST',
      body: JSON.stringify({
        providerId,
        patientLabel,
        patientDescription: 'synthetic outpatient follow-up QA patient',
        privacyMode: 'neutral-id',
        sourceDraftId: `prior-draft-${qaSuffix}`,
        sourceNoteType: 'Outpatient Psychiatric Evaluation',
        sourceDate: priorDate,
        sourceText: [
          'Synthetic prior note: passive death wish was documented after job loss.',
          'Sertraline 50 mg daily was listed with missed doses and mild nausea.',
          'Therapy referral and collateral follow-up remained pending for next visit.',
        ].join(' '),
        noteText: 'Prior assessment documented depression symptoms, safety planning, and medication adherence uncertainty.',
      }),
    });

    const record = save.body?.record;
    requireCheck(checks, 'saveStatus', save.response.status === 200, JSON.stringify(save.body));
    requireCheck(checks, 'recordCreated', Boolean(record?.id), 'No continuity record returned.');
    requireCheck(checks, 'sourceBlockReturned', /Patient Continuity Context - Veranote recall layer/i.test(save.body?.continuitySourceBlock || ''));

    const search = await api(`/api/patient-continuity?providerId=${encodeURIComponent(providerId)}&query=${encodeURIComponent('sertraline therapy')}&dateFrom=2026-05-01&dateTo=2026-05-02&noteType=${encodeURIComponent('Outpatient Psychiatric Evaluation')}&category=medication`);
    requireCheck(checks, 'searchStatus', search.response.status === 200, JSON.stringify(search.body));
    requireCheck(checks, 'searchFindsRecord', (search.body?.records || []).some((item) => item.id === record?.id));
    requireCheck(checks, 'searchSourceBlockReturned', /Use this as prior context only/i.test(search.body?.continuitySourceBlock || ''));

    const markUsed = await api('/api/patient-continuity', {
      method: 'POST',
      body: JSON.stringify({
        providerId,
        recordId: record?.id,
        action: 'mark-used',
      }),
    });
    requireCheck(checks, 'markUsedStatus', markUsed.response.status === 200, JSON.stringify(markUsed.body));
    requireCheck(checks, 'markUsedTimestamp', Boolean(markUsed.body?.record?.lastUsedAt));

    const continuitySourceBlock = markUsed.body?.continuitySourceBlock || search.body?.continuitySourceBlock || save.body?.continuitySourceBlock || '';
    const generate = await api('/api/generate-note', {
      method: 'POST',
      body: JSON.stringify({
        specialty: 'Psychiatry',
        noteType: 'Outpatient Psych Follow-Up',
        outputStyle: 'Standard',
        format: 'Labeled Sections',
        keepCloserToSource: true,
        flagMissingInfo: true,
        customInstructions: 'Use prior continuity only as prior context. Separate previously documented items from today-confirmed facts.',
        sourceSections: {
          intakeCollateral: continuitySourceBlock,
          clinicianNotes: [
            'Today live visit notes:',
            '- Patient reports mood is slightly improved today.',
            '- Denies active suicidal ideation, plan, or intent today.',
            '- Reports taking sertraline most days but missed two doses this week.',
            '- Therapy referral still not scheduled due to transportation.',
          ].join('\n'),
          patientTranscript: [
            'Ambient transcript:',
            'Patient: "I am not trying to kill myself. I still forget the medicine sometimes."',
          ].join('\n'),
          objectiveData: [
            'Provider Add-On:',
            '- Do not state prior passive death wish resolved.',
            '- Do not state medication adherence is good.',
          ].join('\n'),
        },
      }),
    });
    const generatedNote = generate.body?.note || '';
    requireCheck(checks, 'generateStatus', generate.response.status === 200, JSON.stringify(generate.body));
    requireCheck(checks, 'generatedNoteVisible', generatedNote.length > 500, `Generated note length ${generatedNote.length}`);
    requireCheck(checks, 'generationModeKnown', Boolean(generate.body?.generationMeta?.pathUsed));
    requireCheck(checks, 'todayDenialPreserved', /denies? active suicidal ideation|not trying to kill myself|denies? .*?(?:plan|intent)/i.test(generatedNote));
    requireCheck(checks, 'missedDosesPreserved', /missed (?:two|2) doses|forget.*medicine|missed.*this week/i.test(generatedNote));
    requireCheck(checks, 'priorContextSeparated', /previously documented|prior context|prior note|continuity/i.test(generatedNote));
    requireCheck(checks, 'noResolvedRiskInvented', !/passive (?:death wish|SI|suicidal ideation).{0,80}(?:resolved|cleared|no longer present)/i.test(generatedNote));
    requireCheck(checks, 'noGoodAdherenceInvented', !/taking as prescribed|good adherence|fully adherent|adherence is good/i.test(generatedNote));
    requireCheck(checks, 'providerInstructionNotLeaked', !/Provider Add-On|Do not state|Continuity safety rule/i.test(generatedNote));

    const archive = await api('/api/patient-continuity', {
      method: 'POST',
      body: JSON.stringify({
        providerId,
        recordId: record?.id,
        action: 'archive',
      }),
    });
    requireCheck(checks, 'archiveStatus', archive.response.status === 200, JSON.stringify(archive.body));
    requireCheck(checks, 'archiveTimestamp', Boolean(archive.body?.record?.archivedAt));

    const report = {
      generatedAt: new Date().toISOString(),
      appOrigin: APP_ORIGIN,
      providerId,
      recordId: record?.id || '',
      generationMode: generate.body?.generationMeta?.pathUsed || 'unknown',
      generationReason: generate.body?.generationMeta?.reason || '',
      generatedNoteCharacters: generatedNote.length,
      checks,
      failedChecks: Object.entries(checks)
        .filter(([, value]) => value === false)
        .map(([key]) => key),
    };
    const paths = await writeReport(report);
    console.log(JSON.stringify({ ...report, paths }, null, 2));

    if (report.failedChecks.length) {
      process.exit(1);
    }
  } finally {
    if (server) {
      server.kill('SIGTERM');
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
