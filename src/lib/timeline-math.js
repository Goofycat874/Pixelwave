import { MAX_TIMELINE_ZOOM, MIN_TIMELINE_ZOOM } from './editor.js';

export const PIXELS_PER_SECOND = 64;
export const TRACK_HEIGHTS = Object.freeze({ video: 54, audio: 46 });

const MAJOR_STEPS = [0.1, 0.2, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 1800, 3600];

// Picks ruler spacing so labels never collide at any zoom level.
export function rulerSteps(pixelsPerSecond, minLabelSpacing = 84) {
  const major = MAJOR_STEPS.find((step) => step * pixelsPerSecond >= minLabelSpacing) || MAJOR_STEPS.at(-1);
  const divisions = [10, 5, 4, 2].find((count) => (major / count) * pixelsPerSecond >= 9) || 1;
  return { major, minor: major / divisions };
}

export function rulerTicks(start, end, pixelsPerSecond) {
  const { major, minor } = rulerSteps(pixelsPerSecond);
  const first = Math.max(0, Math.floor(start / minor) * minor);
  const ticks = [];
  for (let index = 0, time = first; time <= end + minor && index < 4000; index += 1, time = first + index * minor) {
    const rounded = Math.round(time * 1000) / 1000;
    const isMajor = Math.abs(rounded / major - Math.round(rounded / major)) < 1e-6;
    ticks.push({ time: rounded, major: isMajor });
  }
  return { ticks, major, minor };
}

// The zoom slider is logarithmic so each notch feels like the same amount of zoom.
export function zoomToSlider(zoom) {
  const min = Math.log(MIN_TIMELINE_ZOOM);
  const max = Math.log(MAX_TIMELINE_ZOOM);
  return Math.round(((Math.log(Math.min(MAX_TIMELINE_ZOOM, Math.max(MIN_TIMELINE_ZOOM, zoom))) - min) / (max - min)) * 1000) / 10;
}

export function sliderToZoom(value) {
  const min = Math.log(MIN_TIMELINE_ZOOM);
  const max = Math.log(MAX_TIMELINE_ZOOM);
  return Math.round(Math.exp(min + (Math.min(100, Math.max(0, value)) / 100) * (max - min)) * 1000) / 1000;
}

export function stepZoom(zoom, direction) {
  const factor = direction > 0 ? 1.25 : 0.8;
  return Math.min(MAX_TIMELINE_ZOOM, Math.max(MIN_TIMELINE_ZOOM, Math.round(zoom * factor * 1000) / 1000));
}

// Keeps the time under the pointer fixed while zooming.
export function anchoredScroll({ time, pointerOffset, gutter, pixelsPerSecond }) {
  return Math.max(0, gutter + time * pixelsPerSecond - pointerOffset);
}
