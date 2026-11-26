import { mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build as esbuild } from 'esbuild';
import { build as viteBuild } from 'vite';
import sharp from 'sharp';
import { collectBundledLicenses } from './packaging/licenses';

const root = fileURLToPath(new URL('../', import.meta.url));

export async function buildSources(): Promise<void> {
  await rm(path.join(root, 'build'), { recursive: true, force: true });
  const [nodeBuild] = await Promise.all([
    esbuild({
      absWorkingDir: root,
      entryPoints: {
        'main/index': 'src/main/index.ts',
        'preload/index': 'src/preload/index.ts',
        'cli/index': 'src/cli/index.ts',
      },
      outdir: path.join(root, 'build'),
      outExtension: { '.js': '.cjs' },
      platform: 'node',
      target: 'node24.22',
      format: 'cjs',
      bundle: true,
      external: ['electron', 'sharp', 'chokidar', 'koffi'],
      minify: true,
      legalComments: 'eof',
      metafile: true,
      sourcemap: false,
      logLevel: 'info',
    }),
    viteBuild({ configFile: path.join(root, 'vite.config.ts') }),
  ]);
  const trayDirectory = path.join(root, 'build/assets');
  await mkdir(trayDirectory, { recursive: true });
  const dinosaur = await sharp(path.join(root, 'src/renderer/assets/dino.png')).trim({ threshold: 16 }).toBuffer();
  for (const [name, size] of [['tray.png', 18], ['tray@2x.png', 36]] as const) {
    await sharp(dinosaur).resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png()
      .toFile(path.join(trayDirectory, name));
  }
  await collectBundledLicenses({
    root,
    metafile: nodeBuild.metafile,
    rendererLicenseFile: path.join(root, 'build/renderer/licenses.json'),
    outputDirectory: path.join(root, 'build/licenses'),
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  buildSources().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
