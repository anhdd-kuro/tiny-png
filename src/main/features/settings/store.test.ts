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
  await fs.writeFile(file, JSON.stringify({ overwrite: 'true', dropCorner: 42, quality: -1, language: 'ja', watchEnabled: true, watchPath: null, backgroundStyle: 'image', glassOpacity: 101, unexpected: 'ignored' }));
  const store = new SettingsStore(file);
  assert.equal(store.value.overwrite, false);
  assert.equal(store.value.dropCorner, 'topRight');
  assert.equal(store.value.language, 'ja');
  assert.equal(store.value.watchEnabled, false);
  assert.equal(store.value.backgroundStyle, 'gradient');
  assert.equal(store.value.glassOpacity, 70);
  assert.equal('unexpected' in store.value, false);
});

test('older partial settings keep their preferences and receive compatible appearance defaults', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tiny-settings-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const file = path.join(root, 'settings.json');
  const previous = JSON.stringify({ quality: 65, language: 'ja', glassEnabled: true, cornerMode: 'nearby' });
  await fs.writeFile(file, previous);
  const store = new SettingsStore(file);
  assert.equal(store.value.backgroundStyle, 'gradient');
  assert.equal(store.value.glassOpacity, 70);
  assert.equal(store.value.glassEnabled, true);
  assert.equal(store.value.quality, 65);
  assert.equal(store.value.language, 'ja');
  assert.equal(store.value.cornerMode, 'nearby');
  assert.equal(await fs.readFile(file, 'utf8'), previous);
  store.update({ backgroundStyle: 'solid', glassOpacity: 20 });
  const reopened = new SettingsStore(file);
  assert.equal(reopened.value.backgroundStyle, 'solid');
  assert.equal(reopened.value.glassOpacity, 20);
  assert.equal(reopened.value.language, 'ja');
  assert.equal(reopened.value.glassEnabled, true);
  reopened.update({ glassOpacity: 100, backgroundStyle: 'gradient' });
  assert.equal(new SettingsStore(file).value.glassOpacity, 100);
  assert.equal(new SettingsStore(file).value.backgroundStyle, 'gradient');
});

test('invalid appearance patches cannot partially change or persist another preference', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tiny-settings-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const store = new SettingsStore(path.join(root, 'settings.json'));
  store.update({ backgroundStyle: 'solid', glassOpacity: 70, quality: 65 });
  const before = await fs.readFile(store.file, 'utf8');
  for (const glassOpacity of [19, 101, 70.5, '70', null, NaN, Infinity]) {
    assert.throws(() => store.update({ glassOpacity, quality: 5 }), { message: 'error.invalidSettings' });
  }
  for (const backgroundStyle of ['image', 'Solid', '', null, 1]) {
    assert.throws(() => store.update({ backgroundStyle, glassOpacity: 20 }), { message: 'error.invalidSettings' });
  }
  assert.equal(store.value.backgroundStyle, 'solid');
  assert.equal(store.value.glassOpacity, 70);
  assert.equal(store.value.quality, 65);
  assert.equal(await fs.readFile(store.file, 'utf8'), before);
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
