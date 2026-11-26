import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import sharp from 'sharp';
import { _electron as electron, type Page } from 'playwright';
import { DEFAULT_SETTINGS } from '../src/main/features/settings/store';
import { APP_NAME } from '../src/shared/app';

const root = fileURLToPath(new URL('../', import.meta.url));
const qaRoot = path.join(root, 'tmp/ui-qa');
const artifacts = process.env.TINY_ASSETS_QA_OUTPUT ? path.resolve(process.env.TINY_ASSETS_QA_OUTPUT) : path.join(qaRoot, 'screenshots');
const runtime = path.join(qaRoot, 'runtime');
await fs.mkdir(artifacts, { recursive: true });
await fs.mkdir(runtime, { recursive: true });
const qaProfile = path.join(qaRoot, 'qa-app-data/Tiny PNG');
await fs.mkdir(qaProfile, { recursive: true });
await fs.writeFile(path.join(qaProfile, 'settings.json'), JSON.stringify({ ...DEFAULT_SETTINGS, notificationsEnabled: false, cornerEnabled: false, watchEnabled: false, watchPath: null, s3Enabled: false, overwrite: false }));
const metadata = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8')) as { version: string };
await fs.writeFile(path.join(runtime, 'package.json'), JSON.stringify({ name: 'tiny-assets-qa', version: metadata.version, main: 'entry.cjs' }));
await build({ entryPoints: [path.join(root, 'scripts/qa-launch.ts')], bundle: true, platform: 'node', format: 'cjs', target: 'node24.22', external: ['electron'], outfile: path.join(runtime, 'entry.cjs') });
const app = await electron.launch({
  executablePath: process.env.TINY_ASSETS_ELECTRON_EXECUTABLE ?? createRequire(import.meta.url)('electron') as string,
  args: [runtime], cwd: root, timeout: 25_000, chromiumSandbox: true, colorScheme: null,
  env: { ...process.env, TINY_ASSETS_QA_THEME: 'light' },
  recordVideo: process.env.TINY_ASSETS_QA_VIDEO === '1' ? { dir: path.join(artifacts, 'videos'), size: { width: 760, height: 680 } } : undefined,
});
const errors: string[] = [];
app.on('window', page => page.on('pageerror', error => errors.push(error.message)));
async function findWindow(suffix: string): Promise<Page> {
  return app.windows().find(page => page.url().includes(suffix)) ?? app.waitForEvent('window', { predicate: page => page.url().includes(suffix), timeout: 20_000 });
}
async function capture(page: Page, name: string) {
  await page.screenshot({ path: path.join(artifacts, `${name}.png`), scale: 'device' });
  console.log(`Captured ${name}`);
}
async function waitForState(page: Page, predicate: (state: Awaited<ReturnType<Window['tinyPNG']['getState']>>) => boolean) {
  const deadline = Date.now() + 25_000;
  while (Date.now() < deadline) {
    const state = await page.evaluate(() => window.tinyPNG.getState());
    if (predicate(state)) return state;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error('App state did not settle');
}
try {
  const main = await findWindow('/renderer/index.html');
  await main.getByRole('heading', { name: APP_NAME, exact: true }).waitFor();
  await main.waitForFunction(() => !!window.tinyPNG);
  const state = await main.evaluate(() => window.tinyPNG.getState());
  if (state.settings.s3Enabled || state.settings.watchEnabled) throw new Error('QA profile must stay local and isolated.');
  console.log(JSON.stringify({ pid: app.process().pid, profile: await app.evaluate(({ app }) => app.getPath('userData')), version: metadata.version }));
  await capture(main, 'main-empty-vi-light');
  await main.getByRole('button', { name: state.translations['settings.heading'], exact: true }).click();
  const settings = await findWindow('/features/settings/index.html');
  await settings.getByRole('radio', { name: state.translations['settings.qualityBalanced'], exact: true }).waitFor();
  await capture(settings, 'settings-images-vi-light');
  const settingsWindow = await app.browserWindow(settings);
  console.log('Settings native', JSON.stringify(await settingsWindow.evaluate(window => ({ title: window.getTitle(), minimizable: window.isMinimizable(), maximizable: window.isMaximizable(), bounds: window.getBounds() }))));
  for (const language of ['en', 'ja'] as const) {
    const next = await main.evaluate(language => window.tinyPNG.updateSettings({ language }), language);
    await settings.getByRole('radio', { name: next.translations['settings.qualityBalanced'], exact: true }).waitFor();
    await capture(settings, `settings-images-${language}-light`);
    await capture(main, `main-empty-${language}-light`);
  }
  await main.evaluate(() => window.tinyPNG.updateSettings({ language: 'vi', glassEnabled: true }));
  await settings.waitForFunction(() => getComputedStyle(document.querySelector('#root > div')!).backgroundColor === 'rgba(0, 0, 0, 0)');
  await capture(settings, 'settings-images-vi-glass-light');
  await app.evaluate(({ nativeTheme }) => { nativeTheme.themeSource = 'dark'; });
  await settings.emulateMedia({ colorScheme: 'dark' });
  await capture(settings, 'settings-images-vi-glass-dark');
  await main.evaluate(() => window.tinyPNG.updateSettings({ glassEnabled: false }));
  await capture(settings, 'settings-images-vi-dark');
  const general = (await main.evaluate(() => window.tinyPNG.getState())).translations['settings.general'];
  await settings.getByRole('button', { name: general, exact: true }).click();
  await capture(settings, 'settings-general-vi-dark');
  const translations = (await main.evaluate(() => window.tinyPNG.getState())).translations;
  const opacity = settings.getByRole('slider', { name: translations['settings.glassOpacity'], exact: true });
  assert(await opacity.isDisabled());
  await settings.getByRole('radio', { name: translations['settings.background.solid'], exact: true }).click();
  await waitForState(main, state => state.settings.backgroundStyle === 'solid');
  await capture(main, 'main-solid-vi');
  await settings.getByRole('switch', { name: translations['settings.glass'], exact: true }).click();
  await waitForState(main, state => state.settings.glassEnabled);
  await settings.waitForFunction(() => !document.querySelector<HTMLInputElement>('input[type="range"]')!.disabled);
  await opacity.press('Home');
  await waitForState(main, state => state.settings.glassEnabled && state.settings.glassOpacity === 20);
  await capture(settings, 'settings-general-glass-20-vi-dark');
  await capture(main, 'main-solid-glass-20-vi');
  await opacity.press('End');
  await waitForState(main, state => state.settings.glassOpacity === 100);
  await capture(settings, 'settings-general-glass-100-vi-dark');
  await capture(main, 'main-solid-glass-100-vi');
  await opacity.press('ArrowLeft');
  await waitForState(main, state => state.settings.glassOpacity === 99);
  await settings.getByRole('radio', { name: translations['settings.background.gradient'], exact: true }).click();
  await waitForState(main, state => state.settings.backgroundStyle === 'gradient');
  for (const language of ['en', 'ja'] as const) {
    const next = await main.evaluate(language => window.tinyPNG.updateSettings({ language }), language);
    await settings.getByRole('slider', { name: next.translations['settings.glassOpacity'], exact: true }).waitFor();
    await capture(settings, `settings-general-${language}-dark`);
  }
  await main.evaluate(() => window.tinyPNG.updateSettings({ language: 'vi', glassEnabled: false, glassOpacity: 70 }));
  const automation = (await main.evaluate(() => window.tinyPNG.getState())).translations['settings.automation'];
  await settings.getByRole('button', { name: automation, exact: true }).click();
  await capture(settings, 'settings-automation-vi-dark');
  const cloud = (await main.evaluate(() => window.tinyPNG.getState())).translations['s3.heading'];
  await settings.getByRole('button', { name: cloud, exact: true }).click();
  await capture(settings, 'settings-s3-vi-dark');
  await settingsWindow.evaluate(window => {
    window.webContents.focus();
    window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' });
    window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Escape' });
  });
  assert(!(await settingsWindow.evaluate(window => window.isVisible())));
  await main.getByRole('button', { name: translations['settings.heading'], exact: true }).click();
  await settings.getByRole('region', { name: cloud, exact: true }).waitFor();
  await settings.getByRole('button', { name: translations['settings.images'], exact: true }).click();
  await settings.getByRole('switch', { name: translations['settings.resize'], exact: true }).click();
  await capture(settings, 'settings-resize-dimensions-vi-dark');
  await settings.getByRole('radio', { name: translations['settings.resizePercentMode'], exact: true }).click();
  await capture(settings, 'settings-resize-percent-vi-dark');
  await main.evaluate(() => window.tinyPNG.updateSettings({ resizeEnabled: false }));
  const japanese = await main.evaluate(() => window.tinyPNG.updateSettings({ language: 'ja' }));
  await settingsWindow.evaluate(window => window.setSize(700, 520));
  await settings.getByRole('radio', { name: japanese.translations['settings.qualityBalanced'], exact: true }).focus();
  assert(await settings.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await capture(settings, 'settings-images-ja-minimum-focus-dark');
  await settingsWindow.evaluate(window => window.setSize(760, 640));
  await main.evaluate(() => window.tinyPNG.updateSettings({ language: 'vi' }));
  await settingsWindow.evaluate(window => window.hide());
  const fixtures = path.join(qaRoot, 'fixtures');
  await fs.mkdir(fixtures, { recursive: true });
  const paths: string[] = [];
  for (let index = 1; index <= 8; index++) {
    const file = path.join(fixtures, `Screenshot 2026-11-26 ${String(index).padStart(2, '0')}.png`);
    await sharp({ create: { width: 1400, height: 900, channels: 3, background: { r: 35 + index * 20, g: 100, b: 135 } } }).png({ compressionLevel: 0 }).toFile(file);
    paths.push(file);
  }
  const invalid = path.join(fixtures, 'Ảnh chụp màn hình — file bị lỗi.png');
  await fs.writeFile(invalid, 'Invalid image fixture');
  paths.push(invalid);
  await main.evaluate(() => window.tinyPNG.pause());
  await app.evaluate(({ dialog }, filePaths) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths }); }, paths);
  await main.getByRole('button', { name: /Thêm ảnh/ }).click();
  await waitForState(main, state => state.jobs.length === 9 && state.paused);
  await capture(main, 'main-queue-pending-vi');
  await main.evaluate(() => window.tinyPNG.resume());
  await waitForState(main, state => state.jobs.length === 9 && !state.isProcessing && state.jobs.every(job => job.state === 'completed' || job.state === 'failed'));
  await main.getByRole('button', { name: 'Tạm dừng', exact: true }).waitFor({ state: 'hidden' });
  await capture(main, 'main-queue-complete-error-vi');
  for (const language of ['en', 'ja'] as const) {
    const next = await main.evaluate(language => window.tinyPNG.updateSettings({ language }), language);
    await main.getByRole('button', { name: next.translations['app.addImages'], exact: true }).waitFor();
    await capture(main, `main-queue-complete-error-${language}`);
  }
  await main.evaluate(() => window.tinyPNG.updateSettings({ language: 'vi' }));
  const dropped = path.join(fixtures, 'Dropped screenshot.png');
  await fs.copyFile(paths[0]!, dropped);
  const dragSession = await main.context().newCDPSession(main);
  for (const type of ['dragEnter', 'dragOver', 'drop'] as const) {
    await dragSession.send('Input.dispatchDragEvent', { type, x: 300, y: 200, data: { items: [], files: [dropped], dragOperationsMask: 1 } });
  }
  await waitForState(main, state => state.jobs.some(job => job.source === dropped && job.state === 'completed'));
  await dragSession.detach();
  await capture(main, 'main-after-file-drop-vi');
  const watchDirectory = path.join(fixtures, 'watched');
  await fs.mkdir(watchDirectory, { recursive: true });
  const baseline = path.join(watchDirectory, `baseline-${Date.now()}.png`);
  await fs.copyFile(paths[0]!, baseline);
  await app.evaluate(({ dialog }, directory) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [directory] }); }, watchDirectory);
  await main.evaluate(() => window.tinyPNG.openSettings('automation'));
  await settings.getByRole('button', { name: translations['watch.chooseFolder'], exact: true }).click();
  await waitForState(main, state => state.watchRunning);
  const watched = path.join(watchDirectory, `New screenshot-${Date.now()}.png`);
  await fs.copyFile(paths[0]!, watched);
  const watchedState = await waitForState(main, state => state.jobs.some(job => job.source === watched && job.state === 'completed'));
  assert(!watchedState.jobs.some(job => job.source === baseline));
  await capture(settings, 'settings-automation-watching-vi-dark');
  await main.evaluate(() => window.tinyPNG.stopWatch());
  await settingsWindow.evaluate(window => window.hide());
  await main.evaluate(() => window.tinyPNG.updateSettings({ language: 'vi', cornerEnabled: true, cornerMode: 'always', dropCorner: 'topRight' }));
  const corner = await findWindow('/features/corner-drop/index.html');
  await corner.getByRole('button').waitFor();
  await capture(corner, 'corner-top-right-vi');
  await main.evaluate(() => window.tinyPNG.updateSettings({ dropCorner: 'topCenter' }));
  await capture(corner, 'corner-top-center-vi');
  const cornerWindow = await app.browserWindow(corner);
  assert(!(await cornerWindow.evaluate(window => window.isFocusable())));
  const cornerDropped = path.join(fixtures, 'Corner dropped screenshot.png');
  await fs.copyFile(paths[0]!, cornerDropped);
  const cornerDrag = await corner.context().newCDPSession(corner);
  for (const type of ['dragEnter', 'dragOver', 'drop'] as const) {
    await cornerDrag.send('Input.dispatchDragEvent', { type, x: 80, y: 30, data: { items: [], files: [cornerDropped], dragOperationsMask: 1 } });
  }
  await waitForState(main, state => state.jobs.some(job => job.source === cornerDropped && job.state === 'completed'));
  await cornerDrag.detach();
  await main.evaluate(() => window.tinyPNG.updateSettings({ cornerMode: 'nearby' }));
  assert(!(await cornerWindow.evaluate(window => window.isVisible())));
  await main.evaluate(() => window.tinyPNG.updateSettings({ cornerEnabled: false }));
  await main.emulateMedia({ contrast: 'more', reducedMotion: 'reduce' });
  await capture(main, 'main-increased-contrast-reduced-motion-vi');
  await main.emulateMedia({ contrast: 'no-preference', reducedMotion: 'no-preference' });
  assert.equal(errors.length, 0, errors.join('\n'));
  console.log('Renderer errors', JSON.stringify(errors));
  await fs.writeFile(path.join(artifacts, 'result.json'), JSON.stringify({ version: metadata.version, errors, profile: await app.evaluate(({ app }) => app.getPath('userData')) }, null, 2));
} finally {
  await app.close();
}
