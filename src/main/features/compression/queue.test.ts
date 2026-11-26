import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import sharp from 'sharp';
import { CompressionQueue } from './queue';
import { SettingsStore } from '../settings/store';

function settled(queue: CompressionQueue): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => { queue.off('change', check); reject(new Error('Queue did not finish')); }, 10000);
    const check = (): void => {
      if (!queue.isProcessing && !queue.jobs.some(job => job.state === 'queued')) {
        clearTimeout(timeout); queue.off('change', check); resolve();
      }
    };
    queue.on('change', check); check();
  });
}

test('parallel file drops do not enqueue duplicate active sources', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tiny-queue-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const file = path.join(root, 'screenshot.png');
  await sharp({ create: { width: 80, height: 80, channels: 3, background: '#50a998' } }).png({ compressionLevel: 0 }).toFile(file);
  const queue = new CompressionQueue(new SettingsStore(path.join(root, 'prefs.json')));
  const accepted: Array<[string, string]> = [];
  const finished: string[] = [];
  queue.on('accepted', (source: string, origin: string) => accepted.push([source, origin]));
  queue.on('settled', job => finished.push(job.state));
  queue.pause();
  await Promise.all([queue.enqueue([file], 'watch'), queue.enqueue([file, file])]);
  assert.deepEqual(accepted, [[file, 'watch']]);
  assert.deepEqual(finished, []);
  assert.equal(queue.jobs.length, 1);
  assert.equal(queue.jobs[0].state, 'queued');
  queue.resume(); await settled(queue);
  assert.equal(queue.jobs[0].state, 'completed');
  assert.deepEqual(finished, ['completed']);
  assert.ok(queue.jobs[0].result!.outputBytes < queue.jobs[0].originalBytes);
});

test('failed file can be repaired and retried without blocking a later drop', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tiny-queue-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const file = path.join(root, 'screenshot.png');
  await fs.writeFile(file, 'not an image');
  const queue = new CompressionQueue(new SettingsStore(path.join(root, 'prefs.json')));
  await queue.enqueue([file]); await settled(queue);
  assert.equal(queue.jobs[0].state, 'failed');
  await sharp({ create: { width: 30, height: 30, channels: 3, background: '#50a998' } }).png({ compressionLevel: 0 }).toFile(file);
  queue.retry(queue.jobs[0].id); await settled(queue);
  assert.equal(queue.jobs[0].state, 'completed');
  await assert.rejects(queue.enqueue([path.join(root, 'missing.png')]));
  await queue.enqueue([file]); await settled(queue);
  assert.equal(queue.jobs.length, 2);
  assert.equal(queue.jobs[1].state, 'completed');
});

test('S3 failure preserves the local output and retry uploads it without recompressing', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tiny-queue-s3-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const file = path.join(root, 'screenshot.png');
  await sharp({ create: { width: 60, height: 60, channels: 3, background: '#50a998' } }).png({ compressionLevel: 0 }).toFile(file);
  let attempts = 0;
  const queue = new CompressionQueue(new SettingsStore(path.join(root, 'prefs.json')), {
    enabled: true,
    async upload(result) {
      attempts++;
      await fs.access(result.outputPath);
      if (attempts === 1) throw new Error('error.s3Upload');
      return { bucket: 'example-bucket', key: 'screenshot.png', location: 's3://example-bucket/screenshot.png' };
    },
  });
  const outcomes: Array<[string, string | undefined]> = [];
  queue.on('settled', job => outcomes.push([job.state, job.phase]));
  await queue.enqueue([file]); await settled(queue);
  const job = queue.jobs[0];
  assert.equal(job.state, 'failed');
  assert.ok(job.result);
  const saved = await fs.readFile(job.result.outputPath);
  await fs.unlink(file);
  queue.retry(job.id); await settled(queue);
  assert.equal(job.state, 'completed');
  assert.equal(job.result.remoteLocation, 's3://example-bucket/screenshot.png');
  assert.deepEqual(await fs.readFile(job.result.outputPath), saved);
  assert.equal(attempts, 2);
  assert.deepEqual(outcomes, [['failed', 'uploading'], ['completed', 'uploading']]);
});
