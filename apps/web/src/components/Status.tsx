import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ApiError } from '../lib/api.ts';
import { env } from '../lib/env.ts';
import { Baseball, BubbleTea } from './art/Stickers.tsx';

/** A spinning baseball. */
export function Spinner({ className = 'size-8' }: { className?: string }) {
  const { t } = useTranslation();
  return <Baseball className={`${className} shrink-0 animate-spin [animation-duration:1.2s]`} role="status" aria-hidden={false} aria-label={t('app.loading')} />;
}

export function FullScreenLoader() {
  const { t } = useTranslation();
  const [line] = useState(() => {
    const lines = t('app.loadingFun', { returnObjects: true }) as unknown as string[];
    return lines[Math.floor(Math.random() * lines.length)] ?? t('app.loading');
  });
  return (
    <div className="grid h-dvh place-items-center">
      <div className="flex flex-col items-center gap-2 text-muted">
        <div className="animate-bounce">
          <Spinner className="size-12" />
        </div>
        <div className="h-1.5 w-9 animate-pulse rounded-full bg-black/40" />
        <p className="mt-2 font-display font-bold">{line}</p>
      </div>
    </div>
  );
}

export function ErrorView({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const { t } = useTranslation();
  const message =
    error instanceof ApiError
      ? error.status === 404
        ? t('errors.notFound')
        : error.message
      : error instanceof TypeError
        ? t('errors.network')
        : t('errors.generic');
  return (
    <div className="grid min-h-[60dvh] place-items-center p-6">
      <div className="card max-w-sm p-6 text-center">
        <BubbleTea mood="sad" className="mx-auto mb-3 h-24 -rotate-6" />
        <p className="mb-1 font-display text-lg font-bold">{t('app.error')}</p>
        <p className="mb-4 text-muted">{message}</p>
        <div className="flex justify-center gap-2">
          {onRetry && (
            <button className="btn-primary" onClick={onRetry}>
              {t('app.retry')}
            </button>
          )}
          {/* A plain link (not <Link>) because this also renders outside the router; basePath keeps it inside GitHub Pages. */}
          <a className="btn-secondary" href={env.basePath}>
            {t('game.home')}
          </a>
        </div>
      </div>
    </div>
  );
}
