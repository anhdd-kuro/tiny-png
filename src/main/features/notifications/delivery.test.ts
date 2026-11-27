import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { NotificationDelivery, type NotificationDeliveryAction } from './delivery.ts';
import type { CompletionContent } from './completion.ts';
import type { NotificationDiagnosticAction } from '../../../shared/notifications';
import { NotificationCenterInspector } from './center-inspector.ts';

class FakeNotification extends EventEmitter {
  shows = 0;
  closes = 0;
  show(): void { this.shows++; }
  close(): void { this.closes++; this.emit('close'); }
}

function fixture() {
  const handles: FakeNotification[] = [];
  const records: Array<[NotificationDeliveryAction, string | undefined]> = [];
  const errors: Error[] = [];
  let clicks = 0;
  const content: CompletionContent = { title: 'Complete', body: '1 image', onClick: () => { clicks++; } };
  const delivery = new NotificationDelivery({
    create: () => { const handle = new FakeNotification(); handles.push(handle); return handle; },
    record: (action, key) => { records.push([action, key]); },
    onError: error => { errors.push(error); },
  });
  return { delivery, handles, records, errors, content, clicks: () => clicks };
}

test('only a native show event confirms delivery; duplicate events do not duplicate history', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { delivery, handles, records, content, clicks } = fixture();
  t.after(() => delivery.dispose());
  delivery.show(content);
  assert.equal(handles[0]!.shows, 1);
  assert.deepEqual(records, [['notificationRequested', undefined]]);
  handles[0]!.emit('show');
  handles[0]!.emit('show');
  assert.deepEqual(records, [['notificationRequested', undefined], ['notificationSent', undefined]]);
  handles[0]!.emit('click');
  assert.equal(clicks(), 1);
  handles[0]!.emit('close');
  handles[0]!.emit('click');
  assert.equal(clicks(), 1);
  assert.equal(handles[0]!.eventNames().length, 0);
});

test('creation or show throws produce a localized failure without leaking the native error', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  for (const stage of ['create', 'show'] as const) {
    const handle = new FakeNotification();
    const records: Array<[NotificationDeliveryAction, string | undefined]> = [];
    const errors: Error[] = [];
    handle.show = () => { if (stage === 'show') throw new Error('/Users/private/native-error'); };
    const delivery = new NotificationDelivery({
      create: () => { if (stage === 'create') throw new Error('/Users/private/native-error'); return handle; },
      record: (action, key) => { records.push([action, key]); }, onError: error => { errors.push(error); },
    });
    delivery.show({ title: 'Complete', body: '1 image', onClick() {} });
    assert.deepEqual(records, [['notificationRequested', undefined], ['notificationFailed', 'notifications.unavailable']]);
    assert.deepEqual(errors.map(error => error.message), ['notifications.unavailable']);
    assert.equal(handle.eventNames().length, 0);
    t.mock.timers.tick(10_000);
    assert.equal(records.length, 2);
    delivery.dispose();
  }
});

test('a failed event records once and releases callbacks and its pending timer', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { delivery, handles, records, errors, content } = fixture();
  delivery.show(content);
  handles[0]!.emit('failed', {}, 'permission or signing details');
  handles[0]!.emit('failed');
  handles[0]!.emit('show');
  t.mock.timers.tick(10_000);
  assert.deepEqual(records, [['notificationRequested', undefined], ['notificationFailed', 'notifications.unavailable']]);
  assert.deepEqual(errors.map(error => error.message), ['notifications.unavailable']);
  assert.equal(handles[0]!.eventNames().length, 0);
  delivery.dispose();
});

test('no callback after ten seconds is unconfirmed, not failed; a late show can still confirm', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { delivery, handles, records, errors, content } = fixture();
  t.after(() => delivery.dispose());
  delivery.show(content);
  t.mock.timers.tick(9_999);
  assert.equal(records.length, 1);
  t.mock.timers.tick(1);
  assert.deepEqual(records[1], ['notificationUnconfirmed', 'notifications.unconfirmed']);
  assert.deepEqual(errors, []);
  assert.equal(handles[0]!.closes, 0);
  handles[0]!.emit('show');
  assert.deepEqual(records[2], ['notificationSent', undefined]);
  t.mock.timers.tick(20_000);
  assert.equal(records.length, 3);
  assert.equal(handles[0]!.closes, 0);
});

test('a successful show cancels the confirmation timer without closing the delivered notification', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { delivery, handles, records, content } = fixture();
  t.after(() => delivery.dispose());
  delivery.show(content);
  handles[0]!.emit('show');
  t.mock.timers.tick(30_000);
  assert.deepEqual(records.map(record => record[0]), ['notificationRequested', 'notificationSent']);
  assert.equal(handles[0]!.closes, 0);
});

test('retention stays bounded at 32 without closing earlier delivered notifications', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { delivery, handles, records, content } = fixture();
  t.after(() => delivery.dispose());
  for (let index = 0; index < 33; index++) { delivery.show(content); handles[index]!.emit('show'); }
  assert.equal(handles[0]!.eventNames().length, 0);
  assert.equal(handles.filter(handle => handle.listenerCount('click') === 1).length, 32);
  assert.equal(handles.some(handle => handle.closes !== 0), false);
  assert.equal(records.filter(([action]) => action === 'notificationSent').length, 33);
});

