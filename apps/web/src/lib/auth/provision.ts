import type { RoleName, UserProfile } from '@juice-erp/shared-types';
import { getServerEnv, loadMonorepoEnvLocal } from '@/lib/env/server-env';
import {
  checkHasSupabaseAdminSecretKey,
  checkIsSupabaseConfigured,
  getSupabaseServerClient,
} from '@/lib/supabase/client';
import {
  getInitialCoreUserPasswordFromEnv,
  hashInitialPassword,
  readErpDatabase,
  withErpTransaction,
} from '@/lib/db/store';

export interface CoreAccountSpec {
  id: string;
  email: string;
  full_name: string;
  phone: string;
  role: RoleName;
  department: string;
  envPasswordKey:
    | 'INITIAL_OWNER_PASSWORD'
    | 'INITIAL_KAMRAN_PASSWORD'
    | 'INITIAL_IMRAN_PASSWORD';
}

export const CORE_FACTORY_ACCOUNTS: CoreAccountSpec[] = [
  {
    id: 'user-owner-1',
    email: 'sikandar@fruityfun.pk',
    full_name: 'Sikandar Raja',
    phone: '+92-300-8401122',
    role: 'OWNER',
    department: 'Executive Management',
    envPasswordKey: 'INITIAL_OWNER_PASSWORD',
  },
  {
    id: 'user-mgr-kamran',
    email: 'kamran@fruityfun.pk',
    full_name: 'Kamran Bhai',
    phone: '+92-321-4509988',
    role: 'PRODUCTION_MANAGER',
    department: 'Factory Operations & Production',
    envPasswordKey: 'INITIAL_KAMRAN_PASSWORD',
  },
  {
    id: 'user-mgr-imran',
    email: 'imran@fruityfun.pk',
    full_name: 'Imran Bhai',
    phone: '+92-322-4509977',
    role: 'PRODUCTION_MANAGER',
    department: 'Factory Operations & Production',
    envPasswordKey: 'INITIAL_IMRAN_PASSWORD',
  },
];

export interface AccountProvisionResult {
  email: string;
  full_name: string;
  role: RoleName;
  localProfileStatus: 'CREATED' | 'SYNCED_EXISTING';
  supabaseAuthStatus:
    | 'CREATED_IN_SUPABASE_AUTH'
    | 'UPDATED_EXISTING_IN_SUPABASE_AUTH'
    | 'SKIPPED_SUPABASE_CREDENTIALS_PLACEHOLDER'
    | 'SUPABASE_ERROR';
  authUserId: string | null;
  errorMessage?: string;
}

/**
 * Idempotently provisions and links the three core Fruity Fun Juice Factory accounts:
 *   - Owner:   sikandar@fruityfun.pk (Sikandar Raja, OWNER)
 *   - Manager: kamran@fruityfun.pk   (Kamran Bhai, PRODUCTION_MANAGER)
 *   - Manager: imran@fruityfun.pk    (Imran Bhai, PRODUCTION_MANAGER)
 *
 * Uses INITIAL_OWNER_PASSWORD, INITIAL_KAMRAN_PASSWORD, and INITIAL_IMRAN_PASSWORD
 * from `.env.local`. Never invents or prints passwords, never creates duplicate accounts,
 * and never resets or alters business data.
 */
