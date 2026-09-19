import type { FriendshipState } from '@tg/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api } from '../lib/api.ts';
import { toast } from './Toast.tsx';

export function FriendButton({ userId, state }: { userId: string; state: FriendshipState }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['user', userId] });
    void qc.invalidateQueries({ queryKey: ['friends'] });
  };
  const add = useMutation({ mutationFn: () => api.addFriend(userId), onSuccess: refresh, onError: () => toast(t('errors.generic')) });
  const remove = useMutation({ mutationFn: () => api.removeFriend(userId), onSuccess: refresh, onError: () => toast(t('errors.generic')) });
  const busy = add.isPending || remove.isPending;

  if (state === 'self') return null;
  if (state === 'friends')
    return (
      <button className="btn-secondary" disabled={busy} onClick={() => confirm(t('friends.remove') + '?') && remove.mutate()}>
        ✓ {t('profile.friends')}
      </button>
    );
  if (state === 'outgoing')
    return (
      <button className="btn-secondary" disabled={busy} onClick={() => remove.mutate()} title={t('friends.cancel')}>
        {t('profile.requestSent')}
      </button>
    );
  return (
    <button className="btn-primary" disabled={busy} onClick={() => add.mutate()}>
      {state === 'incoming' ? t('profile.acceptFriend') : t('profile.addFriend')}
    </button>
  );
}
