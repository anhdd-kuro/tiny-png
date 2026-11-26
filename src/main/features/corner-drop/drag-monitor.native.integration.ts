import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDragMonitor } from './drag-monitor.ts';

test('native macOS monitor emits boolean state, deduplicates and stops polling', { skip: process.platform !== 'darwin', timeout: 5000 }, async t => {
  const states: boolean[] = [];
  const errors: Error[] = [];
  const monitor = createDragMonitor({ onChange: state => states.push(state), onError: error => errors.push(error) });
  t.after(() => monitor.stop());
  await new Promise(resolve => setTimeout(resolve, 280));
  monitor.stop();
  const countAfterStop = states.length;
  await new Promise(resolve => setTimeout(resolve, 280));
  assert.deepEqual(errors, []);
  assert.equal(states[0], false);
  assert.ok(states.every((state, index) => typeof state === 'boolean' && (index === 0 || state !== states[index - 1])));
  assert.equal(states.length, countAfterStop);
});
