import type { CompletionContent } from './completion.ts';
import { randomUUID } from 'node:crypto';
import type { NotificationDiagnosticAction } from '../../../shared/notifications';

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
  create(content: CompletionContent, id: string): NativeNotificationHandle;
  record(action: NotificationDeliveryAction, errorKey?: string): void;
  onError(error: Error): void;
  diagnose?(action: NotificationDiagnosticAction, id: string, detail?: unknown): void;
  isInNotificationCenter?(id: string): Promise<boolean>;
}

interface ActiveNotification {
  handle: NativeNotificationHandle;
  id: string;
  state: 'pending' | 'sent' | 'unconfirmed' | 'failed';
  retained: boolean;
  timer?: ReturnType<typeof setTimeout>;
  inspectionTimer?: ReturnType<typeof setTimeout>;
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
    const id = randomUUID();
    this.dependencies.record('notificationRequested');
    this.diagnose('request', id);
    let handle: NativeNotificationHandle;
    try { handle = this.dependencies.create(content, id); }
    catch (error) { this.failed(id, error); return; }

    while (this.active.size >= maximumRetainedNotifications) {
      const oldest = this.active.values().next().value!;
      if (oldest.state === 'pending') this.unconfirmed(oldest);
      this.release(oldest);
    }
    const notification: ActiveNotification = { handle, id, state: 'pending', retained: true, listeners: [] };
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
        this.diagnose('accepted', id);
        this.inspect(notification);
      });
      listen('failed', (...args) => {
        if (!notification.retained || this.disposed || notification.state === 'failed') return;
        notification.state = 'failed';
        this.release(notification);
        this.failed(id, args.find(value => typeof value === 'string' || value instanceof Error));
      });
      listen('close', () => { this.diagnose('closed', id); this.unconfirmed(notification); this.release(notification); });
      listen('click', () => { if (notification.retained && !this.disposed) { this.diagnose('clicked', id); content.onClick(); } });
      notification.timer = setTimeout(() => this.unconfirmed(notification), confirmationTimeoutMs);
      notification.timer.unref?.();
      handle.show();
    } catch (error) {
      notification.state = 'failed';
      this.release(notification);
      this.failed(id, error);
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

  private diagnose(action: NotificationDiagnosticAction, id: string, detail?: unknown): void {
    try { this.dependencies.diagnose?.(action, id, detail); }
    catch { console.warn('Tiny Assets: notification diagnostics callback failed.'); }
  }
  private inspect(notification: ActiveNotification): void {
    if (!this.dependencies.isInNotificationCenter || notification.inspectionTimer) return;
    notification.inspectionTimer = setTimeout(() => {
      notification.inspectionTimer = undefined;
      const inspect = this.dependencies.isInNotificationCenter;
      if (!inspect || !notification.retained || this.disposed) return;
      void inspect(notification.id).then(found => {
        if (!this.disposed && notification.retained) this.diagnose(found ? 'inNotificationCenter' : 'notInNotificationCenter', notification.id);
      }, error => { if (!this.disposed && notification.retained) this.diagnose('inspectionFailed', notification.id, error); });
    }, 1000);
    notification.inspectionTimer.unref?.();
  }
  private failed(id: string, error?: unknown): void {
    this.diagnose('failed', id, error);
    this.dependencies.record('notificationFailed', 'notifications.unavailable');
    this.dependencies.onError(new Error('notifications.unavailable'));
  }

  private unconfirmed(notification: ActiveNotification): void {
    if (!notification.retained || this.disposed || notification.state !== 'pending') return;
    notification.state = 'unconfirmed';
    this.clearTimer(notification);
    // No native callback is not proof of denied permission or failed delivery.
    this.dependencies.record('notificationUnconfirmed', 'notifications.unconfirmed');
    this.diagnose('unconfirmed', notification.id);
  }

  private clearTimer(notification: ActiveNotification): void {
    if (notification.timer) clearTimeout(notification.timer);
    notification.timer = undefined;
  }

  private release(notification: ActiveNotification): void {
    if (!notification.retained) return;
    notification.retained = false;
    this.clearTimer(notification);
    if (notification.inspectionTimer) clearTimeout(notification.inspectionTimer);
    notification.inspectionTimer = undefined;
    for (const [event, listener] of notification.listeners) notification.handle.removeListener?.(event, listener);
    notification.listeners = [];
    this.active.delete(notification);
  }
}
