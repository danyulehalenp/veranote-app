import { getSupabaseAdminClient } from '@/lib/db/supabase-client';
import { shouldUseDurableSupabaseStorage } from '@/lib/db/client';

export type ConnectivityStatus = 'healthy' | 'warning' | 'critical' | 'unknown';

export type ConnectivityCheck = {
  id: string;
  label: string;
  status: ConnectivityStatus;
  summary: string;
  detail?: string;
  checkedAt: string;
};

export type ConnectivityHealthReport = {
  status: ConnectivityStatus;
  checkedAt: string;
  durableStorageMode: 'supabase' | 'prototype';
  checks: ConnectivityCheck[];
  recommendedActions: string[];
};

const CORE_DURABLE_TABLES = [
  'veranote_drafts',
  'veranote_provider_settings',
  'veranote_note_presets',
  'veranote_dictation_audit_events',
  'veranote_assistant_learning',
  'veranote_memory_ledgers',
  'veranote_patient_continuity',
  'veranote_beta_feedback',
  'veranote_app_state',
] as const;

const OPERATIONAL_TABLES = [
  'audit_logs',
  'request_metrics',
  'error_metrics',
  'model_usage',
  'async_tasks',
  'rate_limits',
] as const;

export const CONNECTIVITY_TABLES = [
  ...CORE_DURABLE_TABLES,
  ...OPERATIONAL_TABLES,
] as const;

function hasValue(value: string | undefined) {
  return Boolean(value?.trim());
}

function checkStatusRank(status: ConnectivityStatus) {
  switch (status) {
    case 'critical':
      return 3;
    case 'warning':
      return 2;
    case 'unknown':
      return 1;
    case 'healthy':
    default:
      return 0;
  }
}

export function getOverallConnectivityStatus(checks: ConnectivityCheck[]): ConnectivityStatus {
  return checks.reduce<ConnectivityStatus>((current, check) => (
    checkStatusRank(check.status) > checkStatusRank(current) ? check.status : current
  ), 'healthy');
}

function createCheck(input: Omit<ConnectivityCheck, 'checkedAt'>, checkedAt: string): ConnectivityCheck {
  return {
    ...input,
    checkedAt,
  };
}

export function buildConfigurationChecks(env: NodeJS.ProcessEnv = process.env, checkedAt = new Date().toISOString()) {
  const durableEnabled = shouldUseDurableSupabaseStorage(env);
  const durableConfigured = hasValue(env.SUPABASE_URL) && hasValue(env.SUPABASE_SERVICE_ROLE_KEY);
  const publicSupabaseConfigured = hasValue(env.NEXT_PUBLIC_SUPABASE_URL) || hasValue(env.SUPABASE_URL);
  const authConfigured = hasValue(env.AUTH_SECRET) || hasValue(env.NEXTAUTH_SECRET);
  const appUrlConfigured = hasValue(env.NEXTAUTH_URL) || hasValue(env.NEXT_PUBLIC_APP_URL) || hasValue(env.APP_BASE_URL);
  const betaAccessConfigured = hasValue(env.VERANOTE_BETA_ACCESS_CODE) || hasValue(env.VERANOTE_BETA_ACCESS_CODES);
  const openAiConfigured = hasValue(env.OPENAI_API_KEY);

  return [
    createCheck({
      id: 'durable-storage-mode',
      label: 'Durable storage mode',
      status: durableEnabled ? 'healthy' : 'warning',
      summary: durableEnabled ? 'Production persistence is configured to use Supabase.' : 'Supabase durable storage is not enabled.',
      detail: durableEnabled
        ? 'Saved drafts, settings, presets, patient continuity, and assistant learning should use the server-side Supabase path.'
        : 'The app will fall back to prototype file/tmp storage, which is not safe for production persistence.',
    }, checkedAt),
    createCheck({
      id: 'supabase-server-env',
      label: 'Supabase server credentials',
      status: durableConfigured ? 'healthy' : 'critical',
      summary: durableConfigured ? 'Server-side Supabase credentials are present.' : 'Server-side Supabase credentials are missing.',
      detail: 'This check only reports whether required values exist; it never returns secret values.',
    }, checkedAt),
    createCheck({
      id: 'supabase-public-env',
      label: 'Supabase public URL',
      status: publicSupabaseConfigured ? 'healthy' : 'warning',
      summary: publicSupabaseConfigured ? 'A Supabase project URL is configured.' : 'No Supabase project URL is configured.',
    }, checkedAt),
    createCheck({
      id: 'auth-config',
      label: 'Auth/session configuration',
      status: authConfigured && appUrlConfigured && betaAccessConfigured ? 'healthy' : 'critical',
      summary: authConfigured && appUrlConfigured && betaAccessConfigured
        ? 'Auth secret, app URL, and beta access configuration are present.'
        : 'Auth/session setup is incomplete.',
      detail: 'Missing auth config can look like redirect loops, sign-in failures, or sessions that do not persist.',
    }, checkedAt),
    createCheck({
      id: 'ai-provider-config',
      label: 'AI provider configuration',
      status: openAiConfigured ? 'healthy' : 'warning',
      summary: openAiConfigured ? 'OpenAI API configuration is present.' : 'OpenAI API key is not configured.',
      detail: 'Without this, live generation may fall back to mock or fail depending on the route.',
    }, checkedAt),
  ];
}

