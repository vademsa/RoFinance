import { apiFetch, isNativeApp } from '@platform';
import { ReleaseMonitor, isAppRelease } from '../utils/appRelease';

const listeners = new Set<() => void>();
export const appRelease = new ReleaseMonitor(async () => {
  const response = await apiFetch('/api/app-version', { cache: 'no-store', signal: AbortSignal.timeout(8000) });
  const release = await response.json();
  if (!response.ok || !isAppRelease(release)) throw new Error('APP_VERSION_UNAVAILABLE');
  return release;
}, isNativeApp, typeof document === 'undefined' ? null : document.querySelector<HTMLMetaElement>('meta[name="rofinance-release"]')?.content ?? null,
() => { for (const listener of listeners) listener(); });

export function subscribeAppRelease(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export async function beforeCharacterMutation() {
  await appRelease.check();
  if (appRelease.pending) throw new Error('APP_UPDATE_REQUIRED');
}
