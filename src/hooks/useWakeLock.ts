import { useEffect } from 'react';

interface WakeLockSentinelLike {
  release: () => Promise<void>;
}

/**
 * Keeps mobile screen awake while active 3D scanning runs,
 * matching FLAG_KEEP_SCREEN_ON in Android 3Drecon.
 */
export function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active) return;
    let sentinel: WakeLockSentinelLike | null = null;
    let cancelled = false;

    const requestLock = async () => {
      try {
        const nav = navigator as unknown as {
          wakeLock?: { request: (type: 'screen') => Promise<WakeLockSentinelLike> };
        };
        if (nav.wakeLock && !cancelled) {
          sentinel = await nav.wakeLock.request('screen');
        }
      } catch {
        // Wake lock can fail silently in background tabs or unsupported browsers
      }
    };

    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && active) {
        void requestLock();
      }
    };

    void requestLock();
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', handleVisibility);
      if (sentinel) {
        void sentinel.release().catch(() => undefined);
      }
    };
  }, [active]);
}
