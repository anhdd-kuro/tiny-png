import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp, { type SharpOptions } from 'sharp';
import { MAX_INPUT_BYTES, supportedExtensions } from './files.ts';
import type { CompressionOptions, CompressionResult } from '../../../shared/contracts.ts';

function hasCode(error: unknown, code: string): boolean {
  return error instanceof Error && 'code' in error && error.code === code;
}

import { DEFAULTS } from './options';
const digest = (bytes: Uint8Array): string => crypto.createHash('sha256').update(bytes).digest('hex');

function validate(options: CompressionOptions): void {
  if (!Number.isInteger(options.quality) || options.quality < 1 || options.quality > 100) throw new Error('error.quality');
  if (!['original', 'png', 'jpeg', 'webp', 'avif'].includes(options.format)) throw new Error('error.format');
  if (!['fit', 'cover', 'scale', 'thumb'].includes(options.resizeMethod)) throw new Error('error.resizeMethod');
  if (options.resizeEnabled) {
    if (options.resizeMode === 'percent') {
      if (!Number.isInteger(options.resizePercent) || options.resizePercent < 1 || options.resizePercent > 100) throw new Error('error.resizePercent');
    } else if (options.resizeMode === 'dimensions') {
      const dimensions = options.resizeMethod === 'scale' ? [options.width] : [options.width, options.height];
      if (dimensions.some(n => !Number.isInteger(n) || n < 1 || n > 32768)) throw new Error('error.dimensions');
      if (options.resizeMethod !== 'scale' && options.width * options.height > 256_000_000) throw new Error('error.pixelLimit');
    } else throw new Error('error.dimensions');
  }
  if (options.outputDirectory !== null && typeof options.outputDirectory !== 'string') throw new Error('error.outputFolder');
}

export async function compressFile(file: string, supplied: Partial<CompressionOptions> = {}): Promise<CompressionResult> {
  const options: CompressionOptions = { ...DEFAULTS, ...supplied };
  validate(options);
  file = path.resolve(file);
  if (!supportedExtensions.has(path.extname(file).slice(1).toLowerCase())) throw new Error('error.inputFormat');
  const before = await fs.lstat(file);
  if (!before.isFile() || before.isSymbolicLink()) throw new Error('error.regularFile');
  if (before.size <= 0 || before.size > MAX_INPUT_BYTES) throw new Error('error.fileSize');
  const input = await fs.readFile(file);
  const inputFingerprint = digest(input);
  const engineOptions: SharpOptions = { failOn: 'error', limitInputPixels: 256_000_000, sequentialRead: true };
  const metadata = await sharp(input, engineOptions).metadata();
  const inputFormat = metadata.format === 'heif' && metadata.compression === 'av1' ? 'avif' : metadata.format;
  if (inputFormat !== 'png' && inputFormat !== 'jpeg' && inputFormat !== 'webp' && inputFormat !== 'avif') throw new Error('error.inputFormat');
  if ((metadata.pages || 1) > 1) throw new Error('error.animated');
  const sourceWidth = metadata.autoOrient?.width || metadata.width;
  const sourceHeight = metadata.autoOrient?.height || metadata.height;
  const format = options.format === 'original' ? inputFormat : options.format;
  let pipeline = sharp(input, engineOptions).rotate();
  if (options.resizeEnabled) {
    if (options.resizeMode === 'percent') pipeline = pipeline.resize({
      width: Math.max(1, Math.round(sourceWidth * options.resizePercent / 100)),
      height: Math.max(1, Math.round(sourceHeight * options.resizePercent / 100)),
      fit: 'inside', withoutEnlargement: true,
    });
    else if (options.resizeMethod === 'scale') pipeline = pipeline.resize({ width: options.width, withoutEnlargement: true });
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
  const result: CompressionResult = { source: file, outputPath: file, originalBytes: input.length, outputBytes: output.length,
    savedBytes: input.length - output.length, width: info.width, height: info.height, skipped: false, outputFingerprint: fingerprint };
  if (format === inputFormat && info.width === sourceWidth && info.height === sourceHeight && output.length >= input.length) {
    return { ...result, outputBytes: input.length, savedBytes: 0, width: sourceWidth,
      height: sourceHeight, skipped: true, outputFingerprint: inputFingerprint };
  }
  const originalExtension = path.extname(file).slice(1).toLowerCase();
  const extension = format === 'jpeg' ? (originalExtension === 'jpeg' ? 'jpeg' : 'jpg') : format;
  const extensionMatches = format === 'jpeg' ? ['jpg', 'jpeg'].includes(originalExtension) : originalExtension === format;
  const overwrite = options.overwrite && format === inputFormat && extensionMatches;
  const directory = overwrite ? path.dirname(file) : path.resolve(options.outputDirectory || path.dirname(file));
  const directoryStat = await fs.stat(directory);
  if (!directoryStat.isDirectory()) throw new Error('error.outputFolder');
  const temporary = path.join(directory, `.tiny-png-${crypto.randomUUID()}.tmp`);
  try {
    await fs.writeFile(temporary, output, { flag: 'wx', mode: before.mode & 0o777 });
    if (overwrite) {
      const current = await fs.lstat(file);
      if (!current.isFile() || current.isSymbolicLink() || current.ino !== before.ino || current.dev !== before.dev ||
          current.size !== before.size || current.mtimeMs !== before.mtimeMs || digest(await fs.readFile(file)) !== inputFingerprint) {
        throw new Error('error.changedSource');
      }
      await fs.rename(temporary, file);
      result.outputPath = file;
    } else {
      const stem = path.parse(file).name + (options.resizeEnabled ? '-resized-tinified' : '-tinified');
      for (let index = 0; index < 100_000; index++) {
        const destination = path.join(directory, `${stem}${index ? '-' + index : ''}.${extension}`);
        try {
          await fs.link(temporary, destination);
          result.outputPath = destination;
          break;
        } catch (error) { if (!hasCode(error, 'EEXIST')) throw error; }
      }
      if (result.outputPath === file) throw new Error('error.tooManyNames');
    }
  } finally { await fs.unlink(temporary).catch((error: unknown) => { if (!hasCode(error, 'ENOENT')) throw error; }); }
  return result;
}