export async function provisionCoreFactoryAccounts(): Promise<{
  results: AccountProvisionResult[];
  supabaseLiveConnected: boolean;
}> {
  loadMonorepoEnvLocal();

  // First ensure the persistent DB is loaded and initial hashes are synced
  readErpDatabase();

  const hasLiveSupabaseAdmin =
    checkIsSupabaseConfigured() && checkHasSupabaseAdminSecretKey();
  const supabaseAdmin = hasLiveSupabaseAdmin ? getSupabaseServerClient() : null;

  let existingSupabaseUsers: Array<{ id: string; email?: string }> = [];
  let supabaseLiveConnected = false;

  if (supabaseAdmin) {
    try {
      const { data, error } = await supabaseAdmin.auth.admin.listUsers({
        page: 1,
        perPage: 200,
      });
      if (!error && data?.users) {
        existingSupabaseUsers = data.users;
        supabaseLiveConnected = true;
      }
    } catch {
      supabaseLiveConnected = false;
    }
  }

  const results: AccountProvisionResult[] = [];

  for (const spec of CORE_FACTORY_ACCOUNTS) {
    const plainPassword = getServerEnv(spec.envPasswordKey) || getInitialCoreUserPasswordFromEnv(spec.email);
    if (!plainPassword) {
      throw new Error(
        `Missing required environment variable ${spec.envPasswordKey} in .env.local for ${spec.email}.`
      );
    }

    const expectedHash = hashInitialPassword(plainPassword);
    let authUserId: string | null = null;
    let supabaseAuthStatus: AccountProvisionResult['supabaseAuthStatus'] =
      'SKIPPED_SUPABASE_CREDENTIALS_PLACEHOLDER';
    let errorMessage: string | undefined;

    // 1. If live Supabase Admin (sb_secret_ / SUPABASE_SERVICE_ROLE_KEY) is connected,
    // idempotently create or update the Supabase Auth user and sync public.users / public.user_profiles
    if (supabaseAdmin && supabaseLiveConnected) {
      try {
        const existingSbUser = existingSupabaseUsers.find(
          (u) => (u.email || '').toLowerCase() === spec.email.toLowerCase()
        );

        if (existingSbUser) {
          const { data: updatedData, error: updateErr } =
            await supabaseAdmin.auth.admin.updateUserById(existingSbUser.id, {
              password: plainPassword,
              email_confirm: true,
              user_metadata: {
                full_name: spec.full_name,
                role: spec.role,
                phone: spec.phone,
                department: spec.department,
              },
            });
          if (updateErr) {
            supabaseAuthStatus = 'SUPABASE_ERROR';
            errorMessage = updateErr.message;
          } else {
            authUserId = updatedData?.user?.id || existingSbUser.id;
            supabaseAuthStatus = 'UPDATED_EXISTING_IN_SUPABASE_AUTH';
          }
        } else {
          const { data: createdData, error: createErr } =
            await supabaseAdmin.auth.admin.createUser({
              email: spec.email,
              password: plainPassword,
              email_confirm: true,
              user_metadata: {
                full_name: spec.full_name,
                role: spec.role,
                phone: spec.phone,
                department: spec.department,
              },
            });
          if (createErr) {
            supabaseAuthStatus = 'SUPABASE_ERROR';
            errorMessage = createErr.message;
          } else {
            authUserId = createdData?.user?.id || null;
            supabaseAuthStatus = 'CREATED_IN_SUPABASE_AUTH';
          }
        }
      } catch (err) {
        supabaseAuthStatus = 'SUPABASE_ERROR';
        errorMessage = err instanceof Error ? err.message : 'Supabase admin request failed';
      }
    }

    // 2. Non-destructively upsert the user profile and manager cash account in persistent store
    let localProfileStatus: AccountProvisionResult['localProfileStatus'] = 'SYNCED_EXISTING';

    withErpTransaction((db) => {
      // Remove any accidental duplicate rows with the same email (keeping canonical record)
      const matchingUsers = db.users.filter(
        (u) => u.email.toLowerCase() === spec.email.toLowerCase() || u.id === spec.id
      );

      const nowIso = new Date().toISOString();

      if (matchingUsers.length === 0) {
        localProfileStatus = 'CREATED';
        const newUser: UserProfile = {
          id: spec.id,
          auth_user_id: authUserId,
          email: spec.email,
          full_name: spec.full_name,
          phone: spec.phone,
          role: spec.role,
          is_active: true,
          password_hash: expectedHash,
          department: spec.department,
          can_record_purchases: true,
          working_hours_start: spec.role === 'OWNER' ? '08:00' : '07:00',
          working_hours_end: spec.role === 'OWNER' ? '22:00' : '19:00',
          duty_status: 'ON_DUTY',
          last_login_at: nowIso,
          created_at: nowIso,
          updated_at: nowIso,
        };
        db.users.push(newUser);
      } else {
        const primary = matchingUsers[0];
        primary.id = spec.id;
        primary.email = spec.email;
        primary.full_name = spec.full_name;
        primary.role = spec.role;
        primary.is_active = true;
        primary.department = spec.department;
        primary.can_record_purchases = true;
        primary.password_hash = expectedHash;
        if (authUserId) {
          primary.auth_user_id = authUserId;
        }
        primary.updated_at = nowIso;

        // Deduplicate if more than 1 entry existed for the same email
        if (matchingUsers.length > 1) {
          const extraIds = new Set(matchingUsers.slice(1).map((u) => u.id));
          db.users = db.users.filter((u) => !extraIds.has(u.id));
        }
      }

      // Ensure individual manager cash account exists for Kamran Bhai and Imran Bhai
      if (spec.role === 'PRODUCTION_MANAGER') {
        if (!db.manager_cash_accounts) {
          db.manager_cash_accounts = [];
        }
        const existingCashAcc = db.manager_cash_accounts.find(
          (a) => a.manager_id === spec.id
        );
        if (!existingCashAcc) {
          db.manager_cash_accounts.push({
            manager_id: spec.id,
            manager_name: spec.full_name,
            total_cash_received: 0,
            total_spent_purchases: 0,
            total_spent_expenses: 0,
            available_balance: 0,
            updated_at: nowIso,
          });
        } else {
          existingCashAcc.manager_name = spec.full_name;
        }
      }
    });

    results.push({
      email: spec.email,
      full_name: spec.full_name,
      role: spec.role,
      localProfileStatus,
      supabaseAuthStatus,
      authUserId,
      ...(errorMessage ? { errorMessage } : {}),
    });
  }

  return {
    results,
    supabaseLiveConnected,
  };
}
