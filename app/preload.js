const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('versions', {
  node: () => process.versions.node,
  chrome: () => process.versions.chrome,
  electron: () => process.versions.electron,
  ping: (param) => ipcRenderer.invoke('ping', param)
  // we can also expose variables, not just functions
})

contextBridge.exposeInMainWorld('fs', {
  getFileList: (directory) => ipcRenderer.invoke('getFileList', directory),
  writeFile: (filePath, content) => ipcRenderer.invoke('writeFile', filePath, content),
  deleteFile: (filePath) => ipcRenderer.invoke('deleteFile', filePath),
  readFile: (filePath) => ipcRenderer.invoke('readFile', filePath),
})