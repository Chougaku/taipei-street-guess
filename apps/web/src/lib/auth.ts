import type { SupabaseClient } from '@supabase/supabase-js';
import { env, isNative, useSupabaseAuth } from './env.ts';

const DEV_TOKEN_KEY = 'tg.devToken';

let supabase: Promise<SupabaseClient> | null = null;

/** Supabase client (lazy-loaded so the SDK isn't in the initial bundle); null in local dev mode. */
export function getSupabase(): Promise<SupabaseClient> | null {
  if (!useSupabaseAuth) return null;
  supabase ??= import('@supabase/supabase-js').then(({ createClient }) =>
    createClient(env.supabaseUrl, env.supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        flowType: 'pkce',
        // In the native app OAuth returns through a deep link instead of the page URL.
        detectSessionInUrl: !isNative,
      },
    }),
  );
  return supabase;
}

let pending: Promise<string> | null = null;

async function ensureToken(): Promise<string> {
  const sbPromise = getSupabase();
  if (sbPromise) {
    const sb = await sbPromise;
    const { data } = await sb.auth.getSession();
    if (data.session) return data.session.access_token;
    // Everyone starts as an anonymous guest and can upgrade to a full account later.
    const { data: signIn, error } = await sb.auth.signInAnonymously();
    if (error || !signIn.session) throw error ?? new Error('Anonymous sign-in failed');
    return signIn.session.access_token;
  }

  const stored = safeStorage.get(DEV_TOKEN_KEY);
  if (stored) return stored;
  const res = await fetch(`${env.apiBase}/api/auth/dev-guest`, { method: 'POST' });
  if (!res.ok) throw new Error(`Guest sign-in failed (${res.status})`);
  const { token } = (await res.json()) as { token: string };
  safeStorage.set(DEV_TOKEN_KEY, token);
  return token;
}

/** Returns a valid access token, creating a guest session on first use. */
export async function getToken(): Promise<string> {
  pending ??= ensureToken().finally(() => {
    pending = null;
  });
  return pending;
}

/** Drops the current session (used after a 401 so the next call re-authenticates). */
export async function resetSession() {
  const sb = getSupabase();
  if (sb) await (await sb).auth.signOut({ scope: 'local' });
  else safeStorage.remove(DEV_TOKEN_KEY);
}

export const safeStorage = {
  get(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string) {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* private mode / storage disabled */
    }
  },
  remove(key: string) {
    try {
      localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  },
};
