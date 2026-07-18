import { activeClipsAt, clipTextOverlays, clipTrack, computedColorAdjustments } from './editor.js';
import {
  captionBoxEnabled,
  captionFontStack,
  captionTextForClip,
  loadCustomCaptionFont,
} from './transcription.js';

export function buildRenderPlan(clips) {
  const sorted = [...clips].sort((a, b) => a.start - b.start || clipTrack(a) - clipTrack(b));
  const duration = sorted.length ? Math.max(...sorted.map((clip) => clip.start + clip.duration)) : 0;
  return { clips: sorted, duration: Math.round(duration * 1000) / 1000 };
}

export function exportFrameTimes(duration, frameRate = 30) {
  const fps = Math.max(1, Math.round(Number(frameRate) || 30));
  const count = Math.max(1, Math.ceil(Math.max(0, Number(duration) || 0) * fps));
  return Array.from({ length: count }, (_, index) => Math.round((index / fps) * 1_000_000) / 1_000_000);
}

const exportProfiles = {
  webm: { extension: 'webm', label: 'WebM', detail: 'Fast master' },
  mp4: { extension: 'mp4', label: 'MP4 · H.264', detail: 'Universal playback' },
  mov: { extension: 'mov', label: 'MOV · H.264', detail: 'QuickTime container' },
};

export function exportProfile(format) {
  return exportProfiles[format] || null;
}

export function canvasFilter(effects = {}) {
  const grade = computedColorAdjustments(effects);
  const hue = (grade.temperature < 0 ? 185 : 0) + grade.tint * 0.25;
  return [
    `brightness(${100 + grade.exposure}%)`,
    `contrast(${grade.contrast}%)`,
    `saturate(${grade.saturation}%)`,
    `sepia(${Math.round(Math.abs(grade.temperature) * 0.2)}%)`,
    `hue-rotate(${hue}deg)`,
    `blur(${effects.blur || 0}px)`,
  ].join(' ');
}

function ellipsizeCaption(context, text, maxWidth) {
  let value = String(text || '').trim();
  while (value && context.measureText(`${value}…`).width > maxWidth) value = value.slice(0, -1).trimEnd();
  return value ? `${value}…` : '…';
}

export function captionLines(context, text, maxWidth, maxLines = 3) {
  const words = String(text || '').trim().split(/\s+/).filter(Boolean);
  if (!words.length || maxLines < 1) return [];
  const lines = [];
  let current = '';

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (context.measureText(candidate).width <= maxWidth) {
      current = candidate;
      continue;
    }
    if (!current) {
      current = ellipsizeCaption(context, word, maxWidth).replace(/…$/, '');
      continue;
    }
    if (lines.length === maxLines - 1) return [...lines, ellipsizeCaption(context, current, maxWidth)];
    lines.push(current);
    current = word;
  }

  if (current && lines.length < maxLines) lines.push(current);
  return lines;
}

export function captionRenderStyle(transcript = {}) {
  return {
    drawBackground: captionBoxEnabled(transcript),
    fontStack: captionFontStack(transcript.fontFamily, transcript.customFont),
  };
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
    await waitFor(image, 'load');
    return image;
  }
  const element = document.createElement(asset.kind === 'audio' ? 'audio' : 'video');
  element.preload = 'auto';
  element.crossOrigin = 'anonymous';
  element.src = asset.src;
  await waitFor(element, 'canplay');
  return element;
}

function drawSource(context, source, clip, canvas, alpha = 1, offsetX = 0, transitionScale = 1, wipeProgress = 1) {
  if (clip.kind === 'audio') return;
  const sourceWidth = source.videoWidth || source.naturalWidth;
  const sourceHeight = source.videoHeight || source.naturalHeight;
  if (!sourceWidth || !sourceHeight) return;
  const fit = (clip.fit || 'contain') === 'cover'
    ? Math.max(canvas.width / sourceWidth, canvas.height / sourceHeight)
    : Math.min(canvas.width / sourceWidth, canvas.height / sourceHeight);
  const width = sourceWidth * fit;
  const height = sourceHeight * fit;
  const effects = clip.effects || {};

  context.save();
  if (wipeProgress < 1) {
    context.beginPath();
    context.rect(0, 0, canvas.width * wipeProgress, canvas.height);
    context.clip();
  }
  context.globalAlpha = alpha * ((effects.opacity ?? 100) / 100);
  context.filter = canvasFilter(effects);
  context.translate(
    canvas.width / 2 + offsetX + ((effects.positionX || 0) / 100) * canvas.width / 2,
    canvas.height / 2 + ((effects.positionY || 0) / 100) * canvas.height / 2,
  );
  context.rotate(((effects.rotation || 0) * Math.PI) / 180);
  context.scale(
    ((effects.scale ?? 100) / 100) * transitionScale * (effects.flipX ? -1 : 1),
    ((effects.scale ?? 100) / 100) * transitionScale * (effects.flipY ? -1 : 1),
  );
  context.drawImage(source, -width / 2, -height / 2, width, height);
  context.restore();

  if (effects.vignette > 0) {
    const gradient = context.createRadialGradient(canvas.width / 2, canvas.height / 2, canvas.height * 0.18, canvas.width / 2, canvas.height / 2, canvas.width * 0.68);
    gradient.addColorStop(0, 'rgba(0,0,0,0)');
    gradient.addColorStop(1, `rgba(0,0,0,${Math.min(0.86, effects.vignette / 110)})`);
    context.fillStyle = gradient;
    context.fillRect(0, 0, canvas.width, canvas.height);
  }
}

