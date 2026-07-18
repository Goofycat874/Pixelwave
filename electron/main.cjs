const { app, BrowserWindow, dialog, ipcMain, net, protocol, shell, utilityProcess } = require('electron');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { pathToFileURL } = require('node:url');
const ffmpegStaticPath = require('ffmpeg-static');
const { buildMediaFetchInit, isSupportedCaptionFontPath, resolveMediaByteRange } = require('./media-protocol.cjs');
const { createTranscriptionIpcHandler, createTranscriptionService } = require('./transcription-service.cjs');
const { buildFrameExportArgs, writeFrame } = require('./export-session.cjs');

let mainWindow;
let transcriptionIpcHandler;
let transcriptionService;
const authorizedMediaPaths = new Set();
const exportFormats = new Set(['webm', 'mp4', 'mov']);
const recordingFormats = new Map([
  ['audio/webm', 'webm'],
  ['audio/ogg', 'ogg'],
  ['audio/mp4', 'm4a'],
]);
const MAX_RECORDING_BYTES = 250 * 1024 * 1024;
const MAX_EXPORT_FRAME_BYTES = 32 * 1024 * 1024;
const exportJobs = new Map();

protocol.registerSchemesAsPrivileged([
  { scheme: 'pixelwave-media', privileges: { secure: true, standard: true, supportFetchAPI: true, corsEnabled: true, stream: true } },
]);

function mediaUrl(filePath) {
  authorizedMediaPaths.add(filePath);
  return `pixelwave-media://local/file?path=${encodeURIComponent(filePath)}`;
}

function ffmpegPath() {
  return ffmpegStaticPath.replace('app.asar', 'app.asar.unpacked');
}

function runFfmpeg(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(ffmpegPath(), args, { windowsHide: true });
    let stderr = '';
    child.stderr.on('data', (chunk) => {
      stderr = `${stderr}${chunk}`.slice(-12000);
    });
    child.once('error', reject);
    child.once('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`FFmpeg conversion failed (${code}). ${stderr.split('\n').slice(-4).join(' ')}`));
    });
  });
}

const mediaFilters = [
  { name: 'Media', extensions: ['mp4', 'mov', 'm4v', 'webm', 'avi', 'mkv', 'mp3', 'wav', 'm4a', 'aac', 'ogg', 'png', 'jpg', 'jpeg', 'webp', 'gif'] },
  { name: 'Video', extensions: ['mp4', 'mov', 'm4v', 'webm', 'avi', 'mkv'] },
  { name: 'Audio', extensions: ['mp3', 'wav', 'm4a', 'aac', 'ogg'] },
  { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] },
];
const captionFontFilters = [
  { name: 'Font files', extensions: ['ttf', 'otf', 'woff', 'woff2'] },
];

function inferKind(filePath) {
  const extension = path.extname(filePath).slice(1).toLowerCase();
  if (['mp4', 'mov', 'm4v', 'webm', 'avi', 'mkv'].includes(extension)) return 'video';
  if (['mp3', 'wav', 'm4a', 'aac', 'ogg'].includes(extension)) return 'audio';
  return 'image';
}

