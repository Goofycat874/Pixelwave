// The compositor draws one frame of the timeline into a 2D canvas. The live preview and
// the exporter both call drawFrame(), so what you see while editing is what you export.
import { animatedEffects, applyEasing, clipLocalTime, fadeEnvelope } from './animation.js';
import { gradeChannels, gradeKey } from './color.js';
import {
  buildStylizeFilter,
  hasStylizeFilter,
  pixelateCells,
  stylizeAmounts,
  stylizeKey,
  stylizeSeeds,
} from './effects.js';
import { activeClipsAt, clipTextOverlays, clipTrack, computedColorAdjustments } from './editor.js';
import { isClipHidden, laneKind } from './project.js';
import { hexToRgba, layoutTextOverlay, revealLines, textAnimationState, textFont, textReferenceScale } from './text.js';
import { activeTranscriptWordStart, captionBoxEnabled, captionFontStack, captionTextForClip } from './transcription.js';

export const TRANSITIONS = Object.freeze([
  ['cut', 'Cut'],
  ['dissolve', 'Dissolve'],
  ['dip', 'Dip to black'],
  ['slide', 'Slide'],
  ['push', 'Push'],
  ['wipe', 'Wipe'],
  ['zoom', 'Zoom'],
  ['blur', 'Blur'],
]);

const SVG_NS = 'http://www.w3.org/2000/svg';

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function sourceTimeAt(clip, timelineTime) {
  return Math.max(0, (Number(clip.sourceStart) || 0) + (timelineTime - clip.start) * (clip.speed || 1));
}

export function transitionProgress(clip, time) {
  if (!clip?.transition || clip.transition.type === 'cut') return 1;
  return clamp((time - clip.start) / Math.max(0.1, Number(clip.transition.duration) || 0.6), 0, 1);
}

function findPreviousClip(clips, clip) {
  return clips.find((candidate) => (
    candidate.id !== clip.id
    && laneKind(candidate) === 'video'
    && clipTrack(candidate) === clipTrack(clip)
    && Math.abs(candidate.start + candidate.duration - clip.start) < 0.05
  )) || null;
}

// Describes which clips contribute to a frame and at which timeline time each is sampled.
export function framePlan(project, time) {
  const clips = project.clips || [];
  const active = activeClipsAt(clips, time);
  const layers = [];
  for (const clip of active) {
    if (laneKind(clip) !== 'video' || isClipHidden(project, clip)) continue;
    const transition = clip.transition?.type || 'cut';
    const progress = transitionProgress(clip, time);
    let previous = null;
    if (transition !== 'cut' && progress < 1) {
      const candidate = findPreviousClip(clips, clip);
      if (candidate) {
        const elapsed = time - clip.start;
        const sampleTime = clamp(
          candidate.start + candidate.duration - (Number(clip.transition.duration) || 0.6) + elapsed,
          candidate.start,
          candidate.start + candidate.duration - 0.001,
        );
        previous = { clip: candidate, time: sampleTime };
      }
    }
    layers.push({ clip, time, transition, progress, previous });
  }
  const audible = active.filter((clip) => clip.kind === 'video' || clip.kind === 'audio');
  return { layers, audible, active };
}

// ---------- chroma key ----------

export function chromaKeyMatrix({ keyMode = 'green', keyStrength = 40, keySoftness = 30, keySpill = 40 } = {}) {
  const threshold = 0.42 - (clamp(keyStrength, 0, 100) / 100) * 0.38;
  const slope = 1 / (0.02 + (clamp(keySoftness, 0, 100) / 100) * 0.3);
  const spill = (clamp(keySpill, 0, 100) / 100) * 0.6;
  const round = (value) => Math.round(value * 10000) / 10000;
  // Alpha falls as the key channel dominates the other two: a = slope * (threshold - dominance).
  if (keyMode === 'blue') {
    return [
      1, 0, 0, 0, 0,
      0, 1, 0, 0, 0,
      round(spill / 2), round(spill / 2), round(1 - spill), 0, 0,
      round(slope / 2), round(slope / 2), round(-slope), 0, round(slope * threshold),
    ];
  }
  return [
    1, 0, 0, 0, 0,
    round(spill / 2), round(1 - spill), round(spill / 2), 0, 0,
    0, 0, 1, 0, 0,
    round(slope / 2), round(-slope), round(slope / 2), 0, round(slope * threshold),
  ];
}

