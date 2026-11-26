'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { supportedExtensions, isGenerated } = require('./compressor.cjs');

async function createFolderWatcher(directory, { onFiles, onError = () => {}, ignoredPaths = [], isBusy = () => false } = {}) {
  if (typeof onFiles !== 'function') throw new Error('Watcher requires onFiles callback.');
  const root = path.resolve(directory);
  const stat = await fs.lstat(root);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('Chọn một thư mục thông thường để theo dõi.');
  const { default: chokidar } = await import('chokidar');
  const ignored = [...ignoredPaths].map(p => path.resolve(p));
  const known = new Map();
  const pending = new Map();
  const deferred = new Map();
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
      return stats?.isFile() && (!supportedExtensions.has(path.extname(absolute).slice(1).toLowerCase()) || isGenerated(absolute));
    } });

  async function accept(file) {
    if (closed || !ready || isGenerated(file)) return;
    if (isBusy(file)) {
      if (!deferred.has(file)) deferred.set(file, setTimeout(() => { deferred.delete(file); changed(file); }, 400));
      return;
    }
    try {
      const before = await fs.lstat(file);
      if (!before.isFile() || before.isSymbolicLink() || before.size <= 0 || !supportedExtensions.has(path.extname(file).slice(1).toLowerCase())) return;
      const contents = await fs.readFile(file);
      const after = await fs.lstat(file);
      if (before.size !== after.size || before.mtimeMs !== after.mtimeMs || before.ino !== after.ino) return;
      const fingerprint = crypto.createHash('sha256').update(contents).digest('hex');
      if (closed || known.get(file) === fingerprint) return;
      known.set(file, fingerprint);
      await onFiles([file]);
    } catch (error) { if (!closed && error.code !== 'ENOENT') onError(error); }
  }

  function changed(file) {
    file = path.resolve(file);
    const previous = pending.get(file) || Promise.resolve();
    const next = previous.then(() => accept(file)).finally(() => { if (pending.get(file) === next) pending.delete(file); });
    pending.set(file, next);
  }
  watcher.on('add', changed).on('change', changed).on('unlink', file => {
    file = path.resolve(file);
    known.delete(file);
    clearTimeout(deferred.get(file));
    deferred.delete(file);
  });
  await new Promise((resolve, reject) => {
    watcher.once('ready', () => { ready = true; resolve(); });
    watcher.on('error', error => { onError(error); if (!ready) { watcher.close().catch(() => {}); reject(error); } });
  });
  return {
    markOutput(file, fingerprint) {
      if (typeof fingerprint === 'string') known.set(path.resolve(file), fingerprint);
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

module.exports = { createFolderWatcher };
