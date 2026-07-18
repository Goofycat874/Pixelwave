const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('pixelwave', {
  openMedia: () => ipcRenderer.invoke('media:open'),
  openCaptionFont: () => ipcRenderer.invoke('font:open'),
  createProxy: (item) => ipcRenderer.invoke('media:proxy', item),
  revealMedia: (filePath) => ipcRenderer.invoke('media:reveal', filePath),
  saveVoiceRecording: (bytes, mimeType) => ipcRenderer.invoke('recording:save', bytes, mimeType),
  transcribeClip: (request) => ipcRenderer.invoke('transcription:clip', request),
  onTranscriptionProgress: (callback) => {
    const listener = (_event, status) => callback(status);
    ipcRenderer.on('transcription:progress', listener);
    return () => ipcRenderer.removeListener('transcription:progress', listener);
  },
  openProject: () => ipcRenderer.invoke('project:open'),
  saveProject: (project, currentPath) => ipcRenderer.invoke('project:save', project, currentPath),
  beginExport: (options) => ipcRenderer.invoke('export:begin', options),
  writeExportFrame: (jobId, bytes) => ipcRenderer.invoke('export:frame', jobId, bytes),
  finishExport: (jobId) => ipcRenderer.invoke('export:finish', jobId),
  cancelExport: (jobId) => ipcRenderer.invoke('export:cancel', jobId),
  platform: process.platform,
});
