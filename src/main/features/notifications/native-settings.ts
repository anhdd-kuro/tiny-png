import koffi, { type LibraryHandle } from 'koffi';
import type { NotificationSetting, NotificationSystemSettings } from '../../../shared/notifications.ts';

export type NativeNotificationSettings = NotificationSystemSettings;

type Pointer = bigint | null;
interface PendingQuery {
  promise: Promise<NativeNotificationSettings>;
  resolve(value: NativeNotificationSettings): void;
  reject(error: Error): void;
  timer: ReturnType<typeof setTimeout>;
  settled: boolean;
}

const TIMEOUT_MS = 5000;
let reader: (() => Promise<NativeNotificationSettings>) | undefined;
// FFI pointers do not keep their JS backing storage or library handles alive.
// This process-lifetime root is bounded to one successfully initialized reader.
const residentBlocks: Array<{
  framework: LibraryHandle; objc: LibraryHandle; blocks: LibraryHandle;
  signature: Buffer; descriptor: unknown; block: unknown; invoke: bigint;
}> = [];

function createReader(): () => Promise<NativeNotificationSettings> {
  const framework: LibraryHandle = koffi.load('/System/Library/Frameworks/UserNotifications.framework/UserNotifications', { global: true });
  const objc = koffi.load('/usr/lib/libobjc.A.dylib');
  const blocks = koffi.load('/usr/lib/libSystem.B.dylib');
  const getClass = objc.func('objc_getClass', 'void *', ['str']) as (name: string) => Pointer;
  const selector = objc.func('sel_registerName', 'void *', ['str']) as (name: string) => Pointer;
  const sendPointer = objc.func('objc_msgSend', 'void *', ['void *', 'void *']) as (object: Pointer, method: Pointer) => Pointer;
  const sendInteger = objc.func('objc_msgSend', 'long', ['void *', 'void *']) as (object: Pointer, method: Pointer) => number | bigint;
  const responds = objc.func('objc_msgSend', 'bool', ['void *', 'void *', 'void *']) as (object: Pointer, method: Pointer, argument: Pointer) => boolean;
  const sendBlock = objc.func('objc_msgSend', 'void', ['void *', 'void *', 'void *']) as (object: Pointer, method: Pointer, argument: unknown) => void;
  const pushPool = objc.func('objc_autoreleasePoolPush', 'void *', []) as () => Pointer;
  const popPool = objc.func('objc_autoreleasePoolPop', 'void', ['void *']) as (pool: Pointer) => void;
  const centerClass = getClass('UNUserNotificationCenter');
  if (!centerClass) throw new Error('notifications.unavailable');
  const methods = {
    current: selector('currentNotificationCenter'), read: selector('getNotificationSettingsWithCompletionHandler:'),
    responds: selector('respondsToSelector:'), authorization: selector('authorizationStatus'),
    alert: selector('alertSetting'), alertStyle: selector('alertStyle'),
    notificationCenter: selector('notificationCenterSetting'), sound: selector('soundSetting'),
    scheduledDelivery: selector('scheduledDeliverySetting'), timeSensitive: selector('timeSensitiveSetting'),
  };
  const setting = (value: number | bigint): NotificationSetting => ['notSupported', 'disabled', 'enabled'][Number(value)] as NotificationSetting ?? 'unknown';
  let pending: PendingQuery | undefined;
  const invokeType = koffi.proto('void', ['void *', 'void *']);
  const invoke = koffi.register((_block: Pointer, settings: Pointer): void => {
    const request = pending;
    if (!request) return;
    pending = undefined;
    clearTimeout(request.timer);
    if (request.settled) return;
    request.settled = true;
    let pool: Pointer = null;
    try {
      pool = pushPool();
      if (!settings) throw new Error('notifications.unavailable');
      const result: NativeNotificationSettings = {
        authorization: ['notDetermined', 'denied', 'authorized', 'provisional', 'ephemeral'][Number(sendInteger(settings, methods.authorization))] as NativeNotificationSettings['authorization'] ?? 'unknown',
        alert: setting(sendInteger(settings, methods.alert)),
        alertStyle: ['none', 'banner', 'alert'][Number(sendInteger(settings, methods.alertStyle))] as NativeNotificationSettings['alertStyle'] ?? 'unknown',
        notificationCenter: setting(sendInteger(settings, methods.notificationCenter)),
        sound: setting(sendInteger(settings, methods.sound)),
      };
      if (responds(settings, methods.responds, methods.scheduledDelivery)) result.scheduledDelivery = setting(sendInteger(settings, methods.scheduledDelivery));
      if (responds(settings, methods.responds, methods.timeSensitive)) result.timeSensitive = setting(sendInteger(settings, methods.timeSensitive));
      request.resolve(result);
    } catch { request.reject(new Error('notifications.unavailable')); }
    finally { if (pool) popPool(pool); }
  }, koffi.pointer(invokeType));

  // Apple Block ABI: a global block has no captured objects and copy/release are no-ops.
  // Keep exactly one native block, descriptor and registered callback for this process.
  // In particular, a timeout must not unregister a callback the OS may still invoke.
  const descriptorType = koffi.struct({ reserved: 'ulong', size: 'ulong', signature: 'void *' });
  const blockType = koffi.struct({ isa: 'void *', flags: 'int', reserved: 'int', invoke: 'void *', descriptor: 'void *' });
  const signature = Buffer.from('v16@?0@8\0');
  let descriptor: unknown;
  let block: unknown;
  try {
    descriptor = koffi.alloc(descriptorType, 1);
    block = koffi.alloc(blockType, 1);
    koffi.encode(descriptor, descriptorType, { reserved: 0, size: koffi.sizeof(blockType), signature });
    koffi.encode(block, blockType, { isa: blocks.symbol('_NSConcreteGlobalBlock'), flags: (1 << 28) | (1 << 30), reserved: 0, invoke, descriptor });
  } catch (error) {
    // No native request has received the callback yet, so this cleanup is safe.
    koffi.unregister(invoke);
    if (block) koffi.free(block);
    if (descriptor) koffi.free(descriptor);
    throw error;
  }
  residentBlocks.push({ framework, objc, blocks, signature, descriptor, block, invoke });

  return () => {
    // Single flight also bounds native resources if the OS never answers. A late
    // reply retires the timed-out request before another query can be submitted.
    if (pending) return pending.promise;
    let resolve!: PendingQuery['resolve'];
    let reject!: PendingQuery['reject'];
    const promise = new Promise<NativeNotificationSettings>((yes, no) => { resolve = yes; reject = no; });
    const request: PendingQuery = {
      promise, resolve, reject, settled: false,
      timer: setTimeout(() => { request.settled = true; reject(new Error('notifications.unconfirmed')); }, TIMEOUT_MS),
    };
    pending = request;
    let pool: Pointer = null;
    try {
      pool = pushPool();
      const center = sendPointer(centerClass, methods.current);
      if (!center || !responds(center, methods.responds, methods.read)) throw new Error('notifications.unavailable');
      sendBlock(center, methods.read, block);
    } catch {
      pending = undefined;
      clearTimeout(request.timer);
      request.settled = true;
      reject(new Error('notifications.unavailable'));
    } finally { if (pool) popPool(pool); }
    return promise;
  };
}

/** Read this signed Electron app's public UN settings; never request authorization or replace its delegate. */
export function readNotificationSettings(): Promise<NativeNotificationSettings> {
  if (process.platform !== 'darwin' || !process.versions.electron || process.type !== 'browser') return Promise.reject(new Error('notifications.unavailable'));
  try { reader ??= createReader(); return reader(); }
  catch { return Promise.reject(new Error('notifications.unavailable')); }
}
