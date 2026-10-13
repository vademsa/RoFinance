export type AppRelease = { apiRevision: string; webRevision: string | null };
export function isAppRelease(value: unknown): value is AppRelease {
  if (!value || typeof value !== 'object') return false;
  const release = value as AppRelease;
  return typeof release.apiRevision === 'string' && /^[a-f0-9]{64}$/.test(release.apiRevision)
    && (release.webRevision === null || (typeof release.webRevision === 'string' && /^[a-f0-9-]{36}$/.test(release.webRevision)));
}

export class ReleaseMonitor {
  private baseline: string | null = null;
  pending: AppRelease | null = null;
  private checking: Promise<AppRelease> | null = null;
  constructor(private fetchRelease: () => Promise<AppRelease>, private native: boolean,
    private loadedWebRevision: string | null, private notify: () => void) {}

  check(): Promise<AppRelease> {
    // A tap and a background check share one fresh request; no cached success.
    if (this.checking) return this.checking;
    this.checking = this.fetchRelease().then((release) => {
      if (!isAppRelease(release)) throw new Error('APP_VERSION_UNAVAILABLE');
      const changed = (this.baseline !== null && this.baseline !== release.apiRevision)
        || (!this.native && this.loadedWebRevision !== null && release.webRevision !== this.loadedWebRevision);
      if (this.baseline === null) this.baseline = release.apiRevision;
      if (changed) { this.pending = release; this.notify(); }
      return release;
    }).finally(() => { this.checking = null; });
    return this.checking;
  }

  // Native cannot replace its packaged JavaScript by reloading the WebView.
  acknowledgeNative(release: AppRelease) {
    if (!this.native || this.pending?.apiRevision !== release.apiRevision) return;
    this.baseline = release.apiRevision;
    this.pending = null;
    this.notify();
  }
}
