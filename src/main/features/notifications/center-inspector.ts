export class NotificationCenterInspector {
  private pending: Promise<readonly string[]> | undefined;
  constructor(private readonly readIds: () => Promise<readonly string[]>) {}
  async isPresent(id: string): Promise<boolean> {
    if (!this.pending) {
      let resolve!: (ids: readonly string[]) => void;
      let reject!: (error: unknown) => void;
      const pending = new Promise<readonly string[]>((yes, no) => { resolve = yes; reject = no; });
      this.pending = pending;
      const timeout = setTimeout(() => reject(new Error('notifications.unconfirmed')), 5000);
      timeout.unref?.();
      // Keep a timed-out request in flight until macOS replies, so repeated
      // diagnostics cannot accumulate native requests when the service stalls.
      void Promise.resolve().then(this.readIds).then(resolve, reject).finally(() => {
        clearTimeout(timeout);
        if (this.pending === pending) this.pending = undefined;
      });
    }
    return (await this.pending).includes(id);
  }
}
