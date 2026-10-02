import { defaultEffects } from './editor.js';

export const PROJECT_VERSION = 2;
export const MAX_TRACKS = 6;

export const CANVAS_FORMATS = Object.freeze([
  { id: 'landscape-1080', label: 'Landscape', detail: 'YouTube, desktop', ratio: '16:9', width: 1920, height: 1080 },
  { id: 'vertical-1080', label: 'Vertical', detail: 'TikTok, Reels, Shorts', ratio: '9:16', width: 1080, height: 1920 },
  { id: 'square-1080', label: 'Square', detail: 'Instagram feed', ratio: '1:1', width: 1080, height: 1080 },
  { id: 'portrait-1080', label: 'Portrait', detail: 'Instagram 4:5', ratio: '4:5', width: 1080, height: 1350 },
  { id: 'cinema-2560', label: 'Cinematic', detail: 'Widescreen film', ratio: '21:9', width: 2560, height: 1080 },
  { id: 'landscape-720', label: 'Landscape HD', detail: 'Smaller, faster exports', ratio: '16:9', width: 1280, height: 720 },
  { id: 'landscape-2160', label: '4K UHD', detail: 'Highest quality', ratio: '16:9', width: 3840, height: 2160 },
]);

export const FRAME_RATES = Object.freeze([24, 25, 30, 50, 60]);

export const DEFAULT_FORMAT_ID = 'landscape-1080';

export function canvasFormat(id) {
  return CANVAS_FORMATS.find((format) => format.id === id) || null;
}

export function formatForSize(width, height) {
  return CANVAS_FORMATS.find((format) => format.width === width && format.height === height) || null;
}

export function aspectLabel(width, height) {
  const known = formatForSize(width, height);
  if (known) return known.ratio;
  const gcd = (a, b) => (b ? gcd(b, a % b) : a);
  const divisor = gcd(Math.round(width), Math.round(height)) || 1;
  return `${Math.round(width / divisor)}:${Math.round(height / divisor)}`;
}

export function defaultTrackCounts() {
  return { video: 3, audio: 2 };
}

export function createProject(overrides = {}) {
  const format = canvasFormat(overrides.formatId) || canvasFormat(DEFAULT_FORMAT_ID);
  return {
    version: PROJECT_VERSION,
    name: 'Untitled project',
    width: format.width,
    height: format.height,
    frameRate: 30,
    background: '#000000',
    media: [],
    clips: [],
    markers: [],
    tracks: {},
    trackCounts: defaultTrackCounts(),
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function finite(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function normalizeClip(clip = {}) {
  return {
    ...clip,
    speed: finite(clip.speed, 1) || 1,
    fadeIn: Math.max(0, finite(clip.fadeIn, 0)),
    fadeOut: Math.max(0, finite(clip.fadeOut, 0)),
    keyframes: clip.keyframes && typeof clip.keyframes === 'object' ? clip.keyframes : {},
    effects: { ...defaultEffects(), ...(clip.effects || {}) },
    transition: clip.transition || { type: 'cut', duration: 0.6 },
    textOverlays: clip.textOverlays || [],
  };
}

export function normalizeProject(raw = {}) {
  const legacy = !raw.version || raw.version < 2;
  const base = createProject();
  const clips = (raw.clips || []).map(normalizeClip);
  const highest = (kind) => clips
    .filter((clip) => (clip.kind === 'audio' ? 'audio' : 'video') === kind)
    .reduce((max, clip) => Math.max(max, Math.round(Number(clip.track) || 0) + 1), 0);
  const counts = { ...defaultTrackCounts(), ...(raw.trackCounts || {}) };
  return {
    ...base,
    ...raw,
    version: PROJECT_VERSION,
    width: Math.max(16, finite(raw.width, legacy ? 1280 : base.width)),
    height: Math.max(16, finite(raw.height, legacy ? 720 : base.height)),
    frameRate: Math.max(1, finite(raw.frameRate, 30)),
    background: typeof raw.background === 'string' ? raw.background : base.background,
    media: raw.media || [],
    clips,
    markers: Array.isArray(raw.markers) ? raw.markers : [],
    tracks: raw.tracks && typeof raw.tracks === 'object' ? raw.tracks : {},
    trackCounts: {
      video: Math.min(MAX_TRACKS, Math.max(1, counts.video, highest('video'))),
      audio: Math.min(MAX_TRACKS, Math.max(1, counts.audio, highest('audio'))),
    },
  };
}

export function trackKey(kind, index) {
  return `${kind === 'audio' ? 'audio' : 'video'}-${index}`;
}

export function laneKind(clip) {
  return clip?.kind === 'audio' ? 'audio' : 'video';
}

export function trackState(project, kind, index) {
  return { hidden: false, muted: false, locked: false, ...(project?.tracks?.[trackKey(kind, index)] || {}) };
}

export function clipTrackState(project, clip) {
  return trackState(project, laneKind(clip), Math.round(Number(clip?.track) || 0));
}

export function toggleTrackFlag(project, kind, index, flag) {
  const key = trackKey(kind, index);
  const current = trackState(project, kind, index);
  return {
    ...project,
    tracks: { ...(project.tracks || {}), [key]: { ...current, [flag]: !current[flag] } },
  };
}

export function isClipHidden(project, clip) {
  return laneKind(clip) === 'video' && clipTrackState(project, clip).hidden;
}

export function isClipMuted(project, clip) {
  return Boolean(clip?.muted) || clipTrackState(project, clip).muted;
}

export function isClipLocked(project, clip) {
  return clipTrackState(project, clip).locked;
}

export function addTrack(project, kind) {
  const counts = { ...defaultTrackCounts(), ...(project.trackCounts || {}) };
  const key = kind === 'audio' ? 'audio' : 'video';
  return { ...project, trackCounts: { ...counts, [key]: Math.min(MAX_TRACKS, counts[key] + 1) } };
}

export function frameDuration(project) {
  return 1 / Math.max(1, Number(project?.frameRate) || 30);
}

export function snapToFrame(time, frameRate = 30) {
  const fps = Math.max(1, Number(frameRate) || 30);
  return Math.round(Math.max(0, Number(time) || 0) * fps) / fps;
}