// SVG filters live in one hidden <svg>. Dragging a slider creates a new filter per value, so the
// registry keeps the most recently used ones and removes the rest.
const FILTER_LIMIT = 48;
const filterRegistry = new Map();
let filterSerial = 0;

function filterRoot(doc) {
  let svg = doc.getElementById('pixelwave-filters');
  if (!svg) {
    svg = doc.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('id', 'pixelwave-filters');
    svg.setAttribute('width', '0');
    svg.setAttribute('height', '0');
    svg.setAttribute('aria-hidden', 'true');
    svg.style.position = 'absolute';
    svg.style.pointerEvents = 'none';
    doc.body.appendChild(svg);
  }
  return svg;
}

export function registeredFilter(key, build, doc = globalThis.document) {
  if (!doc?.createElementNS) return null;
  const cached = filterRegistry.get(key);
  if (cached && doc.getElementById?.(cached.id)) {
    filterRegistry.delete(key);
    filterRegistry.set(key, cached);
    return `url(#${cached.id})`;
  }
  filterSerial += 1;
  const id = `pw-fx-${filterSerial}`;
  const filter = doc.createElementNS(SVG_NS, 'filter');
  filter.setAttribute('id', id);
  filter.setAttribute('color-interpolation-filters', 'sRGB');
  build(filter, (name) => doc.createElementNS(SVG_NS, name));
  filterRoot(doc).appendChild(filter);
  filterRegistry.set(key, { id, element: filter });
  while (filterRegistry.size > FILTER_LIMIT) {
    const [oldestKey, oldest] = filterRegistry.entries().next().value;
    oldest.element.remove?.();
    filterRegistry.delete(oldestKey);
  }
  return `url(#${id})`;
}

export function resetFilterRegistry() {
  filterRegistry.clear();
}

export function ensureChromaKeyFilter(effects, doc = globalThis.document) {
  if (!effects || effects.keyMode === 'off' || !effects.keyMode) return null;
  const values = chromaKeyMatrix(effects).join(' ');
  return registeredFilter(`key:${effects.keyMode}:${values}`, (filter, create) => {
    const matrix = create('feColorMatrix');
    matrix.setAttribute('type', 'matrix');
    matrix.setAttribute('in', 'SourceGraphic');
    matrix.setAttribute('result', 'keyed');
    matrix.setAttribute('values', values);
    const composite = create('feComposite');
    composite.setAttribute('in', 'keyed');
    composite.setAttribute('in2', 'SourceGraphic');
    composite.setAttribute('operator', 'in');
    filter.append(matrix, composite);
  }, doc);
}

// Exposure, white balance, the wheels, tone, contrast and the curves as one lookup table per
// channel (see color.js). 256 entries means one exact output level for every 8-bit input level.
export function ensureGradeFilter(effects, doc = globalThis.document) {
  const channels = gradeChannels(effects);
  if (!channels) return null;
  return registeredFilter(`grade:${gradeKey(channels)}`, (filter, create) => {
    const transfer = create('feComponentTransfer');
    ['R', 'G', 'B'].forEach((channel, index) => {
      const lookup = create(`feFunc${channel}`);
      lookup.setAttribute('type', 'table');
      lookup.setAttribute('tableValues', channels[index].join(' '));
      transfer.appendChild(lookup);
    });
    filter.append(transfer);
  }, doc);
}

// Sharpen, glow, grain, aberration and glitch as one filter (see effects.js). `unit` is canvas
// pixels per 720p pixel, so the look holds at any preview or export size.
export function ensureStylizeFilter(effects, { unit = 1, time = 0 } = {}, doc = globalThis.document) {
  const amounts = stylizeAmounts(effects);
  if (!hasStylizeFilter(amounts)) return null;
  const seeds = stylizeSeeds(time);
  return registeredFilter(
    stylizeKey(amounts, unit, seeds),
    (filter, create) => buildStylizeFilter(filter, create, amounts, { unit, seeds }),
    doc,
  );
}

// ---------- filters ----------

