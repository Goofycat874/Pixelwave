import { clipTextOverlays, clipTrack, getProjectDuration } from './editor.js';
import { drawFrame, framePlan, sourceTimeAt } from './compositor.js';
import { resolveTextStyle, textFont } from './text.js';
import { captionFontStack, loadCustomCaptionFont } from './transcription.js';

export const EXPORT_FORMATS = Object.freeze([
  { id: 'mp4', label: 'MP4', detail: 'H.264, plays everywhere', extension: 'mp4', kind: 'video' },
  { id: 'mov', label: 'MOV', detail: 'H.264 in a QuickTime file', extension: 'mov', kind: 'video' },
  { id: 'webm', label: 'WebM', detail: 'VP9 for the web', extension: 'webm', kind: 'video' },
  { id: 'gif', label: 'GIF', detail: 'Looping animation, no sound', extension: 'gif', kind: 'gif' },
  { id: 'mp3', label: 'MP3', detail: 'Audio only', extension: 'mp3', kind: 'audio' },
  { id: 'wav', label: 'WAV', detail: 'Lossless audio only', extension: 'wav', kind: 'audio' },
]);

export const EXPORT_QUALITIES = Object.freeze([
  { id: 'high', label: 'High', detail: 'Best picture, larger file', crf: 16 },
  { id: 'standard', label: 'Standard', detail: 'Great for sharing', crf: 20 },
  { id: 'small', label: 'Small', detail: 'Quick uploads', crf: 26 },
]);

export function exportProfile(format) {
  return EXPORT_FORMATS.find((profile) => profile.id === format) || null;
}

export function exportQuality(id) {
  return EXPORT_QUALITIES.find((quality) => quality.id === id) || EXPORT_QUALITIES[1];
}

export function evenSize(value) {
  return Math.max(2, Math.round(Number(value) / 2) * 2);
}

// Offers sizes by their short side so vertical and landscape projects read the same way.
export function exportResolutions(project) {
  const width = Number(project.width) || 1920;
  const height = Number(project.height) || 1080;
  const shortSide = Math.min(width, height);
  const targets = [...new Set([2160, 1440, 1080, 720, 480, shortSide])].sort((a, b) => b - a);
  return targets.map((target) => {
    const factor = target / shortSide;
    return {
      id: String(target),
      label: `${target}p`,
      width: evenSize(width * factor),
      height: evenSize(height * factor),
      native: target === shortSide,
    };
  });
}

export function buildRenderPlan(clips) {
  const sorted = [...clips].sort((a, b) => a.start - b.start || clipTrack(a) - clipTrack(b));
  const duration = sorted.length ? Math.max(...sorted.map((clip) => clip.start + clip.duration)) : 0;
  return { clips: sorted, duration: Math.round(duration * 1000) / 1000 };
}

export function exportRange(project, range = null) {
  const duration = getProjectDuration(project.clips || []);
  const start = Math.max(0, Math.min(duration, Number(range?.start) || 0));
  const requestedEnd = Number.isFinite(Number(range?.end)) ? Number(range.end) : duration;
  const end = Math.max(start, Math.min(duration, requestedEnd));
  return { start, end, duration: Math.round((end - start) * 1000) / 1000 };
}

export function exportFrameTimes(duration, frameRate = 30, start = 0) {
  const fps = Math.max(1, Math.round(Number(frameRate) || 30));
  const count = Math.max(1, Math.ceil(Math.max(0, Number(duration) || 0) * fps - 1e-6));
  return Array.from({ length: count }, (_, index) => Math.round((start + index / fps) * 1_000_000) / 1_000_000);
}

function waitFor(element, event) {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      element.removeEventListener(event, ready);
      element.removeEventListener('error', failed);
    };
    const ready = () => { cleanup(); resolve(); };
    const failed = () => { cleanup(); reject(new Error('An imported media file could not be prepared for export.')); };
    element.addEventListener(event, ready, { once: true });
    element.addEventListener('error', failed, { once: true });
  });
}

async function prepareSource(asset) {
  if (asset.kind === 'image') {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.src = asset.src;
    await image.decode().catch(() => waitFor(image, 'load'));
    return image;
  }
  const element = document.createElement('video');
  element.preload = 'auto';
  element.muted = true;
  element.crossOrigin = 'anonymous';
  element.src = asset.src;
  await waitFor(element, 'loadeddata');
  return element;
}

async function seekVideo(source, targetTime) {
  if (!(source instanceof HTMLVideoElement)) return;
  const duration = Number.isFinite(source.duration) ? source.duration : targetTime;
  const target = Math.max(0, Math.min(targetTime, Math.max(0, duration - 0.001)));
  source.pause();
  if (source.readyState >= 2 && Math.abs(source.currentTime - target) < 0.0005) return;
  await new Promise((resolve, reject) => {
    const cleanup = () => {
      source.removeEventListener('seeked', ready);
      source.removeEventListener('error', failed);
    };
    const ready = () => { cleanup(); resolve(); };
    const failed = () => { cleanup(); reject(new Error('A video frame could not be decoded for export.')); };
    source.addEventListener('seeked', ready, { once: true });
    source.addEventListener('error', failed, { once: true });
    source.currentTime = target;
  });
}

