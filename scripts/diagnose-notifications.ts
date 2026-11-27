import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { build } from 'esbuild';
import { _electron as electron } from 'playwright';
import { APP_ID, APP_NAME } from '../src/shared/app';
import type { NotificationSystemSettings } from '../src/shared/notifications';

const root = fileURLToPath(new URL('../', import.meta.url));
const run = promisify(execFile);
const bundle = '/Applications/Tiny Assets.app';
const executable = path.join(bundle, 'Contents/MacOS', APP_NAME);
const id = await run('/usr/libexec/PlistBuddy', ['-c', 'Print :CFBundleIdentifier', path.join(bundle, 'Contents/Info.plist')]);
if (id.stdout.trim() !== APP_ID) throw new Error('Installed bundle does not match Tiny Assets.');
const running = await run('/usr/bin/pgrep', ['-f', '^' + executable.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$']).then(() => true, () => false);
if (running) throw new Error('Quit the installed Tiny Assets before running this diagnostic.');
await run('/usr/bin/codesign', ['--verify', '--deep', '--strict', bundle]);
const moduleFile = path.join(root, 'build/diagnostics/native-settings.cjs');
await build({ entryPoints: [path.join(root, 'src/main/features/notifications/native-settings.ts')], bundle: true, platform: 'node', format: 'cjs',
  target: 'node24.22', minify: true, external: ['koffi'], outfile: moduleFile });
const outputDirectory = path.join(root, 'tmp/official-notification-diagnostics');
await fs.mkdir(outputDirectory, { recursive: true, mode: 0o700 });
const diagnosticEnv = Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => typeof entry[1] === 'string'));
delete diagnosticEnv.ELECTRON_RUN_AS_NODE;
diagnosticEnv.ELECTRON_DEBUG_NOTIFICATIONS = '1';
diagnosticEnv.ELECTRON_ENABLE_LOGGING = '1';
const app = await electron.launch({ executablePath: executable, args: [], cwd: root, timeout: 25000, chromiumSandbox: true,
  env: diagnosticEnv });
let nativeOutput = '';
const append = (chunk: Buffer) => { nativeOutput = (nativeOutput + chunk.toString()).slice(-256000); };
app.process().stderr?.on('data', append);
app.process().stdout?.on('data', append);
try {
  const windowDeadline = Date.now() + 25000;
  let main = app.windows().find(page => page.url().endsWith('/build/renderer/index.html'));
  while (!main && Date.now() < windowDeadline) {
    await new Promise(resolve => setTimeout(resolve, 100));
    main = app.windows().find(page => page.url().endsWith('/build/renderer/index.html'));
  }
  if (!main) throw new Error('Official main window did not load.');
  const runtime = await app.evaluate(({ app }) => ({ version: app.getVersion(), executable: app.getPath('exe'), applicationRoot: app.getAppPath() }));
  if (runtime.executable !== executable || runtime.applicationRoot !== path.join(bundle, 'Contents/Resources/app')) throw new Error('Diagnostic did not launch the official bundle.');
  const state = await main.evaluate(() => window.tinyPNG.getState());
  if (!state.settings.notificationsEnabled) throw new Error('Notifications are disabled in Tiny Assets settings; no preference was changed.');
  await app.evaluate(({ Notification }) => {
    const events: Array<{ action: string; id: string; error?: string }> = [];
    (globalThis as unknown as { tinyAssetsDiagnosticEvents: typeof events }).tinyAssetsDiagnosticEvents = events;
    const show = Notification.prototype.show;
    Notification.prototype.show = function () {
      const id = this.id;
      events.push({ action: 'request', id });
      this.once('show', () => { events.push({ action: 'accepted', id }); });
      this.once('failed', (_event, error) => { events.push({ action: 'failed', id, error }); });
      return show.call(this);
    };
  });
  await main.evaluate(() => window.tinyPNG.openSettings('automation'));
  const settingsWindow = app.windows().find(page => page.url().includes('/features/settings/index.html')) ??
    await app.waitForEvent('window');
  await settingsWindow.waitForURL('**/features/settings/index.html*');
  await settingsWindow.getByRole('button', { name: state.translations['notifications.test'], exact: true }).click();
  const request = await app.evaluate(() => (globalThis as unknown as { tinyAssetsDiagnosticEvents: Array<{ action: string; id: string; error?: string }> }).tinyAssetsDiagnosticEvents[0]);
  if (!request) throw new Error('Notification request was not observed.');
  const settings = await app.evaluate((_electron, source) => {
    const load = process.getBuiltinModule('module').createRequire(source);
    const reader = load(source) as { readNotificationSettings(): Promise<NotificationSystemSettings> };
    return reader.readNotificationSettings();
  }, moduleFile);
  const deadline = Date.now() + 7000;
  let deliveredIds: string[] = [];
  while (Date.now() < deadline) {
    deliveredIds = await app.evaluate(({ Notification }) => Notification.getHistory().then(items => items.map(item => item.id)));
    if (deliveredIds.includes(request.id)) break;
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  const signature = await run('/usr/bin/codesign', ['-dr', '-', bundle]);
  const report = { version: runtime.version, executable: runtime.executable, settings,
    newNotificationInCenter: deliveredIds.includes(request.id),
    events: await app.evaluate(() => (globalThis as unknown as { tinyAssetsDiagnosticEvents: Array<{ action: string; id: string; error?: string }> }).tinyAssetsDiagnosticEvents),
    requirement: (signature.stderr + signature.stdout).split('\n').find(line => line.includes('designated =>')) ?? null,
    nativeLogs: nativeOutput.split('\n').filter(line => /notification/i.test(line)).slice(-50) };
  await fs.writeFile(path.join(outputDirectory, 'result.json'), JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
  console.log(JSON.stringify(report, null, 2));
  await new Promise(resolve => setTimeout(resolve, 10000));
} catch (error) {
  await fs.writeFile(path.join(outputDirectory, 'failure.json'), JSON.stringify({ error: String(error),
    nativeLogs: nativeOutput.split('\n').filter(line => /notification/i.test(line)).slice(-50) }, null, 2), { mode: 0o600 });
  throw error;
} finally {
  try { await app.close(); } finally { await run('/usr/bin/open', [bundle]); }
}
