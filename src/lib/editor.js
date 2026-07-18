const MIN_CLIP_DURATION = 0.1;

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
  return Math.min(2, Math.max(0, Math.round(Number(clip?.track) || 0)));
}

export const TIMELINE_TRACKS = Object.freeze([
  { kind: 'video', track: 2, label: 'V3' },
  { kind: 'video', track: 1, label: 'V2' },
  { kind: 'video', track: 0, label: 'V1' },
  { kind: 'audio', track: 0, label: 'A1' },
  { kind: 'audio', track: 1, label: 'A2' },
  { kind: 'audio', track: 2, label: 'A3' },
]);

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

export function createTextOverlay(id = makeId('text')) {
  return {
    id,
    text: 'Your text',
    fontSize: 54,
    positionX: 50,
    positionY: 50,
    opacity: 100,
    color: '#ffffff',
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
  const extensionLimit = clip.kind === 'image'
    ? Number.POSITIVE_INFINITY
    : Math.max(0, ((sourceDuration || clip.sourceEnd) - clip.sourceEnd) / speed);
  const added = Math.max(-(clip.duration - MIN_CLIP_DURATION), Math.min(extensionLimit, requestedDelta));
  return {
    sourceEnd: roundTime(clip.sourceEnd + added * speed),
    duration: roundTime(clip.duration + added),
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
  const first = {
    ...clip,
    id: makeId(),
    sourceEnd: roundTime(clip.sourceStart + sourceOffset),
    duration: offset,
  };
  const second = {
    ...clip,
    id: makeId(),
    start: roundTime(time),
    sourceStart: roundTime(clip.sourceStart + sourceOffset),
    duration: roundTime(clip.duration - offset),
  };
  return [...clips.slice(0, index), first, second, ...clips.slice(index + 1)];
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

export function duplicateClip(clips, clipId) {
  const index = clips.findIndex((clip) => clip.id === clipId);
  if (index < 0) return clips;
  const source = clips[index];
  const duplicate = {
    ...source,
    id: makeId(),
    start: roundTime(source.start + source.duration),
    effects: { ...source.effects },
    transition: { ...source.transition },
    title: { ...source.title },
    textOverlays: (source.textOverlays || []).map((text) => ({ ...text })),
    transcript: { ...source.transcript },
  };
  duplicate.effects.primaryWheels = Object.fromEntries(
    Object.entries(source.effects?.primaryWheels || defaultPrimaryWheels()).map(([key, value]) => [key, { ...value }]),
  );
  return [...clips.slice(0, index + 1), duplicate, ...clips.slice(index + 1)];
}

export function pasteClipAt(source, start) {
  if (!source) return null;
  const pasted = structuredClone(source);
  return {
    ...pasted,
    id: makeId(),
    start: Math.max(0, roundTime(start)),
  };
}

export function setClipSpeed(clip, requestedSpeed) {
  const speed = Math.min(4, Math.max(0.25, Number(requestedSpeed) || 1));
  return {
    ...clip,
    speed,
    duration: roundTime((clip.sourceEnd - clip.sourceStart) / speed),
  };
}

export function serializeProject(project) {
  return {
    ...project,
    version: 1,
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

export function timelineTimeFromPointer({ clientX, viewportLeft, scrollLeft, pixelsPerSecond, gutterWidth = 84 }) {
  return Math.max(0, (clientX - viewportLeft + scrollLeft - gutterWidth) / pixelsPerSecond);
}

export function snapTimelineTime(value, clips, pixelsPerSecond, excludedClipId = null, enabled = true) {
  const safeValue = Math.max(0, value);
  if (!enabled) return safeValue;
  const candidates = [
    0,
    ...clips
      .filter((clip) => clip.id !== excludedClipId)
      .flatMap((clip) => [clip.start, clip.start + clip.duration]),
  ];
  const nearest = candidates.reduce((best, candidate) => (
    Math.abs(candidate - safeValue) < Math.abs(best - safeValue) ? candidate : best
  ), candidates[0]);
  return Math.abs(nearest - safeValue) * pixelsPerSecond <= 6 ? nearest : safeValue;
}

export function timelineZoomForDuration(duration, viewportWidth, gutterWidth = 84) {
  const timelineDuration = Math.max(30, Math.ceil(Math.max(0, Number(duration) || 0) + 8));
  const availableWidth = Math.max(1, (Number(viewportWidth) || 0) - gutterWidth - 24);
  const zoom = availableWidth / (timelineDuration * 64);
  return Math.min(2, Math.max(0.15, Math.round(zoom * 1000) / 1000));
}
