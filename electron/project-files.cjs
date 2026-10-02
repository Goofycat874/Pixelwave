const path = require('node:path');

const VIDEO_EXTENSIONS = ['mp4', 'mov', 'm4v', 'webm', 'avi', 'mkv'];
const AUDIO_EXTENSIONS = ['mp3', 'wav', 'm4a', 'aac', 'ogg', 'flac', 'opus'];
const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp', 'gif'];
const RECENT_LIMIT = 10;

function extensionOf(filePath) {
  return path.extname(String(filePath || '')).slice(1).toLowerCase();
}

function mediaKindForPath(filePath) {
  const extension = extensionOf(filePath);
  if (VIDEO_EXTENSIONS.includes(extension)) return 'video';
  if (AUDIO_EXTENSIONS.includes(extension)) return 'audio';
  if (IMAGE_EXTENSIONS.includes(extension)) return 'image';
  return null;
}

function isImportableMediaPath(filePath) {
  return Boolean(mediaKindForPath(filePath));
}

function mergeRecentProjects(list, entry, limit = RECENT_LIMIT) {
  const valid = (Array.isArray(list) ? list : []).filter((item) => item && typeof item.path === 'string');
  return [
    { path: entry.path, name: entry.name || path.basename(entry.path, '.pixelwave'), openedAt: entry.openedAt },
    ...valid.filter((item) => item.path !== entry.path),
  ].slice(0, limit);
}

module.exports = {
  AUDIO_EXTENSIONS,
  IMAGE_EXTENSIONS,
  VIDEO_EXTENSIONS,
  isImportableMediaPath,
  mediaKindForPath,
  mergeRecentProjects,
};
