import { ACHIEVEMENTS, DISTRICTS, divisionForRating, formatDistance, levelProgress, type ProfilePage as Page } from '@tg/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';
import { Avatar, AVATAR_IDS } from '../components/Avatar.tsx';
import { FriendButton } from '../components/FriendButton.tsx';
import { Modal } from '../components/Modal.tsx';
import { ErrorView, Spinner } from '../components/Status.tsx';
import { toast } from '../components/Toast.tsx';
import { api, ApiError } from '../lib/api.ts';
import { hasServer } from '../lib/env.ts';
import { OFFLINE_ACHIEVEMENTS } from '../lib/local/achievements.ts';
import { useSettings } from '../stores/settings.ts';

const MEDAL_ICON: Record<string, string> = { bronze: '🥉', silver: '🥈', gold: '🥇', platinum: '💎' };

function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-xl bg-panel-2 p-3">
      <div className="text-xs text-muted">{label}</div>
      <div className="text-xl font-black tabular-nums">{value}</div>
    </div>
  );
}

function EditProfile({ page, onClose }: { page: Page; onClose(): void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [nickname, setNickname] = useState(page.profile.nickname);
  const [avatar, setAvatar] = useState(page.profile.avatar);
  const save = useMutation({
    mutationFn: () => api.updateMe({ nickname, avatar }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['me'] });
      void qc.invalidateQueries({ queryKey: ['user', page.profile.id] });
      onClose();
    },
    onError: (e) => toast(e instanceof ApiError ? e.message : t('errors.generic')),
  });
  return (
    <Modal open onClose={onClose} title={t('account.edit')}>
      <label className="mb-1 block text-sm font-semibold text-muted">{t('account.nickname')}</label>
      <input
        value={nickname}
        maxLength={16}
        onChange={(e) => setNickname(e.target.value)}
        className="mb-4 w-full rounded-xl bg-panel-2 px-3 py-2 ring-1 ring-line focus:ring-accent focus:outline-none"
      />
      <p className="mb-2 text-sm font-semibold text-muted">{t('account.avatar')}</p>
      <div className="mb-4 grid grid-cols-8 gap-2">
        {AVATAR_IDS.map((id) => (
          <button key={id} onClick={() => setAvatar(id)} className={`rounded-full p-0.5 ${avatar === id ? 'ring-2 ring-accent' : ''}`} aria-label={id}>
            <Avatar id={id} size={34} />
          </button>
        ))}
      </div>
      <button className="btn-primary w-full" disabled={save.isPending} onClick={() => save.mutate()}>
        {t('app.save')}
      </button>
    </Modal>
  );
}

