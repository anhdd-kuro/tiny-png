'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const sharp = require('sharp');

const DEFAULTS = Object.freeze({ quality: 80, overwrite: false, resizeEnabled: false, resizeMethod: 'fit', width: 1200,
  height: 1200, format: 'original', outputDirectory: null });
const supportedExtensions = new Set(['png', 'jpg', 'jpeg', 'webp', 'avif']);
const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const isGenerated = file => /-tinified(?:-\d+)?$/i.test(path.parse(file).name);

async function collectFiles(paths) {
  const files = new Set();
  async function visit(file, explicit = false) {
    file = path.resolve(file);
    let stat;
    try { stat = await fs.lstat(file); } catch { return; }
    if (stat.isSymbolicLink()) return;
    if (stat.isDirectory()) {
      const children = await fs.readdir(file);
      for (const child of children) if (!child.startsWith('.')) await visit(path.join(file, child));
    } else if (stat.isFile() && !path.basename(file).startsWith('.') && supportedExtensions.has(path.extname(file).slice(1).toLowerCase()) &&
               (explicit || !isGenerated(file))) files.add(file);
  }
  for (const file of paths) if (typeof file === 'string') await visit(file, true);
  return [...files].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

function validate(options) {
  if (!Number.isInteger(options.quality) || options.quality < 1 || options.quality > 100) throw new Error('Chất lượng phải từ 1 đến 100.');
  if (!['original', 'png', 'jpeg', 'webp', 'avif'].includes(options.format)) throw new Error('Định dạng đầu ra không hợp lệ.');
  if (!['fit', 'cover', 'scale', 'thumb'].includes(options.resizeMethod)) throw new Error('Phương pháp resize không hợp lệ.');
  if (options.resizeEnabled) {
    const dimensions = options.resizeMethod === 'scale' ? [options.width] : [options.width, options.height];
    if (dimensions.some(n => !Number.isInteger(n) || n < 1 || n > 32768)) throw new Error('Kích thước resize phải từ 1 đến 32.768 px.');
    if (options.resizeMethod !== 'scale' && options.width * options.height > 256_000_000) throw new Error('Kích thước resize vượt quá 256 megapixel.');
  }
  if (options.outputDirectory !== null && typeof options.outputDirectory !== 'string') throw new Error('Thư mục đầu ra không hợp lệ.');
}

async function compressFile(file, supplied = {}) {
  const options = { ...DEFAULTS, ...supplied };
  validate(options);
  file = path.resolve(file);
  if (!supportedExtensions.has(path.extname(file).slice(1).toLowerCase())) throw new Error('Chọn ảnh PNG, JPG, WebP hoặc AVIF.');
  const before = await fs.lstat(file);
  if (!before.isFile() || before.isSymbolicLink()) throw new Error('Ảnh phải là file thông thường, không phải symlink.');
  if (before.size <= 0 || before.size > 500_000_000) throw new Error('Ảnh phải có dung lượng từ 1 byte đến 500 MB.');
  const input = await fs.readFile(file);
  const inputFingerprint = digest(input);
  const engineOptions = { failOn: 'error', limitInputPixels: 256_000_000, sequentialRead: true };
  const metadata = await sharp(input, engineOptions).metadata();
  const inputFormat = metadata.format === 'heif' && metadata.compression === 'av1' ? 'avif' : metadata.format;
  if (!['png', 'jpeg', 'webp', 'avif'].includes(inputFormat)) throw new Error('Nội dung file không phải ảnh PNG, JPG, WebP hoặc AVIF.');
  if ((metadata.pages || 1) > 1) throw new Error('Ảnh động chưa được hỗ trợ để tránh làm mất các frame.');
  const format = options.format === 'original' ? inputFormat : options.format;
  let pipeline = sharp(input, engineOptions).rotate();
  if (options.resizeEnabled) {
    if (options.resizeMethod === 'scale') pipeline = pipeline.resize({ width: options.width, withoutEnlargement: true });
    else pipeline = pipeline.resize({ width: options.width, height: options.height,
      fit: options.resizeMethod === 'fit' ? 'inside' : 'cover', withoutEnlargement: true,
      position: options.resizeMethod === 'thumb' ? sharp.strategy.attention : 'centre' });
  }
  switch (format) {
    case 'png': pipeline = pipeline.png({ quality: options.quality, palette: true, compressionLevel: 9, effort: 7 }); break;
    case 'jpeg': pipeline = pipeline.flatten({ background: '#ffffff' }).jpeg({ quality: options.quality, mozjpeg: true }); break;
    case 'webp': pipeline = pipeline.webp({ quality: options.quality, effort: 6 }); break;
    case 'avif': pipeline = pipeline.avif({ quality: options.quality, effort: 4 }); break;
  }
  const { data: output, info } = await pipeline.toBuffer({ resolveWithObject: true });
  // Decode the encoded output before any write so an encoder failure cannot replace an original.
  await sharp(output, engineOptions).raw().toBuffer();
  const fingerprint = digest(output);
  const result = { source: file, outputPath: file, originalBytes: input.length, outputBytes: output.length,
    savedBytes: input.length - output.length, width: info.width, height: info.height, skipped: false, outputFingerprint: fingerprint };
  if (format === inputFormat && !options.resizeEnabled && output.length >= input.length) {
    return { ...result, outputBytes: input.length, savedBytes: 0, width: metadata.autoOrient?.width || metadata.width,
      height: metadata.autoOrient?.height || metadata.height, skipped: true, outputFingerprint: inputFingerprint };
  }
  const originalExtension = path.extname(file).slice(1).toLowerCase();
  const extension = format === 'jpeg' ? (originalExtension === 'jpeg' ? 'jpeg' : 'jpg') : format;
  const extensionMatches = format === 'jpeg' ? ['jpg', 'jpeg'].includes(originalExtension) : originalExtension === format;
  const overwrite = options.overwrite && format === inputFormat && extensionMatches;
  const directory = overwrite ? path.dirname(file) : path.resolve(options.outputDirectory || path.dirname(file));
  const directoryStat = await fs.stat(directory);
  if (!directoryStat.isDirectory()) throw new Error('Thư mục đầu ra không tồn tại.');
  const temporary = path.join(directory, `.tiny-png-${crypto.randomUUID()}.tmp`);
  try {
    await fs.writeFile(temporary, output, { flag: 'wx', mode: before.mode & 0o777 });
    if (overwrite) {
      if (options.onBeforeWrite) await options.onBeforeWrite(file, fingerprint);
      const current = await fs.lstat(file);
      if (!current.isFile() || current.isSymbolicLink() || current.ino !== before.ino || current.dev !== before.dev ||
          current.size !== before.size || current.mtimeMs !== before.mtimeMs || digest(await fs.readFile(file)) !== inputFingerprint) {
        throw new Error('Ảnh gốc đã thay đổi trong lúc nén. File gốc được giữ nguyên; hãy thử lại.');
      }
      await fs.rename(temporary, file);
      result.outputPath = file;
    } else {
      const stem = path.parse(file).name + (options.resizeEnabled ? '-resized-tinified' : '-tinified');
      for (let index = 0; index < 100_000; index++) {
        const destination = path.join(directory, `${stem}${index ? '-' + index : ''}.${extension}`);
        if (options.onBeforeWrite) await options.onBeforeWrite(destination, fingerprint);
        try {
          await fs.link(temporary, destination);
          result.outputPath = destination;
          break;
        } catch (error) { if (error.code !== 'EEXIST') throw error; }
      }
      if (result.outputPath === file) throw new Error('Quá nhiều file trùng tên. Chọn thư mục khác.');
    }
  } finally { await fs.unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error; }); }
  return result;
}

module.exports = { DEFAULTS, supportedExtensions, isGenerated, collectFiles, compressFile };
