import type { CompressionOptions } from '../../../shared/contracts';

export const DEFAULTS: Readonly<CompressionOptions> = Object.freeze({
  quality: 80, overwrite: false, resizeEnabled: false, resizeMode: 'dimensions', resizePercent: 50, resizeMethod: 'fit', width: 1200,
  height: 1200, format: 'original', outputDirectory: null,
});
