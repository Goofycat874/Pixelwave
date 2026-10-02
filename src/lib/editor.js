import { scaleKeyframes, shiftKeyframes, splitKeyframes } from './animation.js';

const MIN_CLIP_DURATION = 0.1;
export const MAX_TRACK_INDEX = 5;
export const TIMELINE_GUTTER = 148;
export const MIN_TIMELINE_ZOOM = 0.05;
export const MAX_TIMELINE_ZOOM = 12;

export const COLOR_PRESETS = {
  original: { exposure: 0, contrast: 100, saturation: 100, temperature: 0, tint: 0 },
  warm: { exposure: 4, contrast: 106, saturation: 112, temperature: 28, tint: 4 },
  cool: { exposure: 1, contrast: 108, saturation: 104, temperature: -28, tint: -2 },
  punch: { exposure: 3, contrast: 124, saturation: 128, temperature: 4, tint: 2 },
  fade: { exposure: 8, contrast: 82, saturation: 86, temperature: 8, tint: 3 },
  mono: { exposure: 2, contrast: 116, saturation: 0, temperature: 0, tint: 0 },
};

export function defaultPrimaryWheels() {
  return {
    lift: { x: 0, y: 0, luma: 0 },
    gamma: { x: 0, y: 0, luma: 0 },
    gain: { x: 0, y: 0, luma: 0 },
  };
}

