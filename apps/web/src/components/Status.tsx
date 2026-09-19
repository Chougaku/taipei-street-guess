import { useTranslation } from 'react-i18next';
import { ApiError } from '../lib/api.ts';

export function Spinner({ className = 'size-8' }: { className?: string }) {
  return <div className={`${className} animate-spin rounded-full border-4 border-line border-t-accent`} role="status" />;
}

export function FullScreenLoader() {
  const { t } = useTranslation();
  return (
    <div className="grid h-dvh place-items-center">
      <div className="flex flex-col items-center gap-3 text-muted">
        <Spinner className="size-10" />
        {t('app.loading')}
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
        <p className="mb-1 text-lg font-bold">{t('app.error')}</p>
        <p className="mb-4 text-muted">{message}</p>
        <div className="flex justify-center gap-2">
          {onRetry && (
            <button className="btn-primary" onClick={onRetry}>
              {t('app.retry')}
            </button>
          )}
          <a className="btn-secondary" href="/">
            {t('game.home')}
          </a>
        </div>
      </div>
    </div>
  );
}
