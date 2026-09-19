import type { ChallengeInfo } from '@tg/shared';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { mapName } from '../i18n/index.ts';
import { shareUrl } from '../lib/env.ts';
import { share } from '../lib/native.ts';
import { formatTimeLimit } from './GameSettingsForm.tsx';
import { IconShare } from './icons.tsx';
import { Modal } from './Modal.tsx';
import { toast } from './Toast.tsx';

export function ChallengeShare({ challenge, onClose }: { challenge: ChallengeInfo | null; onClose(): void }) {
  const { t } = useTranslation();
  if (!challenge) return null;
  const url = shareUrl(`/c/${challenge.code}`);
  return (
    <Modal open onClose={onClose} title={t('challenge.create')}>
      <p className="mb-3 text-sm text-muted">{t('challenge.createDesc')}</p>
      <div className="mb-3 flex flex-wrap gap-2 text-xs">
        <span className="chip">{mapName(challenge.map)}</span>
        <span className="chip">{t(`mapPage.${challenge.settings.movement}`)}</span>
        <span className="chip">{formatTimeLimit(t, challenge.settings.timeLimitSec)}</span>
      </div>
      <label className="mb-1 block text-sm font-semibold text-muted">{t('challenge.link')}</label>
      <div className="flex gap-2">
        <input readOnly value={url} className="min-w-0 flex-1 rounded-xl bg-panel-2 px-3 py-2 font-mono text-sm ring-1 ring-line" onFocus={(e) => e.target.select()} />
        <button
          className="btn-secondary px-3"
          onClick={async () => {
            await navigator.clipboard.writeText(url);
            toast(t('app.copied'));
          }}
        >
          {t('challenge.copy')}
        </button>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <button
          className="btn-primary"
          onClick={async () => {
            const r = await share({ title: t('app.name'), text: t('challenge.anonymous'), url });
            if (r === 'copied') toast(t('app.copied'));
          }}
        >
          <IconShare width={18} height={18} /> {t('challenge.share')}
        </button>
        <Link to={`/c/${challenge.code}`} className="btn-secondary" onClick={onClose}>
          {t('challenge.viewLeaderboard')}
        </Link>
      </div>
    </Modal>
  );
}
