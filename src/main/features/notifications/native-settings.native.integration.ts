import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { APP_ID, APP_NAME } from '../../../shared/app.ts';

const run = promisify(execFile);
const base = process.env.TINY_ASSETS_NATIVE_SETTINGS_BASE;

test('signed macOS app reads UN settings without requesting permission and keeps native callbacks bounded', {
  skip: process.platform !== 'darwin' || !base,
  timeout: 60000,
}, async t => {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'tiny-assets-native-settings-'));
  const qaApp = path.join(temporary, 'Tiny Assets Native Settings QA.app');
  const resources = path.join(qaApp, 'Contents/Resources/app');
  const output = path.join(temporary, 'result.json');
  const registration = '/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister';
  t.after(async () => {
    await run(registration, ['-u', qaApp]).catch(() => {});
    await fs.rm(temporary, { recursive: true, force: true });
    const official = '/Applications/Tiny Assets.app';
    const id = await run('/usr/libexec/PlistBuddy', ['-c', 'Print :CFBundleIdentifier', path.join(official, 'Contents/Info.plist')]).then(result => result.stdout.trim(), () => null);
    if (id === APP_ID) await run(registration, ['-f', official]);
  });
  assert.ok(base && path.isAbsolute(base), 'explicit temporary base bundle is required');
  assert.notEqual(path.resolve(base), '/Applications/Tiny Assets.app', 'do not use the installed app as mutable test input');
  const id = await run('/usr/libexec/PlistBuddy', ['-c', 'Print :CFBundleIdentifier', path.join(base, 'Contents/Info.plist')]);
  assert.equal(id.stdout.trim(), APP_ID);
  await fs.cp(base, qaApp, { recursive: true, verbatimSymlinks: true, mode: constants.COPYFILE_FICLONE });
  const plist = path.join(qaApp, 'Contents/Info.plist');
  // Electron derives helper bundle paths from CFBundleName, so preserve it.
  for (const [key, value] of [['CFBundleIdentifier', `${APP_ID}.native-settings-qa`], ['CFBundleDisplayName', 'Tiny Assets Native Settings QA']] as const) {
    await run('/usr/libexec/PlistBuddy', ['-c', `Set :${key} ${value}`, plist])
      .catch(() => run('/usr/libexec/PlistBuddy', ['-c', `Add :${key} string ${value}`, plist]));
  }
  const isolatedId = await run('/usr/libexec/PlistBuddy', ['-c', 'Print :CFBundleIdentifier', plist]);
  assert.equal(isolatedId.stdout.trim(), `${APP_ID}.native-settings-qa`);
  const metadataFile = path.join(resources, 'package.json');
  const metadata = JSON.parse(await fs.readFile(metadataFile, 'utf8')) as Record<string, unknown>;
  await fs.writeFile(metadataFile, JSON.stringify({ ...metadata, main: '__native-settings.cjs' }));
  const source = fileURLToPath(new URL('./native-settings.ts', import.meta.url));
  await build({
    stdin: { contents: `
      import { app } from 'electron';
      import fs from 'node:fs';
      import path from 'node:path';
      import assert from 'node:assert/strict';
      import koffi from 'koffi';
      import { readNotificationSettings } from ${JSON.stringify(source)};
      const root = ${JSON.stringify(temporary)};
      const resultFile = ${JSON.stringify(output)};
      fs.writeFileSync(resultFile, JSON.stringify({ stage: 'entry' }));
      fs.mkdirSync(path.join(root, 'app-data'), { recursive: true });
      app.setPath('appData', path.join(root, 'app-data'));
      fs.mkdirSync(path.join(root, 'profile'), { recursive: true });
      app.setPath('userData', path.join(root, 'profile'));
      app.setName('Tiny Assets Native Settings QA');
      app.whenReady().then(async () => {
        try {
          fs.writeFileSync(resultFile, JSON.stringify({ stage: 'ready' }));
          const initialCallbacks = koffi.stats().callbacks;
          assert.equal(typeof global.gc, 'function', 'native stress test requires exposed GC');
          const first = await readNotificationSettings();
          const warmCallbacks = koffi.stats().callbacks;
          for (let i = 0; i < 12; i++) { global.gc(); await readNotificationSettings(); global.gc(); }
          const active = Array.from({ length: 12 }, () => readNotificationSettings());
          global.gc();
          const concurrent = await Promise.all(active);
          assert.equal(warmCallbacks - initialCallbacks, 1);
          assert.equal(koffi.stats().callbacks, warmCallbacks);
          assert.ok(concurrent.every(value => value.authorization === first.authorization));
          fs.writeFileSync(resultFile, JSON.stringify({ ok: true, first, callbacks: warmCallbacks - initialCallbacks, queries: 25 }));
          app.exit(0);
        } catch (error) {
          fs.writeFileSync(resultFile, JSON.stringify({ ok: false, error: String(error) }));
          app.exit(1);
        }
      });
    `, resolveDir: resources, loader: 'ts' },
    bundle: true, minify: true, platform: 'node', format: 'cjs', target: 'node24.22', external: ['electron', 'koffi'],
    outfile: path.join(resources, '__native-settings.cjs'),
  });
  await run('/usr/bin/codesign', ['--force', '--deep', '--sign', '-', qaApp]);
  const signature = await run('/usr/bin/codesign', ['--display', '--verbose=2', qaApp]);
  assert.equal(/^Identifier=(.+)$/m.exec(signature.stderr)?.[1], `${APP_ID}.native-settings-qa`);
  await run('/usr/bin/codesign', ['--verify', '--deep', '--strict', qaApp]);
  await run(path.join(qaApp, 'Contents/MacOS', APP_NAME), ['--js-flags=--expose-gc'], {
    timeout: 30000, env: { ...process.env, ELECTRON_RUN_AS_NODE: undefined },
  }).catch(async error => {
    const state = await fs.readFile(output, 'utf8').catch(() => 'entry did not execute');
    throw new Error(`Native QA failed (${state}): ${String(error)}`);
  });
  const result = JSON.parse(await fs.readFile(output, 'utf8')) as { ok: boolean; first: Record<string, string>; callbacks: number; queries: number };
  assert.equal(result.ok, true);
  assert.equal(result.callbacks, 1);
  assert.equal(result.queries, 25);
  assert.ok(['notDetermined', 'denied', 'authorized', 'provisional', 'ephemeral', 'unknown'].includes(result.first.authorization));
  assert.ok(['none', 'banner', 'alert', 'unknown'].includes(result.first.alertStyle));
  for (const key of ['alert', 'notificationCenter', 'sound']) assert.ok(['enabled', 'disabled', 'notSupported', 'unknown'].includes(result.first[key]));
  t.diagnostic(JSON.stringify(result));
});
