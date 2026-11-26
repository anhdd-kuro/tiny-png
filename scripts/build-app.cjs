const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

async function main() {
  if (process.platform !== 'darwin') throw new Error('Build app macOS trên máy macOS.');
  const root = path.resolve(__dirname, '..');
  const output = path.join(root, 'dist');
  const icon = path.join(__dirname, 'resources', 'AppIcon.icns');
  process.env.ELECTRON_CACHE ||= path.join(os.tmpdir(), 'tinypng-electron-cache');
  const { packager } = await import('@electron/packager');
  const iconExists = await fs.access(icon).then(() => true, () => false);
  const paths = await packager({
    dir: root,
    out: output,
    name: 'Tiny PNG',
    platform: 'darwin',
    arch: process.arch,
    electronVersion: require('electron/package.json').version,
    download: { cacheRoot: process.env.ELECTRON_CACHE },
    overwrite: true,
    asar: false,
    prune: true,
    appBundleId: 'dev.kuro.tinypng',
    appCategoryType: 'public.app-category.photography',
    ...(iconExists ? { icon } : {}),
    // Keep production node_modules, including sharp's optional native libraries.
    ignore: [
      /^\/(?:\.git|\.github|\.build|\.codex|\.agents|\.aws|dist|test|tests|research_notes|reports|scripts|temp)(?:\/|$)/,
      /^\/(?:AGENTS\.md|README\.md|\.DS_Store|.*\.log)$/,
    ],
  });
  if (paths.length !== 1) throw new Error('Packager không trả về đúng một app macOS.');
  const packagedApp = path.join(paths[0], 'Tiny PNG.app');
  const app = path.join(output, 'Tiny PNG.app');
  await fs.access(path.join(packagedApp, 'Contents', 'MacOS', 'Tiny PNG'));
  await fs.rm(app, { recursive: true, force: true });
  await fs.rename(packagedApp, app);
  for (const args of [
    ['--force', '--deep', '--sign', '-', app],
    ['--verify', '--deep', '--strict', app],
  ]) {
    const result = spawnSync('codesign', args, { stdio: 'inherit' });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(`codesign thất bại (${result.status}).`);
  }
  console.log(`App offline: ${app}`);
  console.log(`Kiến trúc: ${process.arch}; ad-hoc signed, chưa notarize.`);
}

main().catch(error => {
  console.error(`Build thất bại: ${error.message}`);
  process.exitCode = 1;
});
