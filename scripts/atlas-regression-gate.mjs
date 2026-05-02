#!/usr/bin/env node

import { spawnSync } from 'node:child_process';

const vitestSuites = [
  'tests/atlas-clinical-blueprint.test.ts',
  'tests/live-assistant-conversation-route.test.ts',
  'tests/live-assistant-answer-quality.test.ts',
  'tests/med-reference.test.ts',
  'tests/assistant-med-reference-routing.test.ts',
  'tests/atlas-med-expansion-batch1.test.ts',
  'tests/atlas-med-expansion-batch2.test.ts',
  'tests/atlas-med-expansion-batch3.test.ts',
  'tests/assistant-medication-knowledge.test.ts',
  'tests/assistant-medication-stress-routing.test.ts',
  'tests/psych-med-library.test.ts',
  'tests/psych-med-switching.test.ts',
  'tests/assistant-psych-med-knowledge.test.ts',
  'tests/provider-history-medication-scenario-regression.test.ts',
  'tests/atlas-history-med-batch1-routing.test.ts',
  'tests/atlas-history-med-batch2-safety.test.ts',
  'tests/atlas-history-med-final-cleanup.test.ts',
  'tests/atlas-history-med-question-bank.test.ts',
  'tests/atlas-clinical-lab-simulation-bank.test.ts',
];

const simulationCheck = `
import { runAtlasHistoryMedSimulation } from './lib/eval/med-reference/run-atlas-history-med-simulation.ts';
import { runAtlasClinicalLabSimulationBank } from './lib/eval/clinical-labs/atlas-clinical-lab-simulation-bank.ts';
import { summarizeAtlasClinicalLabSimulation } from './lib/eval/clinical-labs/run-atlas-clinical-lab-simulation.ts';

const history = runAtlasHistoryMedSimulation();
const labResults = runAtlasClinicalLabSimulationBank();
const labs = summarizeAtlasClinicalLabSimulation(labResults);

const failures = [];

if (history.summary.totalCases !== 70 || history.summary.passed !== 70 || history.summary.failed !== 0) {
  failures.push(\`History-derived med/lab simulation expected 70/70, got \${history.summary.passed}/\${history.summary.totalCases} with \${history.summary.failed} failed.\`);
}

if (history.summary.unsafeAnswerCount !== 0) {
  failures.push(\`History-derived med/lab simulation expected 0 unsafe answers, got \${history.summary.unsafeAnswerCount}.\`);
}

if (labs.totalCases !== 100 || labs.passed !== 100 || labs.failed !== 0) {
  failures.push(\`Clinical lab simulation expected 100/100, got \${labs.passed}/\${labs.totalCases} with \${labs.failed} failed.\`);
}

if (labs.unsafeAnswerCount !== 0) {
  failures.push(\`Clinical lab simulation expected 0 unsafe answers, got \${labs.unsafeAnswerCount}.\`);
}

console.log(JSON.stringify({
  history: {
    passed: history.summary.passed,
    total: history.summary.totalCases,
    failed: history.summary.failed,
    unsafeAnswerCount: history.summary.unsafeAnswerCount,
  },
  labs: {
    passed: labs.passed,
    total: labs.totalCases,
    failed: labs.failed,
    unsafeAnswerCount: labs.unsafeAnswerCount,
    failuresByRootCause: labs.failuresByRootCause,
  },
}, null, 2));

if (failures.length > 0) {
  throw new Error(['Atlas simulation gate failed:', ...failures].join('\\n- '));
}
`;

const steps = [
  {
    name: 'Protected Atlas simulations',
    command: 'npx',
    args: ['tsx', '--tsconfig', 'tsconfig.json', '-e', simulationCheck],
    displayCommand: 'npx tsx --tsconfig tsconfig.json -e <protected simulation assertions>',
  },
  {
    name: 'Medication/reference/routing/switching Vitest stack',
    command: 'npx',
    args: ['vitest', 'run', '--silent=true', '--maxWorkers=1', ...vitestSuites],
  },
  {
    name: 'Assistant eval',
    command: 'npm',
    args: ['run', 'eval:vera'],
  },
  {
    name: 'Production build',
    command: 'npm',
    args: ['run', 'build'],
  },
];

function runStep(step) {
  const startedAt = Date.now();
  console.log(`\n=== Atlas gate: ${step.name} ===`);
  console.log(`$ ${step.displayCommand ?? [step.command, ...step.args].join(' ')}`);

  const result = spawnSync(step.command, step.args, {
    stdio: 'inherit',
    shell: false,
    env: process.env,
  });

  const durationSeconds = ((Date.now() - startedAt) / 1000).toFixed(1);

  if (result.error) {
    console.error(`\\nAtlas gate failed during "${step.name}" after ${durationSeconds}s.`);
    console.error(result.error);
    process.exit(1);
  }

  if (result.status !== 0) {
    console.error(`\\nAtlas gate failed during "${step.name}" after ${durationSeconds}s with exit code ${result.status}.`);
    process.exit(result.status ?? 1);
  }

  console.log(`Atlas gate step passed: ${step.name} (${durationSeconds}s)`);
}

console.log('Atlas regression gate starting.');
console.log('Protected baseline: history simulation 70/70, clinical lab simulation 100/100, unsafe answers 0, med/routing stack green, eval green, build green.');

for (const step of steps) {
  runStep(step);
}

console.log('\nAtlas regression gate passed.');
