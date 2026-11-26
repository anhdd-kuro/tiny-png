import test from 'node:test';
import assert from 'node:assert/strict';
import { parseArguments, detectLanguage, CLIArgumentError } from './arguments.ts';

test('CLI inherits GUI compression settings and overrides only explicit flags', () => {
  const parsed = parseArguments(['--file', 'a.png', 'images', '--quality', '65', '--resize', 'cover', '--width', '300', '--height', '200', '--webp'],
    { overwrite: true, quality: 90, language: 'ja', s3: true });
  assert.deepEqual(parsed.paths, ['a.png', 'images']);
  assert.equal(parsed.options.overwrite, true);
  assert.equal(parsed.options.quality, 65);
  assert.equal(parsed.options.resizeEnabled, true);
  assert.equal(parsed.options.resizeMethod, 'cover');
  assert.equal(parsed.options.width, 300);
  assert.equal(parsed.options.height, 200);
  assert.equal(parsed.options.format, 'webp');
  assert.equal(parsed.options.language, 'ja');
  assert.equal(parsed.options.s3, false);
});

test('output selection disables inherited overwrite and explicit later flags win', () => {
  const output = parseArguments(['--output', './output', '--no-resize'], { overwrite: true, resizeEnabled: true });
  assert.equal(output.options.overwrite, false);
  assert.equal(output.options.outputDirectory, './output');
  assert.equal(output.options.resizeEnabled, false);
  const overwrite = parseArguments(['--output', './output', '--overwrite']);
  assert.equal(overwrite.options.overwrite, true);
  assert.equal(overwrite.options.outputDirectory, null);
  assert.equal(parseArguments(['--no-overwrite'], { overwrite: true }).options.overwrite, false);
});

test('repeated files, equals syntax and separator preserve paths including leading hyphens', () => {
  const parsed = parseArguments(['--file=one image.png', '--file', 'two.jpg', '--quality=100', '--', '--quality', '-image.png']);
  assert.deepEqual(parsed.paths, ['one image.png', 'two.jpg', '--quality', '-image.png']);
  assert.equal(parsed.options.quality, 100);
});

test('invalid quality, dimensions, formats and unknown credential flags fail before processing', () => {
  for (const args of [['--quality', '0'], ['--quality', '101'], ['--quality', '80.5'], ['--quality', 'abc']]) {
    assert.throws(() => parseArguments(args), { message: 'error.quality' });
  }
  for (const args of [['--width', '0'], ['--height', '32769'], ['--width', 'NaN']]) {
    assert.throws(() => parseArguments(args), { message: 'error.dimensions' });
  }
  assert.throws(() => parseArguments(['--resize', 'fit', '--width', '32768', '--height', '32768']), { message: 'error.pixelLimit' });
  assert.throws(() => parseArguments(['--format', 'gif']), { message: 'error.format' });
  assert.throws(() => parseArguments(['--resize', 'stretch']), { message: 'error.resizeMethod' });
  assert.throws(() => parseArguments(['--language', 'xx']), { message: 'cli.language' });
  assert.throws(() => parseArguments(['--aws-secret=secret']), (error: unknown) => error instanceof CLIArgumentError && error.argument === '--aws-secret');
});

test('missing values and malformed boolean flags are rejected; help needs no file', () => {
  for (const args of [['--file'], ['--output='], ['--quality', '--overwrite']]) {
    assert.throws(() => parseArguments(args), { message: 'cli.missingValue' });
  }
  assert.throws(() => parseArguments(['--overwrite=false']), { message: 'cli.flagValue' });
  assert.equal(parseArguments(['--help']).help, true);
  assert.equal(parseArguments(['-h']).help, true);
  assert.deepEqual(parseArguments([]).paths, []);
});

test('language selection respects separator and S3 requires an explicit CLI flag', () => {
  assert.equal(detectLanguage(['--quality', '0', '--language=en'], 'ja'), 'en');
  assert.equal(detectLanguage(['--', '--language', 'en'], 'ja'), 'ja');
  assert.equal(parseArguments(['--s3', '--language', 'en']).options.s3, true);
  assert.equal(parseArguments([], { s3: true }).options.s3, false);
});

test('percentage and dimension flags switch explicitly between the two resize modes', () => {
  const percentage = parseArguments(['--resize-percent', '50'], { resizeEnabled: false, width: 2000, height: 1000 });
  assert.equal(percentage.options.resizeEnabled, true);
  assert.equal(percentage.options.resizeMode, 'percent');
  assert.equal(percentage.options.resizePercent, 50);
  const dimensions = parseArguments(['--resize', 'cover', '--width', '600', '--height', '400'], { resizeMode: 'percent', resizePercent: 25 });
  assert.equal(dimensions.options.resizeMode, 'dimensions');
  assert.equal(dimensions.options.resizeMethod, 'cover');
  assert.equal(dimensions.options.width, 600);
  assert.equal(dimensions.options.height, 400);
  assert.equal(parseArguments(['--resize', 'fit', '--resize-percent=25']).options.resizeMode, 'percent');
  assert.equal(parseArguments(['--resize-percent', '50', '--no-resize']).options.resizeEnabled, false);
  for (const percent of ['0', '101', '50.5', 'invalid']) {
    assert.throws(() => parseArguments(['--resize-percent', percent]), { message: 'error.resizePercent' });
  }
});
