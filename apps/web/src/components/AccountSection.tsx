import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { continueWithGoogle, getAccount, sendEmailCode, signOut, verifyEmailCode, type AuthMode } from '../lib/account.ts';
import { useSupabaseAuth } from '../lib/env.ts';
import { toast } from './Toast.tsx';

export function AccountSection() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { data: account, refetch } = useQuery({ queryKey: ['account'], queryFn: getAccount, enabled: useSupabaseAuth });
  const [mode, setMode] = useState<AuthMode>('link');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!useSupabaseAuth) return <p className="text-sm text-muted">{t('account.devMode')}</p>;

  const done = async () => {
    await refetch();
    await qc.invalidateQueries();
  };
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      toast(e instanceof Error ? e.message : t('errors.generic'));
    } finally {
      setBusy(false);
    }
  };

  if (account && !account.isAnonymous)
    return (
      <div className="space-y-3">
        <p className="text-sm">{t('account.signedInAs', { email: account.email ?? account.providers.join(', ') })}</p>
        <button className="btn-secondary" disabled={busy} onClick={() => run(async () => {
          await signOut();
          await done();
        })}>
          {t('account.signOut')}
        </button>
      </div>
    );

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted">{t('account.guestNotice')}</p>
      <div className="flex gap-1">
        {(['link', 'signin'] as const).map((m) => (
          <button key={m} className={`chip text-xs ${mode === m ? 'bg-panel-2 text-text' : 'text-muted'}`} onClick={() => { setMode(m); setSent(false); }}>
            {m === 'link' ? t('account.linkAccount') : t('account.signInExisting')}
          </button>
        ))}
      </div>
      {mode === 'signin' && <p className="text-xs text-accent-2">{t('account.signInWarning')}</p>}
      <button className="btn-secondary w-full" disabled={busy} onClick={() => run(() => continueWithGoogle(mode))}>
        <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
          <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
          <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
          <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
          <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
        </svg>
        {t('account.google')}
      </button>
      {!sent ? (
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void run(async () => {
              await sendEmailCode(email, mode);
              setSent(true);
              toast(t('account.codeSent', { email }));
            });
          }}
        >
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t('account.email')}
            className="min-w-0 flex-1 rounded-xl bg-panel-2 px-3 py-2 ring-1 ring-line focus:outline-none focus:ring-accent"
          />
          <button className="btn-primary px-4" disabled={busy}>
            {t('account.sendCode')}
          </button>
        </form>
      ) : (
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void run(async () => {
              await verifyEmailCode(email, code, mode);
              setSent(false);
              await done();
            });
          }}
        >
          <input
            inputMode="numeric"
            autoComplete="one-time-code"
            required
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder={t('account.code')}
            className="min-w-0 flex-1 rounded-xl bg-panel-2 px-3 py-2 font-mono tracking-widest ring-1 ring-line focus:outline-none focus:ring-accent"
          />
          <button className="btn-primary px-4" disabled={busy}>
            {t('account.verify')}
          </button>
        </form>
      )}
    </div>
  );
}
