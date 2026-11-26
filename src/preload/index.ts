import { contextBridge, ipcRenderer, webUtils } from 'electron';
import { IPC } from '../shared/contracts';
import type { AppState, TinyPNG } from '../shared/contracts';

const api: TinyPNG = {
  getState: () => ipcRenderer.invoke(IPC.getState),
  onState: callback => { const listener = (_event: Electron.IpcRendererEvent, state: AppState): void => callback(state); ipcRenderer.on(IPC.state, listener); return () => { ipcRenderer.removeListener(IPC.state, listener); }; },
  onOpenSettings: callback => { const listener = (): void => callback(); ipcRenderer.on(IPC.openSettings, listener); return () => { ipcRenderer.removeListener(IPC.openSettings, listener); }; },
  chooseFiles: () => ipcRenderer.invoke(IPC.chooseFiles),
  enqueueFiles: files => ipcRenderer.invoke(IPC.enqueue, files.map(file => webUtils.getPathForFile(file)).filter(Boolean)),
  chooseWatchFolder: () => ipcRenderer.invoke(IPC.chooseWatch), startWatch: () => ipcRenderer.invoke(IPC.startWatch), stopWatch: () => ipcRenderer.invoke(IPC.stopWatch),
  chooseOutputFolder: () => ipcRenderer.invoke(IPC.chooseOutput), updateSettings: patch => ipcRenderer.invoke(IPC.updateSettings, patch),
  pause: () => ipcRenderer.invoke(IPC.pause), resume: () => ipcRenderer.invoke(IPC.resume), retry: id => ipcRenderer.invoke(IPC.retry, id),
  remove: id => ipcRenderer.invoke(IPC.remove, id), clearFinished: () => ipcRenderer.invoke(IPC.clear), reveal: file => ipcRenderer.invoke(IPC.reveal, file),
  openMain: () => ipcRenderer.invoke(IPC.openMain), dismissNotice: () => ipcRenderer.invoke(IPC.dismissNotice),
  saveS3Credentials: credentials => ipcRenderer.invoke(IPC.saveS3Credentials, credentials),
};
contextBridge.exposeInMainWorld('tinyPNG', api);
