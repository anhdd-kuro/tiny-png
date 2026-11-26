import { app, BrowserWindow, Menu, Tray, ipcMain, dialog, screen, shell, session, safeStorage, Notification } from 'electron';
import type { IpcMainInvokeEvent, MenuItemConstructorOptions } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { SettingsStore } from './features/settings/store';
import { SettingsWindow } from './features/settings/window';
import { SettingsUpdater } from './features/settings/update';
import { CompressionQueue } from './features/compression/queue';
import { FolderWatchController } from './features/folder-watch/controller';
import { createAppWindow } from './features/app-window/window';
import { createTrayImage } from './features/app-window/tray-image';
import { CornerWindow } from './features/corner-drop/window';
import { translations } from '../shared/locales';
import { createTranslator } from '../shared/localization';
import { IPC } from '../shared/contracts';
import type { AppState, CompressionResult, BatchSummary, SettingsCategory, Job } from '../shared/contracts';
import { CredentialStore } from './platform/credential-store';
import { S3Service } from './features/s3/service';
import type { S3Credentials } from '../shared/contracts';
import { APP_NAME, APP_ID, DATA_DIRECTORY } from '../shared/app';
import { HistoryStore } from './features/history/store';
import { NotificationDelivery } from './features/notifications/delivery';
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
let settingsWindow: SettingsWindow;
let settingsUpdater: SettingsUpdater;
let queue: CompressionQueue;
let watch: FolderWatchController;
let quitting = false;
let currentNotice: unknown = null;
let credentials: CredentialStore;
let hasS3Credentials = false;
let completion: CompletionNotifier;
let history: HistoryStore;
let notificationDelivery: NotificationDelivery;
const translators = { en: createTranslator('en'), vi: createTranslator('vi'), ja: createTranslator('ja') };

function text(key: string, values: Record<string, string | number> = {}): string {
  return translators[settings?.value.language ?? 'vi'](key, values);
}
function errorText(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return translations[settings?.value.language ?? 'vi'][message] ?? `${text('error.operationFailed')}: ${message}`;
}
function safeHistoryError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return Object.hasOwn(translations.en, message) ? message : 'error.operationFailed';
}
function snapshot(): AppState {
  const progress = queue.snapshot();
  return { ...progress, jobs: progress.jobs.map(job => ({ ...job, error: job.error ? errorText(job.error) : null })),
    history: history.entries, settings: settings.value, watchRunning: watch.running, notice: currentNotice === null ? null : errorText(currentNotice), translations: translations[settings.value.language], hasS3Credentials };
}
function broadcast(): void {
  if (!queue || !settings || !watch) return;
  const state = snapshot();
  for (const window of [mainWindow, corner?.window, settingsWindow?.window]) {
    if (window && !window.isDestroyed()) window.webContents.send(IPC.state, state);
  }
  const failed = queue.jobs.filter(job => job.state === 'failed').length;
  tray?.setToolTip(`${APP_NAME}${queue.isProcessing ? ` · ${text('app.processing')}` : ''}${failed ? ` · ${text('app.errorCount', { count: failed })}` : ''}`);
}
function notice(error: unknown): void { currentNotice = error; broadcast(); }
function perform(operation: () => Promise<unknown>): void { void operation().catch(notice); }
function openMain(): void { mainWindow.show(); mainWindow.focus(); }
function openSettings(category?: SettingsCategory): void { settingsWindow.open(category); }
function dialogParent(): BrowserWindow {
  const focused = BrowserWindow.getFocusedWindow();
  if (focused && !focused.isDestroyed() && focused.isVisible() && [mainWindow, settingsWindow?.window].includes(focused)) return focused;
  if (mainWindow.isMinimized()) mainWindow.restore();
  openMain();
  return mainWindow;
}

async function chooseFiles(): Promise<void> {
  const result = await dialog.showOpenDialog(dialogParent(), { title: text('dialog.chooseImages'), properties: ['openFile', 'openDirectory', 'multiSelections'],
    filters: [{ name: text('dialog.images'), extensions: ['png', 'jpg', 'jpeg', 'webp', 'avif'] }] });
  if (!result.canceled) await queue.enqueue(result.filePaths);
}
async function chooseWatchFolder(): Promise<void> {
  const result = await dialog.showOpenDialog(dialogParent(), { title: text('dialog.watchFolder'), defaultPath: settings.value.watchPath ?? app.getPath('desktop'),
    properties: ['openDirectory'], buttonLabel: text('dialog.watchButton') });
  if (!result.canceled && result.filePaths[0]) await watch.start(result.filePaths[0]);
}

