import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router';
import { useMe } from '../components/Layout.tsx';
import { NightMarketStall } from '../components/art/Street.tsx';
import { Modal } from '../components/Modal.tsx';
import { PageBanner } from '../components/PageBanner.tsx';
import { Spinner } from '../components/Status.tsx';
import { toast } from '../components/Toast.tsx';
import { mapName } from '../i18n/index.ts';
import { api, ApiError } from '../lib/api.ts';
import { hasServer } from '../lib/env.ts';
import { MapCard } from './Home.tsx';

type Tab = 'official' | 'community' | 'mine';
type Sort = 'popular' | 'new' | 'liked';

function CreateMapModal({ onClose }: { onClose(): void }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const create = useMutation({
    mutationFn: () => api.createMap({ name, description }),
    onSuccess: (m) => navigate(`/editor/${m.id}`),
    onError: (e) => toast(e instanceof ApiError ? e.message : t('errors.generic')),
  });
  return (
    <Modal open onClose={onClose} title={t('maps.create')}>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate();
        }}
      >
        <input
          required
          minLength={2}
          maxLength={40}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t('maps.name')}
          className="w-full rounded-xl bg-panel-2 px-3 py-2 ring-1 ring-line focus:outline-none focus:ring-accent"
        />
        <textarea
          maxLength={300}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={t('maps.description')}
          rows={3}
          className="w-full rounded-xl bg-panel-2 px-3 py-2 ring-1 ring-line focus:outline-none focus:ring-accent"
        />
        <button className="btn-primary w-full" disabled={create.isPending}>
          {t('maps.create')}
        </button>
      </form>
    </Modal>
  );
}

export default function MapsPage() {
  const { t } = useTranslation();
  const { data: me } = useMe();
  const [tab, setTab] = useState<Tab>('official');
  const [sort, setSort] = useState<Sort>('popular');
  const [q, setQ] = useState('');
  const [creating, setCreating] = useState(false);
  const { data: official } = useQuery({ queryKey: ['maps', 'official'], queryFn: api.officialMaps, staleTime: 5 * 60_000, enabled: tab === 'official' });
  const { data: community, isLoading } = useQuery({
    queryKey: ['maps', tab, sort, q, me?.id],
    queryFn: () => api.listMaps(tab === 'mine' ? { sort: 'new', owner: me!.id } : { sort, q }),
    enabled: tab !== 'official' && (tab !== 'mine' || !!me),
  });

  return (
    <div className="space-y-4">
      <PageBanner title={t('maps.title')} tint="from-pink-500/30" art={<NightMarketStall className="w-full" />}>
        <button className="btn-primary mt-4" onClick={() => setCreating(true)}>
          + {t('maps.create')}
        </button>
      </PageBanner>
      <div className="flex gap-1">
        {(['official', ...(hasServer ? (['community'] as const) : []), 'mine'] as const).map((x) => (
          <button key={x} className={`chip ${tab === x ? 'bg-accent text-white ring-accent' : 'text-muted'}`} onClick={() => setTab(x)}>
            {t(`maps.${x}`)}
          </button>
        ))}
      </div>

      {tab === 'community' && (
        <div className="flex flex-wrap gap-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t('maps.search')}
            className="min-w-0 flex-1 rounded-xl bg-panel-2 px-3 py-2 ring-1 ring-line focus:outline-none focus:ring-accent"
          />
          {(['popular', 'new', 'liked'] as const).map((s) => (
            <button key={s} className={`chip ${sort === s ? 'bg-panel-2 text-text' : 'text-muted'}`} onClick={() => setSort(s)}>
              {t(`maps.sort.${s}`)}
            </button>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {tab === 'official'
          ? official?.map((m) => <MapCard key={m.id} map={m} />)
          : isLoading
            ? <Spinner />
            : community?.length === 0
              ? <p className="text-muted">{t('maps.empty')}</p>
              : community?.map((m) => (
                  <div key={m.id} className="card relative p-4">
                    <Link to={`/maps/${m.slug}`} className="block">
                      <p className="text-lg font-black">{mapName(m)}</p>
                      <p className="mt-0.5 line-clamp-2 text-sm text-muted">{m.description}</p>
                      <p className="mt-3 flex flex-wrap gap-2 text-xs text-muted">
                        <span>{t('home.locations', { count: m.locationCount.toLocaleString() as never })}</span>
                        <span>♥ {m.likes}</span>
                        <span>▶ {m.plays}</span>
                        {m.ownerName && <span>{t('maps.by', { name: m.ownerName })}</span>}
                        {tab === 'mine' && <span className="chip py-0 text-[10px]">{t(`maps.visibility.${m.visibility}`)}</span>}
                      </p>
                    </Link>
                    {tab === 'mine' && (
                      <Link to={`/editor/${m.id}`} className="btn-secondary mt-3 w-full py-2 text-sm">
                        {t('maps.edit')}
                      </Link>
                    )}
                  </div>
                ))}
      </div>
      {creating && <CreateMapModal onClose={() => setCreating(false)} />}
    </div>
  );
}
