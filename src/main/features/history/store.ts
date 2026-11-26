import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { HistoryAction, HistoryEntry } from '../../../shared/contracts';

export type HistoryEvent = Omit<HistoryEntry, 'id' | 'timestamp'>;
interface Options { onError?(error: Error): void }
const limit = 500;
const maximumFileBytes = 8 * 1024 * 1024;
const actions = new Set<HistoryAction>(['detected', 'watchDetected', 'compressed', 'skipped', 'failed', 'uploaded', 'uploadFailed', 'watchStarted', 'watchStopped', 'watchFailed', 'notificationRequested', 'notificationSent', 'notificationFailed', 'notificationSuppressed', 'notificationUnconfirmed']);

function text(value: unknown, maximumBytes: number): value is string {
  return typeof value === 'string' && value.length > 0 && !value.includes('\0') && Buffer.byteLength(value) <= maximumBytes;
}
function filename(value: unknown): value is string { return text(value, 4096) && path.isAbsolute(value); }
function event(input: unknown): HistoryEvent {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('error.historyInvalid');
  const value = input as Record<string, unknown>;
  if (typeof value.action !== 'string' || !actions.has(value.action as HistoryAction) || value.file !== null && !filename(value.file)) throw new Error('error.historyInvalid');
  const result: HistoryEvent = { action: value.action as HistoryAction, file: value.file as string | null };
  if (value.outputPath !== undefined) {
    if (!filename(value.outputPath)) throw new Error('error.historyInvalid');
    result.outputPath = value.outputPath;
  }
  for (const key of ['originalBytes', 'outputBytes'] as const) if (value[key] !== undefined) {
    if (typeof value[key] !== 'number' || !Number.isSafeInteger(value[key]) || value[key] < 0) throw new Error('error.historyInvalid');
    result[key] = value[key];
  }
  if (value.error !== undefined) {
    if (!text(value.error, 2048)) throw new Error('error.historyInvalid');
    result.error = value.error;
  }
  return result;
}
function stored(input: unknown): HistoryEntry {
  const value = input as Record<string, unknown> | null;
  const validated = event(input);
  if (!value || !text(value.id, 128) || typeof value.timestamp !== 'string' || value.timestamp.length !== 24 || !Number.isFinite(Date.parse(value.timestamp)) || new Date(value.timestamp).toISOString() !== value.timestamp) throw new Error('error.historyInvalid');
  return { ...validated, id: value.id, timestamp: value.timestamp };
}
function newest(entries: HistoryEntry[]): HistoryEntry[] {
  const ids = new Set<string>();
  return entries.sort((a, b) => b.timestamp.localeCompare(a.timestamp)).filter(entry => {
    if (ids.has(entry.id)) return false;
    ids.add(entry.id);
    return true;
  }).slice(0, limit);
}

export class HistoryStore {
  private records: HistoryEntry[] = [];
  constructor(readonly file: string, private readonly options: Options = {}) {
    let descriptor: number | undefined;
    try {
      const stat = fs.lstatSync(file);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size > maximumFileBytes) throw new Error('error.historyRead');
      descriptor = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
      if (fs.fstatSync(descriptor).size > maximumFileBytes) throw new Error('error.historyRead');
      const contents: unknown = JSON.parse(fs.readFileSync(descriptor, 'utf8'));
      if (!Array.isArray(contents)) throw new Error('error.historyInvalid');
      let malformed = false;
      const valid: HistoryEntry[] = [];
      for (const entry of contents) {
        try { valid.push(stored(entry)); }
        catch { malformed = true; }
      }
      this.records = newest(valid);
      if (malformed) this.report('error.historyInvalid');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') this.report(error instanceof SyntaxError || error instanceof Error && error.message === 'error.historyInvalid' ? 'error.historyInvalid' : 'error.historyRead', error);
    } finally {
      if (descriptor !== undefined) {
        try { fs.closeSync(descriptor); }
        catch (error) { this.report('error.historyRead', error); }
      }
    }
  }

  get entries(): HistoryEntry[] { return this.records.map(entry => ({ ...entry })); }

  add(input: HistoryEvent): HistoryEntry | null {
    let entry: HistoryEntry;
    try { entry = { ...event(input), id: randomUUID(), timestamp: new Date().toISOString() }; }
    catch (error) { this.report('error.historyInvalid', error); return null; }
    return this.commit(newest([entry, ...this.records])) ? { ...entry } : null;
  }

  clear(): boolean { return this.commit([]); }

  private commit(next: HistoryEntry[]): boolean {
    const temporary = path.join(path.dirname(this.file), `.history-${randomUUID()}.tmp`);
    let descriptor: number | undefined;
    try {
      const contents = JSON.stringify(next) + '\n';
      if (Buffer.byteLength(contents) > maximumFileBytes) throw new Error('error.historyWrite');
      fs.mkdirSync(path.dirname(this.file), { recursive: true, mode: 0o700 });
      try {
        const current = fs.lstatSync(this.file);
        if (!current.isFile() || current.isSymbolicLink()) throw new Error('error.historyWrite');
      } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
      descriptor = fs.openSync(temporary, 'wx', 0o600);
      fs.writeFileSync(descriptor, contents, 'utf8');
      fs.fsyncSync(descriptor);
      fs.closeSync(descriptor);
      descriptor = undefined;
      fs.renameSync(temporary, this.file);
      this.records = next;
      return true;
    } catch (error) { this.report('error.historyWrite', error); return false; }
    finally {
      if (descriptor !== undefined) {
        try { fs.closeSync(descriptor); }
        catch { this.report('error.historyWrite'); }
      }
      try { fs.unlinkSync(temporary); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') this.report('error.historyWrite', error); }
    }
  }

  private report(key: string, cause?: unknown): void {
    try { this.options.onError?.(new Error(key, { cause })); }
    catch { console.warn('Tiny Assets: history error callback failed.'); }
  }
}
