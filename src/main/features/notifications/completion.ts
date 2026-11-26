import type { BatchSummary } from '../../../shared/contracts.ts';

export interface CompletionContent { title: string; body: string; onClick(): void }
interface Dependencies {
  isEnabled(): boolean;
  translate(key: string, params?: Record<string, string | number>): string;
  show(content: CompletionContent): void;
  openResults(): void;
}

function savedSize(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB'] as const;
  let value = Math.max(0, bytes);
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) { value /= 1024; unit++; }
  return `${Number(value.toFixed(unit === 0 ? 0 : 1))} ${units[unit]}`;
}

export class CompletionNotifier {
  private pending: BatchSummary | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private disposed = false;

  constructor(private readonly dependencies: Dependencies) {}

  complete(summary: BatchSummary): void {
    if (this.disposed) return;
    if (!this.dependencies.isEnabled()) { this.cancelPending(); return; }
    if (summary.completed + summary.failed <= 0) return;
    const previous = this.pending ?? { completed: 0, failed: 0, savedBytes: 0 };
    this.pending = {
      completed: previous.completed + summary.completed,
      failed: previous.failed + summary.failed,
      savedBytes: previous.savedBytes + summary.savedBytes,
    };
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      const batch = this.pending;
      this.pending = null;
      this.timer = undefined;
      if (!batch || this.disposed || !this.dependencies.isEnabled()) return;
      this.dependencies.show({
        title: this.dependencies.translate('notifications.title'),
        body: this.dependencies.translate('notifications.body', {
          completed: batch.completed, failed: batch.failed, saved: savedSize(batch.savedBytes),
        }),
        onClick: () => this.dependencies.openResults(),
      });
    }, 400);
  }

  cancelPending(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
    this.pending = null;
  }

  dispose(): void { this.disposed = true; this.cancelPending(); }
}
