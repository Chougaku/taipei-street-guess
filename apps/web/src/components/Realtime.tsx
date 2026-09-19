import { EMOTES } from '@tg/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { call, dismissInvite, useRealtime } from '../lib/realtime.ts';
import { Avatar } from './Avatar.tsx';
import { toast } from './Toast.tsx';

/** Party invites from friends, shown anywhere in the app. */
export function InviteToaster() {
  const { t } = useTranslation();
  const invites = useRealtime((s) => s.invites);
  const qc = useQueryClient();

  // Friend requests / accepts arrive as generic notifications.
  useEffect(() => {
    const on = (e: Event) => {
      if ((e as CustomEvent<string>).detail === 'friends:changed') void qc.invalidateQueries({ queryKey: ['friends'] });
    };
    window.addEventListener('tg:notify', on);
    return () => window.removeEventListener('tg:notify', on);
  }, [qc]);

  if (invites.length === 0) return null;
  return (
    <div className="fixed bottom-[calc(max(var(--sab),0.75rem)+4.5rem)] right-3 z-[95] flex w-[min(360px,calc(100vw-1.5rem))] flex-col gap-2 md:bottom-4">
      {invites.map((inv) => (
        <div key={inv.code} className="card flex animate-fade-up items-center gap-3 p-3 shadow-2xl">
          <Avatar id={inv.from.avatar} size={36} />
          <p className="min-w-0 flex-1 text-sm font-semibold">{t('mp.invitedYou', { name: inv.from.nickname })}</p>
          <button
            className="btn-primary px-3 py-2 text-sm"
            onClick={async () => {
              dismissInvite(inv.code);
              window.dispatchEvent(new CustomEvent('tg:deeplink', { detail: `/party/${inv.code}` }));
            }}
          >
            {t('mp.join')}
          </button>
          <button className="btn-ghost px-2 py-2 text-sm" onClick={() => dismissInvite(inv.code)}>
            {t('mp.dismiss')}
          </button>
        </div>
      ))}
    </div>
  );
}

/** Floating emote bubbles. */
export function EmoteFloat() {
  const emotes = useRealtime((s) => s.emotes);
  return (
    <div className="pointer-events-none fixed left-1/2 top-24 z-[60] flex -translate-x-1/2 flex-col items-center gap-1">
      {emotes.map((e) => (
        <div key={e.id} className="flex animate-fade-up items-center gap-2 rounded-full bg-ink/80 py-1 pl-1 pr-3 shadow-lg ring-1 ring-white/10 backdrop-blur">
          <Avatar id={e.from.avatar} size={24} />
          <span className="text-xs font-bold">{e.from.nickname}</span>
          <span className="text-xl leading-none">{e.emoji}</span>
        </div>
      ))}
    </div>
  );
}

export function EmoteBar({ matchId, compact = false }: { matchId?: string; compact?: boolean }) {
  const { t } = useTranslation();
  return (
    <div className={`flex flex-wrap gap-1 ${compact ? '' : 'rounded-2xl bg-ink/70 p-1 ring-1 ring-white/10 backdrop-blur'}`} aria-label={t('mp.emotes')}>
      {EMOTES.map((e) => (
        <button
          key={e}
          className="grid size-9 place-items-center rounded-xl text-lg transition hover:bg-panel-2 active:scale-90"
          onClick={() => call('emote', { emoji: e, matchId }).catch(() => toast(t('errors.generic')))}
        >
          {e === 'GG' ? <span className="text-xs font-black">GG</span> : e}
        </button>
      ))}
    </div>
  );
}

export function ConnectionBanner() {
  const { t } = useTranslation();
  const connected = useRealtime((s) => s.connected);
  if (connected) return null;
  return (
    <div className="fixed inset-x-0 top-0 z-[99] bg-accent-2 py-1 text-center text-xs font-bold text-ink safe-top">{t('mp.disconnected')}</div>
  );
}
