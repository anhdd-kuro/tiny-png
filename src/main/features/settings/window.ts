import { BrowserWindow } from 'electron';
import { IPC } from '../../../shared/contracts';
import type { SettingsCategory } from '../../../shared/contracts';
import { applyWindowMaterial } from '../appearance/material';
import { lockNavigation, webPreferences } from '../../platform/window-security';

interface Dependencies {
  preload: string;
  html: string;
  title(): string;
  glassEnabled(): boolean;
  isQuitting(): boolean;
  onError(error: unknown): void;
}

export class SettingsWindow {
  window: BrowserWindow | null = null;
  private ready = false;
  private subscribed = false;
  private pendingCategory: SettingsCategory | undefined;
  private appliedGlass: boolean | undefined;
  private requested = false;

  constructor(private readonly dependencies: Dependencies) {}

  open(category?: SettingsCategory): void {
    this.requested = true;
    if (category !== undefined) this.pendingCategory = category;
    if (!this.window || this.window.isDestroyed()) this.create(category);
    this.updateAppearance();
    this.present();
  }

  rendererReady(): void { this.subscribed = true; this.present(); }

  updateAppearance(): void {
    if (!this.window || this.window.isDestroyed()) return;
    this.window.setTitle(this.dependencies.title());
    const glass = this.dependencies.glassEnabled();
    if (glass !== this.appliedGlass) {
      applyWindowMaterial(this.window, glass);
      this.appliedGlass = glass;
    }
  }

  dispose(): void {
    this.requested = false;
    this.pendingCategory = undefined;
    if (this.window && !this.window.isDestroyed()) this.window.destroy();
  }

  private create(category?: SettingsCategory): void {
    this.ready = false;
    this.subscribed = false;
    this.appliedGlass = undefined;
    const window = new BrowserWindow({
      title: this.dependencies.title(), width: 760, height: 640, minWidth: 700, minHeight: 520,
      frame: true, titleBarStyle: 'default', fullscreenable: false, maximizable: false,
      show: false, backgroundColor: '#f5f5f7', vibrancy: 'under-window', visualEffectState: 'active',
      webPreferences: webPreferences(this.dependencies.preload),
    });
    this.window = window;
    lockNavigation(window);
    window.once('ready-to-show', () => { this.ready = true; this.present(); });
    window.webContents.on('did-start-loading', () => { this.subscribed = false; });
    window.webContents.on('before-input-event', (event, input) => {
      if (input.type !== 'keyDown' || input.isComposing) return;
      if (input.key === 'Escape') { event.preventDefault(); this.hide(); }
      const command = process.platform === 'darwin' ? input.meta : input.control;
      if (command && input.key.toLowerCase() === 'o') event.preventDefault();
    });
    window.on('close', event => {
      if (!this.dependencies.isQuitting()) { event.preventDefault(); this.hide(); }
    });
    window.once('closed', () => { if (this.window === window) this.window = null; });
    void window.loadFile(this.dependencies.html, category === undefined ? {} : { query: { category } }).catch(this.dependencies.onError);
  }

  private present(): void {
    const window = this.window;
    if (!this.requested || !window || window.isDestroyed() || !this.ready || !this.subscribed) return;
    if (this.pendingCategory !== undefined) {
      window.webContents.send(IPC.openSettings, this.pendingCategory);
      this.pendingCategory = undefined;
    }
    if (window.isMinimized()) window.restore();
    window.show();
    window.focus();
  }

  private hide(): void {
    this.requested = false;
    this.window?.hide();
  }
}
