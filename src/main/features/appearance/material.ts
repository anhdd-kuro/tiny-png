import { nativeTheme, type BrowserWindow } from 'electron';

interface MaterialOptions { transparentHost?: boolean }
interface WindowMaterial { glass: boolean; transparentHost: boolean; refresh(): void }
const materials = new WeakMap<BrowserWindow, WindowMaterial>();

function paint(window: BrowserWindow, enabled: boolean, transparentHost: boolean): void {
  if (window.isDestroyed()) return;
  const glass = process.platform === 'darwin' && enabled && !nativeTheme.prefersReducedTransparency && !nativeTheme.shouldUseHighContrastColors;
  if (process.platform === 'darwin') window.setVibrancy(glass ? 'under-window' : null);
  window.setBackgroundColor(glass || transparentHost ? '#00000000' : nativeTheme.shouldUseDarkColors ? '#1c1c1e' : '#f5f5f7');
}

export function applyWindowMaterial(window: BrowserWindow, glass: boolean, options: MaterialOptions = {}): void {
  if (window.isDestroyed()) return;
  let material = materials.get(window);
  if (!material) {
    const binding: WindowMaterial = { glass, transparentHost: options.transparentHost ?? false,
      refresh: () => paint(window, binding.glass, binding.transparentHost) };
    nativeTheme.on('updated', binding.refresh);
    window.once('closed', () => { nativeTheme.off('updated', binding.refresh); materials.delete(window); });
    materials.set(window, binding);
    material = binding;
  }
  material.glass = glass;
  material.transparentHost = options.transparentHost ?? material.transparentHost;
  material.refresh();
}
