#!/usr/bin/env node

/**
 * Veranote release readiness gate.
 *
 * This intentionally combines local build/unit safety with production-facing
 * smoke checks. It is the "do we trust this deploy?" command, not a broad
 * exploratory QA suite.
 */

import { spawn } from 'node:child_process';

const APP_ORIGIN = (process.env.VERANOTE_RELEASE_APP_ORIGIN || 'https://app.veranote.org').replace(/\/+$/, '');
const ATLAS_SCENARIO = process.env.VERANOTE_RELEASE_ATLAS_SCENARIO || 'diagnostic-to-medication-switch-with-typo-followup';
const NOTE_WORKFLOW_LIMIT = process.env.VERANOTE_RELEASE_NOTE_WORKFLOW_LIMIT || '1';
const RUN_FULL_E2E = process.env.VERANOTE_RELEASE_RUN_FULL_E2E !== '0';

const npmBin = process.platform === 'win32' ? 'npm.cmd' : 'npm';

function runStep(step) {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    console.log(`\n=== ${step.name} ===`);
    const child = spawn(step.command, step.args, {
      stdio: 'inherit',
      env: {
        ...process.env,
        ...(step.env || {}),
      },
    });

    child.on('close', (code) => {
      resolve({
        name: step.name,
        command: [step.command, ...step.args].join(' '),
        code,
        durationMs: Date.now() - startedAt,
        passed: code === 0,
      });
    });

    child.on('error', (error) => {
      console.error(error);
      resolve({
        name: step.name,
        command: [step.command, ...step.args].join(' '),
        code: 1,
        durationMs: Date.now() - startedAt,
        passed: false,
        error: error instanceof Error ? error.message : String(error),
      });
    });
  });
}

async function main() {
  const steps = [
    {
      name: 'Focused durable-storage unit tests',
      command: npmBin,
      args: [
        'test',
        '--',
        '--silent=true',
        '--maxWorkers=1',
        'tests/prototype-db-path.test.ts',
        'tests/draft-persistence.test.ts',
        'tests/dictation-audit-persistence.test.ts',
        'tests/db-presets.test.ts',
      ],
    },
    {
      name: 'Production build',
      command: npmBin,
      args: ['run', 'build'],
    },
    {
      name: 'Production route smoke',
      command: npmBin,
      args: ['run', 'production:smoke'],
    },
    {
      name: 'Production durable-storage smoke',
      command: npmBin,
      args: ['run', 'production:durable'],
      env: {
        PRODUCTION_DURABLE_QA_URL: APP_ORIGIN,
      },
    },
    {
      name: 'Production note workflow smoke',
      command: npmBin,
      args: ['run', 'live:note:qa'],
      env: {
        LIVE_NOTE_WORKFLOW_URL: `${APP_ORIGIN}/dashboard/new-note?fresh=release-gate-note-workflow`,
        LIVE_NOTE_WORKFLOW_LIMIT: NOTE_WORKFLOW_LIMIT,
      },
    },
    {
      name: 'Production workspace rail smoke',
      command: npmBin,
      args: ['run', 'live:workspace-rail'],
      env: {
        LIVE_WORKSPACE_RAIL_URL: `${APP_ORIGIN}/dashboard/new-note?fresh=release-gate-workspace-rail`,
        LIVE_WORKSPACE_RAIL_START_SERVER: '0',
      },
    },
    {
      name: 'Production Atlas conversation smoke',
      command: npmBin,
      args: ['run', 'atlas:live-conversation'],
      env: {
        LIVE_ASSISTANT_QA_URL: `${APP_ORIGIN}/dashboard/new-note?fresh=release-gate-atlas-conversation`,
        LIVE_ASSISTANT_QA_START_SERVER: '0',
        LIVE_ASSISTANT_QA_SCENARIO: ATLAS_SCENARIO,
      },
    },
  ];

  if (RUN_FULL_E2E) {
    steps.push({
      name: 'Production full note reopen/export E2E',
      command: npmBin,
      args: ['run', 'live:note:e2e'],
      env: {
        LIVE_NOTE_E2E_URL: `${APP_ORIGIN}/dashboard/new-note?fresh=release-gate-full-e2e`,
        LIVE_NOTE_E2E_START_SERVER: '0',
      },
    });
  }

  const results = [];
  for (const step of steps) {
    const result = await runStep(step);
    results.push(result);
    if (!result.passed) {
      console.error(`\nRelease readiness gate failed at: ${step.name}`);
      console.error(JSON.stringify({ results }, null, 2));
      process.exit(1);
    }
  }

  console.log('\nRelease readiness gate passed.');
  console.log(JSON.stringify({ appOrigin: APP_ORIGIN, results }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
