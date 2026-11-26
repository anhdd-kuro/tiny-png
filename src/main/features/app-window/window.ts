import { BrowserWindow } from 'electron';
import { webPreferences, lockNavigation } from '../../platform/window-security';
import { APP_NAME } from '../../../shared/app';
import { applyWindowMaterial } from '../appearance/material';

export function createAppWindow({ preload, html, isQuitting }: { preload: string; html: string; isQuitting: () => boolean }): BrowserWindow {
  const window = new BrowserWindow({
    title: APP_NAME, width: 760, height: 680, minWidth: 680, minHeight: 560,
    titleBarStyle: 'hiddenInset', backgroundColor: '#00000000', show: false,
    vibrancy: 'under-window', visualEffectState: 'active', roundedCorners: true,
    webPreferences: webPreferences(preload),
  });
  applyWindowMaterial(window, false);
  lockNavigation(window);
  void window.loadFile(html).catch(error => console.error('Tiny PNG: main window load failed:', error.message));
  window.once('ready-to-show', () => window.show());
  window.on('close', event => { if (!isQuitting()) { event.preventDefault(); window.hide(); } });
  return window;
}
