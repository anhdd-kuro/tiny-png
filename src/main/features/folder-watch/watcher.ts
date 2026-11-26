import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import chokidar from 'chokidar';
import { MAX_INPUT_BYTES, supportedExtensions, isGenerated } from '../compression/files.ts';

export interface FolderWatcher {
  markOutput(file: string, fingerprint?: string): void;
  close(): Promise<void>;
}
interface FolderWatcherOptions {
  onFiles(paths: string[]): void | Promise<void>;
  onError?(error: Error): void;
  ignoredPaths?: Iterable<string>;
  isBusy?(file: string): boolean;
}
function toError(error: unknown): Error { return error instanceof Error ? error : new Error(String(error)); }

export async function createFolderWatcher(directory: string, { onFiles, onError = () => {}, ignoredPaths = [], isBusy = () => false }: FolderWatcherOptions): Promise<FolderWatcher> {
  if (typeof onFiles !== 'function') throw new Error('Watcher requires onFiles callback.');
  const root = path.resolve(directory);
  const stat = await fs.lstat(root);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('error.watchDirectory');
  const ignored = [...ignoredPaths].map(p => path.resolve(p));
  const known = new Map<string, { fingerprint: string }>();
  const pending = new Map<string, Promise<void>>();
  const deferred = new Map<string, ReturnType<typeof setTimeout>>();
  let closed = false;
  let ready = false;
  const watcher = chokidar.watch(root, { ignoreInitial: true, followSymlinks: false, alwaysStat: true,
    // Polling survives macOS watcher limits and screenshot files saved by atomic rename.
    backend: 'polling', pollingInterval: 400, pollingBinaryInterval: 400,
    awaitWriteFinish: { stabilityThreshold: 1500, pollInterval: 200 }, atomic: 200,
    ignored: (file, stats) => {
      const absolute = path.resolve(file);
      const relative = path.relative(root, absolute);
      if (relative.split(path.sep).some(part => part.startsWith('.')) || ignored.some(p => absolute === p || absolute.startsWith(p + path.sep))) return true;
      if (stats?.isSymbolicLink()) return true;
      return Boolean(stats?.isFile() && (!supportedExtensions.has(path.extname(absolute).slice(1).toLowerCase()) || isGenerated(absolute)));
    } });

  function deferWhileBusy(file: string): boolean {
    if (isBusy(file)) {
      if (!deferred.has(file)) deferred.set(file, setTimeout(() => { deferred.delete(file); changed(file); }, 400));
      return true;
    }
    return false;
  }

  async function accept(file: string): Promise<void> {
    if (closed || !ready || isGenerated(file) || deferWhileBusy(file)) return;
    try {
      const before = await fs.lstat(file);
      if (!before.isFile() || before.isSymbolicLink() || before.size <= 0 || !supportedExtensions.has(path.extname(file).slice(1).toLowerCase())) return;
      if (before.size > MAX_INPUT_BYTES) throw new Error('error.fileSize');
      const contents = await fs.readFile(file);
      const after = await fs.lstat(file);
      if (before.size !== after.size || before.mtimeMs !== after.mtimeMs || before.ino !== after.ino) return;
      const fingerprint = crypto.createHash('sha256').update(contents).digest('hex');
      if (closed || known.get(file)?.fingerprint === fingerprint) return;
      if (deferWhileBusy(file)) return;
      const previousKnown = known.get(file);
      await onFiles([file]);
      if (!closed && known.get(file) === previousKnown) known.set(file, { fingerprint });
    } catch (error) {
      const failure = toError(error);
      if (!closed && !('code' in failure && failure.code === 'ENOENT')) onError(failure);
      else console.debug('Skipped watched image after removal or watcher close:', { code: 'code' in failure ? failure.code : undefined });
    }
  }

  function changed(file: string): void {
    file = path.resolve(file);
    const previous = pending.get(file) || Promise.resolve();
    const next: Promise<void> = previous.then(() => accept(file)).finally(() => { if (pending.get(file) === next) pending.delete(file); });
    pending.set(file, next);
  }
  watcher.on('add', changed).on('change', changed).on('unlink', file => {
    file = path.resolve(file);
    known.delete(file);
    clearTimeout(deferred.get(file));
    deferred.delete(file);
  });
  await new Promise<void>((resolve, reject) => {
    watcher.once('ready', () => { ready = true; resolve(); });
    watcher.on('error', error => {
      const failure = toError(error);
      onError(failure);
      if (!ready) { watcher.close().catch((closeError: unknown) => onError(toError(closeError))); reject(failure); }
    });
  });
  return {
    markOutput(file: string, fingerprint?: string) {
      if (!closed && typeof fingerprint === 'string') known.set(path.resolve(file), { fingerprint });
    },
    async close() {
      closed = true;
      for (const timer of deferred.values()) clearTimeout(timer);
      deferred.clear();
      await watcher.close();
      await Promise.allSettled([...pending.values()]);
      known.clear();
    }
  };
}
