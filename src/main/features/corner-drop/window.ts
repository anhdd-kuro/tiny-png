import { BrowserWindow, screen } from 'electron';
import { webPreferences, lockNavigation } from '../../platform/window-security';
import { createDragMonitor, isNearCorner } from './drag-monitor';
import type { Settings } from '../../../shared/contracts';
import { applyWindowMaterial } from '../appearance/material';

export class CornerWindow {
  readonly window: BrowserWindow;
  private settings: Pick<Settings, 'cornerEnabled' | 'dropCorner' | 'cornerMode'> = { cornerEnabled: true, dropCorner: 'topRight', cornerMode: 'always' };
  private dragging = false;
  private ready = false;
  private monitor: ReturnType<typeof createDragMonitor> | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private monitorFailed = false;
  constructor(private readonly deps: { preload: string; html: string; anchorWindow: BrowserWindow; onError: (error: unknown) => void }) {
    this.window = new BrowserWindow({
      width: 112, height: 104, frame: false, transparent: true, resizable: false,
      focusable: false, skipTaskbar: true, alwaysOnTop: true, hasShadow: true,
      backgroundColor: '#00000000', roundedCorners: true,
      acceptFirstMouse: true, show: false, webPreferences: webPreferences(deps.preload),
    });
    applyWindowMaterial(this.window, false, { transparentHost: true });
    lockNavigation(this.window);
    this.window.setAlwaysOnTop(true, 'floating');
    this.window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    this.window.once('ready-to-show', () => { this.ready = true; this.refresh(); });
    void this.window.loadFile(deps.html).catch(deps.onError);
  }
  update(settings: Settings): void {
    this.settings = settings;
    const automatic = settings.cornerEnabled && settings.cornerMode === 'nearby';
    if (automatic && !this.monitor) {
      this.monitorFailed = false;
      this.monitor = createDragMonitor({ onChange: value => { this.dragging = value; this.refresh(); }, onError: error => {
        this.monitorFailed = true; this.dragging = false; this.deps.onError(error); this.refresh();
      } });
      this.timer = setInterval(() => this.refresh(), 120);
      this.timer.unref();
    } else if (!automatic && this.monitor) {
      this.monitor.stop(); this.monitor = null;
      if (this.timer) clearInterval(this.timer);
      this.timer = null; this.dragging = false; this.monitorFailed = false;
    }
    this.refresh();
  }
  refresh(): void {
    if (!this.ready || this.window.isDestroyed()) return;
    const automatic = this.settings.cornerMode === 'nearby' && !this.monitorFailed;
    if (!this.settings.cornerEnabled || automatic && !this.dragging) {
      if (this.window.isVisible()) this.window.hide();
      return;
    }
    const point = screen.getCursorScreenPoint();
    const display = automatic ? screen.getDisplayNearestPoint(point) : screen.getDisplayMatching(this.deps.anchorWindow.getBounds());
    const area = display.workArea;
    const island = this.settings.dropCorner === 'topCenter';
    const width = island ? 220 : 112;
    const height = island ? 72 : 104;
    const current = this.window.getSize();
    if (current[0] !== width || current[1] !== height) this.window.setSize(width, height);
    const right = this.settings.dropCorner.endsWith('Right');
    const top = this.settings.dropCorner.startsWith('top');
    const x = Math.round(island ? area.x + (area.width - width) / 2 : right ? area.x + area.width - width - 20 : area.x + 20);
    const y = Math.round(island ? area.y + 8 : top ? area.y + 20 : area.y + area.height - height - 20);
    const position = this.window.getPosition();
    if (position[0] !== x || position[1] !== y) this.window.setPosition(x, y);
    const visible = !automatic || isNearCorner(point, area, this.settings.dropCorner, 180, display.bounds);
    if (visible && !this.window.isVisible()) this.window.showInactive();
    else if (!visible && this.window.isVisible()) this.window.hide();
  }
  dispose(): void {
    this.monitor?.stop();
    if (this.timer) clearInterval(this.timer);
    if (!this.window.isDestroyed()) this.window.destroy();
  }
}
