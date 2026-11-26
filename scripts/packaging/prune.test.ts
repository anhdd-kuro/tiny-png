import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pruneDevelopmentFiles } from './prune';

async function fixture(t: TestContext) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'tiny-package-prune-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const nodeModules = path.join(directory, 'node_modules');
  await fs.mkdir(nodeModules);
  async function write(relative: string, contents = relative) {
    const file = path.join(nodeModules, relative);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, contents);
    return file;
  }
  return { directory, nodeModules, write };
}

test('packaged pruning preserves Koffi src loaders, native engines, metadata and legal notices', async t => {
  const { nodeModules, write } = await fixture(t);
  const keep = [
    'koffi/src/koffi/index.cjs', 'koffi/src/koffi/index.js', 'koffi/src/koffi/src/static.cjs',
    'koffi/src/koffi/src/trampolines.cjs', 'koffi/package.json',
    '@koromix/koffi-darwin-arm64/darwin_arm64/koffi.node', '@img/sharp-libvips-darwin-arm64/lib/libvips-cpp.dylib',
    'sharp/dist/index.cjs', 'sharp/dist/index.mjs', 'sharp/versions.json',
    'chokidar/index.js', 'chokidar/runtime.js', 'example/LICENSE', 'example/LICENSE-MIT.h', 'example/NOTICE.h',
    'example/.runtime-config.json', 'example/.package-lock.json',
  ];
  const remove = ['koffi/src/native.cc', 'koffi/vendor/include/header.hpp', 'sharp/src/native.c', 'sharp/src/native.h', 'sharp/src/binding.gyp', 'example/options.gypi', 'example/index.d.ts', 'example/index.d.cts', 'example/index.d.mts', 'example/index.js.map', '.modules.yaml', '.pnpm/lock.yaml', '.pnpm-workspace-state-v1.json', '.package-lock.json'];
  for (const file of [...keep, ...remove]) await write(file);
  const result = await pruneDevelopmentFiles(nodeModules);
  assert.deepEqual(result, { removedFiles: remove.length, removedBytes: remove.reduce((bytes, file) => bytes + Buffer.byteLength(file), 0) });
  for (const file of keep) assert.equal(await fs.readFile(path.join(nodeModules, file), 'utf8'), file);
  for (const file of remove) await assert.rejects(fs.access(path.join(nodeModules, file)), { code: 'ENOENT' });
  assert.deepEqual(await pruneDevelopmentFiles(nodeModules), { removedFiles: 0, removedBytes: 0 });
});

test('pruning does not follow or remove dependency symlinks, including files matching source patterns', async t => {
  const { directory, nodeModules, write } = await fixture(t);
  const outside = path.join(directory, 'outside');
  await fs.mkdir(outside);
  await fs.writeFile(path.join(outside, 'index.d.ts'), 'preserve outside');
  await fs.symlink(outside, path.join(nodeModules, 'linked-package'), 'dir');
  await fs.symlink(path.join(outside, 'index.d.ts'), path.join(nodeModules, 'linked.d.ts'));
  await write('real-package/index.d.ts', 'remove this');
  assert.equal((await pruneDevelopmentFiles(nodeModules)).removedFiles, 1);
  assert.equal(await fs.readFile(path.join(outside, 'index.d.ts'), 'utf8'), 'preserve outside');
  assert.equal((await fs.lstat(path.join(nodeModules, 'linked-package'))).isSymbolicLink(), true);
  assert.equal((await fs.lstat(path.join(nodeModules, 'linked.d.ts'))).isSymbolicLink(), true);
});

test('pruning rejects a non-package root or a symlink root without deleting source files', async t => {
  const { directory, nodeModules, write } = await fixture(t);
  const source = await write('keep.h', 'untouched');
  await assert.rejects(pruneDevelopmentFiles(directory));
  const nested = path.join(directory, 'alias');
  await fs.mkdir(nested);
  const link = path.join(nested, 'node_modules');
  await fs.symlink(nodeModules, link, 'dir');
  await assert.rejects(pruneDevelopmentFiles(link));
  assert.equal(await fs.readFile(source, 'utf8'), 'untouched');
});