// Chromium's canvas only honors an SVG url() filter that comes before the CSS filter functions;
// one placed after them renders black. So the key, the grade and the stylize filter lead, then
// saturation, which needs all three channels and cannot live in the per-channel grade tables.
export function mediaFilter(effects = {}, { blurPixels = 0, keyFilter = null, gradeFilter = null, stylizeFilter = null } = {}) {
  const grade = computedColorAdjustments(effects);
  const parts = [];
  if (keyFilter) parts.push(keyFilter);
  if (gradeFilter) parts.push(gradeFilter);
  if (stylizeFilter) parts.push(stylizeFilter);
  if (grade.saturation !== 100) parts.push(`saturate(${grade.saturation}%)`);
  const hue = Number(effects.hue) || 0;
  if (hue) parts.push(`hue-rotate(${Math.round(hue * 100) / 100}deg)`);
  if (effects.invert) parts.push(`invert(${clamp(Number(effects.invert) || 0, 0, 100)}%)`);
  if (blurPixels > 0.01) parts.push(`blur(${Math.round(blurPixels * 100) / 100}px)`);
  return parts.length ? parts.join(' ') : 'none';
}

// ---------- geometry ----------

export function mediaGeometry({ sourceWidth, sourceHeight, clip, effects, width, height }) {
  const fit = (clip?.fit || 'contain') === 'cover'
    ? Math.max(width / sourceWidth, height / sourceHeight)
    : Math.min(width / sourceWidth, height / sourceHeight);
  const fullWidth = sourceWidth * fit;
  const fullHeight = sourceHeight * fit;
  let left = clamp(Number(effects.cropLeft) || 0, 0, 95) / 100;
  let right = clamp(Number(effects.cropRight) || 0, 0, 95) / 100;
  let top = clamp(Number(effects.cropTop) || 0, 0, 95) / 100;
  let bottom = clamp(Number(effects.cropBottom) || 0, 0, 95) / 100;
  if (left + right > 0.98) right = Math.max(0, 0.98 - left);
  if (top + bottom > 0.98) bottom = Math.max(0, 0.98 - top);
  const scale = Math.max(0.001, (Number(effects.scale ?? 100) || 0) / 100);
  return {
    fullWidth,
    fullHeight,
    crop: { left, right, top, bottom },
    rect: {
      x: -fullWidth / 2 + left * fullWidth,
      y: -fullHeight / 2 + top * fullHeight,
      width: fullWidth * (1 - left - right),
      height: fullHeight * (1 - top - bottom),
    },
    centerX: width / 2 + ((Number(effects.positionX) || 0) / 100) * (width / 2),
    centerY: height / 2 + ((Number(effects.positionY) || 0) / 100) * (height / 2),
    rotation: Number(effects.rotation) || 0,
    scale,
  };
}

function transformPoint(x, y, { centerX, centerY, rotation, scaleX, scaleY }) {
  const radians = (rotation * Math.PI) / 180;
  const sx = x * scaleX;
  const sy = y * scaleY;
  return [
    centerX + sx * Math.cos(radians) - sy * Math.sin(radians),
    centerY + sx * Math.sin(radians) + sy * Math.cos(radians),
  ];
}

export function rectCorners(rect, transform) {
  return [
    transformPoint(rect.x, rect.y, transform),
    transformPoint(rect.x + rect.width, rect.y, transform),
    transformPoint(rect.x + rect.width, rect.y + rect.height, transform),
    transformPoint(rect.x, rect.y + rect.height, transform),
  ];
}

export function pointInPolygon([x, y], polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi || 1e-9) + xi) inside = !inside;
  }
  return inside;
}

function roundedRectPath(context, x, y, width, height, radius) {
  context.beginPath();
  if (radius > 0 && context.roundRect) context.roundRect(x, y, width, height, Math.min(radius, width / 2, height / 2));
  else context.rect(x, y, width, height);
}

function sourceSize(source) {
  return {
    width: source?.videoWidth || source?.naturalWidth || source?.width || 0,
    height: source?.videoHeight || source?.naturalHeight || source?.height || 0,
  };
}

// ---------- drawing ----------

let pixelateScratch = null;