function mediaDescriptor(filePath) {
  return {
    id: `media-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    name: path.basename(filePath),
    path: filePath,
    src: mediaUrl(filePath),
    kind: inferKind(filePath),
  };
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1500,
    height: 940,
    minWidth: 1120,
    minHeight: 720,
    backgroundColor: '#111312',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 16 },
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.once('ready-to-show', () => mainWindow.show());

  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) {
    mainWindow.loadURL(devUrl);
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }
}

ipcMain.handle('media:open', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Import media',
    properties: ['openFile', 'multiSelections'],
    filters: mediaFilters,
  });
  if (result.canceled) return [];
  return result.filePaths.map(mediaDescriptor);
});

ipcMain.handle('font:open', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Choose a caption font',
    properties: ['openFile'],
    filters: captionFontFilters,
  });
  if (result.canceled) return null;
  const filePath = result.filePaths[0];
  if (!isSupportedCaptionFontPath(filePath)) {
    throw new Error('Choose a TTF, OTF, WOFF, or WOFF2 font file.');
  }
  const name = path.basename(filePath);
  const displayName = path.basename(filePath, path.extname(filePath));
  return {
    name,
    family: `Pixelwave Custom ${displayName}`,
    path: filePath,
    src: mediaUrl(filePath),
  };
});

ipcMain.handle('project:save', async (_event, project, currentPath) => {
  let filePath = currentPath;
  if (!filePath) {
    const result = await dialog.showSaveDialog(mainWindow, {
      title: 'Save Pixelwave project',
      defaultPath: `${project.name || 'Untitled project'}.pixelwave`,
      filters: [{ name: 'Pixelwave Project', extensions: ['pixelwave'] }],
    });
    if (result.canceled) return null;
    filePath = result.filePath;
  }
  await fs.writeFile(filePath, JSON.stringify(project, null, 2), 'utf8');
  return filePath;
});

ipcMain.handle('project:open', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Open Pixelwave project',
    properties: ['openFile'],
    filters: [{ name: 'Pixelwave Project', extensions: ['pixelwave'] }],
  });
  if (result.canceled) return null;
  const filePath = result.filePaths[0];
  const project = JSON.parse(await fs.readFile(filePath, 'utf8'));
  project.media = (project.media || []).map((item) => ({
    ...item,
    src: item.proxyPath ? mediaUrl(item.proxyPath) : item.path ? mediaUrl(item.path) : item.src,
  }));
  project.clips = (project.clips || []).map((clip) => {
    const customFont = clip.transcript?.customFont;
    if (!customFont?.path || !isSupportedCaptionFontPath(customFont.path)) return clip;
    return {
      ...clip,
      transcript: {
        ...clip.transcript,
        customFont: { ...customFont, src: mediaUrl(customFont.path) },
      },
    };
  });
  return { filePath, project };
});

ipcMain.handle('media:proxy', async (_event, item) => {
  if (!item?.path || item.kind !== 'video') throw new Error('Only imported video files can be optimized.');
  const proxyDirectory = path.join(app.getPath('userData'), 'media-proxies');
  await fs.mkdir(proxyDirectory, { recursive: true });
  const safeId = String(item.id || Date.now()).replace(/[^a-zA-Z0-9_-]/g, '');
  const proxyPath = path.join(proxyDirectory, `${safeId}.mp4`);
  await runFfmpeg([
    '-y', '-i', item.path,
    '-map', '0:v:0', '-map', '0:a?',
    '-vf', "scale='min(1920,iw)':-2",
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart',
    proxyPath,
  ]);
  return { ...item, proxyPath, src: mediaUrl(proxyPath), optimized: true };
});

ipcMain.handle('media:reveal', (_event, filePath) => {
  if (typeof filePath !== 'string' || !filePath) return false;
  shell.showItemInFolder(filePath);
  return true;
});

ipcMain.handle('recording:save', async (_event, bytes, mimeType) => {
  const baseMime = String(mimeType || 'audio/webm').split(';')[0].toLowerCase();
  const extension = recordingFormats.get(baseMime);
  if (!extension) throw new Error('Pixelwave does not support this recording format.');
  const buffer = Buffer.from(bytes);
  if (!buffer.length) throw new Error('The recording did not contain any audio.');
  if (buffer.length > MAX_RECORDING_BYTES) throw new Error('The recording is too large to save. Keep takes under 250 MB.');

  const directory = path.join(app.getPath('userData'), 'voice-recordings');
  await fs.mkdir(directory, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filePath = path.join(directory, `Voice take ${timestamp}.${extension}`);
  await fs.writeFile(filePath, buffer);
  return {
    id: `media-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    name: path.basename(filePath),
    path: filePath,
    src: mediaUrl(filePath),
    kind: 'audio',
    recordedAt: new Date().toISOString(),
  };
});

ipcMain.handle('transcription:clip', async (event, request) => {
  if (!transcriptionIpcHandler) throw new Error('The transcription service is not ready yet.');
  return transcriptionIpcHandler(event, request);
});

