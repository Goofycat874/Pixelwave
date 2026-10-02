import {
  ANIMATABLE_PROPERTIES,
  applyEffectChanges,
  clipLocalTime,
  hasKeyframes,
  keyframeIndexAt,
  propertyValueAt,
  sortKeyframes,
  toggleKeyframe,
} from '../../lib/animation.js';
import { defaultEffects } from '../../lib/editor.js';

const effectDefaults = defaultEffects();

// Everything an inspector tab needs to read and write one clip at the playhead.
export function clipEditing(clip, playhead, { onBeginEdit, onLiveClip, onCommitClip, onSeek }) {
  const local = clipLocalTime(clip, playhead);
  const playheadInside = playhead >= clip.start - 0.0005 && playhead <= clip.start + clip.duration + 0.0005;

  const value = (property) => (
    ANIMATABLE_PROPERTIES[property] ? propertyValueAt(clip, property, local) : clip.effects?.[property] ?? effectDefaults[property]
  );

  const begin = (label) => () => onBeginEdit(label);

  const setEffect = (property, next) => onLiveClip(clip.id, (current) => applyEffectChanges(current, { [property]: next }, clipLocalTime(current, playhead)));

  const keyframeState = (property) => {
    if (!hasKeyframes(clip, property)) return 'none';
    return keyframeIndexAt(clip.keyframes[property], local) >= 0 ? 'on' : 'off';
  };

  const keyframeControls = (property) => (playheadInside ? {
    state: keyframeState(property),
    onToggle: () => onCommitClip(clip.id, (current) => toggleKeyframe(current, property, clipLocalTime(current, playhead)), 'Keyframe'),
    onPrevious: () => {
      const previous = [...sortKeyframes(clip.keyframes?.[property])].reverse().find((frame) => frame.time < local - 0.004);
      if (previous) onSeek(clip.start + previous.time);
    },
    onNext: () => {
      const next = sortKeyframes(clip.keyframes?.[property]).find((frame) => frame.time > local + 0.004);
      if (next) onSeek(clip.start + next.time);
    },
  } : null);

  const effectRow = (property, label, min, max, step = 1, unit = '', animatable = true) => ({
    label,
    min,
    max,
    step,
    unit,
    value: value(property),
    defaultValue: ANIMATABLE_PROPERTIES[property]?.fallback ?? effectDefaults[property],
    onBegin: begin(`Change ${label.toLowerCase()}`),
    onChange: (next) => setEffect(property, next),
    keyframe: animatable && ANIMATABLE_PROPERTIES[property] ? keyframeControls(property) : null,
  });

  const patch = (changes, label) => onCommitClip(clip.id, (current) => ({ ...current, ...changes }), label);
  const patchEffects = (changes, label) => onCommitClip(clip.id, (current) => ({ ...current, effects: { ...current.effects, ...changes } }), label);
  const liveEffects = (changes) => onLiveClip(clip.id, (current) => ({ ...current, effects: { ...current.effects, ...changes } }));
  const liveClip = (changes) => onLiveClip(clip.id, (current) => ({ ...current, ...changes }));

  return { local, playheadInside, value, begin, effectRow, patch, patchEffects, liveEffects, liveClip, keyframeState };
}
