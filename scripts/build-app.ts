import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { packager } from '@electron/packager';
import sharp from 'sharp';
import { buildSources } from './build.ts';
import { APP_ID, APP_NAME } from '../src/shared/app';

const root = fileURLToPath(new URL('../', import.meta.url));

function run(command: string, args: string[], env = process.env): void {
  const result = spawnSync(command, args, { stdio: 'inherit', env });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} thất bại (${result.signal ?? result.status}).`);
}

async function buildIcon(): Promise<string> {
  const source = path.join(root, 'src/renderer/assets/dino.png');
  if (!await fs.access(source).then(() => true, () => false)) throw new Error('Thiếu artwork dino.png cho tiny assets.');
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
  for (const file of ['build/main/index.cjs', 'build/preload/index.cjs', 'build/cli/index.cjs', 'build/renderer/index.html', 'build/renderer/features/corner-drop/index.html']) {
    await fs.access(path.join(resources, file));
  }
  const executable = path.join(app, 'Contents/MacOS', APP_NAME);
  const nativeSmoke = `
    const appRequire = require('node:module').createRequire(process.argv[1]);
    const sharp = appRequire('sharp');
    const koffi = appRequire('koffi');
    if (!sharp.versions.vips || typeof koffi.load !== 'function') throw new Error('Missing native dependencies');
    import(require('node:url').pathToFileURL(appRequire.resolve('chokidar')).href)
      .then(() => console.log('Packaged sharp/libvips, koffi and chokidar loaded; Electron Node ' + process.versions.node))
      .catch(error => { console.error(error); process.exitCode = 1; });
  `;
  run(executable, ['-e', nativeSmoke, path.join(resources, 'package.json')], { ...process.env, ELECTRON_RUN_AS_NODE: '1' });
  run('codesign', ['--force', '--deep', '--sign', '-', app]);
  run('codesign', ['--verify', '--deep', '--strict', app]);
  console.log(`App offline: ${app}`);
  console.log(`Kiến trúc: ${architecture}; ad-hoc signed, chưa notarize.`);
}

main().catch((error: unknown) => {
  console.error(`Build thất bại: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
