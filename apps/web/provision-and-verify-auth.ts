import assert from 'node:assert';
import {
  getServerEnv,
  inspectEnvConfigurationStatus,
  loadMonorepoEnvLocal,
} from './src/lib/env/server-env';
import {
  CORE_FACTORY_ACCOUNTS,
  provisionCoreFactoryAccounts,
} from './src/lib/auth/provision';
import {
  checkHasSupabaseAdminSecretKey,
  checkIsSupabaseConfigured,
  getSupabaseAuthClient,
  getSupabaseServerClient,
} from './src/lib/supabase/client';
import { GET, POST } from './src/app/api/erp/route';
import { ERP_SESSION_COOKIE_NAME } from './src/lib/auth/session';

async function runProvisionAndVerifyAuth() {
  console.log('=== FRUITY FUN JUICE FACTORY ERP — AUTH PROVISIONING & LOGIN VERIFICATION ===\n');

  // 1. Load & verify .env.local configuration (never printing secret values)
  loadMonorepoEnvLocal();
  const envStatus = inspectEnvConfigurationStatus();

  console.log('1. .env.local Configuration Inspection (Secrets Redacted):');
  console.log(`   - NEXT_PUBLIC_SUPABASE_URL configured (live):      ${envStatus.supabaseUrlConfigured}`);
  console.log(`   - NEXT_PUBLIC_SUPABASE_ANON_KEY configured (live): ${envStatus.publishableAnonKeyConfigured} (${envStatus.publishableKeyFormat})`);
  console.log(`   - SUPABASE_SERVICE_ROLE_KEY configured (live):     ${envStatus.secretServiceRoleKeyConfigured} (${envStatus.secretKeyFormat})`);
  console.log(`   - ERP_SESSION_SECRET present:                      ${envStatus.sessionSecretConfigured}`);
  console.log(`   - INITIAL_OWNER_PASSWORD present:                  ${envStatus.initialOwnerPasswordConfigured}`);
  console.log(`   - INITIAL_KAMRAN_PASSWORD present:                 ${envStatus.initialKamranPasswordConfigured}`);
  console.log(`   - INITIAL_IMRAN_PASSWORD present:                  ${envStatus.initialImranPasswordConfigured}`);
  if (envStatus.placeholderVariables.length > 0) {
    console.log(`   - Variables currently containing template placeholders: ${envStatus.placeholderVariables.join(', ')}`);
  }
  if (envStatus.missingVariables.length > 0) {
    console.log(`   - Missing variables: ${envStatus.missingVariables.join(', ')}`);
  }

  // 2. Provision the 3 core factory accounts idempotently using INITIAL_*_PASSWORD from .env.local
  console.log('\n2. Provisioning Core Factory Accounts (Owner + 2 Managers):');
  const provisionOutcome = await provisionCoreFactoryAccounts();
  for (const res of provisionOutcome.results) {
    console.log(
      `   - ${res.email} (${res.full_name} | Role: ${res.role}) -> Local Profile: ${res.localProfileStatus} | Supabase Cloud Auth: ${res.supabaseAuthStatus}${res.errorMessage ? ` (${res.errorMessage})` : ''}`
    );
    assert(
      res.supabaseAuthStatus === 'CREATED_IN_SUPABASE_AUTH' ||
        res.supabaseAuthStatus === 'UPDATED_EXISTING_IN_SUPABASE_AUTH',
      `Supabase Auth provisioning failed for ${res.email}: ${res.supabaseAuthStatus} ${res.errorMessage || ''}`
    );
    assert(res.authUserId, `Supabase authUserId must be non-null for ${res.email}`);
  }

  // 2b. Verify Supabase Auth login, user_metadata role/profile mappings, and wrong-password rejection
  if (checkIsSupabaseConfigured() && checkHasSupabaseAdminSecretKey()) {
    console.log('\n2b. Verifying Live Supabase Auth Accounts, Roles & Profile Mappings:');
    const supabaseAuth = getSupabaseAuthClient()!;

    for (const spec of CORE_FACTORY_ACCOUNTS) {
      const pwd = getServerEnv(spec.envPasswordKey);
      const { data: signInData, error: signInErr } = await supabaseAuth.auth.signInWithPassword({
        email: spec.email,
        password: pwd,
      });
      assert(!signInErr && signInData?.user, `Live Supabase Auth signInWithPassword failed for ${spec.email}: ${signInErr?.message}`);
      assert.strictEqual(signInData.user.email?.toLowerCase(), spec.email.toLowerCase());
      assert.strictEqual(signInData.user.user_metadata?.role, spec.role, `Supabase Auth metadata role must match ${spec.role}`);
      assert.strictEqual(signInData.user.user_metadata?.full_name, spec.full_name, `Supabase Auth metadata full_name must match ${spec.full_name}`);

      console.log(
        `   [PASS] Live Supabase Auth Sign-In & Role Verified: ${spec.email} -> ${signInData.user.user_metadata?.full_name} (Role: ${signInData.user.user_metadata?.role})`
      );
    }

    // Verify Supabase Auth rejects wrong password
    const { error: badSbAuthErr } = await supabaseAuth.auth.signInWithPassword({
      email: 'sikandar@fruityfun.pk',
      password: 'invalid-wrong-password-99999',
    });
    assert(badSbAuthErr, 'Supabase Auth must reject an incorrect password');
    console.log('   [PASS] Live Supabase Auth rejected incorrect password attempt.');
  }

  // 3. Test actual POST /api/erp (AUTHENTICATE_USER) and GET /api/erp (session cookie auth) for all 3 accounts
  console.log('\n3. Testing Email + Password Login & Role-Based Dashboard State Access:');

  for (const spec of CORE_FACTORY_ACCOUNTS) {
    const passwordFromEnv = getServerEnv(spec.envPasswordKey);
    assert(passwordFromEnv, `Password variable ${spec.envPasswordKey} must be non-empty in .env.local`);

    // 3a. Test valid login
    const loginReq = new Request('http://localhost:3000/api/erp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'AUTHENTICATE_USER',
        payload: {
          email: spec.email,
          password: passwordFromEnv,
        },
      }),
    });

    const loginRes = await POST(loginReq);
    assert.strictEqual(loginRes.status, 200, `Login for ${spec.email} must return HTTP 200`);
    const loginJson = await loginRes.json();

    assert.strictEqual(loginJson.ok, true, `Login response ok must be true for ${spec.email}`);
    assert.strictEqual(loginJson.authenticated, true, `authenticated must be true for ${spec.email}`);
    assert.strictEqual(loginJson.actor.email, spec.email, `Actor email must match ${spec.email}`);
    assert.strictEqual(loginJson.actor.full_name, spec.full_name, `Actor full_name must match ${spec.full_name}`);
    assert.strictEqual(loginJson.actor.role, spec.role, `Actor role must match ${spec.role}`);
    assert.strictEqual(loginJson.actor.password_hash, undefined, 'password_hash must never be leaked to client');
    assert(loginJson.sessionToken, 'Signed sessionToken must be issued');

    // Verify Set-Cookie header contains ff_erp_session
    const setCookieHeader = loginRes.headers.get('set-cookie') || '';
    assert(
      setCookieHeader.includes(`${ERP_SESSION_COOKIE_NAME}=`),
      `Set-Cookie header must contain ${ERP_SESSION_COOKIE_NAME}`
    );

    // 3b. Test authenticated GET /api/erp using the issued HTTP-only session cookie
    const sessionReq = new Request('http://localhost:3000/api/erp', {
      method: 'GET',
      headers: {
        cookie: `${ERP_SESSION_COOKIE_NAME}=${encodeURIComponent(loginJson.sessionToken)}`,
      },
    });
    const sessionRes = await GET(sessionReq);
    assert.strictEqual(sessionRes.status, 200, `Authenticated GET /api/erp for ${spec.email} must return 200`);
    const sessionJson = await sessionRes.json();
    assert.strictEqual(sessionJson.authenticated, true);
    assert.strictEqual(sessionJson.actor.email, spec.email);
    assert.strictEqual(sessionJson.actor.role, spec.role);

    // 3c. Verify role-based dashboard isolation
    if (spec.role === 'OWNER') {
      // Owner Sikandar Raja sees both Kamran Bhai and Imran Bhai cash accounts
      assert.strictEqual(
        sessionJson.state.manager_cash_accounts.length,
        2,
        'Owner dashboard must receive both Kamran Bhai and Imran Bhai cash accounts'
      );
      console.log(
        `   [PASS] Owner Login (${spec.email} -> ${spec.full_name}, Role: ${spec.role}) -> Enters Owner Dashboard with access to both Manager Cash Accounts.`
      );
    } else if (spec.role === 'PRODUCTION_MANAGER') {
      // Each Manager only sees their own isolated cash account
      assert.strictEqual(
        sessionJson.state.manager_cash_accounts.length,
        1,
        `Manager ${spec.full_name} must only see their own manager cash account`
      );
      assert.strictEqual(
        sessionJson.state.manager_cash_accounts[0].manager_id,
        spec.id,
        `Manager ${spec.full_name} cash account ID must match ${spec.id}`
      );
      console.log(
        `   [PASS] Manager Login (${spec.email} -> ${spec.full_name}, Role: ${spec.role}) -> Enters isolated ${spec.full_name} Manager Dashboard.`
      );
    }
  }

  // 4. Test invalid password rejection (401 Unauthorized)
  const badLoginReq = new Request('http://localhost:3000/api/erp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'AUTHENTICATE_USER',
      payload: {
        email: 'sikandar@fruityfun.pk',
        password: 'wrong-password-attempt-12345',
      },
    }),
  });
  const badLoginRes = await POST(badLoginReq);
  assert.strictEqual(badLoginRes.status, 401, 'Invalid password must be rejected with HTTP 401');
  console.log('   [PASS] Invalid password attempt properly rejected with HTTP 401.');

  // 5. Test unauthenticated GET /api/erp returns authenticated: false (requires login screen)
  const unauthReq = new Request('http://localhost:3000/api/erp', {
    method: 'GET',
  });
  const unauthRes = await GET(unauthReq);
  const unauthJson = await unauthRes.json();
  assert.strictEqual(unauthJson.authenticated, false, 'Unauthenticated request must return authenticated: false');
  assert.strictEqual(Boolean(unauthJson.state), false, 'Unauthenticated request must not leak ERP database state');
  console.log('   [PASS] Unauthenticated GET /api/erp returns authenticated: false and omits ERP database state.');

  console.log('\n=== ALL AUTHENTICATION, PROVISIONING & ROLE-BASED DASHBOARD TESTS PASSED ===');
}

runProvisionAndVerifyAuth().catch((err) => {
  console.error('Auth verification failed:', err);
  process.exit(1);
});
