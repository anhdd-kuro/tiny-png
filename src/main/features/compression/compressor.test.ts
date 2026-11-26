import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import sharp from 'sharp';
import { compressFile } from './compressor.ts';
import { collectFiles } from './files.ts';
import type { CompressionOptions } from '../../../shared/contracts.ts';

async function fixture(t: TestContext) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'tiny-png-test-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const width = 320, height = 200;
  const raw = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = (y * width + x) * 3;
    raw[i] = x % 256; raw[i + 1] = y % 256; raw[i + 2] = (x + y) % 256;
  }
  const input = await sharp(raw, { raw: { width, height, channels: 3 } }).png({ compressionLevel: 0 }).toBuffer();
  const file = path.join(directory, 'Screenshot.png');
  await fs.writeFile(file, input);
  return { directory, file, input };
}

test('offline PNG compression reduces an actual screenshot and preserves original', async t => {
  const { file, input } = await fixture(t);
  const result = await compressFile(file);
  assert.equal(result.skipped, false);
  assert.ok(result.outputBytes < input.length / 2);
  assert.deepEqual(await fs.readFile(file), input);
  assert.equal((await sharp(result.outputPath).metadata()).format, 'png');
  assert.match(result.outputFingerprint, /^[a-f0-9]{64}$/);
});

test('JPEG uses local encoder and remains decodable with less data', async t => {
  const { directory, file } = await fixture(t);
  const jpeg = path.join(directory, 'photo.jpg');
  await sharp(file).jpeg({ quality: 100, chromaSubsampling: '4:4:4' }).toFile(jpeg);
  const result = await compressFile(jpeg, { quality: 70 });
  assert.ok(result.outputBytes < result.originalBytes);
  assert.equal((await sharp(result.outputPath).metadata()).format, 'jpeg');
});

test('fit, cover, scale and thumb resize dimensions are correct', async t => {
  const { file } = await fixture(t);
  const cases = [['fit', 100, 100, 100, 63], ['cover', 100, 100, 100, 100],
    ['scale', 160, 1, 160, 100], ['thumb', 80, 80, 80, 80]] as const;
  for (const [resizeMethod, width, height, expectedWidth, expectedHeight] of cases) {
    const result = await compressFile(file, { resizeEnabled: true, resizeMethod, width, height });
    assert.equal(result.width, expectedWidth);
    assert.equal(result.height, expectedHeight);
    const metadata = await sharp(result.outputPath).metadata();
    assert.equal(metadata.width, expectedWidth); assert.equal(metadata.height, expectedHeight);
  }
});

test('50 percent resizes a 2000 by 1000 image proportionally and ignores pixel-mode dimensions', async t => {
  const { file } = await fixture(t);
  const input = await sharp({ create: { width: 2000, height: 1000, channels: 3, background: 'orange' } })
    .png({ compressionLevel: 0 }).toBuffer();
  await fs.writeFile(file, input);
  const result = await compressFile(file, { resizeEnabled: true, resizeMode: 'percent', resizePercent: 50,
    resizeMethod: 'cover', width: 100, height: 100 });
  const output = await sharp(result.outputPath).metadata();
  assert.equal(result.width, 1000);
  assert.equal(result.height, 500);
  assert.equal(output.width, 1000);
  assert.equal(output.height, 500);
  assert.deepEqual(await fs.readFile(file), input);
});

test('percentage uses displayed dimensions after EXIF auto orientation', async t => {
  const { directory } = await fixture(t);
  const file = path.join(directory, 'oriented.jpg');
  await sharp({ create: { width: 120, height: 80, channels: 3, background: 'blue' } })
    .withMetadata({ orientation: 6 }).jpeg({ quality: 100 }).toFile(file);
  const result = await compressFile(file, { resizeEnabled: true, resizeMode: 'percent', resizePercent: 50 });
  const output = await sharp(result.outputPath).metadata();
  assert.equal(result.width, 40);
  assert.equal(result.height, 60);
  assert.equal(output.width, 40);
  assert.equal(output.height, 60);
});

test('100 percent never replaces a smaller source with larger output', async t => {
  const { file } = await fixture(t);
  const input = await sharp({ create: { width: 1, height: 1, channels: 3, background: 'black' } })
    .png({ palette: true, quality: 80, compressionLevel: 9, effort: 7 }).toBuffer();
  await fs.writeFile(file, input);
  const result = await compressFile(file, { overwrite: true, resizeEnabled: true, resizeMode: 'percent', resizePercent: 100 });
  assert.equal(result.skipped, true);
  assert.equal(result.outputPath, file);
  assert.equal(result.width, 1);
  assert.equal(result.height, 1);
  assert.deepEqual(await fs.readFile(file), input);
  for (const resizePercent of [0, 101]) {
    await assert.rejects(compressFile(file, { resizeEnabled: true, resizeMode: 'percent', resizePercent }), { message: 'error.resizePercent' });
  }
});

