import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import sharp from 'sharp';
import { createFolderWatcher, type FolderWatcher } from './watcher.ts';
import { compressFile } from '../compression/compressor.ts';
import { MAX_INPUT_BYTES } from '../compression/files.ts';

const delay = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));
async function until(check: () => boolean, timeout = 8000): Promise<void> {
  const end = Date.now() + timeout;
  while (Date.now() < end) { if (check()) return; await delay(100); }
  assert.fail('Watcher did not deliver expected event before timeout');
}
async function setup(t: TestContext) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'tiny-watch-test-'));
  const image = await sharp({ create: { width: 200, height: 100, channels: 3, background: 'orange' } })
    .png({ compressionLevel: 0 }).toBuffer();
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  return { directory, image };
}

test('live watcher ignores baseline and partial writes, emits new screenshot after stability', { timeout: 15000 }, async t => {
  const { directory, image } = await setup(t);
  await fs.writeFile(path.join(directory, 'existing.png'), image);
  const files: string[] = [], errors: Error[] = [];
  const watcher = await createFolderWatcher(directory, { onFiles: batch => { files.push(...batch); }, onError: e => errors.push(e) });
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
  const emitted: string[] = [], errors: Error[] = [];
  let watcher: FolderWatcher;
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
  const files: string[] = [];
  const watcher = await createFolderWatcher(directory, { onFiles: batch => { files.push(...batch); } });
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
  const files: string[] = [];
  const watcher = await createFolderWatcher(directory, { isBusy: file => file === screenshot && busy,
    onFiles: batch => { files.push(...batch); } });
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

test('a job starting during a watched file read does not consume the changed version', { timeout: 10000 }, async t => {
  const { directory, image } = await setup(t);
  const screenshot = path.join(directory, 'read-race.png');
  let busy = false;
  let readStarted = false;
  const files: string[] = [];
  const watcher = await createFolderWatcher(directory, { isBusy: () => busy, onFiles: batch => { files.push(...batch); } });
  t.after(() => watcher.close());
  const originalRead = fs.readFile;
  const mockedRead = t.mock.method(fs, 'readFile', async (source: Parameters<typeof fs.readFile>[0], options?: Parameters<typeof fs.readFile>[1]) => {
    const contents = await originalRead(source, options ?? null);
    if (source === screenshot && !readStarted) { readStarted = true; busy = true; }
    return contents;
  });
  await fs.writeFile(screenshot, image);
  await until(() => readStarted);
  await delay(200);
  assert.deepEqual(files, [], 'watcher must recheck the queue after asynchronous filesystem reads');
  mockedRead.mock.restore();
  busy = false;
  await until(() => files.length === 1);
  assert.deepEqual(files, [screenshot]);
});

test('oversized sparse screenshot is rejected before reading or hashing its contents', { timeout: 10000 }, async t => {
  const { directory } = await setup(t);
  const screenshot = path.join(directory, 'oversized.png');
  const files: string[] = [], errors: Error[] = [];
  const originalRead = fs.readFile;
  let oversizedReads = 0;
  t.mock.method(fs, 'readFile', async (source: Parameters<typeof fs.readFile>[0], options?: Parameters<typeof fs.readFile>[1]) => {
    if (source === screenshot) { oversizedReads++; throw new Error('Oversized image contents must not be read.'); }
    return originalRead(source, options ?? null);
  });
  const watcher = await createFolderWatcher(directory, { onFiles: batch => { files.push(...batch); }, onError: error => { errors.push(error); } });
  t.after(() => watcher.close());
  const handle = await fs.open(screenshot, 'w');
  try { await handle.truncate(MAX_INPUT_BYTES + 1); }
  finally { await handle.close(); }
  assert.equal((await fs.stat(screenshot)).size, MAX_INPUT_BYTES + 1);
  await until(() => errors.length > 0);
  assert.equal(errors[0]?.message, 'error.fileSize');
  assert.equal(oversizedReads, 0);
  assert.deepEqual(files, []);
});

test('a rejected file batch can retry unchanged contents on the next change event', { timeout: 15000 }, async t => {
  const { directory, image } = await setup(t);
  const screenshot = path.join(directory, 'retry-enqueue.png');
  const files: string[] = [], errors: Error[] = [];
  let attempts = 0;
  const watcher = await createFolderWatcher(directory, {
    onFiles: async batch => {
      attempts++;
      if (attempts === 1) throw new Error('Temporary enqueue failure');
      files.push(...batch);
    },
    onError: error => { errors.push(error); },
  });
  t.after(() => watcher.close());
  await fs.writeFile(screenshot, image);
  await until(() => errors.length === 1);
  assert.equal(errors[0]?.message, 'Temporary enqueue failure');
  assert.deepEqual(files, []);
  const touched = new Date(Date.now() + 10_000);
  await fs.utimes(screenshot, touched, touched);
  await until(() => files.length === 1);
  assert.deepEqual(files, [screenshot]);
  assert.equal(attempts, 2);
  const touchedAgain = new Date(Date.now() + 20_000);
  await fs.utimes(screenshot, touchedAgain, touchedAgain);
  await delay(2200);
  assert.equal(attempts, 2, 'successfully queued unchanged content remains deduplicated');
});
