import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { isNativeApp } from '@platform';
import { appRelease, subscribeAppRelease } from '../lib/appRelease';

export function useAppUpdates(isSafe: () => boolean, refreshNative: () => Promise<void>) {
  const callbacks = useRef({ isSafe, refreshNative });
  useLayoutEffect(() => { callbacks.current = { isSafe, refreshNative }; });
  const [updatePending, setUpdatePending] = useState(Boolean(appRelease.pending));
  useEffect(() => {
    let stopped = false;
    let applying = false;
    let retryAt = 0;
    const unsubscribe = subscribeAppRelease(() => setUpdatePending(Boolean(appRelease.pending)));
    const check = () => {
      if (document.visibilityState !== 'hidden') void appRelease.check().catch(() => { /* Offline: retry on focus or next poll. Mutations fail closed. */ });
    };
    const apply = async () => {
      const release = appRelease.pending;
      if (stopped || !release || applying || Date.now() < retryAt || !callbacks.current.isSafe()) return;
      applying = true;
      if (!isNativeApp) { window.location.reload(); return; }
      try {
        await callbacks.current.refreshNative();
        if (!stopped) appRelease.acknowledgeNative(release);
      } catch { retryAt = Date.now() + 10000; }
      finally { applying = false; }
    };
    check();
    const polling = window.setInterval(check, 30000);
    const safeReload = window.setInterval(() => { void apply(); }, 1000);
    window.addEventListener('focus', check);
    window.addEventListener('online', check);
    document.addEventListener('visibilitychange', check);
    return () => {
      stopped = true;
      unsubscribe();
      window.clearInterval(polling); window.clearInterval(safeReload);
      window.removeEventListener('focus', check); window.removeEventListener('online', check);
      document.removeEventListener('visibilitychange', check);
    };
  }, []);
  return updatePending;
}
