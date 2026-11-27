import type { CornerPresentationState } from '../../../shared/contracts';

interface Target {
  isVisible(): boolean;
  showInactive(): void;
  hide(): void;
  setIgnoreMouseEvents(ignore: boolean): void;
  send(state: CornerPresentationState): void;
}

export class CornerPresentation {
  private visible = false;
  private animated = false;
  private disposed = false;
  private revision = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  constructor(private readonly target: Target) {}

  private cancelHide(): void {
    this.revision++;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  sync(): void {
    if (!this.disposed) this.target.send({ visible: this.visible, animated: this.animated });
  }

  setVisible(visible: boolean, animated: boolean): void {
    if (this.disposed) return;
    this.animated = animated;
    if (this.visible === visible) {
      if (!visible && !animated && this.timer) {
        this.cancelHide();
        if (this.target.isVisible()) this.target.hide();
      }
      return;
    }
    this.cancelHide();
    this.visible = visible;
    this.target.setIgnoreMouseEvents(!visible);
    if (visible) {
      if (!this.target.isVisible()) this.target.showInactive();
      this.sync();
    } else {
      this.sync();
      if (animated && this.target.isVisible()) {
        const revision = this.revision;
        this.timer = setTimeout(() => {
          if (this.disposed || revision !== this.revision || this.visible) return;
          this.timer = null;
          if (this.target.isVisible()) this.target.hide();
        }, 180);
      } else if (this.target.isVisible()) this.target.hide();
    }
  }

  dispose(): void {
    this.cancelHide();
    this.disposed = true;
  }
}
