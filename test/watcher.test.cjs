'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const sharp = require('sharp');
const { createFolderWatcher } = require('../src/core/watcher.cjs');
const { compressFile } = require('../src/core/compressor.cjs');

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(check, timeout = 8000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) { if (check()) return; await delay(100); }
  assert.fail('Watcher did not deliver expected event before timeout');
}
async function setup(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'tiny-watch-test-'));
  const image = await sharp({ create: { width: 200, height: 100, channels: 3, background: 'orange' } })
    .png({ compressionLevel: 0 }).toBuffer();
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  return { directory, image };
}

test('live watcher ignores baseline and partial writes, emits new screenshot after stability', { timeout: 15000 }, async t => {
  const { directory, image } = await setup(t);
  await fs.writeFile(path.join(directory, 'existing.png'), image);
  const files = [], errors = [];
  const watcher = await createFolderWatcher(directory, { onFiles: batch => files.push(...batch), onError: e => errors.push(e) });
  t.after(() => watcher.close());
  const screenshot = path.join(directory, 'Screenshot.png');
  await fs.writeFile(screenshot, image.subarray(0, 100));
  await delay(600);
  assert.deepEqual(files, []);
  await fs.appendFile(screenshot, image.subarray(100));
  await until(() => files.length === 1);
  assert.deepEqual(files, [screenshot]);
  assert.deepEqual(errors, []);
  await fs.writeFile(path.join(directory, 'output-tinified.png'), image);
  await fs.writeFile(path.join(directory, '.hidden.png'), image);
  await fs.symlink(screenshot, path.join(directory, 'link.png'));
  await delay(2100);
  assert.equal(files.length, 1);
});

test('live overwrite processing does not loop, genuine later edits still emit', { timeout: 15000 }, async t => {
  const { directory, image } = await setup(t);
  const emitted = [], errors = [];
  let watcher;
  watcher = await createFolderWatcher(directory, { onError: error => errors.push(error), onFiles: async files => {
    emitted.push(...files);
    const result = await compressFile(files[0], { overwrite: true });
    watcher.markOutput(result.outputPath, result.outputFingerprint);
  } });
  t.after(() => watcher.close());
  const screenshot = path.join(directory, 'Screenshot.png');
  await fs.writeFile(screenshot, image);
  await until(() => emitted.length === 1);
  await delay(2600);
  assert.equal(emitted.length, 1, 'own atomic overwrite must not trigger another compression');
  const changed = await sharp({ create: { width: 220, height: 110, channels: 3, background: 'blue' } })
    .png({ compressionLevel: 0 }).toBuffer();
  await fs.writeFile(screenshot, changed);
  await until(() => emitted.length === 2);
  await delay(2300);
  assert.equal(emitted.length, 2);
  assert.deepEqual(errors, []);
});

test('closing watcher stops future callbacks', { timeout: 10000 }, async t => {
  const { directory, image } = await setup(t);
  const files = [];
  const watcher = await createFolderWatcher(directory, { onFiles: batch => files.push(...batch) });
  await watcher.close();
  await fs.writeFile(path.join(directory, 'after-close.png'), image);
  await delay(1800);
  assert.deepEqual(files, []);
});

test('source edited during processing is deferred then delivered once after busy job ends', { timeout: 10000 }, async t => {
  const { directory, image } = await setup(t);
  const screenshot = path.join(directory, 'busy-screenshot.png');
  await fs.writeFile(screenshot, image);
  let busy = true;
  const files = [];
  const watcher = await createFolderWatcher(directory, { isBusy: file => file === screenshot && busy,
    onFiles: batch => files.push(...batch) });
  t.after(() => watcher.close());
  const changed = await sharp({ create: { width: 230, height: 130, channels: 3, background: 'green' } })
    .png({ compressionLevel: 0 }).toBuffer();
  await fs.writeFile(screenshot, changed);
  await delay(2200);
  assert.deepEqual(files, [], 'an edit must not be swallowed by a queue that is already processing this path');
  busy = false;
  await until(() => files.length === 1);
  assert.deepEqual(files, [screenshot]);
  await delay(1000);
  assert.equal(files.length, 1);
});
