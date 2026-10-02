// Keyframes live on clips as { [property]: [{ time, value, easing }] } where time is
// seconds from the clip's timeline start. Easing describes the segment leaving a keyframe.

export const ANIMATABLE_PROPERTIES = Object.freeze({
  positionX: { label: 'Position X', fallback: 0 },
  positionY: { label: 'Position Y', fallback: 0 },
  scale: { label: 'Scale', fallback: 100 },
  rotation: { label: 'Rotation', fallback: 0 },
  opacity: { label: 'Opacity', fallback: 100 },
  volume: { label: 'Volume', fallback: 100 },
  blur: { label: 'Blur', fallback: 0 },
});

export const EASINGS = Object.freeze([
  ['linear', 'Linear'],
  ['ease', 'Smooth'],
  ['ease-in', 'Ease in'],
  ['ease-out', 'Ease out'],
  ['hold', 'Hold'],
]);

const KEYFRAME_TOLERANCE = 1 / 120;

function roundTime(value) {
  return Math.round(value * 1000) / 1000;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function applyEasing(easing, progress) {
  const x = clamp(progress, 0, 1);
  if (easing === 'hold') return 0;
  if (easing === 'ease-in') return x * x * x;
  if (easing === 'ease-out') return 1 - (1 - x) ** 3;
  if (easing === 'ease') return x < 0.5 ? 4 * x * x * x : 1 - ((-2 * x + 2) ** 3) / 2;
  return x;
}

export function sortKeyframes(list = []) {
  return [...list]
    .filter((frame) => Number.isFinite(Number(frame?.time)) && Number.isFinite(Number(frame?.value)))
    .sort((a, b) => a.time - b.time);
}

export function valueAt(list, time, fallback = 0) {
  const frames = sortKeyframes(list);
  if (!frames.length) return fallback;
  if (time <= frames[0].time) return frames[0].value;
  const last = frames[frames.length - 1];
  if (time >= last.time) return last.value;
  for (let index = 0; index < frames.length - 1; index += 1) {
    const from = frames[index];
    const to = frames[index + 1];
    if (time >= from.time && time <= to.time) {
      const span = Math.max(0.000001, to.time - from.time);
      const eased = applyEasing(from.easing || 'linear', (time - from.time) / span);
      return from.value + (to.value - from.value) * eased;
    }
  }
  return last.value;
}

export function hasKeyframes(clip, property) {
  return Boolean(clip?.keyframes?.[property]?.length);
}

export function isAnimated(clip) {
  return Object.values(clip?.keyframes || {}).some((list) => list?.length);
}

export function keyframeIndexAt(list = [], time, tolerance = KEYFRAME_TOLERANCE) {
  return list.findIndex((frame) => Math.abs(frame.time - time) <= tolerance);
}

export function clipLocalTime(clip, timelineTime) {
  return clamp(roundTime((Number(timelineTime) || 0) - (Number(clip?.start) || 0)), 0, Number(clip?.duration) || 0);
}

function baseValue(clip, property) {
  const value = clip?.effects?.[property];
  return Number.isFinite(Number(value)) ? Number(value) : ANIMATABLE_PROPERTIES[property]?.fallback ?? 0;
}

export function propertyValueAt(clip, property, localTime) {
  const base = baseValue(clip, property);
  return hasKeyframes(clip, property) ? valueAt(clip.keyframes[property], localTime, base) : base;
}

export function animatedEffects(clip, localTime) {
  const effects = { ...(clip?.effects || {}) };
  for (const property of Object.keys(clip?.keyframes || {})) {
    if (hasKeyframes(clip, property)) effects[property] = propertyValueAt(clip, property, localTime);
  }
  return effects;
}

export function setKeyframe(clip, property, time, value, easing = null) {
  const list = [...(clip.keyframes?.[property] || [])];
  const safeTime = roundTime(Math.max(0, time));
  const index = keyframeIndexAt(list, safeTime);
  const numeric = Math.round(Number(value) * 1000) / 1000;
  if (index >= 0) list[index] = { ...list[index], value: numeric, ...(easing ? { easing } : {}) };
  else list.push({ time: safeTime, value: numeric, easing: easing || 'ease' });
  return { ...clip, keyframes: { ...(clip.keyframes || {}), [property]: sortKeyframes(list) } };
}

export function removeKeyframe(clip, property, time) {
  const list = (clip.keyframes?.[property] || []).filter((frame) => Math.abs(frame.time - time) > KEYFRAME_TOLERANCE);
  const keyframes = { ...(clip.keyframes || {}) };
  if (list.length) keyframes[property] = list;
  else delete keyframes[property];
  const effects = list.length ? clip.effects : { ...clip.effects, [property]: propertyValueAt(clip, property, time) };
  return { ...clip, effects, keyframes };
}

export function toggleKeyframe(clip, property, time) {
  const list = clip.keyframes?.[property] || [];
  if (keyframeIndexAt(list, time) >= 0) return removeKeyframe(clip, property, time);
  return setKeyframe(clip, property, time, propertyValueAt(clip, property, time));
}

export function clearKeyframes(clip, properties = null) {
  const targets = properties || Object.keys(clip.keyframes || {});
  const keyframes = { ...(clip.keyframes || {}) };
  const effects = { ...(clip.effects || {}) };
  for (const property of targets) {
    if (keyframes[property]?.length) effects[property] = keyframes[property][0].value;
    delete keyframes[property];
  }
  return { ...clip, effects, keyframes };
}

export function setKeyframeEasing(clip, property, time, easing) {
  const list = (clip.keyframes?.[property] || []).map((frame) => (
    Math.abs(frame.time - time) <= KEYFRAME_TOLERANCE ? { ...frame, easing } : frame
  ));
  return { ...clip, keyframes: { ...(clip.keyframes || {}), [property]: list } };
}

// Writes effect changes, turning edits on animated properties into keyframes at localTime.
export function applyEffectChanges(clip, changes, localTime) {
  let next = { ...clip, effects: { ...(clip.effects || {}) } };
  for (const [property, value] of Object.entries(changes)) {
    if (hasKeyframes(next, property)) next = setKeyframe(next, property, localTime, value);
    else next.effects[property] = value;
  }
  return next;
}

export function keyframeTimes(clip) {
  const times = new Set();
  for (const list of Object.values(clip?.keyframes || {})) {
    for (const frame of list || []) times.add(roundTime(frame.time));
  }
  return [...times].sort((a, b) => a - b);
}

export function shiftKeyframes(keyframes = {}, delta) {
  return Object.fromEntries(Object.entries(keyframes).map(([property, list]) => [
    property,
    (list || []).map((frame) => ({ ...frame, time: roundTime(frame.time + delta) })),
  ]));
}

export function scaleKeyframes(keyframes = {}, factor) {
  return Object.fromEntries(Object.entries(keyframes).map(([property, list]) => [
    property,
    (list || []).map((frame) => ({ ...frame, time: roundTime(frame.time * factor) })),
  ]));
}

// Splits keyframes at a clip-local offset, inserting boundary keys so both halves keep their motion.
export function splitKeyframes(clip, offset) {
  const first = {};
  const second = {};
  for (const [property, list] of Object.entries(clip.keyframes || {})) {
    if (!list?.length) continue;
    const boundary = propertyValueAt(clip, property, offset);
    const sorted = sortKeyframes(list);
    const before = sorted.filter((frame) => frame.time < offset - KEYFRAME_TOLERANCE);
    const after = sorted.filter((frame) => frame.time > offset + KEYFRAME_TOLERANCE);
    const easing = [...before].reverse()[0]?.easing || 'linear';
    first[property] = [...before, { time: roundTime(offset), value: boundary, easing }];
    second[property] = [{ time: 0, value: boundary, easing }, ...after.map((frame) => ({ ...frame, time: roundTime(frame.time - offset) }))];
  }
  return [first, second];
}

export function fadeEnvelope(clip, localTime) {
  const duration = Math.max(0, Number(clip?.duration) || 0);
  const fadeIn = Math.min(duration, Math.max(0, Number(clip?.fadeIn) || 0));
  const fadeOut = Math.min(duration, Math.max(0, Number(clip?.fadeOut) || 0));
  let value = 1;
  if (fadeIn > 0 && localTime < fadeIn) value *= Math.max(0, localTime) / fadeIn;
  if (fadeOut > 0 && localTime > duration - fadeOut) value *= Math.max(0, duration - localTime) / fadeOut;
  return clamp(value, 0, 1);
}

export function clipVolumeAt(clip, localTime) {
  return Math.max(0, propertyValueAt(clip, 'volume', localTime) / 100) * fadeEnvelope(clip, localTime);
}

// One-click animations. Values are relative to the clip's current resting state so a
// picture-in-picture clip animates from where the user already placed it.
export const MOTION_PRESETS = Object.freeze([
  { id: 'ken-burns-in', label: 'Slow zoom in', group: 'Continuous' },
  { id: 'ken-burns-out', label: 'Slow zoom out', group: 'Continuous' },
  { id: 'pan-left', label: 'Pan left', group: 'Continuous' },
  { id: 'pan-right', label: 'Pan right', group: 'Continuous' },
  { id: 'float', label: 'Float up', group: 'Continuous' },
  { id: 'pop-in', label: 'Pop in', group: 'Entrance' },
  { id: 'slide-in-left', label: 'Slide from left', group: 'Entrance' },
  { id: 'slide-in-right', label: 'Slide from right', group: 'Entrance' },
  { id: 'slide-in-up', label: 'Rise up', group: 'Entrance' },
  { id: 'spin-in', label: 'Spin in', group: 'Entrance' },
  { id: 'pop-out', label: 'Pop out', group: 'Exit' },
  { id: 'slide-out-right', label: 'Slide out', group: 'Exit' },
  { id: 'drop-out', label: 'Drop out', group: 'Exit' },
]);

const MOTION_PROPERTIES = ['positionX', 'positionY', 'scale', 'rotation', 'opacity'];

function key(time, value, easing = 'ease') {
  return { time: roundTime(time), value: Math.round(value * 1000) / 1000, easing };
}

export function motionPresetKeyframes(clip, presetId) {
  const duration = Math.max(0.2, Number(clip?.duration) || 0);
  const at = (property) => baseValue(clip, property);
  const scale = at('scale');
  const x = at('positionX');
  const y = at('positionY');
  const opacity = at('opacity');
  const rotation = at('rotation');
  const short = Math.min(0.6, duration / 2);
  const end = duration;
  switch (presetId) {
    case 'ken-burns-in':
      return { scale: [key(0, scale), key(end, scale * 1.18)] };
    case 'ken-burns-out':
      return { scale: [key(0, scale * 1.18), key(end, scale)] };
    case 'pan-left':
      return { scale: [key(0, scale * 1.2, 'linear')], positionX: [key(0, x + 10, 'linear'), key(end, x - 10)] };
    case 'pan-right':
      return { scale: [key(0, scale * 1.2, 'linear')], positionX: [key(0, x - 10, 'linear'), key(end, x + 10)] };
    case 'float':
      return { positionY: [key(0, y + 4), key(end, y - 4)], scale: [key(0, scale * 1.04), key(end, scale * 1.08)] };
    case 'pop-in':
      return {
        scale: [key(0, scale * 0.55, 'ease-out'), key(short * 0.7, scale * 1.06), key(short, scale)],
        opacity: [key(0, 0, 'ease-out'), key(short * 0.5, opacity)],
      };
    case 'slide-in-left':
      return { positionX: [key(0, x - 200, 'ease-out'), key(short, x)], opacity: [key(0, 0, 'ease-out'), key(short * 0.6, opacity)] };
    case 'slide-in-right':
      return { positionX: [key(0, x + 200, 'ease-out'), key(short, x)], opacity: [key(0, 0, 'ease-out'), key(short * 0.6, opacity)] };
    case 'slide-in-up':
      return { positionY: [key(0, y + 40, 'ease-out'), key(short, y)], opacity: [key(0, 0, 'ease-out'), key(short * 0.8, opacity)] };
    case 'spin-in':
      return {
        rotation: [key(0, rotation - 180, 'ease-out'), key(short, rotation)],
        scale: [key(0, scale * 0.3, 'ease-out'), key(short, scale)],
        opacity: [key(0, 0, 'ease-out'), key(short * 0.5, opacity)],
      };
    case 'pop-out':
      return {
        scale: [key(end - short, scale, 'ease-in'), key(end - short * 0.6, scale * 1.06, 'ease-in'), key(end, scale * 0.5)],
        opacity: [key(end - short * 0.5, opacity, 'ease-in'), key(end, 0)],
      };
    case 'slide-out-right':
      return { positionX: [key(end - short, x, 'ease-in'), key(end, x + 200)], opacity: [key(end - short * 0.4, opacity, 'ease-in'), key(end, 0)] };
    case 'drop-out':
      return { positionY: [key(end - short, y, 'ease-in'), key(end, y + 60)], opacity: [key(end - short, opacity, 'ease-in'), key(end, 0)] };
    default:
      return {};
  }
}

export function applyMotionPreset(clip, presetId) {
  const generated = motionPresetKeyframes(clip, presetId);
  if (!Object.keys(generated).length) return clip;
  const preset = MOTION_PRESETS.find((item) => item.id === presetId);
  const keyframes = { ...(clip.keyframes || {}) };
  // Entrance and exit presets combine with each other; continuous presets replace motion.
  if (preset?.group === 'Continuous') {
    for (const property of MOTION_PROPERTIES) delete keyframes[property];
  }
  for (const [property, list] of Object.entries(generated)) {
    const kept = preset?.group === 'Continuous' ? [] : (keyframes[property] || []).filter((frame) => (
      preset?.group === 'Entrance' ? frame.time > list.at(-1).time + KEYFRAME_TOLERANCE : frame.time < list[0].time - KEYFRAME_TOLERANCE
    ));
    keyframes[property] = sortKeyframes([...kept, ...list]);
  }
  return { ...clip, keyframes };
}
