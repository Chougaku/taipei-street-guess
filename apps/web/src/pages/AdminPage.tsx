import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal } from '../components/Modal.tsx';
import { ErrorView, Spinner } from '../components/Status.tsx';
import { StreetView } from '../game/StreetView.tsx';
import { api, type AdminReport } from '../lib/api.ts';

export default function AdminPage() {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const [preview, setPreview] = useState<AdminReport | null>(null);
  const { data, error, isLoading } = useQuery({ queryKey: ['admin-reports'], queryFn: api.adminReports });
  const resolve = useMutation({
    mutationFn: ({ panoId, action }: { panoId: string; action: 'disable' | 'dismiss' }) => api.resolveReport(panoId, action),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['admin-reports'] }),
  });

  if (error) return <ErrorView error={error} />;
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <h1 className="text-2xl font-black">{t('admin.title')}</h1>
      {isLoading ? (
        <Spinner />
      ) : !data?.length ? (
        <p className="text-muted">{t('admin.empty')}</p>
      ) : (
        data.map((r) => (
          <div key={r.panoId} className="card space-y-2 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs text-muted">{r.panoId}</span>
              {r.mapName && <span className="chip text-xs">{r.mapName}</span>}
              {r.disabled && <span className="chip text-xs text-bad">{t('admin.disabled')}</span>}
              <span className="ml-auto text-sm font-bold">{t('admin.reports', { count: r.reports })}</span>
            </div>
            <div className="flex flex-wrap gap-1 text-xs">
              {Object.entries(r.reasons).map(([k, n]) => (
                <span key={k} className="chip">
                  {t(`report.reasons.${k}`)} × {n}
                </span>
              ))}
            </div>
            {r.notes.length > 0 && (
              <ul className="list-disc pl-5 text-sm text-muted">
                {r.notes.map((n, i) => (
                  <li key={i}>{n}</li>
                ))}
              </ul>
            )}
            <p className="text-xs text-muted">{new Date(r.lastReportedAt).toLocaleString(i18n.language)}</p>
            <div className="flex flex-wrap gap-2">
              <button className="btn-secondary py-2 text-sm" onClick={() => setPreview(r)}>
                {t('admin.preview')}
              </button>
              <button className="btn-primary py-2 text-sm" disabled={resolve.isPending} onClick={() => resolve.mutate({ panoId: r.panoId, action: 'disable' })}>
                {t('admin.disable')}
              </button>
              <button className="btn-ghost py-2 text-sm" disabled={resolve.isPending} onClick={() => resolve.mutate({ panoId: r.panoId, action: 'dismiss' })}>
                {t('admin.dismiss')}
              </button>
            </div>
          </div>
        ))
      )}
      <Modal open={!!preview} onClose={() => setPreview(null)} title={t('admin.preview')}>
        {preview && (
          <div className="relative h-72 overflow-hidden rounded-xl">
            <StreetView pano={{ panoId: preview.panoId, heading: preview.heading, pitch: 0, zoom: 0 }} movement="moving" />
          </div>
        )}
      </Modal>
    </div>
  );
}
