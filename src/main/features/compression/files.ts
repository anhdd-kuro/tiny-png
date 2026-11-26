import fs from 'node:fs/promises';
import type { Stats } from 'node:fs';
import path from 'node:path';

export const MAX_INPUT_BYTES = 500_000_000;
export const supportedExtensions: ReadonlySet<string> = new Set(['png', 'jpg', 'jpeg', 'webp', 'avif']);
export const isGenerated = (file: string): boolean => /-tinified(?:-\d+)?$/i.test(path.parse(file).name);

export async function collectFiles(paths: readonly string[]): Promise<string[]> {
  const files = new Set<string>();
  async function visit(file: string, explicit = false): Promise<void> {
    file = path.resolve(file);
    let stat: Stats;
    try { stat = await fs.lstat(file); }
    catch (error) {
      if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
      console.debug('Image removed before collection:', file);
      return;
    }
    if (stat.isSymbolicLink()) return;
    if (stat.isDirectory()) {
      const children = await fs.readdir(file);
      for (const child of children) if (!child.startsWith('.')) await visit(path.join(file, child));
    } else if (stat.isFile() && !path.basename(file).startsWith('.') && supportedExtensions.has(path.extname(file).slice(1).toLowerCase()) &&
               (explicit || !isGenerated(file))) files.add(file);
  }
  for (const file of paths) if (typeof file === 'string') await visit(file, true);
  return [...files].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}
