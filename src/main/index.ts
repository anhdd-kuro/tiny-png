import { app, BrowserWindow, Menu, Tray, nativeImage, ipcMain, dialog, screen, shell, session, safeStorage, Notification } from 'electron';
import type { IpcMainInvokeEvent, MenuItemConstructorOptions } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { SettingsStore } from './features/settings/store';
import { CompressionQueue } from './features/compression/queue';
import { FolderWatchController } from './features/folder-watch/controller';
import { createAppWindow } from './features/app-window/window';
import { CornerWindow } from './features/corner-drop/window';
import { translations } from '../shared/locales';
import { IPC } from '../shared/contracts';
import type { AppState, CompressionResult, BatchSummary } from '../shared/contracts';
import { CredentialStore } from './platform/credential-store';
import { S3Service } from './features/s3/service';
import type { S3Credentials } from '../shared/contracts';
import { APP_NAME, APP_ID, DATA_DIRECTORY } from '../shared/app';
import { CompletionNotifier } from './features/notifications/completion';
import { applyWindowMaterial } from './features/appearance/material';

app.setName(APP_NAME);
const profileDirectory = path.join(app.getPath('appData'), DATA_DIRECTORY);
fs.mkdirSync(profileDirectory, { recursive: true });
app.setPath('userData', profileDirectory);
let mainWindow: BrowserWindow;
let corner: CornerWindow;
let tray: Tray;
let settings: SettingsStore;
let queue: CompressionQueue;
let watch: FolderWatchController;
let quitting = false;
let currentNotice: unknown = null;
let credentials: CredentialStore;
let hasS3Credentials = false;
let completion: CompletionNotifier;
const nativeNotifications = new Set<Notification>();

function text(key: string, values: Record<string, string | number> = {}): string {
  const dictionary = translations[settings?.value.language ?? 'vi'];
  return (dictionary[key] ?? key).replace(/\{(\w+)\}/g, (_, name: string) => String(values[name] ?? `{${name}}`));
}
function errorText(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return translations[settings?.value.language ?? 'vi'][message] ?? `${text('error.operationFailed')}: ${message}`;
}
function snapshot(): AppState {
  const progress = queue.snapshot();
  return { ...progress, jobs: progress.jobs.map(job => ({ ...job, error: job.error ? errorText(job.error) : null })),
    settings: settings.value, watchRunning: watch.running, notice: currentNotice === null ? null : errorText(currentNotice), translations: translations[settings.value.language], hasS3Credentials };
}
function broadcast(): void {
  if (!queue || !settings || !watch) return;
  const state = snapshot();
  for (const window of [mainWindow, corner?.window]) {
    if (window && !window.isDestroyed()) window.webContents.send(IPC.state, state);
  }
  const failed = queue.jobs.filter(job => job.state === 'failed').length;
  tray?.setToolTip(`${APP_NAME}${queue.isProcessing ? ` · ${text('app.processing')}` : ''}${failed ? ` · ${text('app.errorCount', { count: failed })}` : ''}`);
}
function notice(error: unknown): void { currentNotice = error; broadcast(); }
function perform(operation: () => Promise<unknown>): void { void operation().catch(notice); }
function openMain(): void { mainWindow.show(); mainWindow.focus(); }

async function chooseFiles(): Promise<void> {
  const result = await dialog.showOpenDialog(mainWindow, { title: text('dialog.chooseImages'), properties: ['openFile', 'openDirectory', 'multiSelections'],
    filters: [{ name: text('dialog.images'), extensions: ['png', 'jpg', 'jpeg', 'webp', 'avif'] }] });
  if (!result.canceled) await queue.enqueue(result.filePaths);
}
async function chooseWatchFolder(): Promise<void> {
  const result = await dialog.showOpenDialog(mainWindow, { title: text('dialog.watchFolder'), defaultPath: settings.value.watchPath ?? app.getPath('desktop'),
    properties: ['openDirectory'], buttonLabel: text('dialog.watchButton') });
  if (!result.canceled && result.filePaths[0]) await watch.start(result.filePaths[0]);
}