function createTray(): Tray {
  return new Tray(createTrayImage());
}
async function showHelp(): Promise<void> {
  await dialog.showMessageBox(dialogParent(), { type: 'info', title: text('help.title'), message: text('help.message'), detail: text('help.detail'), buttons: [text('common.close')] });
}
function updateMenus(): void {
  const showSettings = (): void => openSettings();
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: APP_NAME, submenu: [
      { role: 'about' }, { type: 'separator' },
      { label: text('app.settings'), accelerator: 'CmdOrCtrl+,', click: showSettings }, { type: 'separator' },
      { role: 'services' }, { type: 'separator' },
      { role: 'hide' }, { role: 'hideOthers' }, { role: 'unhide' }, { type: 'separator' },
      { label: text('app.quit'), accelerator: 'CmdOrCtrl+Q', click: () => app.quit() },
    ] },
    { label: text('app.file'), submenu: [
      { label: text('app.addImages'), accelerator: 'CmdOrCtrl+O', click: () => perform(chooseFiles) },
      { label: text('app.watchFolder'), click: () => perform(chooseWatchFolder) }, { role: 'close' },
    ] }, { role: 'editMenu' }, { role: 'windowMenu' },
    { role: 'help', label: text('app.help'), submenu: [{ label: text('help.title'), click: () => perform(showHelp) }] },
  ]));
  const items: MenuItemConstructorOptions[] = [
    { label: text('app.open'), click: openMain }, { label: text('app.addImages'), click: () => perform(chooseFiles) },
    { label: text('app.watchFolder'), click: () => perform(chooseWatchFolder) },
    { label: text('app.stopWatch'), enabled: watch.running, click: () => perform(() => watch.stop()) }, { type: 'separator' },
    { label: text('app.settings'), click: showSettings }, { label: text('app.quit'), click: () => app.quit() },
  ];
  tray.setContextMenu(Menu.buildFromTemplate(items));
}

