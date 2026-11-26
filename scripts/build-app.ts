import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { packager } from '@electron/packager';
import sharp from 'sharp';
import { buildSources } from './build.ts';
import { APP_ID, APP_NAME } from '../src/shared/app';
import { pruneDevelopmentFiles } from './packaging/prune.ts';
import { pruneMacLocales } from './packaging/locales.ts';

const root = fileURLToPath(new URL('../', import.meta.url));

function run(command: string, args: string[], env = process.env): void {
  const result = spawnSync(command, args, { stdio: 'inherit', env });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} thất bại (${result.signal ?? result.status}).`);
}

async function buildIcon(): Promise<string> {
  const source = path.join(root, 'src/renderer/assets/dino.png');
  if (!await fs.access(source).then(() => true, () => false)) throw new Error(`Thiếu artwork dino.png cho ${APP_NAME}.`);
  const representations = [
    ['icp4', 16], ['ic11', 32], ['icp5', 32], ['ic12', 64], ['ic07', 128],
    ['ic13', 256], ['ic08', 256], ['ic14', 512], ['ic09', 512], ['ic10', 1024],
  ] as const;
  const chunks = await Promise.all(representations.map(async ([type, size]) => {
    const png = await sharp(source).resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).ensureAlpha().png().toBuffer();
    const header = Buffer.alloc(8);
    header.write(type, 0, 4, 'ascii');
    header.writeUInt32BE(png.length + 8, 4);
    return Buffer.concat([header, png]);
  }));
  const header = Buffer.alloc(8);
  header.write('icns', 0, 4, 'ascii');
  header.writeUInt32BE(8 + chunks.reduce((total, chunk) => total + chunk.length, 0), 4);
  const destination = path.join(root, 'scripts/resources/AppIcon.icns');
  await fs.writeFile(destination, Buffer.concat([header, ...chunks]));
  return destination;
}

async function main(): Promise<void> {
  if (process.platform !== 'darwin') throw new Error('Build app macOS trên máy macOS.');
  const architecture = process.arch;
  if (architecture !== 'arm64' && architecture !== 'x64') throw new Error(`Kiến trúc không được hỗ trợ: ${architecture}.`);
  await buildSources();
  const output = path.join(root, 'dist');
  const icon = await buildIcon();
  const electronMetadata = JSON.parse(await fs.readFile(path.join(root, 'node_modules/electron/package.json'), 'utf8')) as { version: string };
  const paths = await packager({
    dir: root,
    out: output,
    name: APP_NAME,
    platform: 'darwin',
    arch: architecture,
    electronVersion: electronMetadata.version,
    download: { cacheRoot: process.env.ELECTRON_CACHE ?? path.join(os.tmpdir(), 'tinypng-electron-cache') },
    overwrite: true,
    asar: false,
    prune: true,
    derefSymlinks: true,
    appBundleId: APP_ID,
    appCategoryType: 'public.app-category.photography',
    extendInfo: { CFBundleDevelopmentRegion: 'en', CFBundleLocalizations: ['en', 'en-GB', 'ja', 'vi'] },
    icon,
    ignore: [
      /^\/(?:\.git|\.github|\.build|\.codex|\.agents|\.aws|\.pnpm-store|dist|src|test|tests|research_notes|reports|scripts|tmp|temp)(?:\/|$)/,
      /^\/(?:AGENTS\.md|README\.md|\.DS_Store|.*\.log|tsconfig\.json|(?:vite|eslint)\.config\.ts|pnpm-lock\.yaml|pnpm-workspace\.yaml|\.node-version|\.nvmrc|\.npmrc)$/,
      /\.(?:test|spec)\.[cm]?[jt]sx?$/,
    ],
  });
  if (paths.length !== 1 || !paths[0]) throw new Error('Packager không trả về đúng một app macOS.');
  const packagedApp = path.join(paths[0], `${APP_NAME}.app`);
  const app = path.join(output, `${APP_NAME}.app`);
  await fs.rm(app, { recursive: true, force: true });
  await fs.rename(packagedApp, app);
  const resources = path.join(app, 'Contents/Resources/app');
  const development = await pruneDevelopmentFiles(path.join(resources, 'node_modules'));
  const locales = await pruneMacLocales(app);
  for (const file of ['build/assets/tray.png', 'build/assets/tray@2x.png', 'build/main/index.cjs', 'build/preload/index.cjs', 'build/cli/index.cjs', 'build/renderer/index.html', 'build/renderer/features/corner-drop/index.html', 'build/renderer/features/settings/index.html', 'build/licenses/manifest.json', 'build/renderer/licenses.json']) {
    await fs.access(path.join(resources, file));
  }
  const executable = path.join(app, 'Contents/MacOS', APP_NAME);
  const nativeSmoke = `
    const assert = require('node:assert/strict');
    const path = require('node:path');
    const appRequire = require('node:module').createRequire(process.argv[1]);
    const packagedModules = path.join(path.dirname(process.argv[1]), 'node_modules') + path.sep;
    const expected = ['sharp', 'koffi', 'chokidar', '@img/sharp-' + process.platform + '-' + process.arch + '/sharp.node',
      '@img/sharp-libvips-' + process.platform + '-' + process.arch + '/binary', '@koromix/koffi-' + process.platform + '-' + process.arch];
    for (const name of expected) assert.ok(appRequire.resolve(name).startsWith(packagedModules), 'Dependency escaped packaged node_modules: ' + name);
    const sharp = appRequire('sharp');
    const koffi = appRequire('koffi');
    if (!sharp.versions.vips || typeof koffi.load !== 'function') throw new Error('Missing native dependencies');
    (async () => {
      for (const format of ['png', 'jpeg', 'webp', 'avif']) {
        const encoded = await sharp({ create: { width: 16, height: 12, channels: 3, background: '#348cab' } }).toFormat(format).toBuffer();
        const decoded = await sharp(encoded).raw().toBuffer({ resolveWithObject: true });
        assert.equal(decoded.info.width, 16); assert.equal(decoded.info.height, 12);
        assert.ok(decoded.data.length > 0, 'Image codec failed: ' + format);
      }
      const library = koffi.load('/usr/lib/libSystem.B.dylib');
      try { assert.equal(library.func('getpid', 'int', [])(), process.pid); }
      finally { library.unload(); }
      const chokidar = await import(require('node:url').pathToFileURL(appRequire.resolve('chokidar')).href);
      assert.equal(typeof chokidar.watch, 'function');
      console.log('Packaged PNG/JPEG/WebP/AVIF codecs, native Koffi call and chokidar passed; Electron Node ' + process.versions.node);
    })().catch(error => { console.error(error); process.exitCode = 1; });
  `;
  run(executable, ['-e', nativeSmoke, path.join(resources, 'package.json')], { ...process.env, ELECTRON_RUN_AS_NODE: '1' });
  run('codesign', ['--force', '--deep', '--sign', '-', app]);
  run('codesign', ['--verify', '--deep', '--strict', app]);
  console.log(`App offline: ${app}`);
  console.log(`Pruned: ${development.removedFiles} development files (${development.removedBytes} bytes), ${locales.removedLocales} locales (${locales.removedBytes} bytes).`);
  console.log(`Kiến trúc: ${architecture}; ad-hoc signed, chưa notarize.`);
}

main().catch((error: unknown) => {
  console.error(`Build thất bại: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
