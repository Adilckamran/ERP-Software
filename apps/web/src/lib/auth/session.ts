import crypto from 'crypto';
import type { UserProfile } from '@juice-erp/shared-types';
import {
  checkIsSupabaseConfigured,
  getSupabaseAuthClient,
  getSupabaseServerClient,
} from '@/lib/supabase/client';
import { getServerEnv, loadMonorepoEnvLocal } from '@/lib/env/server-env';
import type { ErpDatabaseState } from '@/lib/db/store';

loadMonorepoEnvLocal();

export const ERP_SESSION_COOKIE_NAME = 'ff_erp_session';

const SCRYPT_PREFIX = 'scrypt$';
const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

function getSessionSecret(): string {
  return (
    getServerEnv('ERP_SESSION_SECRET') ||
    getServerEnv('SUPABASE_SERVICE_ROLE_KEY') ||
    'fruity-fun-erp-phase0-server-hmac-secret-key-2026'
  );
}

/**
 * Cryptographically hash a plaintext password using Node crypto.scryptSync with a random 16-byte salt.
 * Never stores plaintext passwords.
 */
export function hashPasswordSecure(plainPassword: string): string {
  const clean = String(plainPassword || '');
  if (!clean) {
    throw new Error('Password cannot be empty.');
  }
  if (clean.startsWith(SCRYPT_PREFIX)) {
    return clean;
  }
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(clean, salt, 64).toString('hex');
  return `${SCRYPT_PREFIX}${salt}$${derived}`;
}

/**
 * Verify a candidate password against a stored scrypt hash using timingSafeEqual.
 */
export function verifyPasswordSecure(plainPassword: string, storedHash?: string | null): boolean {
  if (!storedHash || !plainPassword) return false;
  if (!storedHash.startsWith(SCRYPT_PREFIX)) {
    // Reject unhashed or malformed password records
    return false;
  }
  const parts = storedHash.slice(SCRYPT_PREFIX.length).split('$');
  if (parts.length !== 2) return false;
  const [salt, keyHex] = parts;
  const expectedBuf = Buffer.from(keyHex, 'hex');
  const candidateBuf = crypto.scryptSync(String(plainPassword), salt, 64);
  if (expectedBuf.length !== candidateBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, candidateBuf);
}

export interface SignedSessionPayload {
  uid: string;
  role: string;
  email: string;
  iat: number;
  exp: number;
  nonce: string;
}

/**
 * Issue an HMAC-SHA256 signed session token for an authenticated user.
 */
export function createSignedSessionToken(user: UserProfile): string {
  const now = Date.now();
  const payload: SignedSessionPayload = {
    uid: user.id,
    role: user.role,
    email: user.email,
    iat: now,
    exp: now + SESSION_TTL_MS,
    nonce: crypto.randomBytes(8).toString('hex'),
  };
  const payloadB64 = Buffer.from(JSON.stringify(payload), 'utf-8').toString('base64url');
  const sig = crypto
    .createHmac('sha256', getSessionSecret())
    .update(payloadB64)
    .digest('base64url');
  return `${payloadB64}.${sig}`;
}

/**
 * Verify an HMAC-SHA256 signed session token. Returns null if forged, tampered, or expired.
 */
export function verifySignedSessionToken(token?: string | null): SignedSessionPayload | null {
  if (!token || typeof token !== 'string' || !token.includes('.')) {
    return null;
  }
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [payloadB64, providedSig] = parts;
  if (!payloadB64 || !providedSig) return null;

  const expectedSig = crypto
    .createHmac('sha256', getSessionSecret())
    .update(payloadB64)
    .digest('base64url');

  const a = Buffer.from(providedSig, 'utf-8');
  const b = Buffer.from(expectedSig, 'utf-8');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return null;
  }

  try {
    const parsed = JSON.parse(
      Buffer.from(payloadB64, 'base64url').toString('utf-8')
    ) as SignedSessionPayload;
    if (!parsed.uid || !parsed.exp || Date.now() > parsed.exp) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Extract session token from Request headers:
 * 1. HTTP-only Cookie (`ff_erp_session=...`)
 * 2. Authorization: Bearer <token>
 */
export function extractSessionTokenFromRequest(request: Request): string | null {
  const authHeader = request.headers.get('authorization');
  if (authHeader && authHeader.toLowerCase().startsWith('bearer ')) {
    const bearer = authHeader.slice(7).trim();
    if (bearer) return bearer;
  }

  const cookieHeader = request.headers.get('cookie');
  if (cookieHeader) {
    const cookies = cookieHeader.split(';');
    for (const c of cookies) {
      const [rawName, ...rest] = c.trim().split('=');
      if (rawName === ERP_SESSION_COOKIE_NAME) {
        return decodeURIComponent(rest.join('='));
      }
    }
  }
  return null;
}

/**
 * Resolve the authenticated UserProfile strictly from the server-verified session token
 * (or Supabase Auth JWT when Supabase is configured).
 * NEVER trusts actorId from query params or request body, and NEVER falls back to Owner.
 */
export async function resolveAuthenticatedSessionUser(
  request: Request,
  dbState: ErpDatabaseState
): Promise<UserProfile | null> {
  const rawToken = extractSessionTokenFromRequest(request);
  if (!rawToken) {
    return null;
  }

  // 1. Verify server-issued HMAC session token
  const verifiedPayload = verifySignedSessionToken(rawToken);
  if (verifiedPayload) {
    const found = dbState.users.find((u) => u.id === verifiedPayload.uid);
    if (!found || !found.is_active) {
      return null;
    }
    return found;
  }

  // 2. If Supabase is configured, also support direct Supabase Auth access_token validation
  if (checkIsSupabaseConfigured()) {
    const supabase = getSupabaseAuthClient() || getSupabaseServerClient();
    if (supabase) {
      const { data, error } = await supabase.auth.getUser(rawToken);
      if (!error && data?.user) {
        const sbUser = data.user;
        const matched = dbState.users.find(
          (u) =>
            u.auth_user_id === sbUser.id ||
            u.id === sbUser.id ||
            (sbUser.email && u.email.toLowerCase() === sbUser.email.toLowerCase())
        );
        if (matched && matched.is_active) {
          return matched;
        }
      }
    }
  }

  return null;
}
