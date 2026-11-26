import fs from 'node:fs/promises';
import path from 'node:path';

export interface LocalePruneResult {
  /** Logical bytes of regular files removed; excludes symlink targets and filesystem allocation overhead. */
  removedBytes: number;
  removedLocales: number;
}

const keepLocale = /^(?:en|vi|ja)(?:[-_].*)?\.lproj$/i;

async function directoryInside(appPath: string, components: string[]): Promise<string> {
  let current = appPath;
  for (const component of ['', ...components]) {
    if (component) current = path.join(current, component);
    const stat = await fs.lstat(current);
    if (!stat.isDirectory() || stat.isSymbolicLink()) {
      throw new Error(`Locale pruning requires a real directory: ${current}`);
    }
  }
  return current;
}

async function regularFileBytes(file: string): Promise<number> {
  const stat = await fs.lstat(file);
  if (stat.isSymbolicLink()) return 0;
  if (stat.isFile()) return stat.size;
  if (!stat.isDirectory()) return 0;
  const children = await fs.readdir(file);
  let total = 0;
  for (const child of children) total += await regularFileBytes(path.join(file, child));
  return total;
}

/** Prune only Electron's two macOS locale roots, before signing the bundle. */
export async function pruneMacLocales(appPath: string): Promise<LocalePruneResult> {
  const root = path.resolve(appPath);
  const outer = await directoryInside(root, ['Contents', 'Resources']);
  const framework = await directoryInside(root, [
    'Contents', 'Frameworks', 'Electron Framework.framework', 'Versions', 'A', 'Resources',
  ]);

  // Fail before removing anything if a supported base language or English fallback is missing.
  for (const language of ['en', 'ja', 'vi']) {
    const locale = await directoryInside(framework, [`${language}.lproj`]);
    const pak = path.join(locale, 'locale.pak');
    const stat = await fs.lstat(pak);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size === 0) {
      throw new Error(`Missing real Electron locale pack: ${pak}`);
    }
  }

  const removals: Array<{ file: string; bytes: number }> = [];
  for (const resources of [outer, framework]) {
    for (const entry of await fs.readdir(resources, { withFileTypes: true })) {
      if (!entry.name.endsWith('.lproj') || keepLocale.test(entry.name) || entry.name === 'Base.lproj') continue;
      if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
      const file = path.join(resources, entry.name);
      removals.push({ file, bytes: await regularFileBytes(file) });
    }
  }

  let removedBytes = 0;
  for (const removal of removals) {
    // rm unlinks a symlink itself; regularFileBytes never traverses its target.
    await fs.rm(removal.file, { recursive: true });
    removedBytes += removal.bytes;
  }
  return { removedBytes, removedLocales: removals.length };
}
