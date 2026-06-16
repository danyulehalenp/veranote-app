import { execFileSync, spawn } from 'node:child_process';

const liveGenerationEnv = {
  VERANOTE_ALLOW_OPENAI: process.env.VERANOTE_ALLOW_OPENAI || '1',
  VERANOTE_NOTE_GENERATION_TIMEOUT_MS: process.env.VERANOTE_NOTE_GENERATION_TIMEOUT_MS || '60000',
};

const gateScope = (process.env.VERANOTE_NOTE_GATE_SCOPE || 'representative').trim().toLowerCase();
const stepTimeoutMs = Number.parseInt(process.env.VERANOTE_NOTE_GATE_STEP_TIMEOUT_MS || '900000', 10);
const staleProcessCleanupEnabled = process.env.VERANOTE_NOTE_GATE_SKIP_STALE_PROCESS_CLEANUP !== '1';

const representativeSourcePacketCaseIds = [
  'four-field-outpatient-passive-risk',
  'inpatient-progress-psychosis-observation-conflict',
  'outpatient-medication-conflict-source-packet',
  'ocr-er-referral-first-episode-psychosis-misspellings',
  'therapy-progress-note-dictated-cbt-no-medical-plan',
  'messy-out-of-order-followup-provider-story-prompt',
  'er-upload-inpatient-eval-alcohol-withdrawal-risk-med-conflict',
  'medical-hp-scanned-discharge-summary-qtc-syncope-antipsychotic-confounder',
];

const fullSourcePacketEnv = {
  ...liveGenerationEnv,
  VERANOTE_SOURCE_PACKET_REGRESSION_CASE_IDS: 'all',
  VERANOTE_SOURCE_PACKET_REQUIRE_LIVE: '1',
};

const representativeSourcePacketEnv = {
  ...liveGenerationEnv,
  VERANOTE_SOURCE_PACKET_REGRESSION_CASE_IDS: representativeSourcePacketCaseIds.join(','),
  VERANOTE_SOURCE_PACKET_REQUIRE_LIVE: '1',
};

const promptAndSourceStep = {
  label: gateScope === 'full'
    ? 'Prompt and full source-packet note generation regression'
    : 'Prompt and representative source-packet note generation regression',
  command: 'npx',
  args: [
    'vitest',
    'run',
    '--silent=true',
    '--maxWorkers=1',
    'tests/note-generation-core-workflow-readiness.test.ts',
    'tests/source-lane-contract.test.ts',
    'tests/note-generation-ehr-coverage.test.ts',
    'tests/assemble-prompt.test.ts',
    'tests/note-generation-source-packet-regression.test.ts',
    'tests/defensibility-layer.test.ts',
    'tests/post-note-cpt-regression.test.ts',
    'tests/document-source-intake.test.ts',
    'tests/document-source-intake-regression.test.ts',
  ],
  env: gateScope === 'full' ? fullSourcePacketEnv : representativeSourcePacketEnv,
};

const noteBuilderRegressionArgs = gateScope === 'full'
  ? [
      'tests/note-builder-first25-cleanup-regression.test.ts',
      'tests/note-builder-sparse-source-regression.test.ts',
      'tests/note-builder-risk-heavy-regression.test.ts',
      'tests/note-builder-substance-overlap-regression.test.ts',
      'tests/note-builder-medical-overlap-regression.test.ts',
      'tests/note-builder-outpatient-followup-regression.test.ts',
      'tests/note-builder-progress-note-regression.test.ts',
    ]
  : [
      'tests/note-builder-first25-cleanup-regression.test.ts',
    ];

const noteBuilderSteps = gateScope === 'full'
  ? noteBuilderRegressionArgs.map((testPath) => ({
      label: `Focused note-builder regression: ${testPath.replace(/^tests\/|\.test\.ts$/g, '')}`,
      command: 'npx',
      args: [
        'vitest',
        'run',
        '--silent=true',
        '--maxWorkers=1',
        testPath,
      ],
      env: liveGenerationEnv,
    }))
  : [{
      label: 'Representative note-builder regression set',
      command: 'npx',
      args: [
        'vitest',
        'run',
        '--silent=true',
        '--maxWorkers=1',
        ...noteBuilderRegressionArgs,
      ],
      env: liveGenerationEnv,
    }];

const steps = [
  promptAndSourceStep,
  ...noteBuilderSteps,
  {
    label: 'Production build',
    command: 'npm',
    args: ['run', 'build'],
  },
];

function formatCommand(step) {
  return `${step.command} ${step.args.join(' ')}`;
}

