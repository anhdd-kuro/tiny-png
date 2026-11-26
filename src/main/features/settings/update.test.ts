import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { SettingsStore } from './store.ts';
import { SettingsUpdater } from './update.ts';

function fixture(t: { after(fn: () => void): void }): SettingsStore {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tiny-settings-confirm-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return new SettingsStore(path.join(directory, 'settings.json'));
}

test('overwrite cancellation leaves settings and saved output directory unchanged', async t => {
  const store = fixture(t);
  store.setOutput('/tmp/image-copies');
  const before = fs.readFileSync(store.file, 'utf8');
  const updater = new SettingsUpdater(store, async () => false);
  assert.equal(await updater.update({ overwrite: true, quality: 20 }), false);
  assert.equal(store.value.overwrite, false);
  assert.equal(store.value.outputDirectory, '/tmp/image-copies');
  assert.equal(fs.readFileSync(store.file, 'utf8'), before);
});

test('only enabling overwrite asks for confirmation; approved preference persists', async t => {
  const store = fixture(t);
  let prompts = 0;
  const updater = new SettingsUpdater(store, async () => { prompts++; return true; });
  await updater.update({ quality: 60 });
  await updater.update({ overwrite: true });
  await updater.update({ overwrite: true, quality: 70 });
  assert.equal(prompts, 1);
  assert.equal(new SettingsStore(store.file).value.overwrite, true);
  await updater.update({ overwrite: false });
  assert.equal(prompts, 1);
  assert.equal(store.value.overwrite, false);
});

test('invalid mixed patches are rejected before any overwrite prompt or persistence', async t => {
  const store = fixture(t);
  let prompts = 0;
  const updater = new SettingsUpdater(store, async () => { prompts++; return true; });
  await assert.rejects(updater.update({ overwrite: true, quality: 101 }), { message: 'error.invalidSettings' });
  assert.equal(prompts, 0);
  assert.equal(fs.existsSync(store.file), false);
});

test('concurrent enabling requests share one native confirmation', async t => {
  const store = fixture(t);
  let approve: (value: boolean) => void = () => {};
  let prompts = 0;
  const updater = new SettingsUpdater(store, () => { prompts++; return new Promise(resolve => { approve = resolve; }); });
  const first = updater.update({ overwrite: true });
  const second = updater.update({ overwrite: true });
  approve(true);
  assert.deepEqual(await Promise.all([first, second]), [false, true]);
  assert.equal(prompts, 1);
  assert.equal(store.value.overwrite, true);
});

test('a later disable invalidates approval while unrelated edits survive an open sheet', async t => {
  const store = fixture(t);
  let approve: (value: boolean) => void = () => {};
  const updater = new SettingsUpdater(store, () => new Promise(resolve => { approve = resolve; }));
  const enabling = updater.update({ overwrite: true });
  await updater.update({ quality: 55 });
  await updater.update({ overwrite: false });
  approve(true);
  assert.equal(await enabling, false);
  assert.equal(store.value.overwrite, false);
  assert.equal(store.value.quality, 55);
});
