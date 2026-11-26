import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { HistoryStore, type HistoryEvent } from './store';
import type { HistoryEntry } from '../../../shared/contracts';

function fixture(t: TestContext) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tiny-history-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const file = path.join(directory, 'private/history.json');
  const errors: string[] = [];
  const store = new HistoryStore(file, { onError: error => { errors.push(error.message); } });
  return { directory, file, store, errors };
}
function persisted(file: string, rows: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(rows));
}
function row(index: number): HistoryEntry {
  return { id: `event-${index}`, timestamp: new Date(Date.UTC(2000, 0, 1, 0, 0, index)).toISOString(), action: 'compressed', file: `/tmp/source-${index}.png`, outputPath: `/tmp/source-${index}-tinified.png`, originalBytes: 100, outputBytes: 60 };
}

test('history survives restart privately, preserves latest-first events and returns defensive snapshots', t => {
  const { directory, file, store, errors } = fixture(t);
  const compressed = store.add({ file: '/tmp/source.png', action: 'compressed', outputPath: '/tmp/output.png', originalBytes: 100, outputBytes: 60 });
  assert.ok(compressed);
  const requested = store.add({ file: null, action: 'notificationRequested' });
  assert.ok(requested);
  assert.notEqual(compressed.id, requested.id);
  assert.equal(new Date(requested.timestamp).toISOString(), requested.timestamp);
  assert.equal(fs.statSync(file).mode & 0o777, 0o600);
  assert.equal(fs.statSync(path.dirname(file)).mode & 0o777, 0o700);
  const snapshot = store.entries;
  snapshot[0]!.action = 'failed';
  snapshot.pop();
  requested.action = 'failed';
  assert.equal(store.entries.length, 2);
  assert.equal(store.entries[0]!.action, 'notificationRequested');
  assert.deepEqual(new HistoryStore(file).entries, store.entries);
  assert.deepEqual(fs.readdirSync(path.join(directory, 'private')), ['history.json']);
  assert.deepEqual(errors, []);
});

test('loaded and newly added history keeps the newest 500 entries across restart', t => {
  const { file } = fixture(t);
  persisted(file, Array.from({ length: 505 }, (_, index) => row(index)));
  const store = new HistoryStore(file);
  assert.equal(store.entries.length, 500);
  assert.equal(store.entries[0]!.id, 'event-504');
  assert.equal(store.entries.at(-1)!.id, 'event-5');
  const newest = store.add({ action: 'detected', file: '/tmp/new.png' });
  assert.ok(newest);
  const reopened = new HistoryStore(file);
  assert.equal(reopened.entries.length, 500);
  assert.equal(reopened.entries[0]!.id, newest.id);
  assert.equal(reopened.entries.at(-1)!.id, 'event-6');
});

test('malformed add events do not change memory or persisted history and unknown fields cannot leak', t => {
  const { file, store, errors } = fixture(t);
  store.add({ action: 'watchStarted', file: '/tmp/screenshots' });
  const before = fs.readFileSync(file, 'utf8');
  const invalid = [null, {}, { action: 'unknown', file: null }, { action: 'detected', file: 'relative.png' },
    { action: 'compressed', file: '/tmp/a.png', originalBytes: -1 }, { action: 'compressed', file: '/tmp/a.png', outputBytes: Infinity },
    { action: 'failed', file: null, error: { message: 'secret' } }, { action: 'failed', file: null, error: 'x'.repeat(2049) }];
  for (const input of invalid) assert.equal(store.add(input as HistoryEvent), null);
  assert.equal(store.entries.length, 1);
  assert.equal(fs.readFileSync(file, 'utf8'), before);
  assert.equal(errors.length, invalid.length);
  assert.ok(errors.every(error => error === 'error.historyInvalid'));
  const safe = store.add({ action: 'uploadFailed', file: '/tmp/a.png', error: 'error.s3Upload', accessKey: 'not-history-data', id: 'override', timestamp: 'invalid' } as HistoryEvent);
  assert.ok(safe);
  assert.notEqual(safe.id, 'override');
  assert.equal(fs.readFileSync(file, 'utf8').includes('not-history-data'), false);
});