function drawTextOverlay(context, title, canvas) {
  if (!title?.text) return;
  context.save();
  context.globalAlpha = (title.opacity ?? 100) / 100;
  context.font = `650 ${title.fontSize || 54}px Geist, Arial, sans-serif`;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  const { x, y } = titleCanvasPosition(title, canvas);
  const metrics = context.measureText(title.text);
  const paddingX = 24;
  const boxHeight = (title.fontSize || 54) * 1.35;
  context.fillStyle = 'rgba(10, 12, 11, 0.48)';
  context.beginPath();
  context.roundRect(x - metrics.width / 2 - paddingX, y - boxHeight / 2, metrics.width + paddingX * 2, boxHeight, 12);
  context.fill();
  context.shadowColor = 'rgba(0,0,0,0.5)';
  context.shadowBlur = 12;
  context.fillStyle = title.color || '#ffffff';
  context.fillText(title.text, x, y);
  context.restore();
}

export function exportTextOverlays(clip) {
  return clipTextOverlays(clip);
}

function drawClipTextOverlays(context, clip, canvas) {
  exportTextOverlays(clip).forEach((text) => drawTextOverlay(context, text, canvas));
}

export function titleCanvasPosition(title = {}, canvas = {}) {
  return {
    x: Math.round((Number(canvas.width) || 0) * ((title.positionX ?? 50) / 100) * 10000) / 10000,
    y: Math.round((Number(canvas.height) || 0) * ((title.positionY ?? 78) / 100) * 10000) / 10000,
  };
}

function drawCaption(context, clip, canvas, timelineTime) {
  const captionText = captionTextForClip(clip, timelineTime);
  if (!captionText) return;
  const fontSize = Math.max(28, Math.round(clip.transcript?.fontSize || canvas.height * 0.043));
  const lineHeight = fontSize * 1.26;
  const maxWidth = canvas.width * 0.72;
  const paddingX = fontSize * 0.72;
  const paddingY = fontSize * 0.46;

  context.save();
  context.filter = 'none';
  const style = captionRenderStyle(clip.transcript);
  context.font = `700 ${fontSize}px ${style.fontStack}`;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  const lines = captionLines(context, captionText, maxWidth, 3);
  if (!lines.length) {
    context.restore();
    return;
  }
  const textWidth = Math.max(...lines.map((line) => context.measureText(line).width));
  const boxWidth = textWidth + paddingX * 2;
  const boxHeight = lines.length * lineHeight + paddingY * 2;
  const x = canvas.width / 2;
  const y = canvas.height * 0.88;
  if (style.drawBackground) {
    context.fillStyle = 'rgba(8, 10, 9, 0.82)';
    context.beginPath();
    context.roundRect(x - boxWidth / 2, y - boxHeight / 2, boxWidth, boxHeight, fontSize * 0.3);
    context.fill();
  }
  context.shadowColor = 'rgba(0, 0, 0, 0.65)';
  context.shadowBlur = fontSize * 0.35;
  context.fillStyle = clip.transcript?.color || '#ffffff';
  lines.forEach((line, index) => {
    const lineY = y + (index - (lines.length - 1) / 2) * lineHeight;
    context.fillText(line, x, lineY);
  });
  context.restore();
}

function canvasPngBytes(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(async (blob) => {
      if (!blob) {
        reject(new Error('Pixelwave could not encode a rendered video frame.'));
        return;
      }
      resolve(await blob.arrayBuffer());
    }, 'image/png');
  });
}

