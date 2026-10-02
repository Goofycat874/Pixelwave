const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('pixelwave', {
  openMedia: () => ipcRenderer.invoke('media:open'),
  pathForFile: (file) => {
    try {
      return webUtils.getPathForFile(file) || '';
    } catch {
      return '';
    }
  },
  registerMedia: (filePaths) => ipcRenderer.invoke('media:register', filePaths),
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
  openProject: (filePath) => ipcRenderer.invoke('project:open', filePath),
  saveProject: (project, currentPath, options) => ipcRenderer.invoke('project:save', project, currentPath, options),
  listRecentProjects: () => ipcRenderer.invoke('recent:list'),
  writeAutosave: (project) => ipcRenderer.invoke('autosave:write', project),
  readAutosave: () => ipcRenderer.invoke('autosave:read'),
  clearAutosave: () => ipcRenderer.invoke('autosave:clear'),
  beginExport: (options) => ipcRenderer.invoke('export:begin', options),
  writeExportFrame: (jobId, bytes) => ipcRenderer.invoke('export:frame', jobId, bytes),
  finishExport: (jobId) => ipcRenderer.invoke('export:finish', jobId),
  cancelExport: (jobId) => ipcRenderer.invoke('export:cancel', jobId),
  exportAudio: (bytes, options) => ipcRenderer.invoke('export:audio', bytes, options),
  exportImage: (bytes, options) => ipcRenderer.invoke('export:image', bytes, options),
  platform: process.platform,
});
