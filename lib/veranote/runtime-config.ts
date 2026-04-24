type EnvMap = Record<string, string | undefined>;

function isProductionBuildPhase(env: EnvMap) {
  return env.NEXT_PHASE === 'phase-production-build' || env.npm_lifecycle_event === 'build';
}

export function getBetaRuntimeConfigIssues(env: EnvMap = process.env) {
  const issues: string[] = [];
  const isProduction = env.NODE_ENV === 'production';
  const authSecret = env.AUTH_SECRET || env.NEXTAUTH_SECRET;
  const hasBetaAccessCode = !!env.VERANOTE_BETA_ACCESS_CODE?.trim() || !!env.VERANOTE_BETA_ACCOUNT_CODES?.trim();
  const internalModeEnabled = env.NEXT_PUBLIC_VERANOTE_INTERNAL_MODE === 'true' || env.VERANOTE_INTERNAL_MODE === 'true';
  const hasCanonicalAppUrl = !!env.NEXT_PUBLIC_APP_URL?.trim() || !!env.APP_BASE_URL?.trim() || !!env.NEXTAUTH_URL?.trim();

  if (isProduction && !authSecret) {
    issues.push('AUTH_SECRET (or NEXTAUTH_SECRET) is required in production.');
  }

  if (isProduction && !hasCanonicalAppUrl) {
    issues.push('NEXTAUTH_URL or NEXT_PUBLIC_APP_URL (or APP_BASE_URL) is required in production.');
  }

  if (isProduction && !hasBetaAccessCode) {
    issues.push('A beta access code configuration is required in production.');
  }

  if (isProduction && internalModeEnabled) {
    issues.push('Internal mode must stay disabled in production beta environments.');
  }

  return issues;
}

export function assertSafeBetaRuntimeConfig(env: EnvMap = process.env) {
  const issues = getBetaRuntimeConfigIssues(env);

  if (env.NODE_ENV === 'production' && !isProductionBuildPhase(env) && issues.length > 0) {
    throw new Error(`Unsafe Veranote beta runtime configuration: ${issues.join(' ')}`);
  }

  return issues;
}