async function checkSupabaseTable(tableName: string, checkedAt: string): Promise<ConnectivityCheck> {
  const supabase = getSupabaseAdminClient();

  if (!supabase) {
    return createCheck({
      id: `supabase-table-${tableName}`,
      label: tableName,
      status: 'critical',
      summary: 'Supabase admin client is unavailable.',
      detail: 'SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for this table check.',
    }, checkedAt);
  }

  try {
    const { error, count } = await supabase
      .from(tableName)
      .select('*', { count: 'exact', head: true });

    if (error) {
      return createCheck({
        id: `supabase-table-${tableName}`,
        label: tableName,
        status: 'critical',
        summary: 'Table check failed.',
        detail: error.code ? `Supabase returned ${error.code}.` : 'Supabase returned an error for this table.',
      }, checkedAt);
    }

    return createCheck({
      id: `supabase-table-${tableName}`,
      label: tableName,
      status: 'healthy',
      summary: 'Reachable through the server-only Supabase path.',
      detail: typeof count === 'number' ? `Rows visible to service role: ${count}.` : undefined,
    }, checkedAt);
  } catch (error) {
    return createCheck({
      id: `supabase-table-${tableName}`,
      label: tableName,
      status: 'critical',
      summary: 'Table check threw before completion.',
      detail: error instanceof Error ? error.message.slice(0, 180) : 'Unknown Supabase table check error.',
    }, checkedAt);
  }
}

export async function getConnectivityHealthReport(env: NodeJS.ProcessEnv = process.env): Promise<ConnectivityHealthReport> {
  const checkedAt = new Date().toISOString();
  const configChecks = buildConfigurationChecks(env, checkedAt);
  const durableStorageMode = shouldUseDurableSupabaseStorage(env) ? 'supabase' : 'prototype';
  const tableChecks = durableStorageMode === 'supabase'
    ? await Promise.all(CONNECTIVITY_TABLES.map((table) => checkSupabaseTable(table, checkedAt)))
    : [];

  const checks = [...configChecks, ...tableChecks];
  const status = getOverallConnectivityStatus(checks);
  const criticalChecks = checks.filter((check) => check.status === 'critical');
  const warningChecks = checks.filter((check) => check.status === 'warning');

  const recommendedActions = [
    criticalChecks.length
      ? 'Fix critical connectivity checks before trusting production persistence.'
      : 'No critical connectivity failures detected.',
    warningChecks.length
      ? 'Review warning checks and confirm they are intentional for the current environment.'
      : 'No warning checks detected.',
    durableStorageMode === 'supabase'
      ? 'Keep Supabase billing active; a paused project can break saved drafts, patient continuity, and settings.'
      : 'Do not use prototype storage for production persistence.',
  ];

  return {
    status,
    checkedAt,
    durableStorageMode,
    checks,
    recommendedActions,
  };
}
