import test from 'node:test';
import assert from 'node:assert/strict';
import { CompletionNotifier, type CompletionContent } from './completion.ts';

test('completion notices coalesce a quiet batch and click opens results', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const notices: CompletionContent[] = [];
  let opened = 0;
  const notifier = new CompletionNotifier({ isEnabled: () => true,
    translate: (key, params) => `${key}:${JSON.stringify(params ?? {})}`,
    show: content => { notices.push(content); }, openResults: () => { opened++; } });
  notifier.complete({ completed: 1, failed: 0, savedBytes: 1000 });
  t.mock.timers.tick(200);
  notifier.complete({ completed: 2, failed: 1, savedBytes: 2048 });
  t.mock.timers.tick(399);
  assert.equal(notices.length, 0);
  t.mock.timers.tick(1);
  assert.equal(notices.length, 1);
  assert.equal(notices[0].title, 'notifications.title:{}');
  assert.equal(notices[0].body, 'notifications.body:{"completed":3,"failed":1,"saved":"3 KB"}');
  notices[0].onClick();
  assert.equal(opened, 1);
  t.mock.timers.tick(1000);
  assert.equal(notices.length, 1);
});

test('disabled completion clears pending counts before notifications are enabled again', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const notices: CompletionContent[] = [];
  let enabled = true;
  const notifier = new CompletionNotifier({ isEnabled: () => enabled,
    translate: (_key, params) => JSON.stringify(params), show: content => { notices.push(content); }, openResults() {} });
  notifier.complete({ completed: 4, failed: 0, savedBytes: 100 });
  enabled = false;
  notifier.complete({ completed: 2, failed: 0, savedBytes: 200 });
  enabled = true;
  t.mock.timers.tick(1000);
  assert.equal(notices.length, 0);
  notifier.complete({ completed: 1, failed: 0, savedBytes: 10 });
  t.mock.timers.tick(400);
  assert.equal(notices.length, 1);
  assert.equal(notices[0].body, '{"completed":1,"failed":0,"saved":"10 B"}');
});

test('turning notifications off before delivery drops the old notice permanently', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const notices: CompletionContent[] = [];
  let enabled = true;
  const notifier = new CompletionNotifier({ isEnabled: () => enabled,
    translate: key => key, show: content => { notices.push(content); }, openResults() {} });
  notifier.complete({ completed: 1, failed: 0, savedBytes: 10 });
  enabled = false;
  t.mock.timers.tick(400);
  enabled = true;
  t.mock.timers.tick(400);
  assert.equal(notices.length, 0);
});

test('dispose and settings cancellation prevent stale notices', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const notices: CompletionContent[] = [];
  const notifier = new CompletionNotifier({ isEnabled: () => true,
    translate: key => key, show: content => { notices.push(content); }, openResults() {} });
  notifier.complete({ completed: 1, failed: 0, savedBytes: 10 });
  assert.equal(notifier.cancelPending(), true);
  assert.equal(notifier.cancelPending(), false);
  t.mock.timers.tick(400);
  notifier.complete({ completed: 2, failed: 0, savedBytes: 20 });
  notifier.dispose();
  notifier.complete({ completed: 3, failed: 0, savedBytes: 30 });
  t.mock.timers.tick(1000);
  assert.equal(notices.length, 0);
});

test('empty batches stay silent and notice content excludes source paths', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const notices: CompletionContent[] = [];
  const notifier = new CompletionNotifier({ isEnabled: () => true,
    translate: (key, params) => `${key}:${JSON.stringify(params ?? {})}`,
    show: content => { notices.push(content); }, openResults() {} });
  notifier.complete({ completed: 0, failed: 0, savedBytes: 0 });
  t.mock.timers.tick(400);
  assert.equal(notices.length, 0);
  const batch = { completed: 1, failed: 0, savedBytes: 1.5 * 1024 * 1024, privatePath: '/Users/private/Screenshot.png' };
  notifier.complete(batch);
  t.mock.timers.tick(400);
  assert.match(notices[0].body, /1\.5 MB/);
  assert.doesNotMatch(notices[0].body, /private|Screenshot|Users/);
});
