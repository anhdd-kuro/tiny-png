const { contextBridge, ipcRenderer, webUtils } = require('electron');
contextBridge.exposeInMainWorld('tinyPNG', {
  getState: () => ipcRenderer.invoke('get-state'),
  onState: callback => { const listener = (_event, state) => callback(state); ipcRenderer.on('state', listener); return () => ipcRenderer.removeListener('state', listener); },
  onOpenSettings: callback => { const listener = () => callback(); ipcRenderer.on('open-settings', listener); return () => ipcRenderer.removeListener('open-settings', listener); },
  chooseFiles: () => ipcRenderer.invoke('choose-files'),
  enqueueFiles: files => ipcRenderer.invoke('enqueue', files.map(file => webUtils.getPathForFile(file)).filter(Boolean)),
  chooseWatchFolder: () => ipcRenderer.invoke('choose-watch'),
  startWatch: () => ipcRenderer.invoke('start-watch'),
  stopWatch: () => ipcRenderer.invoke('stop-watch'),
  chooseOutputFolder: () => ipcRenderer.invoke('choose-output'),
  updateSettings: patch => ipcRenderer.invoke('update-settings', patch),
  pause: () => ipcRenderer.invoke('pause'), resume: () => ipcRenderer.invoke('resume'),
  retry: id => ipcRenderer.invoke('retry', id), remove: id => ipcRenderer.invoke('remove', id),
  clearFinished: () => ipcRenderer.invoke('clear'), reveal: file => ipcRenderer.invoke('reveal', file),
  openMain: () => ipcRenderer.invoke('open-main'), dismissNotice: () => ipcRenderer.invoke('dismiss-notice')
});
