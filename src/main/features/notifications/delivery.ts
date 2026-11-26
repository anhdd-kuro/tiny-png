import type { CompletionContent } from './completion.ts';

type NativeEvent = 'show' | 'failed' | 'close' | 'click';
type Listener = (...args: unknown[]) => void;
export type NotificationDeliveryAction = 'notificationRequested' | 'notificationSent' | 'notificationFailed' | 'notificationUnconfirmed';

export interface NativeNotificationHandle {
  on(event: NativeEvent, listener: Listener): unknown;
  removeListener?(event: NativeEvent, listener: Listener): unknown;
  show(): void;
  close?(): void;
}

interface Dependencies {
  create(content: CompletionContent): NativeNotificationHandle;
  record(action: NotificationDeliveryAction, errorKey?: string): void;
  onError(error: Error): void;
}

interface ActiveNotification {
  handle: NativeNotificationHandle;
  state: 'pending' | 'sent' | 'unconfirmed' | 'failed';
  retained: boolean;
  timer?: ReturnType<typeof setTimeout>;
  listeners: Array<[NativeEvent, Listener]>;
}

const confirmationTimeoutMs = 10_000;
const maximumRetainedNotifications = 32;

export class NotificationDelivery {
  private readonly active = new Set<ActiveNotification>();
  private disposed = false;

  constructor(private readonly dependencies: Dependencies) {}

  show(content: CompletionContent): void {
    if (this.disposed) return;
    this.dependencies.record('notificationRequested');
    let handle: NativeNotificationHandle;
    try { handle = this.dependencies.create(content); }
    catch { this.failed(); return; }

    while (this.active.size >= maximumRetainedNotifications) {
      const oldest = this.active.values().next().value!;
      if (oldest.state === 'pending') this.unconfirmed(oldest);
      this.release(oldest);
    }
    const notification: ActiveNotification = { handle, state: 'pending', retained: true, listeners: [] };
    this.active.add(notification);
    const listen = (event: NativeEvent, listener: Listener): void => {
      notification.listeners.push([event, listener]);
      handle.on(event, listener);
    };
    try {
      listen('show', () => {
        if (!notification.retained || this.disposed || notification.state === 'sent' || notification.state === 'failed') return;
        notification.state = 'sent';
        this.clearTimer(notification);
        this.dependencies.record('notificationSent');
      });
      listen('failed', () => {
        if (!notification.retained || this.disposed || notification.state === 'failed') return;
        notification.state = 'failed';
        this.release(notification);
        this.failed();
      });
      listen('close', () => { this.unconfirmed(notification); this.release(notification); });
      listen('click', () => { if (notification.retained && !this.disposed) content.onClick(); });
      notification.timer = setTimeout(() => this.unconfirmed(notification), confirmationTimeoutMs);
      notification.timer.unref?.();
      handle.show();
    } catch {
      notification.state = 'failed';
      this.release(notification);
      this.failed();
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const notification of this.active) {
      const pending = notification.state === 'pending';
      this.release(notification);
      if (pending) {
        try { notification.handle.close?.(); }
        catch { /* Shutdown must still release the remaining handles. */ }
      }
    }
  }

  private failed(): void {
    this.dependencies.record('notificationFailed', 'notifications.unavailable');
    this.dependencies.onError(new Error('notifications.unavailable'));
  }

  private unconfirmed(notification: ActiveNotification): void {
    if (!notification.retained || this.disposed || notification.state !== 'pending') return;
    notification.state = 'unconfirmed';
    this.clearTimer(notification);
    // No native callback is not proof of denied permission or failed delivery.
    this.dependencies.record('notificationUnconfirmed', 'notifications.unconfirmed');
  }

  private clearTimer(notification: ActiveNotification): void {
    if (notification.timer) clearTimeout(notification.timer);
    notification.timer = undefined;
  }

  private release(notification: ActiveNotification): void {
    if (!notification.retained) return;
    notification.retained = false;
    this.clearTimer(notification);
    for (const [event, listener] of notification.listeners) notification.handle.removeListener?.(event, listener);
    notification.listeners = [];
    this.active.delete(notification);
  }
}