export default function ProfilePage() {
  const { id } = useParams();
  const { t, i18n } = useTranslation();
  const units = useSettings((s) => s.units);
  const [editing, setEditing] = useState(false);
  const { data: page, error, refetch } = useQuery({ queryKey: ['user', id], queryFn: () => api.user(id!) });

  if (error) return <ErrorView error={error} onRetry={() => void refetch()} />;
  if (!page)
    return (
      <div className="grid h-64 place-items-center">
        <Spinner />
      </div>
    );

  const { profile, stats } = page;
  const lp = levelProgress(profile.xp);
  const unlocked = new Map(page.achievements.map((a) => [a.code, a.unlockedAt]));
  const medals = new Map(page.explorer.map((e) => [e.districtCode, e]));
  const lang = i18n.language === 'en' ? 'en' : 'zh-TW';

  return (
    <div className="space-y-4">
      <div className="card flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
        <Avatar id={profile.avatar} size={80} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="truncate text-2xl font-black">{profile.nickname}</h1>
            {profile.online && <span className="chip text-xs text-good">● {t('profile.online')}</span>}
            {profile.isGuest && <span className="chip text-xs text-muted">{t('profile.guest')}</span>}
          </div>
          <p className="text-sm text-muted">{t('profile.joined', { date: new Date(profile.createdAt).toLocaleDateString(i18n.language) })}</p>
          <div className="mt-2 max-w-sm">
            <div className="mb-1 flex justify-between text-xs">
              <span className="font-bold text-teal">{t('profile.level', { level: lp.level })}</span>
              <span className="text-muted">{t('profile.xpToNext', { xp: (lp.needed - lp.current).toLocaleString() })}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-panel-2">
              <div className="h-full rounded-full bg-teal" style={{ width: `${(lp.current / lp.needed) * 100}%` }} />
            </div>
          </div>
        </div>
        {page.friendship === 'self' ? (
          <button className="btn-secondary" onClick={() => setEditing(true)}>
            {t('account.edit')}
          </button>
        ) : (
          <FriendButton userId={profile.id} state={page.friendship} />
        )}
      </div>

      <section className="card p-5">
        <h2 className="mb-3 font-black">{t('profile.stats')}</h2>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat label={t('profile.gamesPlayed')} value={stats.gamesPlayed.toLocaleString()} />
          <Stat label={t('profile.avgScore')} value={stats.avgScore.toLocaleString()} />
          <Stat label={t('profile.bestScore')} value={stats.bestScore.toLocaleString()} />
          <Stat label={t('profile.perfectRounds')} value={stats.perfectRounds.toLocaleString()} />
          <Stat label={t('profile.avgDistance')} value={stats.avgDistanceM === null ? '—' : formatDistance(stats.avgDistanceM, units)} />
          <Stat label={t('profile.dailyStreak')} value={`🔥 ${stats.dailyStreak}`} />
          <Stat label={t('profile.bestStreak')} value={stats.bestDistrictStreak} />
          {hasServer && (
            <>
              <Stat
                label={t('profile.rating')}
                value={profile.rankedGames > 0 ? `${profile.rating} · ${t(`division.${divisionForRating(profile.rating)}`)}` : '—'}
              />
              <Stat label={t('profile.duels')} value={`${stats.duelsWon} / ${stats.duelsPlayed}`} />
            </>
          )}
          <Stat label={t('profile.bestVillageStreak')} value={stats.bestVillageStreak} />
        </div>
      </section>

      <section className="card p-5">
        <h2 className="mb-3 font-black">{t('profile.explorer')}</h2>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
          {DISTRICTS.map((d) => {
            const m = medals.get(d.code);
            return (
              <Link key={d.code} to={`/maps/${d.slug}`} className="rounded-xl bg-panel-2 p-2 text-center hover:ring-1 hover:ring-line">
                <div className="text-2xl">{m?.medal ? MEDAL_ICON[m.medal] : '▫️'}</div>
                <div className="text-xs font-bold">{t(`district.${d.code}`)}</div>
                <div className="text-[10px] text-muted">{m ? m.bestScore.toLocaleString() : '—'}</div>
              </Link>
            );
          })}
        </div>
      </section>

      <section className="card p-5">
        <h2 className="mb-3 font-black">
          {t('profile.achievements')}{' '}
          <span className="text-sm text-muted">
            {unlocked.size} / {ACHIEVEMENTS.filter((a) => hasServer || OFFLINE_ACHIEVEMENTS.has(a.code)).length}
          </span>
        </h2>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {ACHIEVEMENTS.filter((a) => hasServer || OFFLINE_ACHIEVEMENTS.has(a.code)).map((a) => {
            const at = unlocked.get(a.code);
            return (
              <div key={a.code} className={`flex items-center gap-3 rounded-xl p-3 ${at ? 'bg-panel-2' : 'bg-panel-2/40 opacity-50 grayscale'}`}>
                <span className="text-2xl">{a.icon}</span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-bold">{a.name[lang]}</span>
                  <span className="block text-[11px] leading-tight text-muted">{a.desc[lang]}</span>
                </span>
              </div>
            );
          })}
        </div>
      </section>

      <section className="card p-5">
        <h2 className="mb-3 font-black">{t('profile.recentGames')}</h2>
        {page.recentGames.length === 0 ? (
          <p className="text-muted">{t('profile.noGames')}</p>
        ) : (
          <ul className="divide-y divide-line">
            {page.recentGames.map((g) => {
              const body = (
                <>
                  <span className="flex-1">
                    <span className="font-bold">{lang === 'en' ? g.mapNameEn : g.mapName}</span>
                    <span className="ml-2 text-xs text-muted">{new Date(g.finishedAt).toLocaleString(i18n.language)}</span>
                  </span>
                  <span className="font-black tabular-nums text-accent-2">{g.totalScore.toLocaleString()}</span>
                </>
              );
              return (
                <li key={g.id}>
                  {page.friendship === 'self' ? (
                    <Link to={`/game/${g.id}`} className="flex items-center gap-2 py-2 hover:text-accent">
                      {body}
                    </Link>
                  ) : (
                    <div className="flex items-center gap-2 py-2">{body}</div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {editing && <EditProfile page={page} onClose={() => setEditing(false)} />}
    </div>
  );
}