function registerIPC(): void {
  const handle = (channel: string, operation: (...args: unknown[]) => unknown, settingsOnly = false): void => {
    ipcMain.handle(channel, async (event: IpcMainInvokeEvent, ...args: unknown[]) => {
      if (![mainWindow.webContents, corner.window.webContents, settingsWindow.window?.webContents].includes(event.sender)) throw new Error(text('error.invalidSettings'));
      if (settingsOnly && (event.sender !== settingsWindow.window?.webContents || event.senderFrame !== event.sender.mainFrame)) throw new Error(text('error.invalidSettings'));
      try { return await operation(...args); }
      catch (error) { notice(error); throw new Error(errorText(error)); }
    });
  };
  ipcMain.on(IPC.settingsReady, event => {
    if (event.sender === settingsWindow.window?.webContents) settingsWindow.rendererReady();
  });
  handle(IPC.getState, snapshot);
  handle(IPC.openSettings, category => {
    if (category !== undefined && category !== 'images' && category !== 'automation' && category !== 'general' && category !== 'cloud' && category !== 'history') throw new Error('error.invalidSettings');
    openSettings(category);
  });
  handle(IPC.settingsCategory, category => {
    if (category !== 'images' && category !== 'automation' && category !== 'general' && category !== 'cloud' && category !== 'history') throw new Error('error.invalidSettings');
    settingsWindow.setCategory(category);
  }, true);
  handle(IPC.clearHistory, async () => {
    const result = await dialog.showMessageBox(dialogParent(), { type: 'warning', title: text('history.clearAction'), message: text('history.clearConfirm'),
      buttons: [text('history.clearAction'), text('common.cancel')], defaultId: 1, cancelId: 1 });
    if (result.response === 0) { history.clear(); broadcast(); }
  }, true);
  handle(IPC.testNotification, () => {
    if (!settings.value.notificationsEnabled) return;
    notificationDelivery.show({ title: text('notifications.testTitle'), body: text('notifications.testBody'), onClick: () => openSettings('history') });
  }, true);
  handle(IPC.openNotificationSettings, () => shell.openExternal('x-apple.systempreferences:com.apple.Notifications-Settings.extension'), true);
  handle(IPC.chooseFiles, chooseFiles);
  handle(IPC.enqueue, input => {
    if (!Array.isArray(input) || input.length > 5000 || !input.every((file: unknown) => typeof file === 'string' && path.isAbsolute(file))) throw new Error('error.invalidPath');
    return queue.enqueue(input as string[]);
  });
  handle(IPC.chooseWatch, chooseWatchFolder);
  handle(IPC.startWatch, () => settings.value.watchPath ? watch.start() : chooseWatchFolder());
  handle(IPC.stopWatch, () => watch.stop());
  handle(IPC.chooseOutput, async () => {
    const result = await dialog.showOpenDialog(dialogParent(), { title: text('dialog.outputFolder'), properties: ['openDirectory', 'createDirectory'] });
    if (!result.canceled && result.filePaths[0]) { settings.setOutput(result.filePaths[0]); broadcast(); }
  });
  handle(IPC.updateSettings, async patch => {
    const previousGlass = settings.value.glassEnabled;
    if (!await settingsUpdater.update(patch)) return snapshot();
    if (!settings.value.notificationsEnabled && completion.cancelPending()) history.add({ action: 'notificationSuppressed', file: null });
    if (previousGlass !== settings.value.glassEnabled) applyWindowMaterial(mainWindow, settings.value.glassEnabled);
    settingsWindow.updateAppearance();
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
    history = new HistoryStore(path.join(app.getPath('userData'), 'history.json'), { onError: error => { currentNotice = error; } });
    credentials = new CredentialStore(path.join(app.getPath('userData'), 's3-credentials.bin'), safeStorage);
    try { hasS3Credentials = credentials.hasCredentials(); }
    catch (error) { currentNotice = error; }
    const s3 = new S3Service({ getOptions: () => ({ enabled: settings.value.s3Enabled, region: settings.value.s3Region, bucket: settings.value.s3Bucket, prefix: settings.value.s3Prefix }),
      getCredentials: () => credentials.read() });
    queue = new CompressionQueue(settings, s3);
    watch = new FolderWatchController({ settings, queue, onChange: () => { updateMenus(); broadcast(); }, onError: notice,
      onActivity: (action, file, error) => { history.add({ action, file, ...(error ? { error: safeHistoryError(error) } : {}) }); broadcast(); } });
    const build = path.resolve(__dirname, '..');
    const preload = path.join(build, 'preload/index.cjs');
    mainWindow = createAppWindow({ preload, html: path.join(build, 'renderer/index.html'), isQuitting: () => quitting });
    applyWindowMaterial(mainWindow, settings.value.glassEnabled);
    corner = new CornerWindow({ preload, html: path.join(build, 'renderer/features/corner-drop/index.html'), anchorWindow: mainWindow, onError: notice });
    settingsWindow = new SettingsWindow({ preload, html: path.join(build, 'renderer/features/settings/index.html'),
      title: category => `${text(category === 'cloud' ? 's3.heading' : category === 'history' ? 'history.heading' : `settings.${category}`)} — ${APP_NAME}`, glassEnabled: () => settings.value.glassEnabled,
      isQuitting: () => quitting, onError: notice });
    settingsUpdater = new SettingsUpdater(settings, async () => {
      const result = await dialog.showMessageBox(dialogParent(), { type: 'warning', title: text('settings.overwriteAction'),
        message: text('settings.overwriteConfirm'), buttons: [text('settings.overwriteAction'), text('common.cancel')], defaultId: 1, cancelId: 1 });
      return result.response === 0;
    });
    tray = createTray();
    notificationDelivery = new NotificationDelivery({
      create: content => {
        if (!Notification.isSupported()) throw new Error('notifications.unavailable');
        return new Notification({ title: content.title, body: content.body, groupId: APP_ID });
      },
      record: (action, error) => { history.add({ action, file: null, ...(error ? { error } : {}) }); broadcast(); },
      onError: notice,
    });
    completion = new CompletionNotifier({ isEnabled: () => settings.value.notificationsEnabled, translate: text, openResults: openMain,
      show: content => notificationDelivery.show(content) });
    tray.on('double-click', openMain);
    queue.on('change', broadcast);
    queue.on('accepted', (file: string, origin: 'manual' | 'watch') => history.add({ action: origin === 'watch' ? 'watchDetected' : 'detected', file }));
    queue.on('output', (result: CompressionResult) => {
      watch.markOutput(result);
      history.add({ action: result.skipped ? 'skipped' : 'compressed', file: result.source, outputPath: result.outputPath,
        originalBytes: result.originalBytes, outputBytes: result.outputBytes });
    });
    queue.on('settled', (job: Job) => {
      if (job.state === 'failed') history.add({ action: job.phase === 'uploading' ? 'uploadFailed' : 'failed', file: job.source, error: safeHistoryError(job.error) });
      else if (job.result?.remoteLocation) history.add({ action: 'uploaded', file: job.source, outputPath: job.result.outputPath });
    });
    queue.on('drained', (summary: BatchSummary) => {
      if (!settings.value.notificationsEnabled) history.add({ action: 'notificationSuppressed', file: null });
      completion.complete(summary); broadcast();
    });
    session.defaultSession.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*', 'ws://*/*', 'wss://*/*'] }, (_details, callback) => callback({ cancel: true }));
    registerIPC(); updateMenus(); corner.update(settings.value);
    screen.on('display-metrics-changed', () => corner.refresh());
    screen.on('display-added', () => corner.refresh());
    screen.on('display-removed', () => corner.refresh());
    app.on('activate', openMain);
    if (settings.value.watchEnabled && settings.value.watchPath) await watch.start().catch(notice);
  }).catch(error => { dialog.showErrorBox(APP_NAME, errorText(error)); app.quit(); });
  app.on('window-all-closed', () => {});
  app.on('before-quit', () => { quitting = true; completion?.dispose(); notificationDelivery?.dispose(); settingsWindow?.dispose(); corner?.dispose(); if (watch) perform(() => watch.stop({ persist: false })); });
  process.on('SIGTERM', () => app.quit());
  process.on('SIGINT', () => app.quit());
  app.on('open-file', (event, file) => { event.preventDefault(); perform(() => app.whenReady().then(() => queue.enqueue([file]))); });
}
