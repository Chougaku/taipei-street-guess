/**
 * Account upgrade / sign-in flows (Supabase mode only).
 *
 * Guests are anonymous Supabase users. "Link" keeps the same user id (so all progress
 * stays), while "sign in" switches to an existing account on a new device.
 */
import { getSupabase } from './auth.ts';
import { isNative } from './env.ts';

export type AuthMode = 'link' | 'signin';

export interface AccountInfo {
  email: string | null;
  isAnonymous: boolean;
  providers: string[];
}

const NATIVE_CALLBACK = 'taipeiguessr://auth-callback';

async function sb() {
  const client = getSupabase();
  if (!client) throw new Error('Accounts are not available in local development mode');
  return client;
}

export async function getAccount(): Promise<AccountInfo | null> {
  const client = getSupabase();
  if (!client) return null;
  const { data } = await (await client).auth.getUser();
  if (!data.user) return null;
  return {
    email: data.user.email ?? null,
    isAnonymous: data.user.is_anonymous ?? false,
    providers: (data.user.identities ?? []).map((i) => i.provider),
  };
}

export async function sendEmailCode(email: string, mode: AuthMode) {
  const auth = (await sb()).auth;
  const { error } =
    mode === 'link' ? await auth.updateUser({ email }) : await auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
  if (error) throw error;
}

export async function verifyEmailCode(email: string, token: string, mode: AuthMode) {
  const { error } = await (await sb()).auth.verifyOtp({ email, token, type: mode === 'link' ? 'email_change' : 'email' });
  if (error) throw error;
}

export async function continueWithGoogle(mode: AuthMode) {
  const auth = (await sb()).auth;
  const redirectTo = isNative ? NATIVE_CALLBACK : `${window.location.origin}/auth/callback`;
  // Google blocks OAuth inside WebViews, so the native app opens the system browser instead.
  const options = { redirectTo, skipBrowserRedirect: isNative };
  const { data, error } =
    mode === 'link'
      ? await auth.linkIdentity({ provider: 'google', options })
      : await auth.signInWithOAuth({ provider: 'google', options });
  if (error) throw error;
  if (isNative && data.url) {
    const { Browser } = await import('@capacitor/browser');
    await Browser.open({ url: data.url, presentationStyle: 'popover' });
  }
}

/** Native deep-link callback: exchange the PKCE code for a session. */
export async function completeNativeOAuth(url: string) {
  const code = new URL(url).searchParams.get('code');
  const { Browser } = await import('@capacitor/browser');
  await Browser.close().catch(() => {});
  if (code) {
    const { error } = await (await sb()).auth.exchangeCodeForSession(code);
    if (error) throw error;
  }
}

/** Signs out; the next API call transparently starts a fresh guest session. */
export async function signOut() {
  await (await sb()).auth.signOut();
}
