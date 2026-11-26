'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const sharp = require('sharp');
const { compressFile, collectFiles } = require('../src/core/compressor.cjs');

async function fixture(t) {
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
    ['scale', 160, 1, 160, 100], ['thumb', 80, 80, 80, 80]];
  for (const [resizeMethod, width, height, expectedWidth, expectedHeight] of cases) {
    const result = await compressFile(file, { resizeEnabled: true, resizeMethod, width, height });
    assert.equal(result.width, expectedWidth);
    assert.equal(result.height, expectedHeight);
    const metadata = await sharp(result.outputPath).metadata();
    assert.equal(metadata.width, expectedWidth); assert.equal(metadata.height, expectedHeight);
  }
});

test('conversion uses matching extensions and never overwrites original', async t => {
  const { file, input } = await fixture(t);
  for (const format of ['jpeg', 'webp', 'avif']) {
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
  await assert.rejects(compressFile(file, { overwrite: true,
    onBeforeWrite: async () => fs.writeFile(file, replacement) }), /đã thay đổi/);
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
  await assert.rejects(compressFile(file, { quality: 0 }), /Chất lượng/);
  await assert.rejects(compressFile(file, { resizeEnabled: true, width: -5 }), /Kích thước/);
  await assert.rejects(compressFile(file, { format: 'gif' }), /Định dạng/);
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
