import { describe, expect, it } from 'vitest';
import {
  applyGrade,
  applySaturation,
  curveFunction,
  gradeChannels,
  gradeColor,
  gradeKey,
  hueToRgb,
  TABLE_SIZE,
  wheelPuck,
  wheelVector,
} from './color.js';
import {
  activeColorPreset,
  applyColorPreset,
  COLOR_PRESETS,
  defaultEffects,
  defaultPrimaryWheels,
} from './editor.js';

// A saturated purple like the one in the bug report.
const purple = [107, 75, 160].map((value) => value / 255);
const to255 = (rgb) => rgb.map((value) => Math.round(value * 255));
const graded = (effects) => to255(applyGrade(purple, gradeChannels({ ...defaultEffects(), ...effects })));
const withWheel = (name, wheel) => ({ primaryWheels: { ...defaultPrimaryWheels(), [name]: { x: 0, y: 0, luma: 0, ...wheel } } });

describe('color grade', () => {
  it('leaves a neutral grade untouched', () => {
    expect(gradeChannels(defaultEffects())).toBeNull();
    expect(applyGrade(purple, null)).toEqual(purple);
  });

  it('maps hues around the wheel: red right, cyan left, blue-violet up, yellow-green down', () => {
    expect(hueToRgb(0)).toEqual([1, 0, 0]);
    expect(hueToRgb(180)).toEqual([0, 1, 1]);
    const right = wheelVector({ x: 1, y: 0 });
    const left = wheelVector({ x: -1, y: 0 });
    expect(right[0]).toBeGreaterThan(0.6);
    expect(left[0]).toBeLessThan(-0.6);
    expect(left[1]).toBeGreaterThan(0.3);
    const up = wheelVector({ x: 0, y: 1 });
    expect(up[2]).toBeGreaterThan(up[1]);
    const down = wheelVector({ x: 0, y: -1 });
    expect(down[1]).toBeGreaterThan(down[2]);
    expect(wheelVector({ x: 0, y: 0 })).toEqual([0, 0, 0]);
  });

  it('warms and cools by moving red against blue without hue-rotating the picture', () => {
    const [red, green, blue] = purple.map((value) => Math.round(value * 255));
    const warm = graded({ temperature: 100 });
    const cool = graded({ temperature: -100 });
    expect(warm[0]).toBeGreaterThan(red + 15);
    expect(warm[2]).toBeLessThan(blue - 25);
    expect(cool[2]).toBeGreaterThanOrEqual(blue);
    expect(cool[0]).toBeLessThan(red - 15);
    // The reported bug: cool white balance turned purple into green (71, 105, 43).
    expect(cool[1]).toBeLessThan(cool[2]);
    expect(Math.abs(cool[1] - green)).toBeLessThan(10);
    expect(Math.abs(warm[1] - green)).toBeLessThan(10);
  });

  it('pushes tint toward magenta when positive and green when negative', () => {
    const base = purple[1] * 255;
    expect(graded({ tint: 100 })[1]).toBeLessThan(base - 10);
    expect(graded({ tint: -100 })[1]).toBeGreaterThan(base + 15);
  });

  it('makes a wheel drag visibly shift the picture toward the color under the puck', () => {
    const red = graded(withWheel('gain', { x: 1, y: 0 }));
    expect(red[0]).toBeGreaterThan(Math.round(purple[0] * 255) + 15);
    const cyan = graded(withWheel('gain', { x: -1, y: 0 }));
    expect(cyan[0]).toBeLessThan(Math.round(purple[0] * 255) - 8);
    expect(cyan[1]).toBeGreaterThanOrEqual(Math.round(purple[1] * 255));
    // Dragging either way is a real change, not a no-op.
    for (const name of ['lift', 'gamma', 'gain']) {
      for (const x of [1, -1]) {
        const result = graded(withWheel(name, { x, y: 0 }));
        const delta = result.reduce((sum, value, index) => sum + Math.abs(value - Math.round(purple[index] * 255)), 0);
        expect(delta, `${name} ${x}`).toBeGreaterThan(8);
      }
    }
  });

  it('anchors lift at white and brightens or darkens mids with gamma luma', () => {
    const lifted = applyGrade([1, 1, 1], gradeChannels({ ...defaultEffects(), ...withWheel('lift', { luma: 1 }) }));
    expect(lifted.every((value) => Math.abs(value - 1) < 0.001)).toBe(true);
    const shadows = applyGrade([0, 0, 0], gradeChannels({ ...defaultEffects(), ...withWheel('lift', { luma: 1 }) }));
    expect(shadows[0]).toBeGreaterThan(0.08);
    const brighter = applyGrade([0.5, 0.5, 0.5], gradeChannels({ ...defaultEffects(), ...withWheel('gamma', { luma: 1 }) }));
    const darker = applyGrade([0.5, 0.5, 0.5], gradeChannels({ ...defaultEffects(), ...withWheel('gamma', { luma: -1 }) }));
    expect(brighter[0]).toBeGreaterThan(0.5);
    expect(darker[0]).toBeLessThan(0.5);
  });
});