test('conversion uses matching extensions and never overwrites original', async t => {
  const { file, input } = await fixture(t);
  for (const format of ['jpeg', 'webp', 'avif'] as const) {
    const result = await compressFile(file, { format, overwrite: true });
    assert.notEqual(result.outputPath, file);
    assert.equal(path.extname(result.outputPath), format === 'jpeg' ? '.jpg' : '.' + format);
    const metadata = await sharp(result.outputPath).metadata();
    assert.equal(metadata.format, format === 'avif' ? 'heif' : format);
    if (format === 'avif') assert.equal(metadata.compression, 'av1');
  }
  assert.deepEqual(await fs.readFile(file), input);
});

test('concurrent output collisions do not replace existing files', async t => {
  const { file, directory } = await fixture(t);
  const protectedPath = path.join(directory, 'Screenshot-tinified.png');
  await fs.writeFile(protectedPath, 'keep this file');
  const results = await Promise.all([compressFile(file), compressFile(file)]);
  assert.notEqual(results[0].outputPath, results[1].outputPath);
  assert.equal(await fs.readFile(protectedPath, 'utf8'), 'keep this file');
  assert.deepEqual((await fs.readdir(directory)).filter(name => name.startsWith('.tiny-png')), []);
});

test('overwrite is explicit and protects a source edited during compression', async t => {
  const { file, input } = await fixture(t);
  const replacement = await sharp({ create: { width: 50, height: 50, channels: 3, background: 'red' } }).png().toBuffer();
  const readFile = fs.readFile;
  let edited = false;
  const mockedRead = t.mock.method(fs, 'readFile', async (source: Parameters<typeof fs.readFile>[0], options?: Parameters<typeof fs.readFile>[1]) => {
    const contents = await readFile(source, options ?? null);
    if (source === file && !edited) { edited = true; await fs.writeFile(file, replacement); }
    return contents;
  });
  await assert.rejects(compressFile(file, { overwrite: true }), { message: 'error.changedSource' });
  mockedRead.mock.restore();
  assert.deepEqual(await fs.readFile(file), replacement);
  await fs.writeFile(file, input);
  const result = await compressFile(file, { overwrite: true });
  assert.equal(result.outputPath, file);
  assert.ok((await fs.stat(file)).size < input.length);
});

test('already optimized output is skipped instead of enlarged', async t => {
  const { file } = await fixture(t);
  const minimal = await sharp({ create: { width: 1, height: 1, channels: 3, background: 'black' } })
    .png({ palette: true, quality: 80, compressionLevel: 9, effort: 7 }).toBuffer();
  await fs.writeFile(file, minimal);
  const result = await compressFile(file, { overwrite: true });
  assert.equal(result.skipped, true);
  assert.equal(result.outputPath, file);
  assert.equal(result.savedBytes, 0);
  assert.deepEqual(await fs.readFile(file), minimal);
});

test('invalid input/options fail before source changes', async t => {
  const { file, input, directory } = await fixture(t);
  await assert.rejects(compressFile(file, { quality: 0 }), { message: 'error.quality' });
  await assert.rejects(compressFile(file, { resizeEnabled: true, width: -5 }), { message: 'error.dimensions' });
  await assert.rejects(compressFile(file, { format: 'gif' as CompressionOptions['format'] }), { message: 'error.format' });
  const invalid = path.join(directory, 'bad.png');
  await fs.writeFile(invalid, 'not an image');
  await assert.rejects(compressFile(invalid));
  assert.deepEqual(await fs.readFile(file), input);
});

test('collection recurses and deduplicates while excluding hidden, generated and symbolic files', async t => {
  const { file, directory } = await fixture(t);
  const nested = path.join(directory, 'nested'); await fs.mkdir(nested);
  const nestedFile = path.join(nested, 'other.png'); await fs.copyFile(file, nestedFile);
  const generated = path.join(directory, 'Screenshot-tinified-2.png'); await fs.copyFile(file, generated);
  await fs.copyFile(file, path.join(directory, '.hidden.png'));
  await fs.symlink(file, path.join(directory, 'shortcut.png'));
  assert.deepEqual(new Set(await collectFiles([directory, file])), new Set([file, nestedFile]));
  assert.deepEqual(await collectFiles([generated]), [generated]);
  assert.deepEqual(await collectFiles([path.join(directory, '.hidden.png')]), []);
});
