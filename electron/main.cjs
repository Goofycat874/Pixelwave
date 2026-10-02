const { app, BrowserWindow, dialog, ipcMain, net, protocol, shell, utilityProcess } = require('electron');
const fs = require('node:fs/promises');
const { createWriteStream } = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { pathToFileURL } = require('node:url');
const ffmpegStaticPath = require('ffmpeg-static');
const { buildMediaFetchInit, isSupportedCaptionFontPath, resolveMediaByteRange } = require('./media-protocol.cjs');
const { createTranscriptionIpcHandler, createTranscriptionService } = require('./transcription-service.cjs');
const { buildAudioExportArgs, buildFrameExportArgs, expectedFrameBytes, writeFrame } = require('./export-session.cjs');
const {
  AUDIO_EXTENSIONS,
  IMAGE_EXTENSIONS,
  VIDEO_EXTENSIONS,
  isImportableMediaPath,
  mediaKindForPath,
  mergeRecentProjects,
} = require('./project-files.cjs');

let mainWindow;
let transcriptionIpcHandler;
let transcriptionService;
const authorizedMediaPaths = new Set();
const exportFormats = new Set(['webm', 'mp4', 'mov', 'gif']);
const audioExportFormats = new Set(['wav', 'mp3']);
const MAX_AUDIO_EXPORT_BYTES = 2 * 1024 * 1024 * 1024;
const MAX_IMAGE_EXPORT_BYTES = 256 * 1024 * 1024;
const recordingFormats = new Map([
  ['audio/webm', 'webm'],
  ['audio/ogg', 'ogg'],
  ['audio/mp4', 'm4a'],
]);
const MAX_RECORDING_BYTES = 250 * 1024 * 1024;
const MAX_EXPORT_FRAME_BYTES = 64 * 1024 * 1024;
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
  { name: 'Media', extensions: [...VIDEO_EXTENSIONS, ...AUDIO_EXTENSIONS, ...IMAGE_EXTENSIONS] },
  { name: 'Video', extensions: VIDEO_EXTENSIONS },
  { name: 'Audio', extensions: AUDIO_EXTENSIONS },
  { name: 'Images', extensions: IMAGE_EXTENSIONS },
];
const captionFontFilters = [
  { name: 'Font files', extensions: ['ttf', 'otf', 'woff', 'woff2'] },
];

function userDataFile(...parts) {
  return path.join(app.getPath('userData'), ...parts);
}