export function projectFontRequests(project) {
  const requests = new Set();
  for (const clip of project.clips || []) {
    for (const overlay of clipTextOverlays(clip)) requests.add(textFont(resolveTextStyle(overlay), 48));
    if (clip.transcript?.text) requests.add(`700 48px ${captionFontStack(clip.transcript.fontFamily, clip.transcript.customFont)}`);
  }
  return [...requests];
}

export async function loadProjectFonts(project) {
  await Promise.all((project.clips || []).map((clip) => loadCustomCaptionFont(clip.transcript?.customFont).catch(() => null)));
  if (!document.fonts?.load) return;
  await Promise.all(projectFontRequests(project).map((font) => document.fonts.load(font).catch(() => null)));
  await document.fonts.ready;
}

function needsVisualSource(clip) {
  return clip.kind === 'video' || clip.kind === 'image';
}

function releaseVideo(element) {
  if (!(element instanceof HTMLVideoElement)) return;
  element.removeAttribute('src');
  element.load();
}

// Opens decoders only for clips on screen and releases them once their clip has ended,
// so long timelines do not hold every video open at once.
export function createSourceSet(project) {
  const assetById = new Map((project.media || []).map((asset) => [asset.id, asset]));
  const byClip = new Map();
  const pending = new Map();
  const imageByAsset = new Map();

  async function ensure(clip) {
    if (!needsVisualSource(clip)) return null;
    if (byClip.has(clip.id)) return byClip.get(clip.id);
    if (!pending.has(clip.id)) {
      const asset = assetById.get(clip.assetId);
      if (!asset) throw new Error(`Missing media for ${clip.name}.`);
      let loading;
      if (asset.kind === 'image') {
        if (!imageByAsset.has(asset.id)) imageByAsset.set(asset.id, prepareSource(asset));
        loading = imageByAsset.get(asset.id);
      } else {
        loading = prepareSource(asset);
      }
      pending.set(clip.id, loading.then((element) => {
        byClip.set(clip.id, element);
        pending.delete(clip.id);
        return element;
      }));
    }
    return pending.get(clip.id);
  }

  return {
    get: (clip) => byClip.get(clip.id) || null,
    async seekFor(time) {
      const plan = framePlan(project, time);
      const entries = plan.layers.flatMap((layer) => [
        { clip: layer.clip, time: layer.time },
        ...(layer.previous ? [{ clip: layer.previous.clip, time: layer.previous.time }] : []),
      ]);
      await Promise.all(entries.map(async (entry) => {
        const element = await ensure(entry.clip);
        await seekVideo(element, sourceTimeAt(entry.clip, entry.time));
      }));
      const needed = new Set(entries.map((entry) => entry.clip.id));
      for (const [clipId, element] of byClip) {
        const clip = project.clips.find((candidate) => candidate.id === clipId);
        if (!needed.has(clipId) && element instanceof HTMLVideoElement && (!clip || clip.start + clip.duration < time - 2)) {
          releaseVideo(element);
          byClip.delete(clipId);
        }
      }
    },
    dispose() {
      for (const element of byClip.values()) releaseVideo(element);
      byClip.clear();
    },
  };
}

function createCanvas(width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

export async function exportTimeline({
  project,
  width = project.width,
  height = project.height,
  frameRate = project.frameRate || 30,
  range = null,
  onProgress,
  onFrame,
  cancelToken,
}) {
  const span = exportRange(project, range);
  if (!span.duration) throw new Error('Add at least one clip before exporting.');
  if (typeof onFrame !== 'function') throw new Error('The video export session is not available.');

  const canvas = createCanvas(evenSize(width), evenSize(height));
  const context = canvas.getContext('2d', { alpha: false, willReadFrequently: true });
  await loadProjectFonts(project);
  const sources = createSourceSet(project);

  try {
    const frameTimes = exportFrameTimes(span.duration, frameRate, span.start);
    for (let frameIndex = 0; frameIndex < frameTimes.length; frameIndex += 1) {
      if (cancelToken?.cancelled) throw new Error('Export cancelled.');
      const time = frameTimes[frameIndex];
      await sources.seekFor(time);
      drawFrame(context, { project, time, getSource: sources.get });
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
      await onFrame(pixels.buffer, frameIndex, frameTimes.length);
      onProgress?.((frameIndex + 1) / frameTimes.length);
    }
    return { duration: span.duration, frameCount: frameTimes.length, width: canvas.width, height: canvas.height };
  } finally {
    sources.dispose();
  }
}

export async function renderSnapshot(project, time) {
  const canvas = createCanvas(evenSize(project.width), evenSize(project.height));
  const context = canvas.getContext('2d', { alpha: false });
  await loadProjectFonts(project);
  const sources = createSourceSet(project);
  try {
    await sources.seekFor(time);
    drawFrame(context, { project, time, getSource: sources.get });
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('Pixelwave could not capture this frame.');
    return blob.arrayBuffer();
  } finally {
    sources.dispose();
  }
}
