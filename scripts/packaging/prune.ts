import fs from 'node:fs/promises';
import path from 'node:path';

export interface PruneResult { removedFiles: number; removedBytes: number }

export async function pruneDevelopmentFiles(nodeModules: string): Promise<PruneResult> {
  const root = path.resolve(nodeModules);
  const rootStat = await fs.lstat(root);
  if (path.basename(root) !== 'node_modules' || !rootStat.isDirectory() || rootStat.isSymbolicLink()) {
    throw new Error('Pruning requires a regular packaged node_modules directory.');
  }
  const result: PruneResult = { removedFiles: 0, removedBytes: 0 };
  const installMetadata = new Set(['.modules.yaml', '.pnpm/lock.yaml', '.pnpm-workspace-state-v1.json', '.package-lock.json']);
  async function visit(directory: string): Promise<void> {
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) { await visit(file); continue; }
      if (!entry.isFile() || /license|licence|copying|copyright|notice/i.test(entry.name)) continue;
      const relative = path.relative(root, file).split(path.sep).join('/');
      if (!installMetadata.has(relative) && !/(?:\.d\.[cm]?ts|\.map|\.(?:c|cc|cpp|cxx|h|hh|hpp|hxx|gyp|gypi))$/i.test(entry.name)) continue;
      const stat = await fs.lstat(file);
      if (!stat.isFile() || stat.isSymbolicLink()) continue;
      await fs.unlink(file);
      result.removedFiles++;
      result.removedBytes += stat.size;
    }
  }
  await visit(root);
  return result;
}
