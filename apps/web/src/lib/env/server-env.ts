import fs from 'fs';
import path from 'path';

let loadedOnce = false;

/**
 * Strip optional surrounding double or single quotes from an env value.
 */
export function cleanEnvValue(val: string | undefined): string {
  if (!val) return '';
  let trimmed = val.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    trimmed = trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

/**
 * Parse a .env / .env.local file and populate process.env for any unset or empty keys.
 */
function parseAndLoadEnvFile(filePath: string): void {
  if (!fs.existsSync(filePath)) return;
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const lines = raw.split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx <= 0) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const rawVal = trimmed.slice(eqIdx + 1);
      const val = cleanEnvValue(rawVal);
      if (!key) continue;
      if (!process.env[key] || !cleanEnvValue(process.env[key])) {
        process.env[key] = val;
      } else {
        process.env[key] = cleanEnvValue(process.env[key]);
      }
    }
  } catch {
    // Ignore file read errors in restricted environments
  }
}

/**
 * Ensures environment variables from both `apps/web/.env.local` and monorepo root `.env.local`
 * are loaded into `process.env` on the server. Never prints or logs secret values.
 */
export function loadMonorepoEnvLocal(): void {
  if (typeof window !== 'undefined') return;
  if (loadedOnce) return;
  loadedOnce = true;

  const cwd = process.cwd();
  const candidates = [
    path.resolve(cwd, '.env.local'),
    path.resolve(cwd, '..', '.env.local'),
    path.resolve(cwd, '..', '..', '.env.local'),
  ];

  for (const candidate of candidates) {
    parseAndLoadEnvFile(candidate);
  }
}

/**
 * Retrieve a server environment variable after ensuring `.env.local` is loaded.
 */
export function getServerEnv(key: string): string {
  loadMonorepoEnvLocal();
  return cleanEnvValue(process.env[key]);
}

/**
 * Inspects `.env.local` configuration status without exposing or returning any secret values.
 */
export function inspectEnvConfigurationStatus(): {
  supabaseUrlConfigured: boolean;
  publishableAnonKeyConfigured: boolean;
  publishableKeyFormat: 'sb_publishable' | 'jwt_anon' | 'placeholder_or_missing';
  secretServiceRoleKeyConfigured: boolean;
  secretKeyFormat: 'sb_secret' | 'jwt_service_role' | 'placeholder_or_missing';
  sessionSecretConfigured: boolean;
  initialOwnerPasswordConfigured: boolean;
  initialKamranPasswordConfigured: boolean;
  initialImranPasswordConfigured: boolean;
  placeholderVariables: string[];
  missingVariables: string[];
} {
  loadMonorepoEnvLocal();

  const url = cleanEnvValue(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const anonKey = cleanEnvValue(
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  );
  const serviceKey = cleanEnvValue(
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY
  );
  const sessionSecret = cleanEnvValue(process.env.ERP_SESSION_SECRET);
  const ownerPass = cleanEnvValue(process.env.INITIAL_OWNER_PASSWORD);
  const kamranPass = cleanEnvValue(process.env.INITIAL_KAMRAN_PASSWORD);
  const imranPass = cleanEnvValue(process.env.INITIAL_IMRAN_PASSWORD);

  const missingVariables: string[] = [];
  const placeholderVariables: string[] = [];

  if (!url) missingVariables.push('NEXT_PUBLIC_SUPABASE_URL');
  else if (url.includes('your-project-ref')) placeholderVariables.push('NEXT_PUBLIC_SUPABASE_URL');

  if (!anonKey) missingVariables.push('NEXT_PUBLIC_SUPABASE_ANON_KEY');
  else if (anonKey.includes('your-supabase-anon-public-key') || anonKey.includes('replace-with')) {
    placeholderVariables.push('NEXT_PUBLIC_SUPABASE_ANON_KEY');
  }

  if (!serviceKey) missingVariables.push('SUPABASE_SERVICE_ROLE_KEY');
  else if (serviceKey.includes('your-supabase-service-role-secret-key') || serviceKey.includes('replace-with')) {
    placeholderVariables.push('SUPABASE_SERVICE_ROLE_KEY');
  }

  if (!sessionSecret) missingVariables.push('ERP_SESSION_SECRET');
  else if (sessionSecret.includes('replace-with')) placeholderVariables.push('ERP_SESSION_SECRET');

  if (!ownerPass) missingVariables.push('INITIAL_OWNER_PASSWORD');
  else if (ownerPass === 'replace-with-owner-initial-password') {
    placeholderVariables.push('INITIAL_OWNER_PASSWORD');
  }

  if (!kamranPass) missingVariables.push('INITIAL_KAMRAN_PASSWORD');
  else if (kamranPass === 'replace-with-kamran-manager-initial-password') {
    placeholderVariables.push('INITIAL_KAMRAN_PASSWORD');
  }

  if (!imranPass) missingVariables.push('INITIAL_IMRAN_PASSWORD');
  else if (imranPass === 'replace-with-imran-manager-initial-password') {
    placeholderVariables.push('INITIAL_IMRAN_PASSWORD');
  }

  const supabaseUrlConfigured = Boolean(url && !url.includes('your-project-ref'));
  const publishableAnonKeyConfigured = Boolean(
    anonKey &&
      !anonKey.includes('your-supabase-anon-public-key') &&
      !anonKey.includes('replace-with')
  );
  const secretServiceRoleKeyConfigured = Boolean(
    serviceKey &&
      !serviceKey.includes('your-supabase-service-role-secret-key') &&
      !serviceKey.includes('replace-with')
  );

  const publishableKeyFormat = !publishableAnonKeyConfigured
    ? 'placeholder_or_missing'
    : anonKey.startsWith('sb_publishable_')
    ? 'sb_publishable'
    : 'jwt_anon';

  const secretKeyFormat = !secretServiceRoleKeyConfigured
    ? 'placeholder_or_missing'
    : serviceKey.startsWith('sb_secret_')
    ? 'sb_secret'
    : 'jwt_service_role';

  return {
    supabaseUrlConfigured,
    publishableAnonKeyConfigured,
    publishableKeyFormat,
    secretServiceRoleKeyConfigured,
    secretKeyFormat,
    sessionSecretConfigured: Boolean(sessionSecret),
    initialOwnerPasswordConfigured: Boolean(ownerPass),
    initialKamranPasswordConfigured: Boolean(kamranPass),
    initialImranPasswordConfigured: Boolean(imranPass),
    placeholderVariables,
    missingVariables,
  };
}
