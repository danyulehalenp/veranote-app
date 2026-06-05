#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';

const OUTPUT_DIR = process.env.VERANOTE_TEST_OUTPUT_DIR || 'test-results';
const CHUNK_SIZE = Number(process.env.VERANOTE_TEST_CHUNK_SIZE || 12);
const DEFAULT_TIMEOUT_MS = Number(process.env.VERANOTE_TEST_STEP_TIMEOUT_MS || 180000);
const HEAVY_TIMEOUT_MS = Number(process.env.VERANOTE_TEST_HEAVY_TIMEOUT_MS || 240000);
const SOURCE_PACKET_CASE_CHUNK_SIZE = Number(process.env.VERANOTE_SOURCE_PACKET_CASE_CHUNK_SIZE || 8);
const SOURCE_PACKET_TEST_FILE = 'tests/note-generation-source-packet-regression.test.ts';

const heavyFiles = new Set([
  'tests/note-builder-first25-cleanup-regression.test.ts',
  'tests/note-builder-medical-consult-regression.test.ts',
  'tests/note-builder-medical-h-and-p-regression.test.ts',
  'tests/note-builder-medical-overlap-regression.test.ts',
  'tests/note-builder-outpatient-followup-regression.test.ts',
  'tests/note-builder-progress-note-regression.test.ts',
  'tests/note-builder-provider-history-e2e.test.ts',
  'tests/note-builder-risk-heavy-regression.test.ts',
  'tests/note-builder-sparse-source-regression.test.ts',
  'tests/note-builder-substance-overlap-regression.test.ts',
  'tests/note-generation-core-workflow-readiness.test.ts',
  'tests/note-generation-ehr-coverage.test.ts',
  'tests/note-generation-messy-source-ordering.test.ts',
  'tests/note-generation-quality-audit.test.ts',
  SOURCE_PACKET_TEST_FILE,
  'tests/patient-continuity.test.ts',
  'tests/persistent-queue.test.ts',
  'tests/phase-three-batch1-regression.test.ts',
  'tests/phase-three-batch1-routing.test.ts',
  'tests/phase-three-batch2-regression.test.ts',
  'tests/phase-three-batch2-routing.test.ts',
  'tests/phase-three-batch3-routing.test.ts',
  'tests/phase-two-provider-simulation-regression.test.ts',
  'tests/phase-two-trust-cases.test.ts',
]);

function formatDuration(ms) {
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes ? `${minutes}m ${seconds}s` : `${seconds}s`;
}

function listTests() {
  const result = spawnSync('rg', ['--files', 'tests', '-g', '*.test.ts'], {
    encoding: 'utf8',
  });

  if (result.status !== 0) {
    throw new Error(result.stderr || 'Unable to list test files with rg.');
  }

  return result.stdout.trim().split('\n').filter(Boolean).sort();
}

function chunkFiles(files, size) {
  const chunks = [];
  for (let index = 0; index < files.length; index += size) {
    chunks.push(files.slice(index, index + size));
  }
  return chunks;
}

function listSourcePacketCaseIds() {
  const sourcePath = path.join('lib', 'eval', 'note-generation', 'source-packet-regression.ts');
  const source = readFileSync(sourcePath, 'utf8');
  const tableStart = source.indexOf('export const sourcePacketRegressionCases');
  const tableEnd = source.indexOf('function loadEvaluationEnv');
  if (tableStart < 0 || tableEnd < tableStart) {
    throw new Error('Unable to locate source-packet regression case table.');
  }

  const caseTable = source.slice(tableStart, tableEnd);
  return Array.from(caseTable.matchAll(/id:\s*'([^']+)'/g)).map((match) => match[1]);
}