// The picture averaged down to one pixel per block, on a reusable canvas. Null where there is no
// DOM to make a canvas in.
function coarseSource(doc, source, sourceRect, { columns, rows }) {
  if (!doc?.createElement) return null;
  if (!pixelateScratch || pixelateScratch.ownerDocument !== doc) pixelateScratch = doc.createElement('canvas');
  if (pixelateScratch.width !== columns || pixelateScratch.height !== rows) {
    pixelateScratch.width = columns;
    pixelateScratch.height = rows;
  }
  const scratch = pixelateScratch.getContext('2d');
  if (!scratch) return null;
  scratch.imageSmoothingEnabled = true;
  scratch.imageSmoothingQuality = 'high';
  scratch.clearRect(0, 0, columns, rows);
  scratch.drawImage(source, ...sourceRect, 0, 0, columns, rows);
  return pixelateScratch;
}

function drawMedia(context, source, clip, effects, alpha, mods, env) {
  const size = sourceSize(source);
  if (!size.width || !size.height) return null;
  const { width, height, pixelScale, refScale } = env;
  const geometry = mediaGeometry({ sourceWidth: size.width, sourceHeight: size.height, clip, effects, width, height });
  const scale = geometry.scale * mods.scale;
  const transform = {
    centerX: geometry.centerX + mods.offsetX,
    centerY: geometry.centerY + mods.offsetY,
    rotation: geometry.rotation + mods.rotation,
    scaleX: scale * (effects.flipX ? -1 : 1),
    scaleY: scale * (effects.flipY ? -1 : 1),
  };
  const { rect, crop } = geometry;
  const radius = (clamp(Number(effects.radius) || 0, 0, 100) / 100) * (Math.min(rect.width, rect.height) / 2);
  const keyFilter = ensureChromaKeyFilter(effects, env.document);
  const gradeFilter = ensureGradeFilter(effects, env.document);
  const deviceScale = pixelScale * scale;
  const stylizeFilter = ensureStylizeFilter(effects, { unit: refScale * deviceScale, time: env.time }, env.document);

  context.save();
  if (mods.clipRect) {
    context.beginPath();
    context.rect(mods.clipRect.x, mods.clipRect.y, mods.clipRect.width, mods.clipRect.height);
    context.clip();
  }
  context.translate(transform.centerX, transform.centerY);
  context.rotate((transform.rotation * Math.PI) / 180);
  context.scale(transform.scaleX, transform.scaleY);
  context.globalAlpha = clamp(alpha, 0, 1);

  const shadow = clamp(Number(effects.shadow) || 0, 0, 100) / 100;
  if (shadow > 0 && !keyFilter) {
    context.save();
    context.shadowColor = `rgba(0, 0, 0, ${0.3 + shadow * 0.45})`;
    context.shadowBlur = shadow * 46 * refScale * deviceScale;
    context.shadowOffsetY = shadow * 14 * refScale * deviceScale;
    context.fillStyle = '#000';
    roundedRectPath(context, rect.x, rect.y, rect.width, rect.height, radius);
    context.fill();
    context.restore();
  }
  if (radius > 0) {
    roundedRectPath(context, rect.x, rect.y, rect.width, rect.height, radius);
    context.clip();
  }
  const blurPixels = ((Number(effects.blur) || 0) * refScale + (mods.blur || 0)) * deviceScale;
  context.filter = mediaFilter(effects, { blurPixels, keyFilter, gradeFilter, stylizeFilter });
  const sourceRect = [
    crop.left * size.width,
    crop.top * size.height,
    size.width * (1 - crop.left - crop.right),
    size.height * (1 - crop.top - crop.bottom),
  ];
  const cells = pixelateCells(Number(effects.pixelate) || 0, rect.width, rect.height, refScale);
  const coarse = cells && coarseSource(env.document, source, sourceRect, cells);
  if (coarse) {
    // Blocks are the nearest-neighbor enlargement of a small average of the picture.
    context.imageSmoothingEnabled = false;
    context.drawImage(coarse, 0, 0, cells.columns, cells.rows, rect.x, rect.y, rect.width, rect.height);
  } else {
    context.drawImage(source, ...sourceRect, rect.x, rect.y, rect.width, rect.height);
  }
  context.restore();

  if (effects.vignette > 0) {
    context.save();
    const gradient = context.createRadialGradient(width / 2, height / 2, height * 0.18, width / 2, height / 2, width * 0.68);
    gradient.addColorStop(0, 'rgba(0,0,0,0)');
    gradient.addColorStop(1, `rgba(0,0,0,${Math.min(0.86, effects.vignette / 110) * clamp(alpha, 0, 1)})`);
    context.fillStyle = gradient;
    context.fillRect(0, 0, width, height);
    context.restore();
  }
  return rectCorners(rect, transform);
}

