import type { BrowserWindow, WebPreferences } from 'electron';
export function webPreferences(preload: string): WebPreferences { return { preload, contextIsolation: true, nodeIntegration: false, sandbox: true }; }
export function lockNavigation(window: BrowserWindow): void {
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', event => event.preventDefault());
}
