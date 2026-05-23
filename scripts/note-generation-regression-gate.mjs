import { spawnSync } from 'node:child_process';

const liveGenerationEnv = {
  VERANOTE_ALLOW_OPENAI: process.env.VERANOTE_ALLOW_OPENAI || '1',
  VERANOTE_NOTE_GENERATION_TIMEOUT_MS: process.env.VERANOTE_NOTE_GENERATION_TIMEOUT_MS || '60000',
};

const gateScope = (process.env.VERANOTE_NOTE_GATE_SCOPE || 'representative').trim().toLowerCase();
const stepTimeoutMs = Number.parseInt(process.env.VERANOTE_NOTE_GATE_STEP_TIMEOUT_MS || '900000', 10);

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

const steps = [
  promptAndSourceStep,
  {
    label: gateScope === 'full'
      ? 'Focused note-builder regression set'
      : 'Representative note-builder regression set',
    command: 'npx',
    args: [
      'vitest',
      'run',
      '--silent=true',
      '--maxWorkers=1',
      ...noteBuilderRegressionArgs,
    ],
    env: liveGenerationEnv,
  },
  {
    label: 'Production build',
    command: 'npm',
    args: ['run', 'build'],
  },
];

console.log('Note-generation regression gate starting.');
console.log(`Scope: ${gateScope === 'full' ? 'full exhaustive live bank' : 'representative bounded live gate'}.`);
console.log('Protected baseline: four-lane source packets, prompt fidelity directives, focused note-builder regressions, build green.');

for (const step of steps) {
  console.log(`\n=== Note gate: ${step.label} ===`);
  console.log(`$ ${step.command} ${step.args.join(' ')}`);
  const result = spawnSync(step.command, step.args, {
    cwd: process.cwd(),
    stdio: 'inherit',
    timeout: Number.isFinite(stepTimeoutMs) ? stepTimeoutMs : 900000,
    env: {
      ...process.env,
      ...(step.env || {}),
    },
  });

  if (result.status !== 0) {
    if (result.signal) {
      console.error(`Note-generation gate timed out or was terminated at step: ${step.label} (${result.signal})`);
    }
    console.error(`Note-generation gate failed at step: ${step.label}`);
    process.exit(result.status ?? 1);
  }

  console.log(`Note gate step passed: ${step.label}`);
}

console.log('\nNote-generation regression gate passed.');