test('corrupt JSON is reported without startup failure or destructive rewriting', t => {
  const { file, errors } = fixture(t);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, '{broken');
  const store = new HistoryStore(file, { onError: error => { errors.push(error.message); } });
  assert.deepEqual(store.entries, []);
  assert.deepEqual(errors, ['error.historyInvalid']);
  assert.equal(fs.readFileSync(file, 'utf8'), '{broken');
  assert.ok(store.add({ action: 'notificationUnconfirmed', file: null }));
  assert.equal(new HistoryStore(file).entries[0]!.action, 'notificationUnconfirmed');
});

test('mixed malformed stored rows are discarded while valid rows survive and duplicate IDs are bounded', t => {
  const { file, errors } = fixture(t);
  persisted(file, [row(1), { ...row(2), timestamp: '2026-02-30T00:00:00.000Z' }, { ...row(3), action: 'not-an-action' }, row(4), { ...row(4), timestamp: row(5).timestamp }, { ...row(6), file: 'relative.png' }]);
  const before = fs.readFileSync(file, 'utf8');
  const store = new HistoryStore(file, { onError: error => { errors.push(error.message); } });
  assert.deepEqual(store.entries.map(entry => entry.id), ['event-4', 'event-1']);
  assert.equal(store.entries[0]!.timestamp, row(5).timestamp);
  assert.deepEqual(errors, ['error.historyInvalid']);
  assert.equal(fs.readFileSync(file, 'utf8'), before);
});

test('failed atomic replacement preserves prior memory and disk for add and clear and removes temporary files', t => {
  const { file, directory, store, errors } = fixture(t);
  store.add({ action: 'detected', file: '/tmp/source.png' });
  const before = fs.readFileSync(file, 'utf8');
  const snapshot = store.entries;
  const replacement = t.mock.method(fs, 'renameSync', () => { throw Object.assign(new Error('simulated write denial'), { code: 'EACCES' }); });
  assert.equal(store.add({ action: 'failed', file: '/tmp/source.png', error: 'error.inputFormat' }), null);
  assert.equal(store.clear(), false);
  replacement.mock.restore();
  assert.deepEqual(store.entries, snapshot);
  assert.equal(fs.readFileSync(file, 'utf8'), before);
  assert.deepEqual(fs.readdirSync(path.join(directory, 'private')), ['history.json']);
  assert.deepEqual(errors, ['error.historyWrite', 'error.historyWrite']);
  assert.equal(store.clear(), true);
  assert.deepEqual(new HistoryStore(file).entries, []);
  assert.equal(fs.statSync(file).mode & 0o777, 0o600);
});

test('history refuses symlink storage and oversized files without following or changing outside data', t => {
  const { directory, file, errors } = fixture(t);
  const outside = path.join(directory, 'outside.json');
  persisted(outside, [row(1)]);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.symlinkSync(outside, file);
  const store = new HistoryStore(file, { onError: error => { errors.push(error.message); } });
  assert.deepEqual(store.entries, []);
  assert.equal(store.add({ action: 'notificationSuppressed', file: null }), null);
  assert.equal(store.clear(), false);
  assert.deepEqual(JSON.parse(fs.readFileSync(outside, 'utf8')), [row(1)]);
  assert.equal(fs.lstatSync(file).isSymbolicLink(), true);
  assert.deepEqual(errors, ['error.historyRead', 'error.historyWrite', 'error.historyWrite']);
  fs.unlinkSync(file);
  fs.writeFileSync(file, '');
  fs.truncateSync(file, 8 * 1024 * 1024 + 1);
  const oversized = new HistoryStore(file, { onError: error => { errors.push(error.message); } });
  assert.deepEqual(oversized.entries, []);
  assert.equal(errors.at(-1), 'error.historyRead');
  assert.equal(fs.statSync(file).size, 8 * 1024 * 1024 + 1);
});

test('a throwing history error callback cannot crash startup or later recording', t => {
  const { file } = fixture(t);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, 'not-json');
  let store: HistoryStore | undefined;
  assert.doesNotThrow(() => { store = new HistoryStore(file, { onError: () => { throw new Error('consumer callback failed'); } }); });
  assert.ok(store!.add({ action: 'watchFailed', file: null, error: 'error.watchDirectory' }));
  assert.equal(new HistoryStore(file).entries.length, 1);
});
