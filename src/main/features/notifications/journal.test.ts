import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { NotificationJournal, notificationDetail } from './journal';
import { NotificationDiagnosticsService } from './diagnostics';
import type { NotificationIdentity, NotificationSystemSettings } from '../../../shared/notifications';

const identity: NotificationIdentity = { appId: 'dev.kuro.tinypng', version: '1', mode: 'adhoc', codeHash: 'first', requirement: 'cdhash first', changedSinceLastRun: null };
const settings: NotificationSystemSettings = { authorization: 'authorized', alert: 'enabled', alertStyle: 'banner', notificationCenter: 'enabled', sound: 'enabled' };
function fixture(t: TestContext) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tiny-notification-journal-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return path.join(directory, 'diagnostics/notifications.json');
}

test('private bounded diagnostics survive restart, compare code identity and exclude arbitrary fields', t => {
  const file = fixture(t);
  const journal = new NotificationJournal(file, identity);
  journal.setSettings(settings);
  journal.record('request', { notificationId: 'own-notification', detail: new Error(`${os.homedir()}/test\0failure`) });
  for (let i = 0; i < 205; i++) journal.record('accepted', { notificationId: String(i) });
  const persisted = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.equal(persisted.events.length, 200);
  assert.equal(fs.statSync(file).mode & 0o777, 0o600);
  assert.equal(fs.statSync(path.dirname(file)).mode & 0o777, 0o700);
  const same = new NotificationJournal(file, { ...identity, version: '2' });
  assert.equal(same.snapshot().identity.changedSinceLastRun, false);
  const changed = new NotificationJournal(file, { ...identity, requirement: 'cdhash second', codeHash: 'second' });
  assert.equal(changed.snapshot().identity.changedSinceLastRun, true);
  assert.equal(changed.snapshot().events[0].action, 'startup');
  assert.equal(changed.snapshot().settings, null, 'old OS settings are not presented as current after restart');
  const snapshot = changed.snapshot();
  snapshot.events.length = 0;
  assert.equal(changed.snapshot().events.length, 200);
  assert.equal(notificationDetail(`${os.homedir()}/test\0failure`), '~/testfailure');
  assert.equal(notificationDetail({ secretAccessKey: 'never-read' }), undefined);
});

test('malformed logs and write failures do not stop diagnostics or invoke unsafe stored fields', t => {
  const file = fixture(t);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, '{broken');
  const errors: string[] = [];
  const journal = new NotificationJournal(file, identity, { onError: error => errors.push(error.message) });
  assert(errors.includes('error.notificationLogRead'));
  fs.unlinkSync(file);
  fs.mkdirSync(file);
  journal.record('failed', { detail: 'Native backend error' });
  assert(errors.includes('error.notificationLogWrite'));
  assert.equal(journal.snapshot().events[0].action, 'failed');
  assert.deepEqual(fs.readdirSync(path.dirname(file)), ['notifications.json']);
});

test('diagnostics refuse file and directory symlinks without replacing the target', t => {
  const file = fixture(t);
  const target = path.join(path.dirname(path.dirname(file)), 'outside.json');
  fs.mkdirSync(path.dirname(file)); fs.writeFileSync(target, 'preserve'); fs.symlinkSync(target, file);
  const journal = new NotificationJournal(file, identity);
  journal.record('request');
  assert.equal(fs.readFileSync(target, 'utf8'), 'preserve');
  assert(fs.lstatSync(file).isSymbolicLink());
  fs.unlinkSync(file); fs.rmdirSync(path.dirname(file));
  const targetDirectory = path.join(path.dirname(path.dirname(file)), 'outside'); fs.mkdirSync(targetDirectory);
  fs.symlinkSync(targetDirectory, path.dirname(file));
  journal.record('request');
  assert.deepEqual(fs.readdirSync(targetDirectory), []);
});

test('concurrent status refreshes coalesce, report native errors and recover on the next attempt', async t => {
  const journal = new NotificationJournal(fixture(t), identity);
  let resolve!: (settings: NotificationSystemSettings) => void;
  let calls = 0;
  let fail = false;
  const service = new NotificationDiagnosticsService(journal, () => {
    calls++;
    if (fail) throw new Error('notifications.unconfirmed');
    return new Promise<NotificationSystemSettings>(yes => { resolve = yes; });
  });
  const first = service.refresh(); const parallel = service.refresh();
  await Promise.resolve();
  assert.equal(calls, 1); assert.equal(first, parallel);
  resolve(settings); await first;
  assert.deepEqual(journal.snapshot().settings, settings);
  fail = true; await service.refresh();
  assert.equal(journal.snapshot().settings, null);
  assert.equal(journal.snapshot().events[0].detail, 'notifications.unconfirmed');
  fail = false; const recovered = service.refresh(); await Promise.resolve(); resolve(settings); await recovered;
  assert.deepEqual(journal.snapshot().settings, settings);
});

test('Unicode diagnostic details stay within the serialized byte budget and remain readable after restart', t => {
  const file = fixture(t);
  const errors: string[] = [];
  const journal = new NotificationJournal(file, identity, { onError: error => errors.push(error.message) });
  for (let i = 0; i < 200; i++) journal.record('failed', { notificationId: String(i), detail: '界😀\n'.repeat(2048) });
  assert(fs.statSync(file).size <= 1024 * 1024);
  assert(!fs.readFileSync(file, 'utf8').includes('\ufffd'));
  const restarted = new NotificationJournal(file, identity, { onError: error => errors.push(error.message) });
  assert.equal(restarted.snapshot().events.length, 200);
  assert(restarted.snapshot().events.some(event => event.notificationId === '199'));
  assert.deepEqual(errors, []);
});
