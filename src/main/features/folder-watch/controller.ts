import { createFolderWatcher } from './watcher';
import type { SettingsStore } from '../settings/store';
import type { CompressionQueue } from '../compression/queue';
import type { CompressionResult } from '../../../shared/contracts';

interface Dependencies { settings: SettingsStore; queue: CompressionQueue; onChange: () => void; onError: (error: unknown) => void }
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
        this.deps.onChange();
      }
    }
  }
  async start(directory = this.deps.settings.value.watchPath): Promise<void> {
    if (!directory) throw new Error('error.invalidPath');
    const generation = ++this.generation;
    const previous = this.watcher;
    this.watcher = null; this.running = false;
    if (previous) await previous.close();
    if (generation !== this.generation) return;
    const next = await createFolderWatcher(directory, {
      isBusy: file => this.deps.queue.isBusy(file),
      onFiles: files => { if (generation === this.generation) return this.deps.queue.enqueue(files); },
      onError: error => { if (generation === this.generation) this.deps.onError(error); },
    });
    if (generation !== this.generation) { await next.close(); return; }
    try { this.deps.settings.setWatch(directory, true); }
    catch (error) { await next.close(); throw error; }
    this.watcher = next; this.running = true;
    this.deps.onChange();
  }
  markOutput(result: CompressionResult): void { this.watcher?.markOutput(result.outputPath, result.outputFingerprint); }
}
