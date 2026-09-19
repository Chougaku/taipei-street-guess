import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { Share } from '@capacitor/share';
import { useSettings } from '../stores/settings.ts';
import { isNative } from './env.ts';

type HapticKind = 'light' | 'medium' | 'success' | 'error';

export function haptic(kind: HapticKind = 'light') {
  if (!useSettings.getState().haptics) return;
  if (isNative) {
    if (kind === 'success') void Haptics.notification({ type: NotificationType.Success });
    else if (kind === 'error') void Haptics.notification({ type: NotificationType.Error });
    else void Haptics.impact({ style: kind === 'medium' ? ImpactStyle.Medium : ImpactStyle.Light });
    return;
  }
  navigator.vibrate?.(kind === 'light' ? 8 : kind === 'medium' ? 16 : [12, 40, 12]);
}

/** Native share sheet, Web Share API, or clipboard as a last resort. Returns 'copied' for the latter. */
export async function share(opts: { title: string; text: string; url: string }): Promise<'shared' | 'copied' | 'cancelled'> {
  try {
    if (isNative) {
      await Share.share({ title: opts.title, text: opts.text, url: opts.url, dialogTitle: opts.title });
      return 'shared';
    }
    if (navigator.share) {
      await navigator.share(opts);
      return 'shared';
    }
  } catch {
    return 'cancelled';
  }
  await navigator.clipboard.writeText(`${opts.text} ${opts.url}`);
  return 'copied';
}

/** Keeps the screen awake during a game (supported on Android Chrome and iOS 16.4+). */
export function keepScreenAwake(): () => void {
  let lock: WakeLockSentinel | null = null;
  let released = false;
  const acquire = async () => {
    try {
      if (!released && document.visibilityState === 'visible') lock = (await navigator.wakeLock?.request('screen')) ?? null;
    } catch {
      /* not supported or denied */
    }
  };
  const onVisible = () => void acquire();
  void acquire();
  document.addEventListener('visibilitychange', onVisible);
  return () => {
    released = true;
    document.removeEventListener('visibilitychange', onVisible);
    void lock?.release();
  };
}