function drawTextOverlay(context, overlay, clip, local, alphaMultiplier, mods, env, effects = null) {
  const { width, height, pixelScale } = env;
  const layout = layoutTextOverlay(context, overlay, { width, height });
  const { style, size } = layout;
  const anim = textAnimationState(style, local, clip.duration);
  const isTextClip = clip.kind === 'text';
  const offsetX = (isTextClip ? ((Number(effects?.positionX) || 0) / 100) * (width / 2) : 0) + mods.offsetX;
  const offsetY = (isTextClip ? ((Number(effects?.positionY) || 0) / 100) * (height / 2) : 0) + mods.offsetY;
  const scale = anim.scale * (isTextClip ? (Number(effects?.scale ?? 100) || 0) / 100 : 1) * mods.scale;
  const rotation = (isTextClip ? Number(effects?.rotation) || 0 : 0) + mods.rotation;
  const centerX = layout.centerX + anim.offsetX * size + offsetX;
  const centerY = layout.centerY + anim.offsetY * size + offsetY;
  const alpha = clamp(alphaMultiplier * anim.alpha * ((Number(style.opacity) ?? 100) / 100), 0, 1);
  const hit = {
    clipId: clip.id,
    textId: overlay.id,
    centerX,
    centerY,
    width: layout.boxWidth * Math.abs(scale),
    height: layout.boxHeight * Math.abs(scale),
    rotation,
    corners: rectCorners(
      { x: -layout.boxWidth / 2, y: -layout.boxHeight / 2, width: layout.boxWidth, height: layout.boxHeight },
      { centerX, centerY, rotation, scaleX: scale, scaleY: scale },
    ),
    fontPixels: size * Math.abs(scale),
  };
  env.hits.texts.push(hit);
  const skip = env.skipText && env.skipText.clipId === clip.id && env.skipText.textId === overlay.id;
  if (skip || alpha <= 0.001 || !layout.lines.some(Boolean) || Math.abs(scale) < 0.001) return hit;

  const deviceScale = pixelScale * Math.abs(scale);
  context.save();
  if (mods.clipRect) {
    context.beginPath();
    context.rect(mods.clipRect.x, mods.clipRect.y, mods.clipRect.width, mods.clipRect.height);
    context.clip();
  }
  context.translate(centerX, centerY);
  context.rotate((rotation * Math.PI) / 180);
  context.scale(scale, scale);
  context.globalAlpha = alpha;
  const blur = (anim.blur * size + (isTextClip ? (Number(effects?.blur) || 0) * textReferenceScale(width, height) : 0) + (mods.blur || 0)) * deviceScale;
  context.filter = blur > 0.01 ? `blur(${blur}px)` : 'none';

  if (style.backgroundEnabled) {
    context.fillStyle = hexToRgba(style.backgroundColor, (Number(style.backgroundOpacity) ?? 100) / 100);
    roundedRectPath(context, -layout.boxWidth / 2, -layout.boxHeight / 2, layout.boxWidth, layout.boxHeight, size * 0.18);
    context.fill();
  }

  context.font = textFont(style, size);
  if ('letterSpacing' in context) context.letterSpacing = `${(style.letterSpacing / 100) * size}px`;
  context.textBaseline = 'middle';
  context.textAlign = style.align === 'left' ? 'left' : style.align === 'right' ? 'right' : 'center';
  const x = style.align === 'left' ? -layout.boxWidth / 2 + layout.padX : style.align === 'right' ? layout.boxWidth / 2 - layout.padX : 0;
  const lines = revealLines(layout.lines, anim.reveal);
  const firstY = -((layout.lines.length - 1) / 2) * layout.lineHeight;
  const strokeWidth = Math.max(0, Number(style.strokeWidth) || 0) * textReferenceScale(width, height);

  lines.forEach((line, index) => {
    if (!line) return;
    const y = firstY + index * layout.lineHeight + size * 0.04;
    context.save();
    if (style.glow) {
      context.shadowColor = style.color;
      context.shadowBlur = size * 0.5 * deviceScale;
    } else if (style.shadow) {
      context.shadowColor = 'rgba(0, 0, 0, 0.55)';
      context.shadowBlur = size * 0.16 * deviceScale;
      context.shadowOffsetY = size * 0.035 * deviceScale;
    }
    if (strokeWidth > 0) {
      context.lineJoin = 'round';
      context.miterLimit = 2;
      context.lineWidth = strokeWidth * 2;
      context.strokeStyle = style.strokeColor || '#000000';
      context.strokeText(line, x, y);
      context.shadowColor = 'transparent';
    }
    context.fillStyle = style.color || '#ffffff';
    context.fillText(line, x, y);
    if (style.glow) {
      context.shadowBlur = size * 0.18 * deviceScale;
      context.fillText(line, x, y);
    }
    context.restore();
  });
  context.restore();
  return hit;
}