function formatDuration(ms) {
  const seconds = Math.round(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;

  return minutes ? `${minutes}m ${remainingSeconds}s` : `${remainingSeconds}s`;
}

function listRepoGateProcesses() {
  let output = '';
  try {
    output = execFileSync('ps', ['-axo', 'pid,ppid,pgid,command'], {
      encoding: 'utf8',
    });
  } catch {
    return [];
  }

  return output
    .split('\n')
    .slice(1)
    .map((line) => {
      const match = line.trim().match(/^(\d+)\s+(\d+)\s+(\d+)\s+(.+)$/);
      if (!match) return null;
      return {
        pid: Number(match[1]),
        ppid: Number(match[2]),
        pgid: Number(match[3]),
        command: match[4],
      };
    })
    .filter(Boolean)
    .filter((item) => item.pid !== process.pid)
    .filter((item) => item.command.includes('/Users/danielhale/.openclaw/workspace/app-prototype'))
    .filter((item) => (
      item.command.includes('scripts/note-generation-regression-gate.mjs')
      || item.command.includes('vitest run --silent=true')
      || item.command.includes('node_modules/vitest/dist/workers/forks')
    ));
}

function terminateProcessGroup(pid, signal = 'SIGTERM') {
  try {
    process.kill(-pid, signal);
    return true;
  } catch {
    try {
      process.kill(pid, signal);
      return true;
    } catch {
      return false;
    }
  }
}

function cleanupRepoGateProcesses(reason) {
  if (!staleProcessCleanupEnabled) return;
  const processes = listRepoGateProcesses();
  if (!processes.length) return;

  const groups = [...new Set(processes.map((item) => item.pgid).filter((pgid) => pgid > 0))];
  console.warn(`Cleaning up ${processes.length} stale note-gate/Vitest process(es) before ${reason}.`);
  for (const pgid of groups) {
    terminateProcessGroup(pgid, 'SIGTERM');
  }
}

function runStep(step) {
  const startedAt = Date.now();

  return new Promise((resolve) => {
    const child = spawn(step.command, step.args, {
      cwd: process.cwd(),
      detached: true,
      stdio: 'inherit',
      env: {
        ...process.env,
        ...(step.env || {}),
      },
    });

    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      console.error(`Note gate step timed out after ${formatDuration(stepTimeoutMs)}: ${step.label}`);
      terminateProcessGroup(child.pid, 'SIGTERM');
      setTimeout(() => terminateProcessGroup(child.pid, 'SIGKILL'), 5_000).unref();
    }, Number.isFinite(stepTimeoutMs) ? stepTimeoutMs : 900000);

    const stopCurrentChild = () => {
      terminateProcessGroup(child.pid, 'SIGTERM');
    };

    process.once('SIGINT', stopCurrentChild);
    process.once('SIGTERM', stopCurrentChild);

    child.on('close', (code, signal) => {
      clearTimeout(timeout);
      process.removeListener('SIGINT', stopCurrentChild);
      process.removeListener('SIGTERM', stopCurrentChild);

      resolve({
        code,
        signal,
        timedOut,
        durationMs: Date.now() - startedAt,
      });
    });

    child.on('error', (error) => {
      clearTimeout(timeout);
      process.removeListener('SIGINT', stopCurrentChild);
      process.removeListener('SIGTERM', stopCurrentChild);

      resolve({
        code: 1,
        signal: null,
        timedOut,
        durationMs: Date.now() - startedAt,
        error,
      });
    });
  });
}

console.log('Note-generation regression gate starting.');
console.log(`Scope: ${gateScope === 'full' ? 'full exhaustive live bank' : 'representative bounded live gate'}.`);
console.log('Protected baseline: four-lane source packets, prompt fidelity directives, focused note-builder regressions, build green.');

cleanupRepoGateProcesses('starting the note-generation gate');

try {
  for (const step of steps) {
    console.log(`\n=== Note gate: ${step.label} ===`);
    console.log(`$ ${formatCommand(step)}`);
    const result = await runStep(step);

    if (result.error) {
      console.error(result.error);
    }

    if (result.code !== 0) {
      if (result.signal || result.timedOut) {
        console.error(`Note-generation gate timed out or was terminated at step: ${step.label} (${result.signal || 'timeout'})`);
      }
      console.error(`Note-generation gate failed at step: ${step.label}`);
      cleanupRepoGateProcesses('handling a failed note-generation gate step');
      process.exit(result.code ?? 1);
    }

    console.log(`Note gate step passed: ${step.label} (${formatDuration(result.durationMs)})`);
  }
} finally {
  cleanupRepoGateProcesses('finishing the note-generation gate');
}

console.log('\nNote-generation regression gate passed.');