test('evicting an unresolved handle records uncertainty and cancels its timer', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { delivery, handles, records, errors, content } = fixture();
  t.after(() => delivery.dispose());
  for (let index = 0; index < 33; index++) delivery.show(content);
  assert.equal(handles[0]!.eventNames().length, 0);
  assert.equal(records.filter(([action]) => action === 'notificationUnconfirmed').length, 1);
  t.mock.timers.tick(10_000);
  assert.equal(records.filter(([action]) => action === 'notificationUnconfirmed').length, 33);
  assert.equal(records.some(([action]) => action === 'notificationFailed'), false);
  assert.deepEqual(errors, []);
  assert.equal(handles.some(handle => handle.closes !== 0), false);
});

test('dispose releases listeners and timers, closes only pending handles, and ignores later requests', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { delivery, handles, records, content, clicks } = fixture();
  delivery.show(content);
  delivery.show(content);
  handles[1]!.emit('show');
  delivery.dispose();
  delivery.dispose();
  delivery.show(content);
  for (const handle of handles) { handle.emit('click'); handle.emit('show'); handle.emit('failed'); }
  t.mock.timers.tick(30_000);
  assert.equal(handles.length, 2);
  assert.equal(handles[0]!.closes, 1);
  assert.equal(handles[1]!.closes, 0);
  assert.equal(handles.every(handle => handle.eventNames().length === 0), true);
  assert.equal(clicks(), 0);
  assert.deepEqual(records.map(([action]) => action), ['notificationRequested', 'notificationRequested', 'notificationSent']);
});


test('closing before any delivery callback records uncertainty and releases the pending timer', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { delivery, handles, records, errors, content } = fixture();
  delivery.show(content);
  handles[0]!.emit('close');
  t.mock.timers.tick(10_000);
  assert.deepEqual(records, [['notificationRequested', undefined], ['notificationUnconfirmed', 'notifications.unconfirmed']]);
  assert.deepEqual(errors, []);
  assert.equal(handles[0]!.eventNames().length, 0);
  delivery.dispose();
});

test('accepted requests are correlated with Notification Center without claiming banner visibility', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const events: Array<[NotificationDiagnosticAction, string, unknown?]> = [];
  const handles: FakeNotification[] = [];
  const ids: string[] = [];
  const delivery = new NotificationDelivery({
    create: (_content, id) => { ids.push(id); const handle = new FakeNotification(); handles.push(handle); return handle; },
    record() {}, onError() {}, diagnose: (action, id, detail) => events.push([action, id, detail]),
    isInNotificationCenter: async id => id === ids[0],
  });
  t.after(() => delivery.dispose());
  const content = { title: 'Complete', body: '1 image', onClick() {} };
  delivery.show(content); handles[0].emit('show');
  delivery.show(content); handles[1].emit('show');
  t.mock.timers.tick(1000);
  await Promise.resolve(); await Promise.resolve();
  assert(events.some(([action, id]) => action === 'inNotificationCenter' && id === ids[0]));
  assert(events.some(([action, id]) => action === 'notInNotificationCenter' && id === ids[1]));
  assert.notEqual(ids[0], ids[1]);
  handles[0].emit('click');
  assert(events.some(([action, id]) => action === 'clicked' && id === ids[0]));
});

test('native delivery details reach diagnostics while public errors stay localized and inspection is cancelled on close', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const handle = new FakeNotification();
  const events: Array<[NotificationDiagnosticAction, unknown]> = [];
  let inspections = 0;
  const errors: string[] = [];
  const delivery = new NotificationDelivery({ create: () => handle, record() {}, onError: error => errors.push(error.message),
    diagnose: (action, _id, detail) => events.push([action, detail]), isInNotificationCenter: async () => { inspections++; return true; } });
  delivery.show({ title: 'Complete', body: '1 image', onClick() {} });
  handle.emit('failed', {}, 'UNErrorDomain Code=1: notifications disabled');
  assert.deepEqual(errors, ['notifications.unavailable']);
  assert(events.some(([action, detail]) => action === 'failed' && detail === 'UNErrorDomain Code=1: notifications disabled'));
  delivery.show({ title: 'Complete', body: '1 image', onClick() {} });
  handle.emit('show'); handle.emit('close');
  t.mock.timers.tick(1000); await Promise.resolve();
  assert.equal(inspections, 0);
  delivery.dispose();
});

test('a stalled Notification Center query times out without allocating more native requests and recovers after a late reply', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let calls = 0;
  let resolve!: (ids: readonly string[]) => void;
  const inspector = new NotificationCenterInspector(() => { calls++; return new Promise<readonly string[]>(yes => { resolve = yes; }); });
  const first = inspector.isPresent('first'); const firstError = assert.rejects(first, /notifications.unconfirmed/);
  await Promise.resolve();
  t.mock.timers.tick(5000); await firstError;
  await assert.rejects(inspector.isPresent('second'), /notifications.unconfirmed/);
  assert.equal(calls, 1);
  resolve(['first']);
  await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
  const recovered = inspector.isPresent('third'); await Promise.resolve(); resolve(['third']);
  assert.equal(await recovered, true); assert.equal(calls, 2);
});
