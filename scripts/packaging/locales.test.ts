import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pruneMacLocales } from './locales.ts';

async function fixture(t: TestContext) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'tiny-locale-prune-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const app = path.join(directory, 'Tiny Assets.app');
  const outer = path.join(app, 'Contents', 'Resources');
  const framework = path.join(app, 'Contents', 'Frameworks', 'Electron Framework.framework', 'Versions', 'A', 'Resources');
  await fs.mkdir(outer, { recursive: true });
  await fs.mkdir(framework, { recursive: true });
  for (const language of ['en', 'ja', 'vi']) await locale(framework, language, `${language}-pack`);
  return { directory, app, outer, framework };
}

async function locale(root: string, language: string, body = '') {
  const directory = path.join(root, `${language}.lproj`);
  await fs.mkdir(directory, { recursive: true });
  if (body) await fs.writeFile(path.join(directory, 'locale.pak'), body);
  return directory;
}

test('removes unsupported OS locales from both roots and reports regular file bytes', async t => {
  const { app, outer, framework } = await fixture(t);
  await locale(outer, 'de');
  await locale(outer, 'zz_ZZ', 'outer');
  await locale(framework, 'fr', 'french!');
  assert.deepEqual(await pruneMacLocales(app), { removedBytes: 12, removedLocales: 3 });
  for (const file of [path.join(outer, 'de.lproj'), path.join(outer, 'zz_ZZ.lproj'), path.join(framework, 'fr.lproj')]) {
    await assert.rejects(fs.lstat(file), { code: 'ENOENT' });
  }
  assert.deepEqual(await pruneMacLocales(app), { removedBytes: 0, removedLocales: 0 });
});

test('keeps English fallback, all supported dialect and gender variants, and Base resources', async t => {
  const { app, outer, framework } = await fixture(t);
  const languages = ['en', 'en_GB', 'en-US', 'en_GB_FEMININE', 'en_NEUTER', 'vi_VN', 'vi_MASCULINE', 'ja_JP_NEUTER', 'Base'];
  for (const root of [outer, framework]) for (const language of languages) await locale(root, language);
  assert.deepEqual(await pruneMacLocales(app), { removedBytes: 0, removedLocales: 0 });
  for (const root of [outer, framework]) for (const language of languages) {
    assert.equal((await fs.lstat(path.join(root, `${language}.lproj`))).isDirectory(), true);
  }
  assert.equal(await fs.readFile(path.join(framework, 'en.lproj', 'locale.pak'), 'utf8'), 'en-pack');
});

test('preserves binaries, ICU, nested resources and locale folders outside the two roots', async t => {
  const { app, outer, framework } = await fixture(t);
  const untouched = [
    path.join(framework, 'icudtl.dat'),
    path.join(framework, 'chrome_200_percent.pak'),
    path.join(outer, 'app', 'build', 'main', 'index.cjs'),
    path.join(outer, 'app', 'node_modules', 'native.node'),
    path.join(outer, 'assets', 'fr.lproj', 'asset.bin'),
    path.join(app, 'Contents', 'Frameworks', 'Other.framework', 'Resources', 'de.lproj', 'resource.bin'),
    path.join(outer, 'not-a-directory.lproj'),
  ];
  const bytes = Buffer.from([0, 1, 7, 128, 255]);
  for (const file of untouched) { await fs.mkdir(path.dirname(file), { recursive: true }); await fs.writeFile(file, bytes); }
  await locale(framework, 'de', 'remove');
  await pruneMacLocales(app);
  for (const file of untouched) assert.deepEqual(await fs.readFile(file), bytes);
});

test('missing required packs aborts before pruning either root', async t => {
  const { app, outer, framework } = await fixture(t);
  await locale(outer, 'de', 'outer');
  await locale(framework, 'fr', 'framework');
  await fs.rm(path.join(framework, 'vi.lproj', 'locale.pak'));
  await assert.rejects(pruneMacLocales(app), { code: 'ENOENT' });
  assert.equal(await fs.readFile(path.join(outer, 'de.lproj', 'locale.pak'), 'utf8'), 'outer');
  assert.equal(await fs.readFile(path.join(framework, 'fr.lproj', 'locale.pak'), 'utf8'), 'framework');
});

test('empty or symlinked required packs are rejected before pruning', async t => {
  const { app, outer, framework, directory } = await fixture(t);
  await locale(outer, 'de', 'keep-until-valid');
  const pak = path.join(framework, 'en.lproj', 'locale.pak');
  await fs.writeFile(pak, '');
  await assert.rejects(pruneMacLocales(app), /Missing real Electron locale pack/);
  const outside = path.join(directory, 'outside.pak');
  await fs.writeFile(outside, 'external');
  await fs.rm(pak);
  await fs.symlink(outside, pak);
  await assert.rejects(pruneMacLocales(app), /Missing real Electron locale pack/);
  assert.equal(await fs.readFile(path.join(outer, 'de.lproj', 'locale.pak'), 'utf8'), 'keep-until-valid');
  assert.equal(await fs.readFile(outside, 'utf8'), 'external');
});

test('unlinks unsupported locale symlinks without following live or dangling targets', async t => {
  const { app, outer, framework, directory } = await fixture(t);
  const outside = path.join(directory, 'outside');
  await fs.mkdir(outside);
  await fs.writeFile(path.join(outside, 'keep.bin'), 'external-data');
  await fs.symlink(outside, path.join(outer, 'de.lproj'));
  await fs.symlink(path.join(directory, 'missing'), path.join(framework, 'fr.lproj'));
  const removable = await locale(framework, 'zz', 'abc');
  await fs.symlink(outside, path.join(removable, 'external'));
  await fs.symlink(path.join(directory, 'missing'), path.join(removable, 'dangling'));
  assert.deepEqual(await pruneMacLocales(app), { removedBytes: 3, removedLocales: 3 });
  assert.equal(await fs.readFile(path.join(outside, 'keep.bin'), 'utf8'), 'external-data');
  for (const root of [path.join(outer, 'de.lproj'), path.join(framework, 'fr.lproj'), removable]) {
    await assert.rejects(fs.lstat(root), { code: 'ENOENT' });
  }
});

test('refuses symlinked resource roots instead of pruning outside the app', async t => {
  const { app, outer, framework, directory } = await fixture(t);
  await locale(outer, 'de', 'stay');
  const external = path.join(directory, 'framework-resources');
  await fs.rename(framework, external);
  await locale(external, 'fr', 'outside');
  await fs.symlink(external, framework);
  await assert.rejects(pruneMacLocales(app), /requires a real directory/);
  assert.equal(await fs.readFile(path.join(external, 'fr.lproj', 'locale.pak'), 'utf8'), 'outside');
  assert.equal(await fs.readFile(path.join(outer, 'de.lproj', 'locale.pak'), 'utf8'), 'stay');
});
