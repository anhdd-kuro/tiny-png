import { createFolderWatcher } from './watcher';
import type { SettingsStore } from '../settings/store';
import type { CompressionQueue } from '../compression/queue';
import type { CompressionResult } from '../../../shared/contracts';

interface Dependencies { settings: SettingsStore; queue: CompressionQueue; onChange: () => void; onError: (error: unknown) => void; onActivity?: (action: 'watchStarted' | 'watchStopped' | 'watchFailed', directory: string | null, error?: unknown) => void }
export class FolderWatchController {
  private watcher: Awaited<ReturnType<typeof createFolderWatcher>> | null = null;
  running = false;
  private generation = 0;
  constructor(private readonly deps: Dependencies) {}
  async stop({ persist = true } = {}): Promise<void> {
    const generation = ++this.generation;
    const previous = this.watcher;
    this.watcher = null; this.running = false;
    this.deps.onChange();
    try { if (previous) await previous.close(); }
    finally {
      if (persist && generation === this.generation) {
        this.deps.settings.setWatch(this.deps.settings.value.watchPath, false);
        this.deps.onActivity?.('watchStopped', this.deps.settings.value.watchPath);
        this.deps.onChange();
      }
    }
  }
  async start(directory = this.deps.settings.value.watchPath): Promise<void> {
    try { await this.startWatcher(directory); }
    catch (error) { this.deps.onActivity?.('watchFailed', directory, error); throw error; }
  }
  private async startWatcher(directory: string | null): Promise<void> {
    if (!directory) throw new Error('error.invalidPath');
    const generation = ++this.generation;
    const previous = this.watcher;
    this.watcher = null; this.running = false;
    if (previous) await previous.close();
    if (generation !== this.generation) return;
    const next = await createFolderWatcher(directory, {
      isBusy: file => this.deps.queue.isBusy(file),
      onFiles: files => { if (generation === this.generation) return this.deps.queue.enqueue(files, 'watch'); },
      onError: error => { if (generation === this.generation) { if (this.running) this.deps.onActivity?.('watchFailed', directory, error); this.deps.onError(error); } },
    });
    if (generation !== this.generation) { await next.close(); return; }
    try { this.deps.settings.setWatch(directory, true); }
    catch (error) { await next.close(); throw error; }
    this.watcher = next; this.running = true;
    this.deps.onActivity?.('watchStarted', directory);
    this.deps.onChange();
  }
  markOutput(result: CompressionResult): void { this.watcher?.markOutput(result.outputPath, result.outputFingerprint); }
}