function createTray(): Tray {
  const bitmap = Buffer.alloc(18 * 18 * 4);
  for (let y = 2; y < 16; y++) for (let x = 2; x < 16; x++) {
    const border = x < 4 || x > 13 || y < 4 || y > 13;
    const mountain = y >= 8 && y <= 12 && (Math.abs(x - 7) === 12 - y || Math.abs(x - 12) === 11 - y);
    const sun = x >= 11 && x <= 12 && y >= 5 && y <= 6;
    if (border || mountain || sun) bitmap[(y * 18 + x) * 4 + 3] = 255;
  }
  const image = nativeImage.createFromBitmap(bitmap, { width: 18, height: 18 });
  image.setTemplateImage(true);
  return new Tray(image);
}
function updateMenus(): void {
  const showSettings = (): void => { openMain(); mainWindow.webContents.send(IPC.openSettings); };
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: APP_NAME, submenu: [
      { label: text('app.settings'), accelerator: 'CmdOrCtrl+,', click: showSettings }, { type: 'separator' },
      { role: 'hide' }, { role: 'hideOthers' }, { role: 'unhide' }, { type: 'separator' },
      { label: text('app.quit'), accelerator: 'CmdOrCtrl+Q', click: () => app.quit() },
    ] },
    { label: text('app.file'), submenu: [
      { label: text('app.addImages'), accelerator: 'CmdOrCtrl+O', click: () => perform(chooseFiles) },
      { label: text('app.watchFolder'), click: () => perform(chooseWatchFolder) }, { role: 'close' },
    ] }, { role: 'editMenu' }, { role: 'windowMenu' },
  ]));
  const items: MenuItemConstructorOptions[] = [
    { label: text('app.open'), click: openMain }, { label: text('app.addImages'), click: () => perform(chooseFiles) },
    { label: text('app.watchFolder'), click: () => perform(chooseWatchFolder) },
    { label: text('app.stopWatch'), click: () => perform(() => watch.stop()) }, { type: 'separator' },
    { label: text('app.settings'), click: showSettings }, { label: text('app.quit'), click: () => app.quit() },
  ];
  tray.setContextMenu(Menu.buildFromTemplate(items));
}