ipcMain.handle('export:begin', async (event, options = {}) => {
  const format = exportFormats.has(options.format) ? options.format : 'mp4';
  const extension = format;
  const formatNames = { webm: 'WebM Video', mp4: 'MP4 Video', mov: 'QuickTime Movie' };
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Export video',
    defaultPath: options.suggestedName || `Pixelwave export.${extension}`,
    filters: [{ name: formatNames[format], extensions: [extension] }],
  });
  if (result.canceled) return null;

  const temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'pixelwave-frame-export-'));
  let audioPath = null;
  const audioBuffer = options.audioBytes ? Buffer.from(options.audioBytes) : null;
  if (audioBuffer?.length) {
    audioPath = path.join(temporaryDirectory, 'mix.wav');
    await fs.writeFile(audioPath, audioBuffer);
  }

  const child = spawn(ffmpegPath(), buildFrameExportArgs({
    format,
    frameRate: options.frameRate || 30,
    audioPath,
    outputPath: result.filePath,
  }), { windowsHide: true, stdio: ['pipe', 'ignore', 'pipe'] });
  let stderr = '';
  child.stderr.on('data', (chunk) => {
    stderr = `${stderr}${chunk}`.slice(-12000);
  });
  const done = new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`FFmpeg export failed (${code}). ${stderr.split('\n').slice(-4).join(' ')}`));
    });
  });
  done.catch(() => {});
  const jobId = `export-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  exportJobs.set(jobId, {
    child,
    done,
    ownerId: event.sender.id,
    outputPath: result.filePath,
    temporaryDirectory,
  });
  return { jobId };
});

ipcMain.handle('export:frame', async (event, jobId, bytes) => {
  const job = exportJobs.get(jobId);
  if (!job || job.ownerId !== event.sender.id) throw new Error('The export session is no longer available.');
  const byteLength = bytes?.byteLength ?? bytes?.length ?? 0;
  if (!byteLength || byteLength > MAX_EXPORT_FRAME_BYTES) throw new Error('The rendered video frame is invalid.');
  await writeFrame(job.child.stdin, bytes);
  return true;
});

ipcMain.handle('export:finish', async (event, jobId) => {
  const job = exportJobs.get(jobId);
  if (!job || job.ownerId !== event.sender.id) throw new Error('The export session is no longer available.');
  try {
    job.child.stdin.end();
    await job.done;
    return job.outputPath;
  } finally {
    exportJobs.delete(jobId);
    await fs.rm(job.temporaryDirectory, { recursive: true, force: true });
  }
});

ipcMain.handle('export:cancel', async (event, jobId) => {
  const job = exportJobs.get(jobId);
  if (!job || job.ownerId !== event.sender.id) return false;
  exportJobs.delete(jobId);
  job.child.stdin.destroy();
  job.child.kill('SIGTERM');
  await job.done.catch(() => {});
  await fs.rm(job.outputPath, { force: true });
  await fs.rm(job.temporaryDirectory, { recursive: true, force: true });
  return true;
});

app.whenReady().then(async () => {
  const cacheDir = path.join(app.getPath('userData'), 'speech-models');
  await fs.mkdir(cacheDir, { recursive: true });
  transcriptionService = createTranscriptionService({
    fork: (...args) => utilityProcess.fork(...args),
    workerPath: path.join(__dirname, 'transcription-worker.cjs'),
    ffmpegPath: ffmpegPath(),
    cacheDir,
  });
  transcriptionIpcHandler = createTranscriptionIpcHandler({
    service: transcriptionService,
    authorizedPaths: authorizedMediaPaths,
  });
  protocol.handle('pixelwave-media', async (request) => {
    const filePath = new URL(request.url).searchParams.get('path');
    if (!filePath) return new Response('Missing media path', { status: 400 });
    if (!authorizedMediaPaths.has(filePath)) return new Response('Media path is not authorized', { status: 403 });
    const response = await net.fetch(pathToFileURL(filePath).href, buildMediaFetchInit(request));
    const fileSize = (await fs.stat(filePath)).size;
    const byteRange = resolveMediaByteRange(request.headers.get('Range'), fileSize);
    const headers = new Headers(response.headers);
    headers.set('Accept-Ranges', 'bytes');
    headers.set('Access-Control-Allow-Origin', '*');
    headers.set('Access-Control-Allow-Headers', 'Range');
    if (byteRange) {
      headers.set('Content-Length', String(byteRange.length));
      headers.set('Content-Range', byteRange.contentRange);
    } else {
      headers.set('Content-Length', String(fileSize));
    }
    return new Response(response.body, {
      status: byteRange ? 206 : response.status,
      statusText: byteRange ? 'Partial Content' : response.statusText,
      headers,
    });
  });
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => transcriptionService?.dispose());
