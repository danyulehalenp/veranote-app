#!/usr/bin/env node

/**
 * Veranote beta readiness gate.
 *
 * This is intentionally a coordinator, not a replacement for the underlying
 * gates. Each command keeps its own detailed report; this script gives Daniel
 * one repeatable pre-beta command with a concise pass/fail summary.
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';

const OUTPUT_DIR = process.env.BETA_GATE_OUTPUT_DIR || 'test-results';
const COMMANDS = [
  {
    name: 'Production domain smoke check',
    command: 'curl',
    args: ['-I', '--max-time', '25', 'https://app.veranote.org'],
    required: true,
  },
  {
    name: 'Live note end-to-end QA',
    command: 'npm',
    args: ['run', 'live:note:e2e'],
    required: true,
  },
  {
    name: 'Live note workflow matrix QA',
    command: 'npm',
    args: ['run', 'live:note:matrix'],
    required: true,
  },
  {
    name: 'Atlas clinical regression gate',
    command: 'npm',
    args: ['run', 'atlas:gate'],
    required: true,
  },
  {
    name: 'Note generation regression gate',
    command: 'npm',
    args: ['run', 'note:gate'],
    required: true,
  },
  {
    name: 'Next production build',
    command: 'npm',
    args: ['run', 'build'],
    required: true,
  },
  {
    name: 'Patch whitespace check',
    command: 'git',
    args: ['diff', '--check'],
    required: true,
  },
];

function formatDuration(ms) {
  const seconds = Math.round(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;

  if (!minutes) {
    return `${remainingSeconds}s`;
  }

  return `${minutes}m ${remainingSeconds}s`;
}

function runCommand(step) {
  const startedAt = Date.now();

  return new Promise((resolve) => {
    console.log(`\n=== ${step.name} ===`);
    console.log(`$ ${[step.command, ...step.args].join(' ')}`);

    const child = spawn(step.command, step.args, {
      stdio: 'inherit',
      env: process.env,
    });

    child.on('close', (code, signal) => {
      const durationMs = Date.now() - startedAt;
      resolve({
        name: step.name,
        command: [step.command, ...step.args].join(' '),
        required: step.required,
        status: code === 0 ? 'passed' : 'failed',
        exitCode: code,
        signal,
        durationMs,
        duration: formatDuration(durationMs),
      });
    });

    child.on('error', (error) => {
      const durationMs = Date.now() - startedAt;
      resolve({
        name: step.name,
        command: [step.command, ...step.args].join(' '),
        required: step.required,
        status: 'failed',
        exitCode: null,
        signal: null,
        durationMs,
        duration: formatDuration(durationMs),
        error: error instanceof Error ? error.message : String(error),
      });
    });
  });
}

async function writeReport(report) {
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  const date = new Date().toISOString().slice(0, 10);
  const jsonPath = path.join(OUTPUT_DIR, `beta-readiness-gate-${date}.json`);
  const markdownPath = path.join(OUTPUT_DIR, `beta-readiness-gate-${date}.md`);

  await fs.writeFile(jsonPath, JSON.stringify(report, null, 2));
  await fs.writeFile(markdownPath, [
    '# Veranote Beta Readiness Gate',
    '',
    `- Generated: ${report.generatedAt}`,
    `- Result: ${report.passed ? 'pass' : 'fail'}`,
    `- Duration: ${report.duration}`,
    '',
    '## Steps',
    '',
    ...report.steps.map((step) => [
      `### ${step.name}`,
      `- Status: ${step.status}`,
      `- Command: \`${step.command}\``,
      `- Duration: ${step.duration}`,
      step.error ? `- Error: ${step.error}` : '',
    ].filter(Boolean).join('\n')),
    '',
  ].join('\n\n'));

  return { jsonPath, markdownPath };
}

async function main() {
  const startedAt = Date.now();
  const steps = [];

  for (const step of COMMANDS) {
    const result = await runCommand(step);
    steps.push(result);

    if (result.status !== 'passed' && step.required) {
      break;
    }
  }

  const durationMs = Date.now() - startedAt;
  const failed = steps.filter((step) => step.status !== 'passed');
  const report = {
    generatedAt: new Date().toISOString(),
    passed: failed.length === 0 && steps.length === COMMANDS.length,
    durationMs,
    duration: formatDuration(durationMs),
    steps,
  };
  const paths = await writeReport(report);

  console.log('\n=== Beta readiness summary ===');
  console.log(JSON.stringify({ ...report, reportPaths: paths }, null, 2));

  if (!report.passed) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
