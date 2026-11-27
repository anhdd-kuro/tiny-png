import fs from 'node:fs/promises';
import path from 'node:path';
import { constants } from 'node:fs';
import { createRequire } from 'node:module';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { build } from 'esbuild';
import { APP_ID, APP_NAME } from '../../src/shared/app';

const run = promisify(execFile);
const registration = '/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister';

export async function prepareQAApplication(root: string, runtime: string, version: string) {
  const packaged = process.env.TINY_ASSETS_QA_PACKAGED === '1';
  const qaBundle = path.join(runtime, 'Tiny Assets QA.app');
  const applicationRoot = packaged ? path.join(qaBundle, 'Contents/Resources/app') : runtime;
  const entry = packaged ? '__qa.cjs' : 'entry.cjs';
  const cleanup = async () => {
    if (!packaged) return;
    await run(registration, ['-u', qaBundle]).catch(() => {});
    await fs.rm(qaBundle, { recursive: true, force: true });
    const official = '/Applications/Tiny Assets.app';
    const id = await run('/usr/libexec/PlistBuddy', ['-c', 'Print :CFBundleIdentifier', path.join(official, 'Contents/Info.plist')]).then(result => result.stdout.trim(), () => null);
    if (id === APP_ID) await run(registration, ['-f', official]);
  };
  try {
    if (packaged) {
      await fs.rm(qaBundle, { recursive: true, force: true });
      await fs.cp(path.join(root, 'dist', `${APP_NAME}.app`), qaBundle, { recursive: true, verbatimSymlinks: true, mode: constants.COPYFILE_FICLONE });
      const plist = path.join(qaBundle, 'Contents/Info.plist');
      // Electron derives helper bundle paths from CFBundleName, so preserve it.
      for (const [key, value] of [['CFBundleIdentifier', `${APP_ID}.qa`], ['CFBundleDisplayName', 'Tiny Assets QA']] as const) {
        await run('/usr/libexec/PlistBuddy', ['-c', `Set :${key} ${value}`, plist])
          .catch(() => run('/usr/libexec/PlistBuddy', ['-c', `Add :${key} string ${value}`, plist]));
      }
      const identity = await run('/usr/libexec/PlistBuddy', ['-c', 'Print :CFBundleIdentifier', plist]);
      if (identity.stdout.trim() !== `${APP_ID}.qa`) throw new Error('Packaged QA must have its own bundle identifier.');
      const metadataFile = path.join(applicationRoot, 'package.json');
      const metadata = JSON.parse(await fs.readFile(metadataFile, 'utf8')) as Record<string, unknown>;
      await fs.writeFile(metadataFile, JSON.stringify({ ...metadata, main: entry }));
    } else {
      await fs.writeFile(path.join(runtime, 'package.json'), JSON.stringify({ name: 'tiny-assets-qa', version, main: entry }));
    }
    await build({ entryPoints: [path.join(root, 'scripts/qa-launch.ts')], bundle: true, platform: 'node', format: 'cjs', target: 'node24.22', external: ['electron'], outfile: path.join(applicationRoot, entry) });
    if (packaged) {
      await run('/usr/bin/codesign', ['--force', '--deep', '--sign', '-', qaBundle]);
      const signature = await run('/usr/bin/codesign', ['--display', '--verbose=2', qaBundle]);
      if (/^Identifier=(.+)$/m.exec(signature.stderr)?.[1] !== `${APP_ID}.qa`) throw new Error('QA code signing identity must differ from the production app.');
    }
    return {
      executablePath: packaged ? path.join(qaBundle, 'Contents/MacOS', APP_NAME) : process.env.TINY_ASSETS_ELECTRON_EXECUTABLE ?? createRequire(import.meta.url)('electron') as string,
      args: packaged ? [] : [runtime],
      cleanup,
    };
  } catch (error) {
    await cleanup();
    throw error;
  }
}
