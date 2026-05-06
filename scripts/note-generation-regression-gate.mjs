import { spawnSync } from 'node:child_process';

const liveGenerationEnv = {
  VERANOTE_ALLOW_OPENAI: process.env.VERANOTE_ALLOW_OPENAI || '1',
};

const steps = [
  {
    label: 'Prompt and source-packet note generation regression',
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
    env: liveGenerationEnv,
  },
  {
    label: 'Focused note-builder regression set',
    command: 'npx',
    args: [
      'vitest',
      'run',
      '--silent=true',
      '--maxWorkers=1',
      'tests/note-builder-first25-cleanup-regression.test.ts',
      'tests/note-builder-sparse-source-regression.test.ts',
      'tests/note-builder-risk-heavy-regression.test.ts',
      'tests/note-builder-substance-overlap-regression.test.ts',
      'tests/note-builder-medical-overlap-regression.test.ts',
      'tests/note-builder-outpatient-followup-regression.test.ts',
      'tests/note-builder-progress-note-regression.test.ts',
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
console.log('Protected baseline: four-lane source packets, prompt fidelity directives, focused note-builder regressions, build green.');

for (const step of steps) {
  console.log(`\n=== Note gate: ${step.label} ===`);
  console.log(`$ ${step.command} ${step.args.join(' ')}`);
  const result = spawnSync(step.command, step.args, {
    cwd: process.cwd(),
    stdio: 'inherit',
    env: {
      ...process.env,
      ...(step.env || {}),
    },
  });

  if (result.status !== 0) {
    console.error(`Note-generation gate failed at step: ${step.label}`);
    process.exit(result.status ?? 1);
  }

  console.log(`Note gate step passed: ${step.label}`);
}

console.log('\nNote-generation regression gate passed.');
