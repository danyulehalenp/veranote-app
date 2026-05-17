#!/usr/bin/env node

/**
 * Safe Veranote connectivity health check.
 * Prints operational status only. Never prints secrets or patient content.
 */

import nextEnv from '@next/env';

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

const { getConnectivityHealthReport } = await import('../lib/veranote/connectivity-health.ts');

const report = await getConnectivityHealthReport();
const summary = {
  status: report.status,
  checkedAt: report.checkedAt,
  durableStorageMode: report.durableStorageMode,
  critical: report.checks.filter((check) => check.status === 'critical').map((check) => check.label),
  warnings: report.checks.filter((check) => check.status === 'warning').map((check) => check.label),
  healthyCount: report.checks.filter((check) => check.status === 'healthy').length,
  recommendedActions: report.recommendedActions,
};

console.log(JSON.stringify(summary, null, 2));
process.exit(report.status === 'critical' ? 1 : 0);
