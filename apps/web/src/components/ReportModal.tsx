import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../lib/api.ts';
import { Modal } from './Modal.tsx';
import { toast } from './Toast.tsx';

const REASONS = ['no_coverage', 'indoor', 'bad_quality', 'wrong_place', 'other'] as const;

/** Report the location of a played round (or a pano id for streak / multiplayer rounds). */
export function ReportButton({ target, className = '' }: { target: { gameId?: string; roundNo?: number; panoId?: string }; className?: string }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<(typeof REASONS)[number]>('no_coverage');
  const [note, setNote] = useState('');
  const send = useMutation({
    mutationFn: () => api.report({ ...target, reason, note: note || undefined }),
    onSuccess: () => {
      toast(t('report.thanks'));
      setOpen(false);
    },
    onError: () => toast(t('errors.generic')),
  });
  return (
    <>
      <button className={`text-xs text-muted underline-offset-2 hover:text-text hover:underline ${className}`} onClick={() => setOpen(true)}>
        ⚑ {t('report.button')}
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title={t('report.title')}>
        <div className="space-y-2">
          {REASONS.map((r) => (
            <label key={r} className={`flex cursor-pointer items-center gap-3 rounded-xl p-3 ring-1 ${reason === r ? 'bg-accent/15 ring-accent' : 'bg-panel-2 ring-line'}`}>
              <input type="radio" name="reason" className="accent-[var(--color-accent)]" checked={reason === r} onChange={() => setReason(r)} />
              {t(`report.reasons.${r}`)}
            </label>
          ))}
          <textarea
            value={note}
            maxLength={500}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t('report.note')}
            rows={2}
            className="w-full rounded-xl bg-panel-2 px-3 py-2 ring-1 ring-line focus:outline-none focus:ring-accent"
          />
          <button className="btn-primary w-full" disabled={send.isPending} onClick={() => send.mutate()}>
            {t('report.send')}
          </button>
        </div>
      </Modal>
    </>
  );
}
