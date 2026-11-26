const { app, BrowserWindow, Menu, Tray, nativeImage, ipcMain, dialog, screen, shell, session } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { collectFiles, compressFile, DEFAULTS } = require('./core/compressor.cjs');
const { createFolderWatcher } = require('./core/watcher.cjs');

app.setName('Tiny PNG');
let mainWindow, cornerWindow, tray, watcher;
let quitting = false;
let watchGeneration = 0;
let preferencePath;
const state = { jobs: [], settings: {}, isProcessing: false, paused: false, watchRunning: false, notice: null };

function readSettings() {
  const defaults = { ...DEFAULTS, cornerEnabled: true, dropCorner: 'topRight', watchPath: null, watchEnabled: false };
  try { return { ...defaults, ...JSON.parse(fs.readFileSync(preferencePath, 'utf8')) }; }
  catch { return defaults; }
}

function saveSettings() {
  fs.mkdirSync(path.dirname(preferencePath), { recursive: true });
  const temporary = `${preferencePath}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(state.settings, null, 2), { mode: 0o600 });
  fs.renameSync(temporary, preferencePath);
}

function broadcast() {
  for (const win of [mainWindow, cornerWindow]) {
    if (win && !win.isDestroyed()) win.webContents.send('state', state);
  }
  if (tray) {
    const failed = state.jobs.filter(job => job.state === 'failed').length;
    tray.setToolTip(`Tiny PNG${state.isProcessing ? ' — Đang nén' : ''}${failed ? ` — ${failed} ảnh lỗi` : ''}`);
  }
}

function notice(error) {
  state.notice = error instanceof Error ? error.message : String(error);
  broadcast();
}

function openMain() {
  if (!mainWindow || mainWindow.isDestroyed()) createMainWindow();
  mainWindow.show();
  mainWindow.focus();
}

function safeWindowOptions() {
  return { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true };
}

function lockWindow(win) {
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', event => event.preventDefault());
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    title: 'Tiny PNG', width: 920, height: 760, minWidth: 680, minHeight: 560,
    titleBarStyle: 'hiddenInset', backgroundColor: '#388bab', show: false,
    webPreferences: safeWindowOptions()
  });
  lockWindow(mainWindow);
  mainWindow.loadFile(path.join(__dirname, 'renderer/index.html'));
  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.on('close', event => { if (!quitting) { event.preventDefault(); mainWindow.hide(); } });
}

function positionCorner() {
  if (!cornerWindow || cornerWindow.isDestroyed()) return;
  const display = mainWindow && !mainWindow.isDestroyed() ? screen.getDisplayMatching(mainWindow.getBounds()) : screen.getPrimaryDisplay();
  const { x, y, width, height } = display.workArea;
  const position = state.settings.dropCorner;
  const right = position.endsWith('Right');
  const top = position.startsWith('top');
  cornerWindow.setPosition(Math.round(right ? x + width - 132 : x + 20), Math.round(top ? y + 20 : y + height - 124));
}

function updateCorner() {
  if (!cornerWindow || cornerWindow.isDestroyed()) {
    cornerWindow = new BrowserWindow({
      width: 112, height: 104, frame: false, transparent: true, resizable: false,
      focusable: false, skipTaskbar: true, alwaysOnTop: true, hasShadow: true,
      acceptFirstMouse: true, show: false, webPreferences: safeWindowOptions()
    });
    lockWindow(cornerWindow);
    cornerWindow.setAlwaysOnTop(true, 'floating');
    cornerWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    cornerWindow.loadFile(path.join(__dirname, 'renderer/corner.html'));
    cornerWindow.once('ready-to-show', () => { positionCorner(); if (state.settings.cornerEnabled) cornerWindow.showInactive(); });
  }
  positionCorner();
  if (state.settings.cornerEnabled) cornerWindow.showInactive(); else cornerWindow.hide();
}

function buildMenu() {
  const showSettings = () => { openMain(); mainWindow.webContents.send('open-settings'); };
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: 'Tiny PNG', submenu: [
      { label: 'Cài đặt…', accelerator: 'CmdOrCtrl+,', click: showSettings },
      { type: 'separator' }, { role: 'hide' }, { role: 'hideOthers' }, { role: 'unhide' },
      { type: 'separator' }, { label: 'Thoát Tiny PNG', accelerator: 'CmdOrCtrl+Q', click: () => app.quit() }
    ] },
    { label: 'File', submenu: [
      { label: 'Thêm ảnh…', accelerator: 'CmdOrCtrl+O', click: () => chooseFiles() },
      { label: 'Theo dõi thư mục…', click: () => chooseWatchFolder() },
      { role: 'close' }
    ] },
    { role: 'editMenu' }, { role: 'windowMenu' }
  ]));
  const bitmap = Buffer.alloc(18 * 18 * 4);
  for (let y = 2; y < 16; y++) for (let x = 2; x < 16; x++) {
    const border = x < 4 || x > 13 || y < 4 || y > 13;
    const mountain = y >= 8 && y <= 12 && (Math.abs(x - 7) === 12 - y || Math.abs(x - 12) === 11 - y);
    const sun = x >= 11 && x <= 12 && y >= 5 && y <= 6;
    if (border || mountain || sun) bitmap[(y * 18 + x) * 4 + 3] = 255;
  }
  const trayImage = nativeImage.createFromBitmap(bitmap, { width: 18, height: 18 });
  trayImage.setTemplateImage(true);
  tray = new Tray(trayImage.resize({ width: 18, height: 18 }));
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Mở Tiny PNG', click: openMain },
    { label: 'Thêm ảnh…', click: () => chooseFiles() },
    { label: 'Theo dõi thư mục…', click: () => chooseWatchFolder() },
    { label: 'Dừng theo dõi', click: () => stopWatching() },
    { type: 'separator' }, { label: 'Cài đặt…', click: showSettings },
    { label: 'Thoát Tiny PNG', click: () => app.quit() }
  ]));
  tray.on('double-click', openMain);
}

async function chooseFiles() {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Chọn ảnh hoặc thư mục', properties: ['openFile', 'openDirectory', 'multiSelections'],
    filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'avif'] }]
  });
  if (!result.canceled) await enqueue(result.filePaths);
}

async function enqueue(paths) {
  const files = await collectFiles(paths);
  if (!files.length) { notice('Không tìm thấy ảnh PNG, JPEG, WebP hoặc AVIF hợp lệ.'); return; }
  const active = new Set(state.jobs.filter(job => ['queued', 'processing'].includes(job.state)).map(job => job.source));
  for (const source of files) {
    if (active.has(source)) continue;
    const stat = await fs.promises.stat(source).catch(() => null);
    if (!stat) continue;
    state.jobs.push({ id: randomUUID(), source, name: path.basename(source), originalBytes: stat.size, state: 'queued', error: null, result: null });
    active.add(source);
  }
  broadcast();
  if (!state.paused) void runQueue();
}

async function runQueue() {
  if (state.isProcessing || state.paused) return;
  state.isProcessing = true;
  broadcast();
  try {
    let job;
    while (!state.paused && (job = state.jobs.find(item => item.state === 'queued'))) {
      job.state = 'processing';
      job.error = null;
      const options = { ...state.settings };
      broadcast();
      try {
        const result = await compressFile(job.source, options);
        watcher?.markOutput(result.outputPath, result.outputFingerprint);
        job.result = result;
        job.state = 'completed';
      } catch (error) { job.state = 'failed'; job.error = error.message; }
      broadcast();
    }
  } finally { state.isProcessing = false; broadcast(); }
}

async function stopWatching() {
  ++watchGeneration;
  const previous = watcher;
  watcher = null;
  state.watchRunning = false;
  state.settings.watchEnabled = false;
  saveSettings();
  broadcast();
  if (previous) await previous.close();
}

async function startWatching(directory = state.settings.watchPath) {
  if (!directory) { await chooseWatchFolder(); return; }
  await stopWatching();
  const generation = watchGeneration;
  try {
    const next = await createFolderWatcher(directory, {
      onFiles: paths => { if (generation === watchGeneration) void enqueue(paths).catch(notice); },
      onError: error => { if (generation === watchGeneration) notice(error); }
    });
    if (generation !== watchGeneration) { await next.close(); return; }
    watcher = next;
    state.settings.watchPath = directory;
    state.settings.watchEnabled = true;
    state.watchRunning = true;
    saveSettings();
    broadcast();
  } catch (error) { if (generation === watchGeneration) notice(error); }
}

async function chooseWatchFolder() {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Theo dõi thư mục screenshot', defaultPath: state.settings.watchPath || app.getPath('desktop'),
    properties: ['openDirectory'], buttonLabel: 'Theo dõi thư mục'
  });
  if (!result.canceled && result.filePaths[0]) await startWatching(result.filePaths[0]);
}

function validateSettings(patch) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw new Error('Cài đặt không hợp lệ.');
  const result = {};
  const bools = ['overwrite', 'resizeEnabled', 'cornerEnabled'];
  for (const key of bools) if (key in patch) {
    if (typeof patch[key] !== 'boolean') throw new Error('Cài đặt không hợp lệ.');
    result[key] = patch[key];
  }
  for (const [key, min, max] of [['quality', 1, 100], ['width', 1, 32768], ['height', 1, 32768]]) if (key in patch) {
    if (!Number.isInteger(patch[key]) || patch[key] < min || patch[key] > max) throw new Error(`${key} phải từ ${min} đến ${max}.`);
    result[key] = patch[key];
  }
  for (const [key, values] of [
    ['format', ['original', 'png', 'jpeg', 'webp', 'avif']],
    ['resizeMethod', ['fit', 'cover', 'scale', 'thumb']],
    ['dropCorner', ['topRight', 'topLeft', 'bottomRight', 'bottomLeft']]
  ]) if (key in patch) {
    if (!values.includes(patch[key])) throw new Error('Cài đặt không hợp lệ.');
    result[key] = patch[key];
  }
  if ('outputDirectory' in patch) {
    if (patch.outputDirectory !== null) throw new Error('Hãy dùng nút chọn thư mục output.');
    result.outputDirectory = null;
  }
  return result;
}

function registerIPC() {
  const handle = (name, fn) => ipcMain.handle(name, async (event, ...args) => {
    if (![mainWindow?.webContents, cornerWindow?.webContents].includes(event.sender)) throw new Error('Cửa sổ không được phép.');
    try { return await fn(...args); }
    catch (error) { notice(error); throw new Error(error.message); }
  });
  handle('get-state', () => state);
  handle('choose-files', chooseFiles);
  handle('enqueue', paths => {
    if (!Array.isArray(paths) || paths.length > 5000 || !paths.every(file => typeof file === 'string' && path.isAbsolute(file))) throw new Error('Đường dẫn ảnh không hợp lệ.');
    return enqueue(paths);
  });
  handle('choose-watch', chooseWatchFolder);
  handle('start-watch', () => startWatching());
  handle('stop-watch', stopWatching);
  handle('choose-output', async () => {
    const result = await dialog.showOpenDialog(mainWindow, { title: 'Lưu ảnh tại', properties: ['openDirectory', 'createDirectory'] });
    if (!result.canceled && result.filePaths[0]) {
      state.settings.outputDirectory = result.filePaths[0];
      state.settings.overwrite = false;
      saveSettings(); broadcast();
    }
  });
  handle('update-settings', patch => {
    state.settings = { ...state.settings, ...validateSettings(patch) };
    if (state.settings.overwrite) state.settings.outputDirectory = null;
    saveSettings(); updateCorner(); broadcast(); return state;
  });
  handle('pause', () => { state.paused = true; broadcast(); });
  handle('resume', () => { state.paused = false; void runQueue(); });
  handle('retry', id => {
    const job = state.jobs.find(item => item.id === id && item.state === 'failed');
    if (job) { job.state = 'queued'; job.error = null; broadcast(); if (!state.paused) void runQueue(); }
  });
  handle('remove', id => { state.jobs = state.jobs.filter(job => job.id !== id || job.state === 'processing'); broadcast(); });
  handle('clear', () => { state.jobs = state.jobs.filter(job => ['queued', 'processing'].includes(job.state)); broadcast(); });
  handle('reveal', file => {
    if (!state.jobs.some(job => job.result?.outputPath === file || job.source === file)) throw new Error('Không có file này trong danh sách.');
    shell.showItemInFolder(file);
  });
  handle('open-main', openMain);
  handle('dismiss-notice', () => { state.notice = null; broadcast(); });
}

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', (_event, args) => { openMain(); const files = args.filter(arg => path.isAbsolute(arg) && fs.existsSync(arg) && !arg.endsWith('.app')); if (files.length) void enqueue(files).catch(notice); });
  app.whenReady().then(async () => {
    preferencePath = path.join(app.getPath('userData'), 'settings.json');
    state.settings = readSettings();
    // The app loads bundled files only. Compression and UI never need network access.
    session.defaultSession.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*', 'ws://*/*', 'wss://*/*'] }, (_details, callback) => callback({ cancel: true }));
    registerIPC(); createMainWindow(); updateCorner(); buildMenu();
    screen.on('display-metrics-changed', positionCorner);
    screen.on('display-added', positionCorner);
    screen.on('display-removed', positionCorner);
    app.on('activate', openMain);
    if (state.settings.watchEnabled && state.settings.watchPath) await startWatching(state.settings.watchPath);
  }).catch(error => { dialog.showErrorBox('Tiny PNG', error.message); app.quit(); });
  app.on('window-all-closed', () => {});
  app.on('before-quit', () => { quitting = true; void watcher?.close(); });
  app.on('open-file', (event, file) => { event.preventDefault(); app.whenReady().then(() => enqueue([file])).catch(notice); });
}