function registerIPC(): void {
  const handle = (channel: string, operation: (...args: unknown[]) => unknown): void => {
    ipcMain.handle(channel, async (event: IpcMainInvokeEvent, ...args: unknown[]) => {
      if (![mainWindow.webContents, corner.window.webContents].includes(event.sender)) throw new Error(text('error.invalidSettings'));
      try { return await operation(...args); }
      catch (error) { notice(error); throw new Error(errorText(error)); }
    });
  };
  handle(IPC.getState, snapshot);
  handle(IPC.chooseFiles, chooseFiles);
  handle(IPC.enqueue, input => {
    if (!Array.isArray(input) || input.length > 5000 || !input.every((file: unknown) => typeof file === 'string' && path.isAbsolute(file))) throw new Error('error.invalidPath');
    return queue.enqueue(input as string[]);
  });
  handle(IPC.chooseWatch, chooseWatchFolder);
  handle(IPC.startWatch, () => settings.value.watchPath ? watch.start() : chooseWatchFolder());
  handle(IPC.stopWatch, () => watch.stop());
  handle(IPC.chooseOutput, async () => {
    const result = await dialog.showOpenDialog(mainWindow, { title: text('dialog.outputFolder'), properties: ['openDirectory', 'createDirectory'] });
    if (!result.canceled && result.filePaths[0]) { settings.setOutput(result.filePaths[0]); broadcast(); }
  });
  handle(IPC.updateSettings, patch => {
    const previousGlass = settings.value.glassEnabled;
    settings.update(patch);
    if (!settings.value.notificationsEnabled) completion.cancelPending();
    if (previousGlass !== settings.value.glassEnabled) applyWindowMaterial(mainWindow, settings.value.glassEnabled);
    corner.update(settings.value); updateMenus(); broadcast(); return snapshot();
  });
  handle(IPC.pause, () => queue.pause());
  handle(IPC.resume, () => queue.resume());
  handle(IPC.retry, id => { if (typeof id === 'string') queue.retry(id); });
  handle(IPC.remove, id => { if (typeof id === 'string') queue.remove(id); });
  handle(IPC.clear, () => queue.clearFinished());
  handle(IPC.reveal, file => {
    if (typeof file !== 'string' || !queue.jobs.some(job => job.result?.outputPath === file || job.source === file)) throw new Error('error.notInQueue');
    shell.showItemInFolder(file);
  });
  handle(IPC.openMain, openMain);
  handle(IPC.dismissNotice, () => { currentNotice = null; broadcast(); });
  handle(IPC.saveS3Credentials, input => {
    if (!input || typeof input !== 'object') throw new Error('error.s3Credentials');
    const value = input as Record<string, unknown>;
    if (typeof value.accessKeyId !== 'string' || typeof value.secretAccessKey !== 'string' ||
        !value.accessKeyId.trim() || !value.secretAccessKey.trim() || value.accessKeyId.length > 256 || value.secretAccessKey.length > 4096 ||
        value.sessionToken !== undefined && (typeof value.sessionToken !== 'string' || value.sessionToken.length > 16384)) throw new Error('error.s3Credentials');
    credentials.save({ accessKeyId: value.accessKeyId.trim(), secretAccessKey: value.secretAccessKey.trim(),
      ...(typeof value.sessionToken === 'string' && value.sessionToken.trim() ? { sessionToken: value.sessionToken.trim() } : {}) } satisfies S3Credentials);
    hasS3Credentials = true;
    broadcast(); return snapshot();
  });
}

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', (_event, args) => {
    perform(async () => {
      await app.whenReady();
      openMain();
      const files = args.slice(app.isPackaged ? 1 : 2).filter(argument => !argument.startsWith('-') && path.isAbsolute(argument) && fs.existsSync(argument));
      if (files.length) await queue.enqueue(files);
    });
  });
  app.whenReady().then(async () => {
    settings = new SettingsStore(path.join(app.getPath('userData'), 'settings.json'));
    credentials = new CredentialStore(path.join(app.getPath('userData'), 's3-credentials.bin'), safeStorage);
    try { hasS3Credentials = credentials.hasCredentials(); }
    catch (error) { currentNotice = error; }
    const s3 = new S3Service({ getOptions: () => ({ enabled: settings.value.s3Enabled, region: settings.value.s3Region, bucket: settings.value.s3Bucket, prefix: settings.value.s3Prefix }),
      getCredentials: () => credentials.read() });
    queue = new CompressionQueue(settings, s3);
    watch = new FolderWatchController({ settings, queue, onChange: broadcast, onError: notice });
    const build = path.resolve(__dirname, '..');
    const preload = path.join(build, 'preload/index.cjs');
    mainWindow = createAppWindow({ preload, html: path.join(build, 'renderer/index.html'), isQuitting: () => quitting });
    applyWindowMaterial(mainWindow, settings.value.glassEnabled);
    corner = new CornerWindow({ preload, html: path.join(build, 'renderer/features/corner-drop/index.html'), anchorWindow: mainWindow, onError: notice });
    tray = createTray();
    completion = new CompletionNotifier({ isEnabled: () => settings.value.notificationsEnabled, translate: text, openResults: openMain,
      show: content => {
        try {
          if (!Notification.isSupported()) throw new Error('notifications.unavailable');
          const notification = new Notification({ title: content.title, body: content.body, groupId: APP_ID });
          nativeNotifications.add(notification);
          notification.on('click', content.onClick);
          notification.on('close', () => nativeNotifications.delete(notification));
          notification.on('failed', () => { nativeNotifications.delete(notification); notice(new Error('notifications.unavailable')); });
          notification.show();
        } catch { notice(new Error('notifications.unavailable')); }
      } });
    tray.on('double-click', openMain);
    queue.on('change', broadcast);
    queue.on('output', (result: CompressionResult) => watch.markOutput(result));
    queue.on('drained', (summary: BatchSummary) => completion.complete(summary));
    session.defaultSession.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*', 'ws://*/*', 'wss://*/*'] }, (_details, callback) => callback({ cancel: true }));
    registerIPC(); updateMenus(); corner.update(settings.value);
    screen.on('display-metrics-changed', () => corner.refresh());
    screen.on('display-added', () => corner.refresh());
    screen.on('display-removed', () => corner.refresh());
    app.on('activate', openMain);
    if (settings.value.watchEnabled && settings.value.watchPath) await watch.start().catch(notice);
  }).catch(error => { dialog.showErrorBox(APP_NAME, errorText(error)); app.quit(); });
  app.on('window-all-closed', () => {});
  app.on('before-quit', () => { quitting = true; completion?.dispose(); corner?.dispose(); if (watch) perform(() => watch.stop({ persist: false })); });
  process.on('SIGTERM', () => app.quit());
  process.on('SIGINT', () => app.quit());
  app.on('open-file', (event, file) => { event.preventDefault(); perform(() => app.whenReady().then(() => queue.enqueue([file]))); });
}
