import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { _electron as electron, type Page } from 'playwright';
import { DEFAULT_SETTINGS } from '../src/main/features/settings/store';
import { APP_NAME } from '../src/shared/app';
import { prepareQAApplication } from './packaging/qa-application';

const root = fileURLToPath(new URL('../', import.meta.url));
const qaRoot = path.join(root, 'tmp/ui-qa');
const artifacts = process.env.TINY_ASSETS_QA_OUTPUT ? path.resolve(process.env.TINY_ASSETS_QA_OUTPUT) : path.join(qaRoot, 'screenshots');
const runtime = path.join(qaRoot, 'runtime');
await fs.mkdir(artifacts, { recursive: true });
await fs.mkdir(runtime, { recursive: true });
const qaProfile = path.join(qaRoot, 'qa-app-data/Tiny PNG');
await fs.mkdir(qaProfile, { recursive: true });
await fs.rm(path.join(qaProfile, 'history.json'), { force: true });
await fs.rm(path.join(qaProfile, 'diagnostics'), { recursive: true, force: true });
await fs.writeFile(path.join(qaProfile, 'settings.json'), JSON.stringify({ ...DEFAULT_SETTINGS, notificationsEnabled: false, cornerEnabled: false, watchEnabled: false, watchPath: null, s3Enabled: false, overwrite: false }));
const metadata = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8')) as { version: string };
const application = await prepareQAApplication(root, runtime, metadata.version);
const app = await electron.launch({
  executablePath: application.executablePath,
  args: application.args, cwd: root, timeout: 25_000, chromiumSandbox: true, colorScheme: null,
  env: { ...process.env, TINY_ASSETS_QA_THEME: 'light' },
  recordVideo: process.env.TINY_ASSETS_QA_VIDEO === '1' ? { dir: path.join(artifacts, 'videos'), size: { width: 760, height: 680 } } : undefined,
}).catch(async error => { await application.cleanup(); throw error; });
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
  const qaMetadata = JSON.parse(await fs.readFile(path.join(qaRoot, 'qa-runtime.json'), 'utf8')) as { applicationRoot: string };
  const trayIcon = await app.evaluate(({ nativeImage }, applicationRoot) => {
    const icon = nativeImage.createFromPath(applicationRoot + '/build/assets/tray.png');
    return { empty: icon.isEmpty(), size: icon.getSize(), scales: icon.getScaleFactors() };
  }, qaMetadata.applicationRoot);
  assert.equal(trayIcon.empty, false);
  assert.deepEqual(trayIcon.size, { width: 18, height: 18 });
  assert.deepEqual(trayIcon.scales.sort(), [1, 2]);
  for (const [name, size] of [['tray.png', 18], ['tray@2x.png', 36]] as const) {
    const png = await sharp(path.join(qaMetadata.applicationRoot, 'build/assets', name)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    assert.equal(png.info.width, size); assert.equal(png.info.height, size);
    assert.equal(png.data[3], 0);
    assert(png.data.some((value, index) => index % 4 === 3 && value > 128));
  }
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
  await settings.getByText(translations['notificationDiagnostics.heading'], { exact: true }).click();
  const checkedAfter = Date.now();
  await settings.getByRole('button', { name: translations['notificationDiagnostics.refresh'], exact: true }).click();
  let nativeDiagnostics = await settings.evaluate(() => window.tinyPNG.getNotificationDiagnostics());
  const checkDeadline = Date.now() + 15000;
  while ((!nativeDiagnostics.checkedAt || Date.parse(nativeDiagnostics.checkedAt) < checkedAfter) && Date.now() < checkDeadline) {
    await new Promise(resolve => setTimeout(resolve, 50));
    nativeDiagnostics = await settings.evaluate(() => window.tinyPNG.getNotificationDiagnostics());
  }
  assert(nativeDiagnostics.settings);
  assert(['notDetermined', 'denied', 'authorized', 'provisional', 'ephemeral', 'unknown'].includes(nativeDiagnostics.settings.authorization));
  assert(nativeDiagnostics.checkedAt);
  await capture(settings, 'settings-notification-diagnostics-vi-dark');
  for (const language of ['en', 'ja'] as const) {
    await main.evaluate(language => window.tinyPNG.updateSettings({ language }), language);
    await capture(settings, `settings-notification-diagnostics-${language}-dark`);
  }
  await app.evaluate(({ nativeTheme }) => { nativeTheme.themeSource = 'light'; });
  await settings.emulateMedia({ colorScheme: 'light' });
  await capture(settings, 'settings-notification-diagnostics-ja-light');
  await main.evaluate(() => window.tinyPNG.updateSettings({ language: 'vi' }));
  await app.evaluate(({ nativeTheme }) => { nativeTheme.themeSource = 'dark'; });
  await settings.emulateMedia({ colorScheme: 'dark' });
  await settings.getByText(translations['notificationDiagnostics.heading'], { exact: true }).click();
  await assert.rejects(main.evaluate(() => window.tinyPNG.getNotificationDiagnostics()));
  await main.evaluate(() => window.tinyPNG.dismissNotice());

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
  if (process.env.TINY_ASSETS_QA_NATIVE_NOTIFICATIONS === '1') await main.evaluate(() => window.tinyPNG.updateSettings({ notificationsEnabled: true }));
  const watched = path.join(watchDirectory, `New screenshot-${Date.now()}.png`);
  const screenshotTemporary = path.join(watchDirectory, '.Screenshot-in-progress.png');
  await fs.copyFile(paths[0]!, screenshotTemporary);
  await fs.rename(screenshotTemporary, watched);
  const watchedState = await waitForState(main, state => state.jobs.some(job => job.source === watched && job.state === 'completed'));
  assert(!watchedState.jobs.some(job => job.source === baseline));
  if (process.env.TINY_ASSETS_QA_NATIVE_NOTIFICATIONS === '1') {
    const nativeWatch = await waitForState(main, state => state.history.some(entry => ['notificationSent', 'notificationFailed', 'notificationUnconfirmed'].includes(entry.action)));
    console.log('Automatic watcher native notification', JSON.stringify(nativeWatch.history.slice(0, 3)));
    await main.evaluate(() => window.tinyPNG.updateSettings({ notificationsEnabled: false }));
  }
  await capture(settings, 'settings-automation-watching-vi-dark');
  assert(watchedState.history.some(entry => entry.file === watched && entry.action === 'watchDetected'));
  assert(watchedState.history.some(entry => entry.file === watched && ['compressed', 'skipped'].includes(entry.action)));
  assert(!watchedState.history.some(entry => entry.file === baseline));
  assert(watchedState.history.some(entry => entry.action === 'watchStarted' && entry.file === watchDirectory));
  await settings.getByRole('button', { name: translations['history.heading'], exact: true }).click();
  await settings.getByText(path.basename(watched), { exact: true }).first().waitFor();
  for (const language of ['vi', 'en', 'ja'] as const) {
    await main.evaluate(language => window.tinyPNG.updateSettings({ language }), language);
    assert(await settings.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await capture(settings, `settings-history-${language}-dark`);
  }
  await app.evaluate(({ nativeTheme }) => { nativeTheme.themeSource = 'light'; });
  await settings.emulateMedia({ colorScheme: 'light' });
  await capture(settings, 'settings-history-ja-light');
  await main.evaluate(() => window.tinyPNG.updateSettings({ language: 'vi' }));
  await settings.getByRole('button', { name: translations['settings.automation'], exact: true }).click();
  await settings.getByRole('button', { name: translations['notifications.test'], exact: true }).waitFor();
  await main.evaluate(() => window.tinyPNG.updateSettings({ notificationsEnabled: true }));
  await app.evaluate(({ Notification }) => {
    const notificationClass = Notification as unknown as { prototype: { show(): void }; };
    (globalThis as unknown as { qaNotificationShow: unknown }).qaNotificationShow = notificationClass.prototype.show;
    (globalThis as unknown as { qaNotificationHistory: unknown }).qaNotificationHistory = Notification.getHistory;
    Notification.getHistory = async () => [];
    notificationClass.prototype.show = function (this: { emit(event: string): void }) { this.emit('show'); };
  });
  const sentBefore = (await main.evaluate(() => window.tinyPNG.getState())).history.filter(entry => entry.action === 'notificationSent').length;
  await settings.getByRole('button', { name: translations['notifications.test'], exact: true }).click();
  await waitForState(main, state => state.history.filter(entry => entry.action === 'notificationSent').length > sentBefore);
  await app.evaluate(({ Notification }) => {
    Notification.prototype.show = function () { this.emit('failed', {}, 'QA delivery failure'); };
  });
  const diagnosticSent = await settings.evaluate(() => window.tinyPNG.getNotificationDiagnostics());
  assert(diagnosticSent.events.some(event => event.action === 'accepted' && !!event.notificationId));
  const failedBefore = (await main.evaluate(() => window.tinyPNG.getState())).history.filter(entry => entry.action === 'notificationFailed').length;
  await settings.getByRole('button', { name: translations['notifications.test'], exact: true }).click();
  await waitForState(main, state => state.history.filter(entry => entry.action === 'notificationFailed').length > failedBefore);
  const inspectionDeadline = Date.now() + 10000;
  let mockInspected = false;
  while (Date.now() < inspectionDeadline) {
    const status = await settings.evaluate(() => window.tinyPNG.getNotificationDiagnostics());
    mockInspected = status.events.some(event => event.action === 'notInNotificationCenter');
    if (mockInspected) break;
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  assert(mockInspected);
  await app.evaluate(({ Notification }) => {
    Notification.prototype.show = (globalThis as unknown as { qaNotificationShow: typeof Notification.prototype.show }).qaNotificationShow;
    Notification.getHistory = (globalThis as unknown as { qaNotificationHistory: typeof Notification.getHistory }).qaNotificationHistory;
  });
  const diagnosticFailure = await settings.evaluate(() => window.tinyPNG.getNotificationDiagnostics());
  assert(diagnosticFailure.events.some(event => event.action === 'failed' && event.detail === 'QA delivery failure'));
  await main.evaluate(() => window.tinyPNG.dismissNotice());
  if (process.env.TINY_ASSETS_QA_NATIVE_NOTIFICATIONS === '1') {
    const before = (await main.evaluate(() => window.tinyPNG.getState())).history[0]?.id;
    await settings.getByRole('button', { name: translations['notifications.test'], exact: true }).click();
    const native = await waitForState(main, state => {
      const cutoff = state.history.findIndex(entry => entry.id === before);
      return state.history.slice(0, cutoff < 0 ? undefined : cutoff).some(entry => ['notificationSent', 'notificationFailed', 'notificationUnconfirmed'].includes(entry.action));
    });
    const deadline = Date.now() + 15000;
    let inspected = false;
    while (Date.now() < deadline) {
      const status = await settings.evaluate(() => window.tinyPNG.getNotificationDiagnostics());
      const latest = status.events.find(event => event.action === 'request');
      inspected = !!latest && status.events.some(event => event.notificationId === latest.notificationId && ['inNotificationCenter', 'notInNotificationCenter', 'inspectionFailed'].includes(event.action));
      if (inspected) { console.log('Native diagnostic lifecycle', JSON.stringify(status.events.filter(event => event.notificationId === latest?.notificationId))); break; }
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    assert(inspected);
    console.log('Native notification lifecycle', JSON.stringify(native.history.slice(0, 2)));
    await main.evaluate(() => window.tinyPNG.dismissNotice());
  }
  await main.evaluate(() => window.tinyPNG.updateSettings({ notificationsEnabled: false }));
  await settings.getByRole('button', { name: translations['history.heading'], exact: true }).click();
  const persistedHistory = JSON.parse(await fs.readFile(path.join(qaProfile, 'history.json'), 'utf8'));
  assert(Array.isArray(persistedHistory) || Array.isArray(persistedHistory.entries));
  await capture(settings, 'settings-history-notification-results-vi-light');
  await app.evaluate(({ dialog }) => { dialog.showMessageBox = async () => ({ response: 1, checkboxChecked: false }); });
  await settings.getByRole('button', { name: translations['history.clearAction'], exact: true }).click();
  assert((await main.evaluate(() => window.tinyPNG.getState())).history.length > 0);
  await app.evaluate(({ dialog }) => { dialog.showMessageBox = async () => ({ response: 0, checkboxChecked: false }); });
  await settings.getByRole('button', { name: translations['history.clearAction'], exact: true }).click();
  await waitForState(main, state => state.history.length === 0);
  await capture(settings, 'settings-history-empty-vi-light');

  await main.evaluate(() => window.tinyPNG.stopWatch());
  await settingsWindow.evaluate(window => window.hide());
  await main.evaluate(() => window.tinyPNG.updateSettings({ language: 'vi', cornerEnabled: true, cornerMode: 'always', dropCorner: 'topRight' }));
  const corner = await findWindow('/features/corner-drop/index.html');
  await corner.getByRole('button').waitFor();
  await capture(corner, 'corner-top-right-vi');
  await main.evaluate(() => window.tinyPNG.updateSettings({ dropCorner: 'topCenter' }));
  const cornerWindow = await app.browserWindow(corner);
  await corner.locator('[data-corner-presentation="visible"]').waitFor();
  await corner.waitForFunction(() => Number(getComputedStyle(document.querySelector('button')!).opacity) >= .999);
  assert.deepEqual(await cornerWindow.evaluate(window => window.getSize()), [320, 80]);
  await capture(corner, 'corner-top-center-vi');
  await main.evaluate(() => window.tinyPNG.clearFinished());
  await capture(corner, 'corner-top-center-idle-vi');
  const animated = !await app.evaluate(({ systemPreferences }) => systemPreferences.getAnimationSettings().prefersReducedMotion) && await corner.evaluate(() => !matchMedia('(prefers-reduced-motion: reduce)').matches);
  const recordCornerFrames = () => corner.evaluate(() => {
    const frames: Array<{ opacity: number; blur: number }> = [];
    (window as unknown as { qaCornerFrames: typeof frames }).qaCornerFrames = frames;
    void (async () => {
      for (let index = 0; index < 45; index++) {
        await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
        const style = getComputedStyle(document.querySelector('button')!);
        frames.push({ opacity: Number(style.opacity), blur: Number.parseFloat(style.filter.replace('blur(', '')) || 0 });
      }
    })();
  });
  const settleCorner = async () => {
    await corner.locator('[data-corner-presentation="visible"]').waitFor();
    await corner.waitForFunction(() => Number(getComputedStyle(document.querySelector('button')!).opacity) >= .999);
  };
  const waitCornerHidden = async () => {
    const deadline = Date.now() + 3000;
    while (await cornerWindow.evaluate(window => window.isVisible())) {
      if (Date.now() > deadline) throw new Error('Animated corner did not hide');
      await new Promise(resolve => setTimeout(resolve, 25));
    }
  };
  if (animated) {
    await main.evaluate(() => window.tinyPNG.updateSettings({ cornerMode: 'nearby' }));
    const firstHideDeadline = Date.now() + 3000;
    while (await cornerWindow.evaluate(window => window.isVisible())) {
      if (Date.now() > firstHideDeadline) throw new Error('Animated drop did not hide');
      await new Promise(resolve => setTimeout(resolve, 25));
    }
    await recordCornerFrames();
    await main.evaluate(() => window.tinyPNG.updateSettings({ cornerMode: 'always' }));
    await corner.locator('[data-corner-presentation="visible"]').waitFor();
    await corner.waitForFunction(() => Number(getComputedStyle(document.querySelector('button')!).opacity) >= .999);
    const frames = await corner.evaluate(() => (window as unknown as { qaCornerFrames: Array<{ opacity: number; blur: number }> }).qaCornerFrames);
    assert(frames.some(frame => frame.opacity > 0 && frame.opacity < .99), 'reveal must visibly fade through intermediate frames');
    const supportsBlur = await corner.evaluate(() => !matchMedia('(prefers-reduced-transparency: reduce)').matches && !matchMedia('(prefers-contrast: more)').matches);
    if (supportsBlur) assert(frames.some(frame => frame.blur > 0 && frame.opacity > 0), 'reveal must visibly blur before settling');
    console.log('Corner reveal frames', JSON.stringify(frames));
    await main.evaluate(() => window.tinyPNG.updateSettings({ cornerMode: 'nearby' }));
    await corner.waitForFunction(() => document.querySelector('[data-corner-presentation]')?.getAttribute('data-corner-presentation') === 'hidden');
    assert(await corner.evaluate(() => document.querySelector<HTMLElement>('[data-corner-presentation]')!.inert));
    await main.evaluate(() => window.tinyPNG.updateSettings({ cornerMode: 'always' }));
    await corner.locator('[data-corner-presentation="visible"]').waitFor();
    await corner.waitForFunction(() => Number(getComputedStyle(document.querySelector('button')!).opacity) >= .999);
    assert(await cornerWindow.evaluate(window => window.isVisible()), 're-entry must cancel the stale hide');
    await capture(corner, 'corner-top-center-reentered-vi');
    const assertCornerFrames = async (phase: string) => {
      const samples = await corner.evaluate(() => (window as unknown as { qaCornerFrames: Array<{ opacity: number; blur: number }> }).qaCornerFrames);
      assert(samples.some(sample => sample.opacity > 0 && sample.opacity < .99), `${phase} must render intermediate opacity`);
      if (supportsBlur) assert(samples.some(sample => sample.blur > 0 && sample.opacity > 0), `${phase} must render intermediate blur`);
    };
    for (const position of ['topLeft', 'topRight', 'bottomLeft', 'bottomRight'] as const) {
      await main.evaluate(dropCorner => window.tinyPNG.updateSettings({ dropCorner, cornerMode: 'nearby' }), position);
      await waitCornerHidden();
      await recordCornerFrames();
      await main.evaluate(() => window.tinyPNG.updateSettings({ cornerMode: 'always' }));
      await settleCorner();
      assert.deepEqual(await cornerWindow.evaluate(window => window.getSize()), [112, 104]);
      await assertCornerFrames(`${position} reveal`);
      await recordCornerFrames();
      await main.evaluate(() => window.tinyPNG.updateSettings({ cornerMode: 'nearby' }));
      await waitCornerHidden();
      await assertCornerFrames(`${position} hide`);
      await main.evaluate(() => window.tinyPNG.updateSettings({ cornerMode: 'always' }));
      await settleCorner();
      await main.evaluate(() => window.tinyPNG.updateSettings({ cornerMode: 'nearby' }));
      await corner.waitForFunction(() => document.querySelector('[data-corner-presentation]')?.getAttribute('data-corner-presentation') === 'hidden');
      assert(await corner.evaluate(() => document.querySelector<HTMLElement>('[data-corner-presentation]')!.inert));
      await main.evaluate(() => window.tinyPNG.updateSettings({ cornerMode: 'always' }));
      await settleCorner();
      assert(await cornerWindow.evaluate(window => window.isVisible()), `${position} re-entry must cancel the stale hide`);
      await capture(corner, `corner-${position}-reentered-vi`);
    }
    await main.evaluate(() => window.tinyPNG.updateSettings({ dropCorner: 'topCenter' }));
    await settleCorner();
  }
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
  const hideDeadline = Date.now() + 3000;
  while (await cornerWindow.evaluate(window => window.isVisible())) {
    if (Date.now() > hideDeadline) throw new Error('Nearby drop did not finish hiding');
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  await corner.emulateMedia({ reducedMotion: 'reduce' });
  await main.evaluate(() => window.tinyPNG.updateSettings({ cornerMode: 'always' }));
  await corner.locator('[data-corner-presentation="visible"]').waitFor();
  const reduced = await corner.getByRole('button').evaluate(button => {
    const style = getComputedStyle(button); return { opacity: style.opacity, filter: style.filter, transform: style.transform, duration: style.transitionDuration };
  });
  assert.deepEqual(reduced, { opacity: '1', filter: 'none', transform: 'none', duration: '0s' });
  await capture(corner, 'corner-top-center-reduced-motion-vi');
  await corner.emulateMedia({ reducedMotion: 'no-preference' });
  await main.evaluate(() => window.tinyPNG.updateSettings({ cornerEnabled: false }));
  await main.emulateMedia({ contrast: 'more', reducedMotion: 'reduce' });
  await capture(main, 'main-increased-contrast-reduced-motion-vi');
  await main.emulateMedia({ contrast: 'no-preference', reducedMotion: 'no-preference' });
  assert.equal(errors.length, 0, errors.join('\n'));
  console.log('Renderer errors', JSON.stringify(errors));
  await fs.writeFile(path.join(artifacts, 'result.json'), JSON.stringify({ version: metadata.version, errors, profile: await app.evaluate(({ app }) => app.getPath('userData')) }, null, 2));
} finally {
  try { await app.close(); } finally { await application.cleanup(); }
}
