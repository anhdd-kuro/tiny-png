import fs from 'node:fs';
import path from 'node:path';
import { DEFAULTS } from '../compression/options';
import type { Settings, SettingsPatch } from '../../../shared/contracts';

export const DEFAULT_SETTINGS: Settings = { ...DEFAULTS, notificationsEnabled: true, glassEnabled: false, backgroundStyle: 'gradient', glassOpacity: 70, cornerEnabled: true, dropCorner: 'topRight', cornerMode: 'always', language: 'vi', watchPath: null, watchEnabled: false, s3Enabled: false, s3Region: 'ap-northeast-1', s3Bucket: '', s3Prefix: '' };

export function validatePatch(input: unknown): SettingsPatch {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('error.invalidSettings');
  const patch = input as Record<string, unknown>;
  const result: Record<string, unknown> = {};
  for (const key of ['overwrite', 'resizeEnabled', 'cornerEnabled', 's3Enabled', 'notificationsEnabled', 'glassEnabled']) if (key in patch) {
    if (typeof patch[key] !== 'boolean') throw new Error('error.invalidSettings');
    result[key] = patch[key];
  }
  for (const [key, min, max] of [['quality', 1, 100], ['width', 1, 32768], ['height', 1, 32768], ['resizePercent', 1, 100], ['glassOpacity', 20, 100]] as const) if (key in patch) {
    const value = patch[key];
    if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) throw new Error('error.invalidSettings');
    result[key] = value;
  }
  for (const [key, values] of [
    ['format', ['original', 'png', 'jpeg', 'webp', 'avif']], ['resizeMethod', ['fit', 'cover', 'scale', 'thumb']], ['resizeMode', ['dimensions', 'percent']],
    ['dropCorner', ['topRight', 'topLeft', 'bottomRight', 'bottomLeft', 'topCenter']], ['cornerMode', ['always', 'nearby']], ['language', ['en', 'vi', 'ja']],
    ['backgroundStyle', ['gradient', 'solid']],
  ] as const) if (key in patch) {
    if (!(values as readonly unknown[]).includes(patch[key])) throw new Error('error.invalidSettings');
    result[key] = patch[key];
  }
  if ('outputDirectory' in patch) {
    if (patch.outputDirectory !== null) throw new Error('error.chooseOutput');
    result.outputDirectory = null;
  }
  for (const key of ['s3Region', 's3Bucket', 's3Prefix']) if (key in patch) {
    const value = patch[key];
    if (typeof value !== 'string' || value.length > 1024 || /[\u0000-\u001f]/.test(value)) throw new Error('error.s3Config');
    result[key] = value.trim();
  }
  return result as SettingsPatch;
}

export class SettingsStore {
  value: Settings = { ...DEFAULT_SETTINGS };
  constructor(readonly file: string) {
    let persisted: unknown;
    try { persisted = JSON.parse(fs.readFileSync(file, 'utf8')); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') console.warn('Tiny PNG: settings reset:', (error as Error).name); return; }
    if (!persisted || typeof persisted !== 'object' || Array.isArray(persisted)) return;
    const saved = persisted as Record<string, unknown>;
    for (const key of Object.keys(DEFAULT_SETTINGS) as (keyof Settings)[]) {
      if (!(key in saved)) continue;
      try {
        const value = saved[key];
        if (key === 'outputDirectory' || key === 'watchPath') {
          if (value === null || typeof value === 'string' && path.isAbsolute(value)) this.value[key] = value;
        } else if (key === 'watchEnabled') {
          if (typeof value === 'boolean') this.value.watchEnabled = value;
        } else Object.assign(this.value, validatePatch({ [key]: value }));
      } catch { console.warn('Tiny PNG: invalid saved setting:', key); }
    }
    if (this.value.overwrite) this.value.outputDirectory = null;
    if (!this.value.watchPath) this.value.watchEnabled = false;
  }
  private commit(next: Settings): void {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const temporary = `${this.file}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify(next, null, 2), { mode: 0o600 });
    fs.renameSync(temporary, this.file);
    this.value = next;
  }
  update(patch: unknown): void {
    const next = { ...this.value, ...validatePatch(patch) };
    if (next.overwrite) next.outputDirectory = null;
    this.commit(next);
  }
  setWatch(watchPath: string | null, watchEnabled: boolean): void { this.commit({ ...this.value, watchPath, watchEnabled }); }
  setOutput(outputDirectory: string): void { this.commit({ ...this.value, outputDirectory, overwrite: false }); }
}
