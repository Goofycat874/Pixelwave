import { describe, expect, it } from 'vitest';
import {
  animatedEffects,
  applyEasing,
  applyEffectChanges,
  applyMotionPreset,
  clearKeyframes,
  clipVolumeAt,
  fadeEnvelope,
  keyframeTimes,
  MOTION_PRESETS,
  propertyValueAt,
  removeKeyframe,
  setKeyframe,
  splitKeyframes,
  toggleKeyframe,
  valueAt,
} from './animation.js';

const clip = {
  id: 'clip-a',
  start: 10,
  duration: 4,
  effects: { scale: 100, positionX: 0, positionY: 0, opacity: 100, rotation: 0, volume: 100 },
  keyframes: {},
};

describe('keyframe interpolation', () => {
  it('holds the first and last values outside the keyed range', () => {
    const frames = [{ time: 1, value: 10, easing: 'linear' }, { time: 3, value: 30 }];
    expect(valueAt(frames, 0)).toBe(10);
    expect(valueAt(frames, 2)).toBe(20);
    expect(valueAt(frames, 9)).toBe(30);
    expect(valueAt([], 2, 7)).toBe(7);
  });

  it('applies the easing of the segment that leaves each keyframe', () => {
    expect(applyEasing('linear', 0.25)).toBe(0.25);
    expect(applyEasing('ease-in', 0.5)).toBeCloseTo(0.125);
    expect(applyEasing('ease-out', 0.5)).toBeCloseTo(0.875);
    expect(applyEasing('hold', 0.9)).toBe(0);
    expect(valueAt([{ time: 0, value: 0, easing: 'hold' }, { time: 1, value: 100 }], 0.99)).toBe(0);
  });
});

describe('editing keyframes', () => {
  it('adds, updates and removes keyframes without mutating the clip', () => {
    const keyed = setKeyframe(clip, 'scale', 0, 100);
    const twice = setKeyframe(keyed, 'scale', 2, 140);
    const updated = setKeyframe(twice, 'scale', 2.004, 150);
    expect(clip.keyframes).toEqual({});
    expect(updated.keyframes.scale.map((frame) => [frame.time, frame.value])).toEqual([[0, 100], [2, 150]]);
    const removed = removeKeyframe(updated, 'scale', 2);
    expect(removed.keyframes.scale).toHaveLength(1);
    const cleared = removeKeyframe(removed, 'scale', 0);
    expect(cleared.keyframes.scale).toBeUndefined();
    expect(cleared.effects.scale).toBe(100);
  });

  it('toggles a keyframe at the current value', () => {
    const keyed = toggleKeyframe(setKeyframe(clip, 'opacity', 0, 0), 'opacity', 2);
    expect(keyed.keyframes.opacity).toEqual([
      { time: 0, value: 0, easing: 'ease' },
      { time: 2, value: 0, easing: 'ease' },
    ]);
    expect(toggleKeyframe(keyed, 'opacity', 2).keyframes.opacity).toHaveLength(1);
  });

  it('routes edits on animated properties into keyframes and the rest into effects', () => {
    const animated = setKeyframe(clip, 'scale', 0, 100);
    const edited = applyEffectChanges(animated, { scale: 180, positionX: 25 }, 3);
    expect(edited.keyframes.scale.at(-1)).toMatchObject({ time: 3, value: 180 });
    expect(edited.effects.positionX).toBe(25);
    expect(edited.effects.scale).toBe(100);
  });

  it('resolves animated effects at a clip-local time', () => {
    const animated = setKeyframe(setKeyframe(clip, 'positionX', 0, -50), 'positionX', 4, 50);
    expect(animatedEffects({ ...animated, keyframes: { positionX: animated.keyframes.positionX.map((frame) => ({ ...frame, easing: 'linear' })) } }, 2).positionX).toBe(0);
    expect(propertyValueAt(animated, 'scale', 2)).toBe(100);
    expect(keyframeTimes(animated)).toEqual([0, 4]);
  });

  it('clears keyframes back to a resting value', () => {
    const animated = setKeyframe(setKeyframe(clip, 'rotation', 0, 45), 'rotation', 4, 90);
    expect(clearKeyframes(animated).effects.rotation).toBe(45);
  });
});

describe('fades and volume', () => {
  it('ramps opacity and volume through fade handles', () => {
    const faded = { ...clip, fadeIn: 1, fadeOut: 2 };
    expect(fadeEnvelope(faded, 0)).toBe(0);
    expect(fadeEnvelope(faded, 0.5)).toBe(0.5);
    expect(fadeEnvelope(faded, 1.5)).toBe(1);
    expect(fadeEnvelope(faded, 3)).toBe(0.5);
    expect(fadeEnvelope(faded, 4)).toBe(0);
    expect(clipVolumeAt({ ...faded, effects: { volume: 50 } }, 0.5)).toBe(0.25);
  });
});

describe('splitting animated clips', () => {
  it('keeps motion continuous across both halves', () => {
    const animated = {
      ...clip,
      keyframes: { scale: [{ time: 0, value: 100, easing: 'linear' }, { time: 4, value: 200, easing: 'linear' }] },
    };
    const [first, second] = splitKeyframes(animated, 1);
    expect(first.scale).toEqual([{ time: 0, value: 100, easing: 'linear' }, { time: 1, value: 125, easing: 'linear' }]);
    expect(second.scale).toEqual([{ time: 0, value: 125, easing: 'linear' }, { time: 3, value: 200, easing: 'linear' }]);
  });
});

describe('motion presets', () => {
  it('builds every preset relative to the clip resting state', () => {
    const placed = { ...clip, effects: { ...clip.effects, scale: 50, positionX: 40 } };
    for (const preset of MOTION_PRESETS) {
      const animated = applyMotionPreset(placed, preset.id);
      expect(Object.keys(animated.keyframes).length, preset.id).toBeGreaterThan(0);
    }
    const zoom = applyMotionPreset(placed, 'ken-burns-in');
    expect(zoom.keyframes.scale.map((frame) => frame.value)).toEqual([50, 59]);
    const slide = applyMotionPreset(placed, 'slide-in-left');
    expect(slide.keyframes.positionX.at(-1).value).toBe(40);
  });

  it('combines an entrance with an exit but lets continuous moves replace motion', () => {
    const both = applyMotionPreset(applyMotionPreset(clip, 'pop-in'), 'pop-out');
    expect(both.keyframes.opacity[0].value).toBe(0);
    expect(both.keyframes.opacity.at(-1).value).toBe(0);
    expect(both.keyframes.opacity.length).toBe(4);
    const replaced = applyMotionPreset(both, 'pan-left');
    expect(replaced.keyframes.opacity).toBeUndefined();
  });
});