export function defaultCaptionPosition(project) {
  return (Number(project?.height) || 0) > (Number(project?.width) || 0) ? 72 : 86;
}

function captionLayoutLines(context, text, maxWidth, maxLines = 3) {
  const words = String(text || '').trim().split(/\s+/).filter(Boolean);
  const lines = [];
  let current = '';
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (context.measureText(candidate).width <= maxWidth || !current) current = candidate;
    else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines.slice(0, maxLines);
}

function drawCaption(context, clip, time, env) {
  const text = captionTextForClip(clip, time);
  if (!text) return;
  const { width, height, refScale } = env;
  const transcript = clip.transcript || {};
  const size = Math.max(14, (Number(transcript.fontSize) || 54) * refScale);
  const lineHeight = size * 1.2;
  const padX = size * 0.6;
  const padY = size * 0.36;
  const local = time - clip.start;
  const wordStart = activeTranscriptWordStart(transcript.words, local, clip.speed || 1);
  const age = wordStart === null ? 1 : clamp((local - wordStart) / 0.15, 0, 1);
  const positionY = Number(transcript.positionY) || defaultCaptionPosition({ width, height });

  context.save();
  context.font = `700 ${size}px ${captionFontStack(transcript.fontFamily, transcript.customFont)}`;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  const lines = captionLayoutLines(context, text, width * 0.76);
  if (!lines.length) {
    context.restore();
    return;
  }
  const textWidth = Math.max(...lines.map((line) => context.measureText(line).width));
  const boxWidth = textWidth + padX * 2;
  const boxHeight = lines.length * lineHeight + padY * 2;
  const x = width / 2;
  const y = height * (positionY / 100);
  context.translate(x, y + (1 - age) * size * 0.12);
  context.scale(0.96 + age * 0.04, 0.96 + age * 0.04);
  context.globalAlpha = 0.18 + age * 0.82;
  if (captionBoxEnabled(transcript)) {
    context.fillStyle = 'rgba(8, 9, 10, 0.84)';
    roundedRectPath(context, -boxWidth / 2, -boxHeight / 2, boxWidth, boxHeight, size * 0.24);
    context.fill();
  }
  context.shadowColor = 'rgba(0, 0, 0, 0.7)';
  context.shadowBlur = size * 0.3 * env.pixelScale;
  context.fillStyle = transcript.color || '#ffffff';
  lines.forEach((line, index) => {
    context.fillText(line, 0, (index - (lines.length - 1) / 2) * lineHeight + size * 0.04);
  });
  context.restore();
}

function noMods(overrides = {}) {
  return { alpha: 1, offsetX: 0, offsetY: 0, scale: 1, rotation: 0, blur: 0, clipRect: null, ...overrides };
}

