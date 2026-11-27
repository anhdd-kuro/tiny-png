import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import os from 'node:os';
import type { NotificationDiagnosticAction, NotificationDiagnosticEvent, NotificationDiagnostics, NotificationIdentity, NotificationSystemSettings } from '../../../shared/notifications';

const actions = new Set<NotificationDiagnosticAction>(['startup', 'settings', 'settingsFailed', 'request', 'accepted', 'failed', 'unconfirmed', 'inNotificationCenter', 'notInNotificationCenter', 'inspectionFailed', 'clicked', 'closed']);
const settingsValues = new Set(['enabled', 'disabled', 'notSupported', 'unknown']);
const maximumEntries = 200;
const maximumBytes = 1024 * 1024;

export function notificationDetail(input: unknown): string | undefined {
  const value = input instanceof Error ? input.message : typeof input === 'string' ? input : undefined;
  if (!value) return undefined;
  let bytes = 0;
  const result: string[] = [];
  for (const character of value.slice(0, 8192).replaceAll(os.homedir(), '~').replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '')) {
    bytes += Buffer.byteLength(character);
    if (bytes > 2048) break;
    result.push(character);
  }
  return result.join('') || undefined;
}
function systemSettings(value: unknown): NotificationSystemSettings | null {
  if (!value || typeof value !== 'object') return null;
  const settings = value as Record<string, unknown>;
  if (!['notDetermined', 'denied', 'authorized', 'provisional', 'ephemeral', 'unknown'].includes(String(settings.authorization)) ||
      !['none', 'banner', 'alert', 'unknown'].includes(String(settings.alertStyle)) ||
      !['alert', 'notificationCenter', 'sound'].every(key => settingsValues.has(String(settings[key])))) return null;
  return { authorization: settings.authorization, alert: settings.alert, alertStyle: settings.alertStyle,
    notificationCenter: settings.notificationCenter, sound: settings.sound,
    ...(settingsValues.has(String(settings.scheduledDelivery)) ? { scheduledDelivery: settings.scheduledDelivery } : {}),
    ...(settingsValues.has(String(settings.timeSensitive)) ? { timeSensitive: settings.timeSensitive } : {}) } as NotificationSystemSettings;
}

export class NotificationJournal {
  private value: NotificationDiagnostics;
  private readonly onChange: (snapshot: NotificationDiagnostics) => void;
  constructor(readonly file: string, identity: NotificationIdentity, options: { onChange?(snapshot: NotificationDiagnostics): void; onError?(error: Error): void } = {}) {
    this.onChange = options.onChange ?? (() => {});
    this.onError = options.onError ?? (() => {});
    this.value = { identity: { ...identity }, settings: null, checkedAt: null, events: [] };
    try {
      const directory = fs.lstatSync(path.dirname(file));
      if (!directory.isDirectory() || directory.isSymbolicLink()) throw new Error('error.notificationLogRead');
      const stat = fs.lstatSync(file);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size > maximumBytes) throw new Error('error.notificationLogRead');
      const fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
      let saved: Record<string, unknown>;
      try { saved = JSON.parse(fs.readFileSync(fd, 'utf8')) as Record<string, unknown>; }
      finally { fs.closeSync(fd); }
      if (!saved || typeof saved !== 'object' || !Array.isArray(saved.events)) throw new Error('error.notificationLogRead');
      const previous = saved.identity as Record<string, unknown> | undefined;
      if (typeof previous?.requirement === 'string' && identity.requirement) this.value.identity.changedSinceLastRun = previous.requirement !== identity.requirement;
      for (const entry of saved.events.slice(0, maximumEntries)) {
        if (!entry || typeof entry !== 'object' || typeof entry.id !== 'string' || entry.id.length > 128 ||
            typeof entry.timestamp !== 'string' || entry.timestamp.length > 32 || !Number.isFinite(Date.parse(entry.timestamp)) || !actions.has(entry.action)) continue;
        const settings = systemSettings(entry.settings);
        this.value.events.push({ id: entry.id, timestamp: entry.timestamp, action: entry.action,
          ...(typeof entry.notificationId === 'string' && entry.notificationId.length <= 128 ? { notificationId: entry.notificationId } : {}),
          ...(notificationDetail(entry.detail) ? { detail: notificationDetail(entry.detail) } : {}), ...(settings ? { settings } : {}) });
      }
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') this.report('error.notificationLogRead'); }
    this.record('startup');
  }
  private readonly onError: (error: Error) => void;
  snapshot(): NotificationDiagnostics { return structuredClone(this.value); }
  record(action: NotificationDiagnosticAction, input: { notificationId?: string; detail?: unknown; settings?: NotificationSystemSettings } = {}): void {
    const settings = systemSettings(input.settings);
    const detail = notificationDetail(input.detail);
    this.value.events.unshift({ id: randomUUID(), timestamp: new Date().toISOString(), action,
      ...(input.notificationId ? { notificationId: input.notificationId.slice(0, 128) } : {}), ...(detail ? { detail } : {}), ...(settings ? { settings } : {}) });
    this.value.events.length = Math.min(this.value.events.length, maximumEntries);
    this.persist();
  }
  setSettings(input: NotificationSystemSettings): void {
    const settings = systemSettings(input);
    if (!settings) return;
    const changed = JSON.stringify(settings) !== JSON.stringify(this.value.settings);
    this.value.settings = settings;
    this.value.checkedAt = new Date().toISOString();
    if (changed) this.record('settings', { settings });
    else this.persist();
  }
  settingsFailed(error: unknown): void {
    this.value.settings = null;
    this.value.checkedAt = new Date().toISOString();
    this.record('settingsFailed', { detail: error });
  }
  private report(key: string): void {
    try { this.onError(new Error(key)); } catch { console.warn('Tiny Assets: notification log error callback failed.'); }
  }
  private persist(): void {
    const temporary = path.join(path.dirname(this.file), `.notifications-${randomUUID()}.tmp`);
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true, mode: 0o700 });
      const directory = fs.lstatSync(path.dirname(this.file));
      if (!directory.isDirectory() || directory.isSymbolicLink()) throw new Error('error.notificationLogWrite');
      try { const stat = fs.lstatSync(this.file); if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('error.notificationLogWrite'); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
      let contents = JSON.stringify({ schemaVersion: 1, ...this.value }) + '\n';
      while (Buffer.byteLength(contents) > maximumBytes && this.value.events.length > 1) {
        this.value.events.pop();
        contents = JSON.stringify({ schemaVersion: 1, ...this.value }) + '\n';
      }
      if (Buffer.byteLength(contents) > maximumBytes) throw new Error('error.notificationLogWrite');
      fs.writeFileSync(temporary, contents, { flag: 'wx', mode: 0o600 });
      fs.renameSync(temporary, this.file);
    } catch { this.report('error.notificationLogWrite'); }
    finally {
      try { fs.unlinkSync(temporary); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') this.report('error.notificationLogWrite'); }
    }
    try { this.onChange(this.snapshot()); } catch { console.warn('Tiny Assets: notification log change callback failed.'); }
  }
}
