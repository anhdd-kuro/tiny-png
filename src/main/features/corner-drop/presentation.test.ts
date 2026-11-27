import test from 'node:test';
import assert from 'node:assert/strict';
import { CornerPresentation } from './presentation';

function target() {
  const state = { shown: false, ignoreMouse: true, hides: 0, shows: 0, messages: [] as boolean[], animations: [] as boolean[] };
  const presentation = new CornerPresentation({
    isVisible: () => state.shown,
    showInactive: () => { state.shown = true; state.shows++; },
    hide: () => { state.shown = false; state.hides++; },
    setIgnoreMouseEvents: ignore => { state.ignoreMouse = ignore; },
    send: value => { state.messages.push(value.visible); state.animations.push(value.animated); },
  });
  return { state, presentation };
}

test('Exit becomes click-through immediately and hides after the renderer transition', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { state, presentation } = target();
  presentation.setVisible(true, true);
  assert.equal(state.shown, true);
  assert.equal(state.ignoreMouse, false);
  presentation.setVisible(false, true);
  assert.equal(state.shown, true);
  assert.equal(state.ignoreMouse, true);
  assert.deepEqual(state.messages, [true, false]);
  t.mock.timers.tick(179);
  assert.equal(state.shown, true);
  t.mock.timers.tick(1);
  assert.equal(state.shown, false);
});

test('Ready sync and each reveal carry the native animation decision', () => {
  const { state, presentation } = target();
  presentation.sync();
  presentation.setVisible(true, false);
  presentation.setVisible(false, false);
  presentation.setVisible(true, true);
  assert.deepEqual(state.messages, [false, true, false, true]);
  assert.deepEqual(state.animations, [false, false, false, true]);
  presentation.dispose();
});

test('Rapid re-entry cancels the old hide without re-showing or hiding the active target', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { state, presentation } = target();
  presentation.setVisible(true, true);
  presentation.setVisible(false, true);
  t.mock.timers.tick(90);
  presentation.setVisible(true, true);
  t.mock.timers.tick(500);
  assert.equal(state.shown, true);
  assert.equal(state.ignoreMouse, false);
  assert.equal(state.shows, 1);
  assert.equal(state.hides, 0);
  assert.deepEqual(state.messages, [true, false, true]);
});

test('Repeated proximity polling does not restart the exit timer', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { state, presentation } = target();
  presentation.setVisible(true, true);
  presentation.setVisible(false, true);
  t.mock.timers.tick(120);
  presentation.setVisible(false, true);
  t.mock.timers.tick(60);
  assert.equal(state.shown, false);
  assert.equal(state.hides, 1);
});

test('Disable and reduced motion hide immediately, including an exit already pending', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { state, presentation } = target();
  presentation.setVisible(true, true);
  presentation.setVisible(false, true);
  presentation.setVisible(false, false);
  assert.equal(state.shown, false);
  presentation.setVisible(true, false);
  t.mock.timers.tick(500);
  assert.equal(state.shown, true);
  presentation.setVisible(false, false);
  assert.equal(state.shown, false);
  assert.equal(state.ignoreMouse, true);
});

test('Dispose cancels pending work and prevents later calls into a destroyed window', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { state, presentation } = target();
  presentation.setVisible(true, true);
  presentation.setVisible(false, true);
  presentation.dispose();
  const before = structuredClone(state);
  t.mock.timers.tick(500);
  presentation.setVisible(true, true);
  presentation.sync();
  assert.deepEqual(state, before);
});
