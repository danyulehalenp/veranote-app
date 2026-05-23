#!/usr/bin/env node

/**
 * Daily Veranote status monitor.
 *
 * Operational only: this does not print env values, secrets, PHI, or private
 * messages. It is intentionally scoped to the canonical Veranote production app.
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const CANONICAL_REPO = process.env.VERANOTE_CANONICAL_REPO
  || '/Users/danielhale/.openclaw/workspace/app-prototype';
const EXPECTED_REMOTE = 'https://github.com/danyulehalenp/veranote-app.git';
const EXPECTED_PACKAGE_NAME = 'clinical-documentation-transformer';
const OUTPUT_DIR = process.env.VERANOTE_DAILY_STATUS_OUTPUT_DIR || 'test-results';
const RUN_DURABLE = process.env.VERANOTE_DAILY_STATUS_DURABLE === '1';

function commandToString(command, args = []) {
  return [command, ...args].join(' ');
}

function run(command, args = [], options = {}) {
  const startedAt = Date.now();
  const result = spawnSync(command, args, {
    cwd: CANONICAL_REPO,
    encoding: 'utf8',
    timeout: options.timeoutMs || 120_000,
    env: {
      ...process.env,
      ...(options.env || {}),
    },
  });

  return {
    command: commandToString(command, args),
    status: result.status,
    signal: result.signal,
    passed: result.status === 0,
    durationMs: Date.now() - startedAt,
    stdout: (result.stdout || '').trim(),
    stderr: (result.stderr || '').trim(),
  };
}

function parseJsonFromOutput(output) {
  const trimmed = output.trim();
  const jsonStart = trimmed.indexOf('{');
  if (jsonStart === -1) {
    return null;
  }

  try {
    return JSON.parse(trimmed.slice(jsonStart));
  } catch {
    return null;
  }
}

function shortOutput(text, maxLength = 2400) {
  const normalized = text.replace(/\s+\n/g, '\n').trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength)}\n...truncated`;
}

function assertCanonicalRepo() {
  const resolved = path.resolve(CANONICAL_REPO);
  if (!fs.existsSync(resolved)) {
    throw new Error(`Canonical Veranote repo does not exist: ${resolved}`);
  }

  const packagePath = path.join(resolved, 'package.json');
  if (!fs.existsSync(packagePath)) {
    throw new Error(`Canonical Veranote repo is missing package.json: ${packagePath}`);
  }

  const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
  if (packageJson.name !== EXPECTED_PACKAGE_NAME) {
    throw new Error(`Wrong package name at ${resolved}: expected ${EXPECTED_PACKAGE_NAME}, got ${packageJson.name || 'unknown'}`);
  }

  const remote = spawnSync('git', ['remote', 'get-url', 'origin'], {
    cwd: resolved,
    encoding: 'utf8',
  });
  const remoteUrl = (remote.stdout || '').trim();
  if (remote.status !== 0 || remoteUrl !== EXPECTED_REMOTE) {
    throw new Error(`Wrong Git remote at ${resolved}: expected ${EXPECTED_REMOTE}, got ${remoteUrl || 'none'}`);
  }

  return resolved;
}

function lineList(items) {
  if (!items.length) {
    return '- None';
  }
  return items.map((item) => `- ${item}`).join('\n');
}

function markdownReport(report) {
  const latest = report.git.latestCommit;
  const production = report.productionSmoke.parsed;
  const connectivity = report.connectivity.parsed;
  const vercelReady = report.vercelDeployments.stdout.includes('● Ready');
  const dirty = report.git.trackedDirtyFiles;

  return [
    `# Veranote Daily Status - ${report.checkedAt.slice(0, 10)}`,
    '',
    '## Canonical Repo',
    `- Path: \`${report.repoPath}\``,
    `- Remote: \`${EXPECTED_REMOTE}\``,
    `- Branch: \`${report.git.branchLine || 'unknown'}\``,
    `- Latest commit: \`${latest.shortHash || 'unknown'}\` ${latest.subject || ''}`,
    '',
    '## Build And Connectivity',
    `- Local build: ${report.build.passed ? 'passed' : 'failed'}`,
    `- Connectivity: ${connectivity?.status || (report.connectivity.passed ? 'passed' : 'failed')}`,
    `- Durable storage mode: ${connectivity?.durableStorageMode || 'unknown'}`,
    `- Connectivity warnings: ${(connectivity?.warnings || []).length}`,
    `- Connectivity criticals: ${(connectivity?.critical || []).length}`,
    '',
    '## Production',
    `- Vercel latest deployment ready: ${vercelReady ? 'yes' : 'unknown'}`,
    `- Production smoke: ${production?.passed ? 'passed' : 'failed'}`,
    `- Primary URL healthy: ${production?.primaryHealthy ? 'yes' : 'no'}`,
    `- Fallback URL healthy: ${production?.fallbackHealthy ? 'yes' : 'no'}`,
    `- Network block likely: ${production?.networkBlockLikely ? 'yes' : 'no'}`,
    `- Guidance: ${production?.guidance || 'not available'}`,
    '',
    '## Local Worktree',
    `- Tracked dirty files: ${dirty.length}`,
    lineList(dirty.map((file) => `\`${file}\``)),
    `- Untracked files hidden from this summary: ${report.git.untrackedCount}`,
    '',
    '## Optional Durable Browser Check',
    RUN_DURABLE
      ? `- Result: ${report.productionDurable?.passed ? 'passed' : 'failed'}`
      : '- Result: skipped by default; set `VERANOTE_DAILY_STATUS_DURABLE=1` to run it.',
    '',
    '## Recommended Next Steps',
    ...report.recommendedNextSteps.map((step, index) => `${index + 1}. ${step}`),
    '',
  ].join('\n');
}

async function main() {
  const repoPath = assertCanonicalRepo();
  fs.mkdirSync(path.join(repoPath, OUTPUT_DIR), { recursive: true });

  const gitStatus = run('git', ['status', '--short', '--branch']);
  const gitStatusNoUntracked = run('git', ['status', '--short', '--branch', '--untracked-files=no']);
  const gitLog = run('git', ['log', '-1', '--format=%h%n%H%n%s%n%ci']);
  const build = run('npm', ['run', 'build'], { timeoutMs: 240_000 });
  const connectivity = run('npm', ['run', 'connectivity:health'], { timeoutMs: 120_000 });
  const productionSmoke = run('npm', ['run', 'production:smoke'], { timeoutMs: 120_000 });
  const vercelDeployments = run('npx', ['vercel', 'ls'], { timeoutMs: 120_000 });
  const productionDurable = RUN_DURABLE
    ? run('npm', ['run', 'production:durable'], { timeoutMs: 180_000 })
    : null;

  const gitLines = gitStatus.stdout.split(/\r?\n/).filter(Boolean);
  const branchLine = gitLines.find((line) => line.startsWith('##')) || '';
  const trackedDirtyFiles = gitStatusNoUntracked.stdout
    .split(/\r?\n/)
    .filter((line) => line && !line.startsWith('##'))
    .map((line) => line.replace(/^.. /, '').trim())
    .filter(Boolean);
  const untrackedCount = gitLines.filter((line) => line.startsWith('??')).length;
  const [shortHash, fullHash, subject, committedAt] = gitLog.stdout.split(/\r?\n/);

  const report = {
    project: 'Veranote',
    checkedAt: new Date().toISOString(),
    repoPath,
    expectedRemote: EXPECTED_REMOTE,
    git: {
      branchLine,
      latestCommit: {
        shortHash,
        fullHash,
        subject,
        committedAt,
      },
      trackedDirtyFiles,
      untrackedCount,
      statusShortNoUntracked: gitStatusNoUntracked.stdout,
    },
    build: {
      passed: build.passed,
      durationMs: build.durationMs,
      excerpt: shortOutput(`${build.stdout}\n${build.stderr}`),
    },
    connectivity: {
      passed: connectivity.passed,
      parsed: parseJsonFromOutput(connectivity.stdout),
      excerpt: shortOutput(`${connectivity.stdout}\n${connectivity.stderr}`),
    },
    productionSmoke: {
      passed: productionSmoke.passed,
      parsed: parseJsonFromOutput(productionSmoke.stdout || productionSmoke.stderr),
      excerpt: shortOutput(`${productionSmoke.stdout}\n${productionSmoke.stderr}`),
    },
    vercelDeployments: {
      passed: vercelDeployments.passed,
      excerpt: shortOutput(`${vercelDeployments.stdout}\n${vercelDeployments.stderr}`),
      stdout: vercelDeployments.stdout,
    },
    productionDurable: productionDurable
      ? {
          passed: productionDurable.passed,
          parsed: parseJsonFromOutput(productionDurable.stdout || productionDurable.stderr),
          excerpt: shortOutput(`${productionDurable.stdout}\n${productionDurable.stderr}`),
        }
      : null,
    recommendedNextSteps: [
      'Keep the automation pointed at the canonical repo path and ignore reports from other checkouts unless intentionally requested.',
      'Review and either commit or discard the two tracked local dashboard/template edits after confirming they are still desired.',
      'Continue UX simplification of provider-facing workflow pages so internal planning controls do not crowd clinical note work.',
      'Run the full note-generation bank before larger beta milestones: npm run note:gate:full.',
      'Keep Supabase billing active and monitor connectivity:health for storage warnings.',
    ],
  };

  const date = new Date().toISOString().slice(0, 10);
  const jsonPath = path.join(repoPath, OUTPUT_DIR, `veranote-daily-status-${date}.json`);
  const markdownPath = path.join(repoPath, OUTPUT_DIR, `veranote-daily-status-${date}.md`);
  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));
  fs.writeFileSync(markdownPath, markdownReport(report));

  console.log(JSON.stringify({
    passed: build.passed && connectivity.passed && productionSmoke.passed && vercelDeployments.passed,
    checkedAt: report.checkedAt,
    repoPath,
    latestCommit: report.git.latestCommit.shortHash,
    buildPassed: build.passed,
    connectivityStatus: report.connectivity.parsed?.status || 'unknown',
    productionClassification: report.productionSmoke.parsed?.classification || 'unknown',
    networkBlockLikely: Boolean(report.productionSmoke.parsed?.networkBlockLikely),
    trackedDirtyFiles,
    untrackedCount,
    jsonPath,
    markdownPath,
  }, null, 2));

  if (!build.passed || !connectivity.passed || !productionSmoke.passed || !vercelDeployments.passed) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(JSON.stringify({
    passed: false,
    message: error instanceof Error ? error.message : String(error),
    checkedAt: new Date().toISOString(),
  }, null, 2));
  process.exit(1);
});
