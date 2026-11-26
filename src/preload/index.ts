import { contextBridge, ipcRenderer, webUtils } from 'electron';
import { IPC } from '../shared/contracts';
import type { AppState, TinyPNG, SettingsCategory } from '../shared/contracts';

const api: TinyPNG = {
  getState: () => ipcRenderer.invoke(IPC.getState),
  onState: callback => { const listener = (_event: Electron.IpcRendererEvent, state: AppState): void => callback(state); ipcRenderer.on(IPC.state, listener); return () => { ipcRenderer.removeListener(IPC.state, listener); }; },
  onOpenSettings: callback => {
    const listener = (_event: Electron.IpcRendererEvent, category?: SettingsCategory): void => callback(category);
    ipcRenderer.on(IPC.openSettings, listener);
    ipcRenderer.send(IPC.settingsReady);
    return () => { ipcRenderer.removeListener(IPC.openSettings, listener); };
  },
  openSettings: category => ipcRenderer.invoke(IPC.openSettings, category),
  setSettingsCategory: category => ipcRenderer.invoke(IPC.settingsCategory, category),
  chooseFiles: () => ipcRenderer.invoke(IPC.chooseFiles),
  enqueueFiles: files => ipcRenderer.invoke(IPC.enqueue, files.map(file => webUtils.getPathForFile(file)).filter(Boolean)),
  chooseWatchFolder: () => ipcRenderer.invoke(IPC.chooseWatch), startWatch: () => ipcRenderer.invoke(IPC.startWatch), stopWatch: () => ipcRenderer.invoke(IPC.stopWatch),
  chooseOutputFolder: () => ipcRenderer.invoke(IPC.chooseOutput), updateSettings: patch => ipcRenderer.invoke(IPC.updateSettings, patch),
  pause: () => ipcRenderer.invoke(IPC.pause), resume: () => ipcRenderer.invoke(IPC.resume), retry: id => ipcRenderer.invoke(IPC.retry, id),
  remove: id => ipcRenderer.invoke(IPC.remove, id), clearFinished: () => ipcRenderer.invoke(IPC.clear), reveal: file => ipcRenderer.invoke(IPC.reveal, file),
  openMain: () => ipcRenderer.invoke(IPC.openMain), dismissNotice: () => ipcRenderer.invoke(IPC.dismissNotice),
  clearHistory: () => ipcRenderer.invoke(IPC.clearHistory),
  testNotification: () => ipcRenderer.invoke(IPC.testNotification),
  openNotificationSettings: () => ipcRenderer.invoke(IPC.openNotificationSettings),
  saveS3Credentials: credentials => ipcRenderer.invoke(IPC.saveS3Credentials, credentials),
};
contextBridge.exposeInMainWorld('tinyPNG', api);
