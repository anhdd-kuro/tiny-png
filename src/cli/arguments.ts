import { DEFAULTS } from '../main/features/compression/options.ts';
import type { CompressionOptions, Language, OutputFormat, ResizeMethod } from '../shared/contracts.ts';

export interface CLIOptions extends CompressionOptions { language: Language; s3: boolean }
export interface ParsedArguments { options: CLIOptions; paths: string[]; help: boolean }
export class CLIArgumentError extends Error {
  constructor(key: string, readonly argument?: string) { super(key); this.name = 'CLIArgumentError'; }
}

export function detectLanguage(args: readonly string[], fallback: Language = 'vi'): Language {
  let language = fallback;
  for (let index = 0; index < args.length && args[index] !== '--'; index++) {
    const token = args[index];
    const value = token === '--language' ? args[index + 1] : token.startsWith('--language=') ? token.slice('--language='.length) : undefined;
    if (value === 'en' || value === 'vi' || value === 'ja') language = value;
  }
  return language;
}

export function parseArguments(args: readonly string[], defaults: Partial<CLIOptions> = {}): ParsedArguments {
  const options: CLIOptions = {
    quality: defaults.quality ?? DEFAULTS.quality,
    overwrite: defaults.overwrite ?? DEFAULTS.overwrite,
    resizeEnabled: defaults.resizeEnabled ?? DEFAULTS.resizeEnabled,
    resizeMode: defaults.resizeMode ?? DEFAULTS.resizeMode,
    resizePercent: defaults.resizePercent ?? DEFAULTS.resizePercent,
    resizeMethod: defaults.resizeMethod ?? DEFAULTS.resizeMethod,
    width: defaults.width ?? DEFAULTS.width,
    height: defaults.height ?? DEFAULTS.height,
    format: defaults.format ?? DEFAULTS.format,
    outputDirectory: defaults.outputDirectory ?? DEFAULTS.outputDirectory,
    language: detectLanguage(args, defaults.language ?? 'vi'),
    s3: false,
  };
  const paths: string[] = [];
  let help = false;
  let positionalOnly = false;
  for (let index = 0; index < args.length; index++) {
    const token = args[index];
    if (positionalOnly) { paths.push(token); continue; }
    if (token === '--') { positionalOnly = true; continue; }
    if (!token.startsWith('-') || token === '-') { paths.push(token); continue; }
    const separator = token.indexOf('=');
    const key = separator === -1 ? token : token.slice(0, separator);
    const inline = separator === -1 ? undefined : token.slice(separator + 1);
    const value = (): string => {
      const result = inline ?? args[++index];
      if (result === undefined || result === '' || inline === undefined && result.startsWith('--')) throw new CLIArgumentError('cli.missingValue', key);
      return result;
    };
    const flag = (): void => { if (inline !== undefined) throw new CLIArgumentError('cli.flagValue', key); };
    switch (key) {
      case '--help': case '-h': flag(); help = true; break;
      case '--file': paths.push(value()); break;
      case '--quality': options.quality = Number(value()); break;
      case '--overwrite': flag(); options.overwrite = true; options.outputDirectory = null; break;
      case '--no-overwrite': flag(); options.overwrite = false; break;
      case '--output': options.outputDirectory = value(); options.overwrite = false; break;
      case '--format': {
        const format = value();
        if (!['original', 'png', 'jpeg', 'webp', 'avif'].includes(format)) throw new CLIArgumentError('error.format');
        options.format = format as OutputFormat;
        break;
      }
      case '--webp': flag(); options.format = 'webp'; break;
      case '--resize': {
        const method = value();
        if (!['fit', 'cover', 'scale', 'thumb'].includes(method)) throw new CLIArgumentError('error.resizeMethod');
        options.resizeEnabled = true;
        options.resizeMode = 'dimensions';
        options.resizeMethod = method as ResizeMethod;
        break;
      }
      case '--resize-percent': options.resizePercent = Number(value()); options.resizeMode = 'percent'; options.resizeEnabled = true; break;
      case '--width': options.width = Number(value()); break;
      case '--height': options.height = Number(value()); break;
      case '--no-resize': flag(); options.resizeEnabled = false; break;
      case '--language': {
        const language = value();
        if (language !== 'en' && language !== 'vi' && language !== 'ja') throw new CLIArgumentError('cli.language');
        options.language = language;
        break;
      }
      case '--s3': flag(); options.s3 = true; break;
      default: throw new CLIArgumentError('cli.unknownOption', key);
    }
  }
  if (!Number.isInteger(options.quality) || options.quality < 1 || options.quality > 100) throw new CLIArgumentError('error.quality');
  if (!Number.isInteger(options.resizePercent) || options.resizePercent < 1 || options.resizePercent > 100) throw new CLIArgumentError('error.resizePercent');
  if (!Number.isInteger(options.width) || options.width < 1 || options.width > 32768 ||
      !Number.isInteger(options.height) || options.height < 1 || options.height > 32768) throw new CLIArgumentError('error.dimensions');
  if (options.resizeEnabled && options.resizeMode === 'dimensions' && options.resizeMethod !== 'scale' && options.width * options.height > 256_000_000) throw new CLIArgumentError('error.pixelLimit');
  return { options, paths, help };
}