async function readRecentProjects() {
  try {
    const parsed = JSON.parse(await fs.readFile(userDataFile('recent-projects.json'), 'utf8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function rememberRecentProject(filePath, name) {
  const next = mergeRecentProjects(await readRecentProjects(), { path: filePath, name, openedAt: new Date().toISOString() });
  await fs.writeFile(userDataFile('recent-projects.json'), JSON.stringify(next, null, 2), 'utf8').catch(() => {});
  if (process.platform === 'darwin' || process.platform === 'win32') app.addRecentDocument(filePath);
}

function hydrateProjectFile(project) {
  const next = { ...project };
  next.media = (project.media || []).map((item) => ({
    ...item,
    src: item.generator ? undefined : item.proxyPath ? mediaUrl(item.proxyPath) : item.path ? mediaUrl(item.path) : item.src,
  }));
  next.clips = (project.clips || []).map((clip) => {
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
  return next;
}

function inferKind(filePath) {
  return mediaKindForPath(filePath) || 'image';
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
    minWidth: 1100,
    minHeight: 700,
    backgroundColor: '#0d0e10',
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
  // The renderer blocks unload while there are unsaved changes; ask before discarding them.
  mainWindow.webContents.on('will-prevent-unload', (event) => {
    const choice = dialog.showMessageBoxSync(mainWindow, {
      type: 'question',
      buttons: ['Quit without saving', 'Keep editing'],
      defaultId: 1,
      cancelId: 1,
      title: 'Unsaved changes',
      message: 'This project has changes that are not saved yet.',
      detail: 'Pixelwave keeps an autosave copy, but saving makes sure nothing is lost.',
    });
    if (choice === 0) event.preventDefault();
  });

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

ipcMain.handle('project:save', async (_event, project, currentPath, options = {}) => {
  let filePath = options.saveAs ? null : currentPath;
  if (!filePath) {
    const result = await dialog.showSaveDialog(mainWindow, {
      title: 'Save Pixelwave project',
      defaultPath: `${project.name || 'Untitled project'}.pixelwave`,
      filters: [{ name: 'Pixelwave Project', extensions: ['pixelwave'] }],
    });
    if (result.canceled) return null;
    filePath = result.filePath;
  }
  if (!filePath.toLowerCase().endsWith('.pixelwave')) filePath = `${filePath}.pixelwave`;
  const temporaryPath = `${filePath}.saving`;
  await fs.writeFile(temporaryPath, JSON.stringify(project, null, 2), 'utf8');
  await fs.rename(temporaryPath, filePath);
  await rememberRecentProject(filePath, project.name);
  await fs.rm(userDataFile('autosave.pixelwave'), { force: true });
  return filePath;
});

ipcMain.handle('project:open', async (_event, requestedPath = null) => {
  let filePath = typeof requestedPath === 'string' ? requestedPath : null;
  if (filePath) {
    const known = (await readRecentProjects()).some((item) => item.path === filePath);
    if (!known || !filePath.toLowerCase().endsWith('.pixelwave')) throw new Error('That project is not in your recent list.');
  } else {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Open Pixelwave project',
      properties: ['openFile'],
      filters: [{ name: 'Pixelwave Project', extensions: ['pixelwave'] }],
    });
    if (result.canceled) return null;
    filePath = result.filePaths[0];
  }
  const project = hydrateProjectFile(JSON.parse(await fs.readFile(filePath, 'utf8')));
  await rememberRecentProject(filePath, project.name);
  return { filePath, project };
});

ipcMain.handle('recent:list', async () => {
  const recent = await readRecentProjects();
  return Promise.all(recent.map(async (item) => ({
    ...item,
    missing: !(await fs.stat(item.path).then((stat) => stat.isFile()).catch(() => false)),
  })));
});

ipcMain.handle('autosave:write', async (_event, project) => {
  if (!project || typeof project !== 'object') return false;
  const target = userDataFile('autosave.pixelwave');
  const payload = JSON.stringify({ savedAt: new Date().toISOString(), project });
  if (payload.length > 64 * 1024 * 1024) return false;
  await fs.writeFile(`${target}.tmp`, payload, 'utf8');
  await fs.rename(`${target}.tmp`, target);
  return true;
});

ipcMain.handle('autosave:read', async () => {
  try {
    const parsed = JSON.parse(await fs.readFile(userDataFile('autosave.pixelwave'), 'utf8'));
    if (!parsed?.project) return null;
    return { savedAt: parsed.savedAt, project: hydrateProjectFile(parsed.project) };
  } catch {
    return null;
  }
});

ipcMain.handle('autosave:clear', async () => {
  await fs.rm(userDataFile('autosave.pixelwave'), { force: true });
  return true;
});

ipcMain.handle('media:register', async (_event, filePaths) => {
  if (!Array.isArray(filePaths)) return [];
  const accepted = [];
  for (const filePath of filePaths.slice(0, 200)) {
    if (typeof filePath !== 'string' || !path.isAbsolute(filePath) || !isImportableMediaPath(filePath)) continue;
    const stat = await fs.stat(filePath).catch(() => null);
    if (stat?.isFile()) accepted.push(mediaDescriptor(filePath));
  }
  return accepted;
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
  const width = Math.round(Number(options.width) || 0);
  const height = Math.round(Number(options.height) || 0);
  if (width < 2 || height < 2 || width > 7680 || height > 7680 || width % 2 || height % 2) throw new Error('The export size is not supported.');
  const frameBytes = expectedFrameBytes(width, height);
  if (frameBytes > MAX_EXPORT_FRAME_BYTES) throw new Error('The export size is too large.');
  const formatNames = { webm: 'WebM Video', mp4: 'MP4 Video', mov: 'QuickTime Movie', gif: 'Animated GIF' };
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Export video',
    defaultPath: options.suggestedName || `Pixelwave export.${extension}`,
    filters: [{ name: formatNames[format], extensions: [extension] }],
  });
  if (result.canceled) return null;

  const temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'pixelwave-frame-export-'));
  let audioPath = null;
  const audioBuffer = options.audioBytes && format !== 'gif' ? Buffer.from(options.audioBytes) : null;
  if (audioBuffer?.length) {
    audioPath = path.join(temporaryDirectory, 'mix.wav');
    await fs.writeFile(audioPath, audioBuffer);
  }

  const child = spawn(ffmpegPath(), buildFrameExportArgs({
    format,
    frameRate: Math.min(120, Math.max(1, Math.round(Number(options.frameRate) || 30))),
    width,
    height,
    quality: options.quality,
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
    frameBytes,
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
  if (byteLength !== job.frameBytes) throw new Error('The rendered video frame is invalid.');
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

async function chooseSavePath(title, suggestedName, filters) {
  const result = await dialog.showSaveDialog(mainWindow, { title, defaultPath: suggestedName, filters });
  return result.canceled ? null : result.filePath;
}

ipcMain.handle('export:audio', async (_event, bytes, options = {}) => {
  const format = audioExportFormats.has(options.format) ? options.format : 'wav';
  const buffer = Buffer.from(bytes || []);
  if (!buffer.length || buffer.length > MAX_AUDIO_EXPORT_BYTES) throw new Error('There is no audio to export.');
  const outputPath = await chooseSavePath('Export audio', options.suggestedName || `Pixelwave audio.${format}`, [{ name: format === 'mp3' ? 'MP3 Audio' : 'WAV Audio', extensions: [format] }]);
  if (!outputPath) return null;
  if (format === 'wav') {
    await fs.writeFile(outputPath, buffer);
    return outputPath;
  }
  const temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'pixelwave-audio-export-'));
  try {
    const inputPath = path.join(temporaryDirectory, 'mix.wav');
    await fs.writeFile(inputPath, buffer);
    await runFfmpeg(buildAudioExportArgs({ inputPath, outputPath, format }));
    return outputPath;
  } finally {
    await fs.rm(temporaryDirectory, { recursive: true, force: true });
  }
});

ipcMain.handle('export:image', async (_event, bytes, options = {}) => {
  const buffer = Buffer.from(bytes || []);
  if (!buffer.length || buffer.length > MAX_IMAGE_EXPORT_BYTES) throw new Error('The frame could not be captured.');
  const outputPath = await chooseSavePath('Save frame', options.suggestedName || 'Pixelwave frame.png', [{ name: 'PNG Image', extensions: ['png'] }]);
  if (!outputPath) return null;
  await new Promise((resolve, reject) => {
    const stream = createWriteStream(outputPath);
    stream.once('error', reject);
    stream.end(buffer, resolve);
  });
  return outputPath;
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
