import { createClient } from '@supabase/supabase-js';
import { cleanEnvValue, loadMonorepoEnvLocal } from '@/lib/env/server-env';

if (typeof window === 'undefined') {
  loadMonorepoEnvLocal();
}

function getSupabaseConfig() {
  if (typeof window === 'undefined') {
    loadMonorepoEnvLocal();
  }

  const supabaseUrl = cleanEnvValue(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const supabasePublishableOrAnonKey = cleanEnvValue(
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  );
  const supabaseSecretOrServiceRoleKey =
    typeof window === 'undefined'
      ? cleanEnvValue(
          process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY
        )
      : '';

  // Guard: never allow a secret key (sb_secret_) to be placed in NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (supabasePublishableOrAnonKey.startsWith('sb_secret_')) {
    throw new Error(
      'SECURITY ERROR: A Supabase Secret key (sb_secret_) was assigned to NEXT_PUBLIC_SUPABASE_ANON_KEY. Use a Publishable key (sb_publishable_) for NEXT_PUBLIC_SUPABASE_ANON_KEY and keep sb_secret_ in SUPABASE_SERVICE_ROLE_KEY (server-only).'
    );
  }

  const hasValidUrl = Boolean(
    supabaseUrl &&
      supabaseUrl.startsWith('http') &&
      !supabaseUrl.includes('your-project-ref')
  );

  const hasValidPublishableKey = Boolean(
    supabasePublishableOrAnonKey &&
      !supabasePublishableOrAnonKey.includes('your-supabase-anon-public-key') &&
      !supabasePublishableOrAnonKey.includes('replace-with')
  );

  const hasValidSecretKey = Boolean(
    supabaseSecretOrServiceRoleKey &&
      !supabaseSecretOrServiceRoleKey.includes('your-supabase-service-role-secret-key') &&
      !supabaseSecretOrServiceRoleKey.includes('replace-with')
  );

  return {
    supabaseUrl,
    supabasePublishableOrAnonKey,
    supabaseSecretOrServiceRoleKey,
    isConfigured: hasValidUrl && hasValidPublishableKey,
    hasAdminSecretKey: hasValidUrl && hasValidSecretKey,
  };
}

export const isSupabaseConfigured: boolean = getSupabaseConfig().isConfigured;

export function checkIsSupabaseConfigured(): boolean {
  return getSupabaseConfig().isConfigured;
}

export function checkHasSupabaseAdminSecretKey(): boolean {
  return getSupabaseConfig().hasAdminSecretKey;
}

/**
 * Browser / Client-safe Supabase client (enforces Row Level Security).
 * Compatible with both Supabase Publishable keys (`sb_publishable_...`) and legacy JWT `anon` keys.
 */
export function getSupabaseBrowserClient() {
  const cfg = getSupabaseConfig();
  if (!cfg.isConfigured) return null;
  return createClient(cfg.supabaseUrl, cfg.supabasePublishableOrAnonKey);
}

/**
 * Server-side stateless Auth client using the Publishable / Anon key (`NEXT_PUBLIC_SUPABASE_ANON_KEY`).
 * Used for `auth.signInWithPassword()` and `auth.getUser(accessToken)` so user authentication
 * never uses the elevated Secret key (`sb_secret_`).
 */
export function getSupabaseAuthClient() {
  const cfg = getSupabaseConfig();
  if (!cfg.isConfigured) return null;
  return createClient(cfg.supabaseUrl, cfg.supabasePublishableOrAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

/**
 * Server-only Supabase client using `SUPABASE_SERVICE_ROLE_KEY` (`sb_secret_...` or service_role JWT).
 * Strictly isolated to server-side execution (`typeof window === 'undefined'`).
 */
export function getSupabaseServerClient() {
  if (typeof window !== 'undefined') {
    throw new Error(
      'SECURITY ERROR: getSupabaseServerClient() cannot be called in browser/client code. The Secret key (sb_secret_) is server-only.'
    );
  }
  const cfg = getSupabaseConfig();
  if (!cfg.isConfigured && !cfg.hasAdminSecretKey) return null;
  const activeKey = cfg.hasAdminSecretKey
    ? cfg.supabaseSecretOrServiceRoleKey
    : cfg.supabasePublishableOrAnonKey;
  if (!activeKey) return null;
  return createClient(cfg.supabaseUrl, activeKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