async function seekVideo(source, targetTime) {
  if (!(source instanceof HTMLVideoElement)) return;
  const duration = Number.isFinite(source.duration) ? source.duration : targetTime;
  const target = Math.max(0, Math.min(targetTime, Math.max(0, duration - 0.001)));
  source.pause();
  if (source.readyState >= 2 && Math.abs(source.currentTime - target) < 0.001) return;
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

function sourceTimeAt(clip, timelineTime) {
  return Math.max(0, clip.sourceStart + (timelineTime - clip.start) * (clip.speed || 1));
}

export async function exportTimeline({ project, onProgress, onFrame, cancelToken }) {
  const plan = buildRenderPlan(project.clips);
  if (!plan.duration) throw new Error('Add at least one clip before exporting.');
  if (typeof onFrame !== 'function') throw new Error('The direct video export session is not available.');

  const canvas = document.createElement('canvas');
  canvas.width = project.width || 1280;
  canvas.height = project.height || 720;
  const context = canvas.getContext('2d', { alpha: false });
  const assetById = new Map(project.media.map((asset) => [asset.id, asset]));
  const visualClips = plan.clips.filter((clip) => clip.kind !== 'audio');
  const sourceByClip = new Map();

  await Promise.all(plan.clips.map((clip) => loadCustomCaptionFont(clip.transcript?.customFont)));
  if (document.fonts?.ready) await document.fonts.ready;
  await Promise.all(visualClips.map(async (clip) => {
    const asset = assetById.get(clip.assetId);
    if (!asset) throw new Error(`Missing media for ${clip.name}.`);
    sourceByClip.set(clip.id, await prepareSource(asset));
  }));

  const frameTimes = exportFrameTimes(plan.duration, project.frameRate || 30);
  for (let frameIndex = 0; frameIndex < frameTimes.length; frameIndex += 1) {
    if (cancelToken?.cancelled) throw new Error('Export cancelled.');
    const time = frameTimes[frameIndex];
    const activeClips = activeClipsAt(plan.clips, time);
    const visualLayers = activeClips.filter((clip) => clip.kind !== 'audio');

    await Promise.all(visualLayers.map((clip) => (
      seekVideo(sourceByClip.get(clip.id), sourceTimeAt(clip, time))
    )));

    context.fillStyle = '#101211';
    context.fillRect(0, 0, canvas.width, canvas.height);
    for (const visual of visualLayers) {
      const source = sourceByClip.get(visual.id);
      const transition = visual.transition || { type: 'cut', duration: 0 };
      const progress = transition.type === 'cut' ? 1 : Math.min(1, (time - visual.start) / Math.max(0.1, transition.duration));
      const previous = plan.clips.find((clip) => (
        clip.kind !== 'audio'
        && clipTrack(clip) === clipTrack(visual)
        && Math.abs(clip.start + clip.duration - visual.start) < 0.05
      ));
      if (previous && progress < 1 && transition.type === 'dissolve') {
        const overlapTime = previous.start + previous.duration - (visual.start + transition.duration - time);
        await seekVideo(sourceByClip.get(previous.id), sourceTimeAt(previous, overlapTime));
        drawSource(context, sourceByClip.get(previous.id), previous, canvas, 1 - progress);
      }
      const alpha = transition.type === 'dissolve' ? progress : 1;
      const offset = transition.type === 'slide' ? (1 - progress) * canvas.width : 0;
      const transitionScale = transition.type === 'zoom' ? 0.72 + progress * 0.28 : 1;
      const wipeProgress = transition.type === 'wipe' ? progress : 1;
      drawSource(context, source, visual, canvas, transition.type === 'zoom' ? progress : alpha, offset, transitionScale, wipeProgress);
      if (transition.type === 'dip' && progress < 1) {
        context.fillStyle = `rgba(0,0,0,${Math.sin(progress * Math.PI)})`;
        context.fillRect(0, 0, canvas.width, canvas.height);
      }
      drawClipTextOverlays(context, visual, canvas);
    }
    const captionClip = [...activeClips].reverse().find((clip) => clip.transcript?.showAsCaptions && clip.transcript?.text);
    if (captionClip) drawCaption(context, captionClip, canvas, time);

    await onFrame(await canvasPngBytes(canvas), frameIndex, frameTimes.length);
    onProgress?.((frameIndex + 1) / frameTimes.length);
  }

  return { duration: plan.duration, frameCount: frameTimes.length };
}
