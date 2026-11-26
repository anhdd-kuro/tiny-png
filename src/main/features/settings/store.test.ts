import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { SettingsStore, validatePatch } from './store';

test('corrupt stored settings cannot enable overwrite or crash corner positioning', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tiny-settings-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const file = path.join(root, 'settings.json');
  await fs.writeFile(file, JSON.stringify({ overwrite: 'true', dropCorner: 42, quality: -1, language: 'ja', watchEnabled: true, watchPath: null, unexpected: 'ignored' }));
  const store = new SettingsStore(file);
  assert.equal(store.value.overwrite, false);
  assert.equal(store.value.dropCorner, 'topRight');
  assert.equal(store.value.language, 'ja');
  assert.equal(store.value.watchEnabled, false);
  assert.equal('unexpected' in store.value, false);
});

test('language and corner reveal preferences persist while output selection disables overwrite', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tiny-settings-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const file = path.join(root, 'settings.json');
  const store = new SettingsStore(file);
  store.update({ language: 'en', cornerMode: 'nearby', dropCorner: 'bottomLeft', overwrite: true });
  store.setOutput(root);
  const reopened = new SettingsStore(file);
  assert.equal(reopened.value.language, 'en');
  assert.equal(reopened.value.cornerMode, 'nearby');
  assert.equal(reopened.value.dropCorner, 'bottomLeft');
  assert.equal(reopened.value.overwrite, false);
  assert.equal(reopened.value.outputDirectory, root);
});

test('invalid renderer settings fail without changing persisted preferences', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tiny-settings-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const store = new SettingsStore(path.join(root, 'settings.json'));
  store.update({ language: 'vi' });
  const before = await fs.readFile(store.file, 'utf8');
  assert.throws(() => store.update({ overwrite: true, language: 'xx' }));
  assert.throws(() => validatePatch({ outputDirectory: '/unapproved/path' }));
  assert.equal(store.value.overwrite, false);
  assert.equal(await fs.readFile(store.file, 'utf8'), before);
});
