import { rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build as esbuild } from 'esbuild';
import { build as viteBuild } from 'vite';
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
