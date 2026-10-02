import { clipLocalTime, clipVolumeAt } from './animation.js';
import { framePlan, sourceTimeAt } from './compositor.js';
import { isClipMuted } from './project.js';

const PRELOAD_SECONDS = 1.5;
const RELEASE_AFTER_MS = 4000;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

// Owns the hidden <video>, <audio> and <img> elements behind the canvas preview. Video
// elements are both the picture source for the compositor and the sound you hear.
export default class PreviewSourcePool {
  constructor({ onChange } = {}) {
    this.onChange = onChange || (() => {});
    this.media = new Map();
    this.images = new Map();
    this.lastUsed = new Map();
    this.notify = () => this.onChange();
  }

  imageFor(asset) {
    let image = this.images.get(asset.id);
    if (!image || image.dataset.src !== asset.src) {
      image = new Image();
      image.crossOrigin = 'anonymous';
      image.decoding = 'async';
      image.dataset.src = asset.src;
      image.addEventListener('load', this.notify);
      image.src = asset.src;
      this.images.set(asset.id, image);
    }
    return image;
  }

  mediaFor(clip, asset) {
    let element = this.media.get(clip.id);
    if (element && element.dataset.src !== asset.src) {
      this.release(clip.id);
      element = null;
    }
    if (!element) {
      element = document.createElement(clip.kind === 'audio' ? 'audio' : 'video');
      element.preload = 'auto';
      element.crossOrigin = 'anonymous';
      element.playsInline = true;
      element.dataset.src = asset.src;
      for (const event of ['loadeddata', 'seeked', 'canplay']) element.addEventListener(event, this.notify);
      element.src = asset.src;
      this.media.set(clip.id, element);
    }
    return element;
  }

  release(clipId) {
    const element = this.media.get(clipId);
    if (!element) return;
    element.pause();
    for (const event of ['loadeddata', 'seeked', 'canplay']) element.removeEventListener(event, this.notify);
    element.removeAttribute('src');
    element.load();
    this.media.delete(clipId);
    this.lastUsed.delete(clipId);
  }

  getSource = (clip) => {
    if (clip.kind === 'image') {
      const image = this.images.get(clip.assetId);
      return image?.complete && image.naturalWidth ? image : null;
    }
    const element = this.media.get(clip.id);
    return element && element.readyState >= 2 && element.videoWidth ? element : null;
  };

  // True when every picture the frame needs is decoded and not mid-seek.
  isFrameReady(project, time) {
    const plan = framePlan(project, time);
    return plan.layers.every((layer) => [layer.clip, layer.previous?.clip].filter(Boolean).every((clip) => {
      if (clip.kind === 'text') return true;
      if (clip.kind === 'image') return Boolean(this.getSource(clip));
      const element = this.media.get(clip.id);
      return element && element.readyState >= 2 && !element.seeking;
    }));
  }

  sync({ project, time, playing }) {
    const now = performance.now();
    const assetById = new Map((project.media || []).map((asset) => [asset.id, asset]));
    const plan = framePlan(project, time);
    const frame = 1 / Math.max(1, project.frameRate || 30);
    const entries = new Map();
    const want = (clip, sampleTime, role) => {
      if (!clip || clip.kind === 'text' || entries.has(clip.id)) return;
      entries.set(clip.id, { clip, sampleTime, role });
    };
    for (const clip of plan.active) want(clip, time, 'main');
    for (const layer of plan.layers) if (layer.previous) want(layer.previous.clip, layer.previous.time, 'previous');
    for (const clip of project.clips || []) {
      if (clip.start > time && clip.start - time <= PRELOAD_SECONDS) want(clip, clip.start, 'preload');
    }

    for (const { clip, sampleTime, role } of entries.values()) {
      const asset = assetById.get(clip.assetId);
      if (!asset?.src) continue;
      if (clip.kind === 'image' || asset.kind === 'image') {
        this.imageFor(asset);
        continue;
      }
      const element = this.mediaFor(clip, asset);
      this.lastUsed.set(clip.id, now);
      const duration = Number.isFinite(element.duration) ? element.duration : Number.POSITIVE_INFINITY;
      const target = clamp(sourceTimeAt(clip, sampleTime), 0, Math.max(0, duration - 0.03));
      const audible = role === 'main' && !isClipMuted(project, clip);
      const volume = audible ? clamp(clipVolumeAt(clip, clipLocalTime(clip, sampleTime)), 0, 1) : 0;
      element.muted = volume <= 0.001;
      element.volume = volume;
      const rate = clamp(Number(clip.speed) || 1, 0.25, 4);
      if (element.playbackRate !== rate) element.playbackRate = rate;
      const shouldPlay = playing && role !== 'preload';
      if (shouldPlay) {
        if (element.paused) {
          if (Math.abs(element.currentTime - target) > 0.05) element.currentTime = target;
          element.play().catch(() => {});
        } else if (Math.abs(element.currentTime - target) > 0.25) {
          element.currentTime = target;
        }
      } else {
        if (!element.paused) element.pause();
        if (Math.abs(element.currentTime - target) > frame / 2) element.currentTime = target;
      }
    }

    for (const [clipId, element] of this.media) {
      if (entries.has(clipId)) continue;
      if (!element.paused) element.pause();
      if (now - (this.lastUsed.get(clipId) || 0) > RELEASE_AFTER_MS) this.release(clipId);
    }
  }

  pauseAll() {
    for (const element of this.media.values()) element.pause();
  }

  dispose() {
    for (const clipId of [...this.media.keys()]) this.release(clipId);
    for (const image of this.images.values()) image.removeEventListener('load', this.notify);
    this.images.clear();
  }
}
