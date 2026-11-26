import koffi, { type LibraryHandle } from 'koffi';
import type { DropCorner } from '../../../shared/contracts.ts';

interface Point { x: number; y: number }
interface WorkArea extends Point { width: number; height: number }
interface DragSample { leftDown: boolean; changeCount: bigint; containsFiles: boolean }
interface DragMonitorOptions { onChange(dragging: boolean): void; onError?(error: Error): void }
export interface DragMonitor { stop(): void }
type ObjCPointer = bigint | null;
type ObjCInteger = number | bigint;

let appKitLibrary: LibraryHandle | undefined;
let objcLibrary: LibraryHandle | undefined;

function macDragReader(): () => DragSample {
  if (process.platform !== 'darwin') throw new Error('File drag detection requires macOS.');
  appKitLibrary ??= koffi.load('/System/Library/Frameworks/AppKit.framework/AppKit', { global: true });
  objcLibrary ??= koffi.load('/usr/lib/libobjc.A.dylib');
  const objc = objcLibrary;
  const getClass = objc.func('objc_getClass', 'void *', ['str']) as (name: string) => ObjCPointer;
  const selector = objc.func('sel_registerName', 'void *', ['str']) as (name: string) => ObjCPointer;
  const sendPointer = objc.func('objc_msgSend', 'void *', ['void *', 'void *']) as (receiver: ObjCPointer, method: ObjCPointer) => ObjCPointer;
  const sendObject = objc.func('objc_msgSend', 'void *', ['void *', 'void *', 'void *']) as (receiver: ObjCPointer, method: ObjCPointer, argument: ObjCPointer) => ObjCPointer;
  const sendString = objc.func('objc_msgSend', 'void *', ['void *', 'void *', 'str']) as (receiver: ObjCPointer, method: ObjCPointer, argument: string) => ObjCPointer;
  const sendSigned = objc.func('objc_msgSend', 'int64_t', ['void *', 'void *']) as (receiver: ObjCPointer, method: ObjCPointer) => ObjCInteger;
  const sendUnsigned = objc.func('objc_msgSend', 'uint64_t', ['void *', 'void *']) as (receiver: ObjCPointer, method: ObjCPointer) => ObjCInteger;
  const sendBool = objc.func('objc_msgSend', 'bool', ['void *', 'void *', 'void *']) as (receiver: ObjCPointer, method: ObjCPointer, argument: ObjCPointer) => boolean;
  const pushPool = objc.func('objc_autoreleasePoolPush', 'void *', []) as () => ObjCPointer;
  const popPool = objc.func('objc_autoreleasePoolPop', 'void', ['void *']) as (pool: ObjCPointer) => void;
  const stringClass = getClass('NSString');
  const pasteboardClass = getClass('NSPasteboard');
  const eventClass = getClass('NSEvent');
  if (!stringClass || !pasteboardClass || !eventClass) throw new Error('macOS AppKit drag classes are unavailable.');
  const dragBoardName = koffi.decode(appKitLibrary.symbol('NSPasteboardNameDrag'), 'void *') as ObjCPointer;
  if (!dragBoardName) throw new Error('macOS drag pasteboard name is unavailable.');
  const methods = {
    string: selector('stringWithUTF8String:'), pasteboard: selector('pasteboardWithName:'),
    changeCount: selector('changeCount'), types: selector('types'), contains: selector('containsObject:'),
    buttons: selector('pressedMouseButtons'),
  };
  return () => {
    const pool = pushPool();
    try {
      const board = sendObject(pasteboardClass, methods.pasteboard, dragBoardName);
      if (!board) throw new Error('macOS drag pasteboard is unavailable.');
      const changeCount = BigInt(sendSigned(board, methods.changeCount));
      const leftDown = (BigInt(sendUnsigned(eventClass, methods.buttons)) & 1n) !== 0n;
      let containsFiles = false;
      if (leftDown) {
        const types = sendPointer(board, methods.types);
        const fileURLType = sendString(stringClass, methods.string, 'public.file-url');
        const legacyFileType = sendString(stringClass, methods.string, 'NSFilenamesPboardType');
        containsFiles = sendBool(types, methods.contains, fileURLType) || sendBool(types, methods.contains, legacyFileType);
      }
      return { leftDown, changeCount, containsFiles };
    } finally { popPool(pool); }
  };
}

export function isNearCorner(point: Point, workArea: WorkArea, corner: DropCorner, radius = 180, displayBounds: WorkArea = workArea): boolean {
  if (!point || !workArea || !['topRight', 'topLeft', 'bottomRight', 'bottomLeft', 'topCenter'].includes(corner) ||
      ![point.x, point.y, workArea.x, workArea.y, workArea.width, workArea.height, displayBounds.x, displayBounds.y, displayBounds.width, displayBounds.height, radius].every(Number.isFinite) ||
      radius < 0 || workArea.width <= 0 || workArea.height <= 0 || displayBounds.width <= 0 || displayBounds.height <= 0) return false;
  const maxX = workArea.x + workArea.width;
  const maxY = workArea.y + workArea.height;
  if (point.x < displayBounds.x || point.y < displayBounds.y || point.x > displayBounds.x + displayBounds.width || point.y > displayBounds.y + displayBounds.height) return false;
  const x = corner === 'topCenter' ? workArea.x + workArea.width / 2 : corner.endsWith('Right') ? maxX : workArea.x;
  const y = corner.startsWith('top') ? workArea.y : maxY;
  return Math.hypot(point.x - x, point.y - y) <= radius;
}

export function createDragMonitor({ onChange, onError = () => {} }: DragMonitorOptions): DragMonitor {
  let stopped = false;
  let timer: ReturnType<typeof setInterval> | undefined;
  let previous: boolean | undefined;
  const stop = (): void => { stopped = true; if (timer) clearInterval(timer); };
  try {
    const read = macDragReader();
    let idleChangeCount = read().changeCount;
    const report = (dragging: boolean): void => {
      if (stopped || previous === dragging) return;
      previous = dragging;
      onChange(dragging);
    };
    report(false);
    timer = setInterval(() => {
      try {
        const sample = read();
        if (!sample.leftDown) idleChangeCount = sample.changeCount;
        // Drag pasteboard types persist after a drop; an ordinary click must not reuse that stale session.
        report(sample.leftDown && sample.changeCount !== idleChangeCount && sample.containsFiles);
      } catch (error) {
        stop();
        onError(error instanceof Error ? error : new Error(String(error)));
      }
    }, 120);
  } catch (error) {
    queueMicrotask(() => { if (!stopped) onError(error instanceof Error ? error : new Error(String(error))); });
  }
  return { stop };
}
