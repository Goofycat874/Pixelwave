import { describe, expect, it } from 'vitest';
import {
  applyGrade,
  applySaturation,
  curveFunction,
  gradeChannels,
  gradeColor,
  gradeKey,
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

// Pro controls, judged on a neutral gray so each control is isolated from the others.
const toLinear = (value) => (value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
const level = (effects, input) => applyGrade([input, input, input], gradeChannels({ ...defaultEffects(), ...effects }))[0];

describe('grade tables', () => {
  it('bakes each channel into 256 exact levels and reuses the same grade', () => {
    const effects = { ...defaultEffects(), exposure: 10 };
    const channels = gradeChannels(effects);
    expect(channels).toHaveLength(3);
    channels.forEach((table) => expect(table).toHaveLength(TABLE_SIZE));
    expect(gradeChannels({ ...effects })).toBe(channels);
    expect(gradeKey(channels)).toBe(gradeKey(channels));
    expect(gradeKey(gradeChannels({ ...effects, exposure: -10 }))).not.toBe(gradeKey(channels));
  });

  it('treats missing pro controls on older projects as neutral', () => {
    expect(gradeChannels({ exposure: 0, contrast: 100, temperature: 0, tint: 0 })).toBeNull();
    expect(gradeChannels({ primaryWheels: defaultPrimaryWheels() })).toBeNull();
  });
});

describe('exposure and contrast', () => {
  it('moves exposure in stops of linear light', () => {
    const gray = 0.4;
    expect(toLinear(level({ exposure: 25 }, gray))).toBeCloseTo(toLinear(gray) * 2, 2);
    expect(toLinear(level({ exposure: -25 }, gray))).toBeCloseTo(toLinear(gray) / 2, 2);
  });

  it('steepens contrast around mid-gray without clipping blacks or whites', () => {
    const contrasty = (value) => level({ contrast: 200 }, value);
    expect(contrasty(0)).toBe(0);
    expect(contrasty(1)).toBe(1);
    expect(contrasty(0.46)).toBeCloseTo(0.46, 2);
    expect(contrasty(0.6) - contrasty(0.4)).toBeGreaterThan(0.2 * 1.6);
    // Hard contrast would clip at 0.25 and 0.75; the soft toe and shoulder keep the separation.
    expect(contrasty(0.1)).toBeGreaterThan(0);
    expect(contrasty(0.9)).toBeLessThan(1);
    expect(contrasty(0.9)).toBeGreaterThan(contrasty(0.8));
  });

  it('flattens contrast by lifting the blacks and lowering the whites', () => {
    expect(level({ contrast: 70 }, 0)).toBeGreaterThan(0.1);
    expect(level({ contrast: 70 }, 1)).toBeLessThan(0.9);
  });
});

describe('tone controls', () => {
  it('lifts shadows without touching the highlights', () => {
    expect(level({ shadows: 100 }, 0.25)).toBeGreaterThan(0.25 + 0.1);
    expect(level({ shadows: 100 }, 0.9)).toBeCloseTo(0.9, 1);
    expect(level({ shadows: -100 }, 0.25)).toBeLessThan(0.25 - 0.1);
  });

  it('pulls highlights down without touching the shadows', () => {
    expect(level({ highlights: -100 }, 0.75)).toBeLessThan(0.75 - 0.1);
    expect(level({ highlights: -100 }, 0.2)).toBeCloseTo(0.2, 1);
    expect(level({ highlights: 100 }, 0.75)).toBeGreaterThan(0.75 + 0.1);
  });

  it('moves the black and white points', () => {
    expect(level({ blacks: 100 }, 0)).toBeGreaterThan(0.08);
    expect(level({ blacks: -100 }, 0.05)).toBe(0);
    expect(level({ whites: -100 }, 1)).toBeLessThan(0.92);
    expect(level({ whites: 100 }, 0.97)).toBeGreaterThan(0.97);
  });

  it('never inverts the picture, even with every tone control at an extreme', () => {
    for (const sign of [-1, 1]) {
      const channels = gradeChannels({
        ...defaultEffects(),
        shadows: 100 * sign,
        highlights: -100 * sign,
        whites: 100 * sign,
        blacks: -100 * sign,
      });
      channels.forEach((table) => table.forEach((value, index) => {
        if (index) expect(value).toBeGreaterThanOrEqual(table[index - 1]);
      }));
    }
  });
});

describe('curves', () => {
  const curved = (patch) => ({ curves: { ...defaultEffects().curves, ...patch } });

  it('bends the midtones with a master curve and leaves the ends alone', () => {
    const effects = curved({ master: [[0, 0], [0.5, 0.7], [1, 1]] });
    expect(level(effects, 0.5)).toBeCloseTo(0.7, 2);
    expect(level(effects, 0)).toBe(0);
    expect(level(effects, 1)).toBe(1);
  });

  it('applies a single-channel curve to that channel only', () => {
    const [r, g, b] = applyGrade([0.5, 0.5, 0.5], gradeChannels({ ...defaultEffects(), ...curved({ red: [[0, 0], [0.5, 0.7], [1, 1]] }) }));
    expect(r).toBeCloseTo(0.7, 2);
    expect(g).toBeCloseTo(0.5, 3);
    expect(b).toBeCloseTo(0.5, 3);
  });

  it('is neutral for identity curves and for unusable data', () => {
    expect(gradeChannels({ ...defaultEffects(), curves: { master: [[0, 0], [1, 1]], red: [[0.5, 0.5]], green: null } })).toBeNull();
  });

  it('runs smoothly through points without overshooting between them', () => {
    const fn = curveFunction([[0, 0], [0.25, 0.5], [0.75, 0.55], [1, 1]]);
    let previous = 0;
    for (let x = 0; x <= 1; x += 0.005) {
      const y = fn(x);
      expect(y).toBeGreaterThanOrEqual(previous - 1e-9);
      expect(y).toBeLessThanOrEqual(1);
      previous = y;
    }
    expect(fn(0.25)).toBeCloseTo(0.5, 6);
  });
});

describe('looks', () => {
  it('detects which look is applied and which have been tuned by hand', () => {
    for (const key of Object.keys(COLOR_PRESETS)) {
      expect(activeColorPreset(applyColorPreset(defaultEffects(), key))).toBe(key);
    }
    expect(activeColorPreset(defaultEffects())).toBe('original');
    expect(activeColorPreset({ ...applyColorPreset(defaultEffects(), 'film'), exposure: 30 })).toBe('');
  });

  it('gives every look except Original a real grade, and Original none', () => {
    expect(gradeChannels(applyColorPreset(defaultEffects(), 'original'))).toBeNull();
    const sky = [0.36, 0.55, 0.82];
    for (const key of Object.keys(COLOR_PRESETS).filter((name) => name !== 'original')) {
      const graded = gradeColor(sky, applyColorPreset(defaultEffects(), key));
      const change = graded.reduce((sum, value, index) => sum + Math.abs(value - sky[index]), 0);
      expect(change, key).toBeGreaterThan(0.02);
    }
  });

  it('splits teal into the shadows and orange into the highlights', () => {
    const effects = applyColorPreset(defaultEffects(), 'cinema');
    const [shadowRed, , shadowBlue] = gradeColor([0.15, 0.15, 0.15], effects);
    expect(shadowBlue).toBeGreaterThan(shadowRed);
    const [highlightRed, , highlightBlue] = gradeColor([0.8, 0.8, 0.8], effects);
    expect(highlightRed).toBeGreaterThan(highlightBlue);
  });

  it('places a wheel puck by hue', () => {
    const [r, g, b] = wheelVector(wheelPuck(0, 1));
    expect(r).toBeGreaterThan(0.6);
    expect(g).toBeLessThan(0);
    expect(b).toBeLessThan(0);
    expect(wheelVector(wheelPuck(240, 1))[2]).toBeGreaterThan(0.6);
  });

  it('desaturates with Rec. 709 weights', () => {
    const [r, g, b] = applySaturation([0.8, 0.3, 0.2], 0);
    expect(r).toBeCloseTo(g, 6);
    expect(g).toBeCloseTo(b, 6);
  });
});