function makeId(prefix = 'clip') {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function roundTime(value) {
  return Math.round(value * 1000) / 1000;
}

export function defaultEffects() {
  return {
    exposure: 0,
    contrast: 100,
    saturation: 100,
    temperature: 0,
    tint: 0,
    primaryWheels: defaultPrimaryWheels(),
    blur: 0,
    vignette: 0,
    rotation: 0,
    scale: 100,
    opacity: 100,
    volume: 100,
    positionX: 0,
    positionY: 0,
    flipX: false,
    flipY: false,
    cropTop: 0,
    cropRight: 0,
    cropBottom: 0,
    cropLeft: 0,
    radius: 0,
    shadow: 0,
    hue: 0,
    invert: 0,
    keyMode: 'off',
    keyStrength: 40,
    keySoftness: 30,
    keySpill: 40,
  };
}

export function applyColorPreset(effects = {}, preset = 'original') {
  return {
    ...effects,
    ...(COLOR_PRESETS[preset] || COLOR_PRESETS.original),
    primaryWheels: defaultPrimaryWheels(),
  };
}

export function resetColorEffects(effects = {}) {
  return applyColorPreset(effects, 'original');
}

function safeWheel(wheels, key) {
  return { x: 0, y: 0, luma: 0, ...(wheels?.[key] || {}) };
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function computedColorAdjustments(effects = {}) {
  const lift = safeWheel(effects.primaryWheels, 'lift');
  const gamma = safeWheel(effects.primaryWheels, 'gamma');
  const gain = safeWheel(effects.primaryWheels, 'gain');
  return {
    exposure: clamp(Math.round((effects.exposure || 0) + lift.luma * 10 + gamma.luma * 18 + gain.luma * 25), -70, 70),
    contrast: clamp(Math.round((effects.contrast ?? 100) - lift.luma * 10 + gamma.luma * 5 + gain.luma * 16), 0, 220),
    saturation: clamp(Math.round(effects.saturation ?? 100), 0, 220),
    temperature: clamp(Math.round((effects.temperature || 0) + lift.x * 20 + gamma.x * 28 + gain.x * 36), -100, 100),
    tint: clamp(Math.round((effects.tint || 0) + lift.y * 18 + gamma.y * 26 + gain.y * 34), -100, 100),
  };
}

export function clipTrack(clip) {
  return Math.min(MAX_TRACK_INDEX, Math.max(0, Math.round(Number(clip?.track) || 0)));
}

export function timelineTracks(counts = { video: 3, audio: 3 }) {
  const video = Math.max(1, Math.min(MAX_TRACK_INDEX + 1, Number(counts.video) || 3));
  const audio = Math.max(1, Math.min(MAX_TRACK_INDEX + 1, Number(counts.audio) || 3));
  return [
    ...Array.from({ length: video }, (_, index) => {
      const track = video - 1 - index;
      return { kind: 'video', track, label: `V${track + 1}` };
    }),
    ...Array.from({ length: audio }, (_, track) => ({ kind: 'audio', track, label: `A${track + 1}` })),
  ];
}

export const TIMELINE_TRACKS = Object.freeze(timelineTracks());

export function trackAcceptsKind(trackKind, mediaKind) {
  return trackKind === (mediaKind === 'audio' ? 'audio' : 'video');
}

function clipLaneKind(clip) {
  return clip?.kind === 'audio' ? 'audio' : 'video';
}

export function activeClipsAt(clips, time, kind = null) {
  return clips
    .filter((clip) => time >= clip.start && time < clip.start + clip.duration)
    .filter((clip) => !kind || clipLaneKind(clip) === kind)
    .sort((a, b) => clipTrack(a) - clipTrack(b) || a.start - b.start);
}

export const LEGACY_TEXT_ID = 'legacy-title';

export function createTextOverlay(id = makeId('text'), patch = {}) {
  return {
    id,
    text: 'Your text',
    fontSize: 54,
    positionX: 50,
    positionY: 50,
    opacity: 100,
    color: '#ffffff',
    ...patch,
  };
}

export function createTextClip(start = 0, track = 1, overlayPatch = {}, duration = 4) {
  const overlay = createTextOverlay(makeId('text'), {
    fontFamily: 'Geist',
    fontWeight: 700,
    backgroundEnabled: false,
    shadow: true,
    ...overlayPatch,
  });
  return {
    id: makeId(),
    assetId: null,
    name: overlay.text.split('\n')[0].slice(0, 40) || 'Text',
    kind: 'text',
    start: Math.max(0, roundTime(start)),
    track: clipTrack({ track }),
    sourceStart: 0,
    sourceEnd: roundTime(duration),
    duration: roundTime(duration),
    speed: 1,
    fit: 'contain',
    textOverlays: [overlay],
    effects: defaultEffects(),
    keyframes: {},
    fadeIn: 0,
    fadeOut: 0,
    transition: { type: 'cut', duration: 0.6 },
  };
}

export function clipTextOverlays(clip = {}) {
  const legacy = clip.title?.text
    ? [{ ...clip.title, id: LEGACY_TEXT_ID, legacy: true }]
    : [];
  return [...legacy, ...(clip.textOverlays || [])];
}

export function resolveTextControlEntry(clips, {
  selectedClipId,
  selectedTextId,
  textEditingClipId,
  textEditingTextId,
} = {}) {
  const editing = Boolean(textEditingClipId && textEditingTextId);
  const clipId = editing ? textEditingClipId : selectedClipId;
  const textId = editing ? textEditingTextId : selectedTextId;
  const clip = clips.find((candidate) => candidate.id === clipId);
  const textOverlay = clipTextOverlays(clip).find((text) => text.id === textId);
  return clip && textOverlay ? { clip, textOverlay, editing } : null;
}

export function updateClipTextOverlay(clip, textId, nextText) {
  if (textId === LEGACY_TEXT_ID) {
    const { id: _id, legacy: _legacy, ...title } = nextText;
    return { ...clip, title };
  }
  return {
    ...clip,
    textOverlays: (clip.textOverlays || []).map((text) => text.id === textId ? { ...nextText, id: textId } : text),
  };
}

export function createClip(media, start = 0, track = 0) {
  const duration = media.kind === 'image' ? 5 : Math.max(media.duration || 5, MIN_CLIP_DURATION);
  return {
    id: makeId(),
    assetId: media.id,
    name: media.name,
    kind: media.kind,
    start: Math.max(0, roundTime(start)),
    track: clipTrack({ track }),
    sourceStart: 0,
    sourceEnd: roundTime(duration),
    duration: roundTime(duration),
    speed: 1,
    fit: 'contain',
    title: {
      text: '',
      fontSize: 54,
      positionX: 50,
      positionY: 78,
      opacity: 100,
      color: '#ffffff',
    },
    textOverlays: [],
    transcript: {
      text: '',
      words: [],
      language: 'en-US',
      showAsCaptions: true,
      fontFamily: 'Outfit',
      customFont: null,
      fontSize: 54,
      color: '#ffffff',
      backgroundEnabled: true,
    },
    effects: defaultEffects(),
    keyframes: {},
    fadeIn: 0,
    fadeOut: 0,
    transition: { type: 'cut', duration: 0.6 },
  };
}

export function getProjectDuration(clips) {
  if (!clips.length) return 0;
  return roundTime(Math.max(...clips.map((clip) => clip.start + clip.duration)));
}

export function appendClip(clips, clip) {
  const matchingLane = clips.filter((item) => (
    clipLaneKind(item) === clipLaneKind(clip) && clipTrack(item) === clipTrack(clip)
  ));
  return [...clips, { ...clip, start: getProjectDuration(matchingLane) }];
}

export function trimClip(clips, clipId, edge, amount) {
  return clips.map((clip) => {
    if (clip.id !== clipId) return clip;
    const safeAmount = Math.max(0, amount);
    const removed = Math.min(safeAmount, clip.duration - MIN_CLIP_DURATION);
    if (edge === 'start') {
      return {
        ...clip,
        start: roundTime(clip.start + removed),
        sourceStart: roundTime(clip.sourceStart + removed * (clip.speed || 1)),
        duration: roundTime(clip.duration - removed),
        keyframes: shiftKeyframes(clip.keyframes, -removed),
      };
    }
    return {
      ...clip,
      sourceEnd: roundTime(clip.sourceEnd - removed * (clip.speed || 1)),
      duration: roundTime(clip.duration - removed),
    };
  });
}

export function resizeClipEnd(clip, sourceDuration, requestedDelta) {
  const speed = clip.speed || 1;
  const extensionLimit = clip.kind === 'image' || clip.kind === 'text'
    ? Number.POSITIVE_INFINITY
    : Math.max(0, ((sourceDuration || clip.sourceEnd) - clip.sourceEnd) / speed);
  const added = Math.max(-(clip.duration - MIN_CLIP_DURATION), Math.min(extensionLimit, requestedDelta));
  return {
    sourceEnd: roundTime(clip.sourceEnd + added * speed),
    duration: roundTime(clip.duration + added),
  };
}

export function trimClipStart(clip, requestedDelta) {
  const speed = clip.speed || 1;
  const sourceLimit = clip.kind === 'image' || clip.kind === 'text'
    ? Number.POSITIVE_INFINITY
    : clip.sourceStart / speed;
  const removed = Math.max(-Math.min(sourceLimit, clip.start), Math.min(clip.duration - MIN_CLIP_DURATION, requestedDelta));
  return {
    start: roundTime(clip.start + removed),
    sourceStart: roundTime(Math.max(0, clip.sourceStart + removed * speed)),
    duration: roundTime(clip.duration - removed),
    keyframes: shiftKeyframes(clip.keyframes, -removed),
  };
}

export function isLiveWheelDrag(event, hasPointerCapture = false) {
  return event?.buttons === 1 || hasPointerCapture;
}

export function splitClip(clips, clipId, time) {
  const index = clips.findIndex((clip) => clip.id === clipId);
  if (index < 0) return clips;
  const clip = clips[index];
  const offset = roundTime(time - clip.start);
  if (offset < MIN_CLIP_DURATION || offset > clip.duration - MIN_CLIP_DURATION) return clips;

  const sourceOffset = roundTime(offset * (clip.speed || 1));
  const [firstKeys, secondKeys] = splitKeyframes(clip, offset);
  const first = {
    ...structuredClone(clip),
    id: makeId(),
    sourceEnd: roundTime(clip.sourceStart + sourceOffset),
    duration: offset,
    keyframes: firstKeys,
    fadeOut: 0,
  };
  const second = {
    ...structuredClone(clip),
    id: makeId(),
    start: roundTime(time),
    sourceStart: roundTime(clip.sourceStart + sourceOffset),
    duration: roundTime(clip.duration - offset),
    keyframes: secondKeys,
    fadeIn: 0,
    transition: { ...(clip.transition || {}), type: 'cut' },
  };
  return [...clips.slice(0, index), first, second, ...clips.slice(index + 1)];
}

export function splitClipsAt(clips, time, clipIds = null) {
  const targets = clips.filter((clip) => (
    (!clipIds || clipIds.includes(clip.id))
    && time > clip.start + MIN_CLIP_DURATION
    && time < clip.start + clip.duration - MIN_CLIP_DURATION
  ));
  return targets.reduce((current, clip) => splitClip(current, clip.id, time), clips);
}

export function moveClip(clips, clipId, start, track = null) {
  return clips.map((clip) => clip.id === clipId ? {
    ...clip,
    start: Math.max(0, roundTime(start)),
    track: track === null ? clipTrack(clip) : clipTrack({ track }),
  } : clip);
}

export function nudgeClip(clips, clipId, delta) {
  const selected = clips.find((clip) => clip.id === clipId);
  if (!selected) return clips;
  return moveClip(clips, clipId, selected.start + delta);
}

export function stepPlayhead(current, direction, duration, frameRate = 30, largeStep = false) {
  const safeDuration = Math.max(0, Number(duration) || 0);
  const safeFrameRate = Math.max(1, Number(frameRate) || 30);
  const amount = largeStep ? 1 : 1 / safeFrameRate;
  return Math.min(safeDuration, Math.max(0, roundTime((Number(current) || 0) + Math.sign(direction) * amount)));
}

export function removeClip(clips, clipId) {
  return clips.filter((clip) => clip.id !== clipId);
}

export function removeMediaFromProject(project, assetId) {
  return {
    ...project,
    media: project.media.filter((item) => item.id !== assetId),
    clips: project.clips.filter((clip) => clip.assetId !== assetId),
  };
}

function freshTextIds(clip) {
  if (clip.kind !== 'text' && !(clip.textOverlays || []).length) return clip;
  return {
    ...clip,
    textOverlays: (clip.textOverlays || []).map((text) => ({ ...text, id: makeId('text') })),
  };
}

export function duplicateClip(clips, clipId) {
  const index = clips.findIndex((clip) => clip.id === clipId);
  if (index < 0) return clips;
  const source = clips[index];
  const duplicate = freshTextIds({
    ...structuredClone(source),
    id: makeId(),
    start: roundTime(source.start + source.duration),
  });
  duplicate.effects = duplicate.effects || defaultEffects();
  duplicate.effects.primaryWheels = Object.fromEntries(
    Object.entries(source.effects?.primaryWheels || defaultPrimaryWheels()).map(([key, value]) => [key, { ...value }]),
  );
  return [...clips.slice(0, index + 1), duplicate, ...clips.slice(index + 1)];
}

export function duplicateClips(clips, clipIds) {
  const group = clips.filter((clip) => clipIds.includes(clip.id));
  if (!group.length) return { clips, created: [] };
  const groupStart = Math.min(...group.map((clip) => clip.start));
  const groupEnd = Math.max(...group.map((clip) => clip.start + clip.duration));
  const created = group.map((clip) => freshTextIds({
    ...structuredClone(clip),
    id: makeId(),
    start: roundTime(groupEnd + (clip.start - groupStart)),
  }));
  return { clips: [...clips, ...created], created };
}

export function pasteClipAt(source, start) {
  if (!source) return null;
  const pasted = freshTextIds(structuredClone(source));
  return {
    ...pasted,
    id: makeId(),
    start: Math.max(0, roundTime(start)),
  };
}

export function pasteClipsAt(sources = [], start) {
  if (!sources.length) return [];
  const origin = Math.min(...sources.map((clip) => clip.start));
  return sources.map((clip) => pasteClipAt(clip, start + (clip.start - origin)));
}

export function setClipSpeed(clip, requestedSpeed) {
  const speed = Math.min(4, Math.max(0.25, Number(requestedSpeed) || 1));
  const previous = clip.speed || 1;
  const factor = previous / speed;
  return {
    ...clip,
    speed,
    duration: roundTime((clip.sourceEnd - clip.sourceStart) / speed),
    keyframes: scaleKeyframes(clip.keyframes, factor),
    fadeIn: roundTime((clip.fadeIn || 0) * factor),
    fadeOut: roundTime((clip.fadeOut || 0) * factor),
  };
}

export function moveClips(clips, clipIds, delta) {
  const group = clips.filter((clip) => clipIds.includes(clip.id));
  if (!group.length) return clips;
  const earliest = Math.min(...group.map((clip) => clip.start));
  const safeDelta = Math.max(-earliest, delta);
  return clips.map((clip) => (
    clipIds.includes(clip.id) ? { ...clip, start: roundTime(clip.start + safeDelta) } : clip
  ));
}

function sameLane(a, b) {
  return clipLaneKind(a) === clipLaneKind(b) && clipTrack(a) === clipTrack(b);
}

export function rippleDeleteClips(clips, clipIds) {
  const removed = clips.filter((clip) => clipIds.includes(clip.id)).sort((a, b) => b.start - a.start);
  let next = clips.filter((clip) => !clipIds.includes(clip.id));
  for (const gone of removed) {
    next = next.map((clip) => (
      sameLane(clip, gone) && clip.start >= gone.start + gone.duration - 0.0005
        ? { ...clip, start: roundTime(clip.start - gone.duration) }
        : clip
    ));
  }
  return next;
}

export function closeGapAt(clips, kind, track, time) {
  const lane = clips
    .filter((clip) => clipLaneKind(clip) === kind && clipTrack(clip) === track)
    .sort((a, b) => a.start - b.start);
  const next = lane.find((clip) => clip.start > time);
  if (!next) return clips;
  const previousEnd = lane
    .filter((clip) => clip.start + clip.duration <= next.start + 0.0005 && clip.id !== next.id)
    .reduce((max, clip) => Math.max(max, clip.start + clip.duration), 0);
  if (time < previousEnd - 0.0005) return clips;
  const gap = roundTime(next.start - previousEnd);
  if (gap <= 0) return clips;
  return clips.map((clip) => (
    clipLaneKind(clip) === kind && clipTrack(clip) === track && clip.start >= next.start - 0.0005
      ? { ...clip, start: roundTime(clip.start - gap) }
      : clip
  ));
}

export function closeAllGaps(clips, kind, track) {
  let cursor = 0;
  const lane = clips
    .filter((clip) => clipLaneKind(clip) === kind && clipTrack(clip) === track)
    .sort((a, b) => a.start - b.start);
  const positions = new Map();
  for (const clip of lane) {
    const start = Math.min(clip.start, cursor);
    positions.set(clip.id, roundTime(start));
    cursor = Math.max(cursor, start + clip.duration);
  }
  return clips.map((clip) => (positions.has(clip.id) ? { ...clip, start: positions.get(clip.id) } : clip));
}

export function editPoints(clips) {
  const points = new Set([0]);
  for (const clip of clips) {
    points.add(roundTime(clip.start));
    points.add(roundTime(clip.start + clip.duration));
  }
  return [...points].sort((a, b) => a - b);
}

export function adjacentEditPoint(clips, time, direction) {
  const points = editPoints(clips);
  if (direction < 0) return [...points].reverse().find((point) => point < time - 0.0005) ?? 0;
  return points.find((point) => point > time + 0.0005) ?? points.at(-1) ?? 0;
}

export function detachAudio(clips, clipId, audioTrack = 0) {
  const source = clips.find((clip) => clip.id === clipId);
  if (!source || source.kind !== 'video') return { clips, audioClip: null };
  const audioClip = {
    ...structuredClone(source),
    id: makeId(),
    kind: 'audio',
    track: clipTrack({ track: audioTrack }),
    name: source.name,
    textOverlays: [],
    transition: { type: 'cut', duration: 0.6 },
    detachedFrom: source.id,
  };
  return {
    clips: [
      ...clips.map((clip) => (clip.id === clipId ? { ...clip, muted: true } : clip)),
      audioClip,
    ],
    audioClip,
  };
}

export function freeLaneTrack(clips, kind, start, duration, preferred = 0, maxTrack = MAX_TRACK_INDEX) {
  const end = start + duration;
  for (let track = preferred; track <= maxTrack; track += 1) {
    const busy = clips.some((clip) => (
      clipLaneKind(clip) === kind && clipTrack(clip) === track
      && clip.start < end - 0.0005 && clip.start + clip.duration > start + 0.0005
    ));
    if (!busy) return track;
  }
  return Math.min(maxTrack, preferred);
}

export function serializeProject(project) {
  return {
    ...project,
    version: 2,
    media: project.media.map(({ src: _src, thumbnail: _thumbnail, ...item }) => item),
    clips: project.clips.map((clip) => {
      const customFont = clip.transcript?.customFont;
      if (!customFont) return clip;
      const { src: _src, ...durableFont } = customFont;
      return {
        ...clip,
        transcript: { ...clip.transcript, customFont: durableFont },
      };
    }),
    modifiedAt: new Date().toISOString(),
  };
}

export function getTransitionProgress(clip, playhead) {
  if (!clip || !clip.transition || clip.transition.type === 'cut') return 1;
  return Math.min(1, Math.max(0, (playhead - clip.start) / Math.max(0.1, clip.transition.duration)));
}

export function timelineTimeFromPointer({ clientX, viewportLeft, scrollLeft, pixelsPerSecond, gutterWidth = TIMELINE_GUTTER }) {
  return Math.max(0, (clientX - viewportLeft + scrollLeft - gutterWidth) / pixelsPerSecond);
}

export function snapTimelineTime(value, clips, pixelsPerSecond, excludedClipId = null, enabled = true, extraPoints = []) {
  const safeValue = Math.max(0, value);
  if (!enabled) return safeValue;
  const excluded = Array.isArray(excludedClipId) ? excludedClipId : [excludedClipId];
  const candidates = [
    0,
    ...extraPoints.filter((point) => Number.isFinite(point)),
    ...clips
      .filter((clip) => !excluded.includes(clip.id))
      .flatMap((clip) => [clip.start, clip.start + clip.duration]),
  ];
  const nearest = candidates.reduce((best, candidate) => (
    Math.abs(candidate - safeValue) < Math.abs(best - safeValue) ? candidate : best
  ), candidates[0]);
  return Math.abs(nearest - safeValue) * pixelsPerSecond <= 6 ? nearest : safeValue;
}

export function timelineZoomForDuration(duration, viewportWidth, gutterWidth = TIMELINE_GUTTER) {
  const timelineDuration = Math.max(10, Math.max(0, Number(duration) || 0) * 1.04 + 1);
  const availableWidth = Math.max(1, (Number(viewportWidth) || 0) - gutterWidth - 24);
  const zoom = availableWidth / (timelineDuration * 64);
  return Math.min(MAX_TIMELINE_ZOOM, Math.max(MIN_TIMELINE_ZOOM, Math.round(zoom * 1000) / 1000));
}

export function timelineCanvasDuration(duration, viewportSeconds = 0) {
  return Math.max(30, Math.ceil(Math.max(Number(duration) || 0, 0) + 10), Math.ceil(viewportSeconds));
}