function drawClip(context, clip, sampleTime, mods, env) {
  const local = clipLocalTime(clip, sampleTime);
  const effects = animatedEffects(clip, local);
  const fade = fadeEnvelope(clip, local);
  const opacity = clamp((Number(effects.opacity ?? 100) || 0) / 100, 0, 1);
  const textAlpha = mods.alpha * fade;
  if (clip.kind === 'text') {
    for (const overlay of clipTextOverlays(clip)) drawTextOverlay(context, overlay, clip, local, textAlpha * opacity, mods, env, effects);
    return;
  }
  const source = env.getSource?.(clip, sampleTime);
  const corners = source ? drawMedia(context, source, clip, effects, mods.alpha * fade * opacity, mods, env) : null;
  if (corners) env.hits.media.push({ clipId: clip.id, corners });
  for (const overlay of clipTextOverlays(clip)) drawTextOverlay(context, overlay, clip, local, textAlpha, noMods({ clipRect: mods.clipRect }), env);
}

function drawLayer(context, layer, env) {
  const { clip, transition, previous, time } = layer;
  const { width, height } = env;
  const p = applyEasing('ease', layer.progress);
  const baseTrack = clipTrack(clip) === 0;

  if (transition === 'cut' || layer.progress >= 1) {
    drawClip(context, clip, time, noMods(), env);
    return;
  }

  const blackout = (alpha) => {
    context.save();
    context.globalAlpha = clamp(alpha, 0, 1);
    context.fillStyle = '#000';
    context.fillRect(0, 0, width, height);
    context.restore();
  };

  if (transition === 'dip') {
    if (previous && p < 0.5) {
      drawClip(context, previous.clip, previous.time, noMods(), env);
      blackout(p * 2);
    } else {
      drawClip(context, clip, time, noMods(), env);
      blackout(previous ? (1 - p) * 2 : 1 - p);
    }
    return;
  }

  if (previous) {
    const previousMods = {
      dissolve: noMods({ alpha: baseTrack ? 1 : 1 - p }),
      slide: noMods({ offsetX: -p * width * 0.25 }),
      push: noMods({ offsetX: -p * width }),
      wipe: noMods(),
      zoom: noMods({ alpha: 1 - p, scale: 1 + p * 0.25 }),
      blur: noMods({ alpha: baseTrack ? 1 : 1 - p, blur: p * 28 }),
    }[transition] || noMods();
    drawClip(context, previous.clip, previous.time, previousMods, env);
  }

  const currentMods = {
    dissolve: noMods({ alpha: p }),
    slide: noMods({ offsetX: (1 - p) * width }),
    push: noMods({ offsetX: (1 - p) * width }),
    wipe: noMods({ clipRect: { x: 0, y: 0, width: width * p, height } }),
    zoom: noMods({ alpha: p, scale: 0.72 + p * 0.28 }),
    blur: noMods({ alpha: p, blur: (1 - p) * 28 }),
  }[transition] || noMods();
  drawClip(context, clip, time, currentMods, env);
}

export function drawFrame(context, {
  project,
  time,
  getSource,
  skipText = null,
  captions = true,
  doc = globalThis.document,
}) {
  const width = Math.max(1, Number(project.width) || 1280);
  const height = Math.max(1, Number(project.height) || 720);
  const canvas = context.canvas;
  const pixelScale = (canvas?.width || width) / width;
  const env = {
    width,
    height,
    pixelScale,
    refScale: textReferenceScale(width, height),
    time,
    getSource,
    skipText,
    document: doc,
    hits: { media: [], texts: [] },
  };
  context.save();
  context.setTransform(pixelScale, 0, 0, (canvas?.height || height) / height, 0, 0);
  context.globalAlpha = 1;
  context.filter = 'none';
  context.fillStyle = project.background || '#000000';
  context.fillRect(0, 0, width, height);

  const plan = framePlan(project, time);
  for (const layer of plan.layers) drawLayer(context, layer, env);

  if (captions) {
    const captionClip = [...plan.active].reverse().find((clip) => clip.transcript?.showAsCaptions && clip.transcript?.text);
    if (captionClip) drawCaption(context, captionClip, time, env);
  }
  context.restore();
  return env.hits;
}

export function hitTest(hits, point) {
  const text = [...(hits?.texts || [])].reverse().find((hit) => pointInPolygon(point, hit.corners));
  if (text) return { type: 'text', clipId: text.clipId, textId: text.textId };
  const media = [...(hits?.media || [])].reverse().find((hit) => pointInPolygon(point, hit.corners));
  if (media) return { type: 'media', clipId: media.clipId };
  return null;
}