function runVitestStep(step) {
  const startedAt = Date.now();
  const args = ['vitest', 'run', '--silent=true', '--maxWorkers=1', ...step.files];
  console.log(`\n=== Vitest stable: ${step.name} ===`);
  console.log(`$ npx ${args.join(' ')}`);

  const result = spawnSync('npx', args, {
    encoding: 'utf8',
    env: {
      ...process.env,
      ...(step.env || {}),
    },
    timeout: step.timeoutMs,
    maxBuffer: 1024 * 1024 * 20,
  });
  const durationMs = Date.now() - startedAt;
  const timedOut = result.error?.code === 'ETIMEDOUT';
  const status = timedOut ? 'timeout' : result.status === 0 ? 'passed' : 'failed';

  if (result.stdout) {
    process.stdout.write(result.stdout);
  }
  if (result.stderr) {
    process.stderr.write(result.stderr);
  }

  console.log(`Vitest stable step ${status}: ${step.name} (${formatDuration(durationMs)})`);

  return {
    name: step.name,
    files: step.files,
    command: `npx ${args.join(' ')}`,
    env: step.env || null,
    status,
    exitCode: result.status,
    signal: result.signal,
    durationMs,
    duration: formatDuration(durationMs),
    timedOut,
    error: result.error ? String(result.error) : null,
    stdoutTail: (result.stdout || '').slice(-5000),
    stderrTail: (result.stderr || '').slice(-5000),
  };
}

async function writeReport(report) {
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const jsonPath = path.join(OUTPUT_DIR, `full-vitest-stable-${stamp}.json`);
  const markdownPath = path.join(OUTPUT_DIR, `full-vitest-stable-${stamp}.md`);
  const failed = report.steps.filter((step) => step.status !== 'passed');

  await fs.writeFile(jsonPath, JSON.stringify(report, null, 2));
  await fs.writeFile(markdownPath, [
    '# Full Vitest Stable Run',
    '',
    `- Generated: ${report.generatedAt}`,
    `- Result: ${report.passed ? 'pass' : 'fail'}`,
    `- Duration: ${report.duration}`,
    `- Total files: ${report.totalFiles}`,
    `- Failed steps: ${failed.length}`,
    '',
    '## Steps',
    '',
    ...report.steps.map((step) => [
      `### ${step.name}`,
      `- Status: ${step.status}`,
      `- Duration: ${step.duration}`,
      `- Files: ${step.files.length}`,
      step.error ? `- Error: ${step.error}` : '',
    ].filter(Boolean).join('\n')),
    '',
  ].join('\n\n'));

  return { jsonPath, markdownPath };
}

async function main() {
  const startedAt = Date.now();
  const allFiles = listTests();
  const regularFiles = allFiles.filter((file) => !heavyFiles.has(file));
  const presentHeavyFiles = allFiles.filter((file) => heavyFiles.has(file) && file !== SOURCE_PACKET_TEST_FILE);
  const sourcePacketCaseIds = allFiles.includes(SOURCE_PACKET_TEST_FILE)
    ? listSourcePacketCaseIds()
    : [];
  const onlySourcePacket = process.env.VERANOTE_TEST_ONLY_SOURCE_PACKET === '1';
  const steps = [
    ...(onlySourcePacket ? [] : chunkFiles(regularFiles, CHUNK_SIZE).map((files, index) => ({
      name: `regular chunk ${index + 1}`,
      files,
      timeoutMs: DEFAULT_TIMEOUT_MS,
    }))),
    ...chunkFiles(sourcePacketCaseIds, SOURCE_PACKET_CASE_CHUNK_SIZE).map((caseIds, index) => ({
      name: `source-packet chunk ${index + 1}`,
      files: [SOURCE_PACKET_TEST_FILE],
      timeoutMs: HEAVY_TIMEOUT_MS,
      env: {
        VERANOTE_SOURCE_PACKET_REGRESSION_CASE_IDS: caseIds.join(','),
      },
    })),
    ...(onlySourcePacket ? [] : presentHeavyFiles.map((file) => ({
      name: `heavy ${file}`,
      files: [file],
      timeoutMs: HEAVY_TIMEOUT_MS,
    }))),
  ];

  const results = [];
  for (const step of steps) {
    results.push(runVitestStep(step));
  }

  const durationMs = Date.now() - startedAt;
  const failed = results.filter((step) => step.status !== 'passed');
  const report = {
    generatedAt: new Date().toISOString(),
    passed: failed.length === 0,
    durationMs,
    duration: formatDuration(durationMs),
    totalFiles: allFiles.length,
    chunkSize: CHUNK_SIZE,
    steps: results,
  };
  const reportPaths = await writeReport(report);

  console.log('\n=== Full Vitest stable summary ===');
  console.log(JSON.stringify({
    passed: report.passed,
    duration: report.duration,
    totalFiles: report.totalFiles,
    failedSteps: failed.map((step) => ({
      name: step.name,
      status: step.status,
      files: step.files,
    })),
    reportPaths,
  }, null, 2));

  process.exit(report.passed ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
