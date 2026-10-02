import { describe, expect, it } from 'vitest';
import { ensureStylizeFilter, mediaFilter, resetFilterRegistry } from './compositor.js';
import {
  activeStylizePreset,
  applyStylizePreset,
  buildStylizeFilter,
  hasStylizeFilter,
  pixelateCells,
  STYLIZE_DEFAULTS,
  STYLIZE_PRESETS,
  stylizeAmounts,
  stylizeKey,
  stylizeSeeds,
} from './effects.js';
import { defaultEffects } from './editor.js';

function element(name) {
  return {
    name,
    attributes: {},
    children: [],
    setAttribute(key, value) { this.attributes[key] = value; },
    appendChild(child) { this.children.push(child); return child; },
  };
}

function build(effects, options) {
  const filter = element('filter');
  buildStylizeFilter(filter, element, stylizeAmounts(effects), options);
  return filter.children;
}

const names = (primitives) => primitives.map((primitive) => primitive.name);

describe('stylize amounts', () => {
  it('clamps and rounds every amount and treats missing ones as off', () => {
    expect(stylizeAmounts({ sharpen: 140, glow: -5, grain: 12.6, glitch: 'x' })).toEqual({
      sharpen: 100, glow: 0, grain: 13, aberration: 0, glitch: 0, pixelate: 0,
    });
    expect(hasStylizeFilter(stylizeAmounts(defaultEffects()))).toBe(false);
    expect(hasStylizeFilter(stylizeAmounts({ pixelate: 80 }))).toBe(false);
    expect(hasStylizeFilter(stylizeAmounts({ aberration: 1 }))).toBe(true);
  });

  it('ships every stylize control switched off on a new clip', () => {
    expect(defaultEffects()).toMatchObject(STYLIZE_DEFAULTS);
  });
});

describe('stylize filter', () => {
  it('builds nothing for pixelate alone, which the canvas handles', () => {
    expect(build({ pixelate: 70 })).toEqual([]);
  });

  it('only includes the stages that are switched on', () => {
    expect(names(build({ sharpen: 50 }))).toEqual(['feGaussianBlur', 'feComposite', 'feComposite']);
    expect(names(build({ aberration: 40 }))).toContain('feConvolveMatrix');
    expect(names(build({ aberration: 40 }))).not.toContain('feTurbulence');
    expect(names(build({ grain: 40 }))).toEqual(['feTurbulence', 'feColorMatrix', 'feComposite', 'feComposite']);
    expect(names(build({ glitch: 40 }))).toEqual(['feTurbulence', 'feColorMatrix', 'feComponentTransfer', 'feDisplacementMap']);
  });

  it('chains every stage into the next and keeps the picture alpha', () => {
    const primitives = build({ glitch: 30, aberration: 30, sharpen: 30, glow: 30, grain: 30 });
    const results = new Set(['SourceGraphic']);
    for (const primitive of primitives) {
      const { in: input, in2: second, result } = primitive.attributes;
      if (input) expect(results.has(input), `${primitive.name} reads ${input}`).toBe(true);
      if (second) expect(results.has(second), `${primitive.name} reads ${second}`).toBe(true);
      if (result) results.add(result);
    }
    // Sharpen and grain mix arithmetically, so each is followed by a composite "in" that restores alpha.
    expect(primitives.filter((primitive) => primitive.attributes.operator === 'in')).toHaveLength(2);
  });

  it('scales lengths with the canvas resolution so preview and export match', () => {
    const shift = (unit) => Number(build({ aberration: 100 }, { unit }).find((primitive) => primitive.name === 'feConvolveMatrix').attributes.targetX);
    expect(shift(2)).toBe(shift(1) * 2);
    const blur = (unit) => Number(build({ glow: 50 }, { unit }).find((primitive) => primitive.name === 'feGaussianBlur').attributes.stdDeviation);
    expect(blur(2)).toBeCloseTo(blur(1) * 2, 2);
    const frequency = (unit) => Number(build({ grain: 50 }, { unit }).find((primitive) => primitive.name === 'feTurbulence').attributes.baseFrequency);
    expect(frequency(1)).toBeGreaterThan(frequency(2));
  });

  it('seeds grain and glitch from the time so a given frame always looks the same', () => {
    expect(stylizeSeeds(1.0)).toEqual(stylizeSeeds(1.0));
    expect(stylizeSeeds(0).grain).not.toBe(stylizeSeeds(0.1).grain);
    expect(stylizeSeeds(0.05).glitch).toBe(stylizeSeeds(0).glitch);
    const amounts = stylizeAmounts({ grain: 40 });
    expect(stylizeKey(amounts, 1, stylizeSeeds(0))).not.toBe(stylizeKey(amounts, 1, stylizeSeeds(0.1)));
    // A filter without grain does not care which grain seed is current.
    const sharp = stylizeAmounts({ sharpen: 40 });
    expect(stylizeKey(sharp, 1, stylizeSeeds(0))).toBe(stylizeKey(sharp, 1, stylizeSeeds(0.1)));
  });
});

describe('stylize in the compositor', () => {
  function fakeDocument() {
    const byId = new Map();
    const make = (name) => ({
      name,
      attributes: {},
      children: [],
      style: {},
      setAttribute(key, value) { this.attributes[key] = value; if (key === 'id') byId.set(value, this); },
      appendChild(child) { this.children.push(child); return child; },
      append(...children) { children.forEach((child) => this.appendChild(child)); },
      remove() { byId.delete(this.attributes.id); },
    });
    return { body: make('body'), createElementNS: (_ns, name) => make(name), getElementById: (id) => byId.get(id) || null };
  }

  it('adds no filter when every SVG stylize effect is off, and reuses identical ones', () => {
    resetFilterRegistry();
    const doc = fakeDocument();
    expect(ensureStylizeFilter({ pixelate: 60 }, { unit: 1 }, doc)).toBeNull();
    const first = ensureStylizeFilter({ sharpen: 40 }, { unit: 1 }, doc);
    expect(first).toMatch(/^url\(#pw-fx-\d+\)$/);
    expect(ensureStylizeFilter({ sharpen: 40 }, { unit: 1, time: 3 }, doc)).toBe(first);
    expect(ensureStylizeFilter({ sharpen: 41 }, { unit: 1 }, doc)).not.toBe(first);
  });

  it('puts the stylize filter after the key and the grade and before the CSS functions', () => {
    expect(mediaFilter({ saturation: 120 }, { keyFilter: 'url(#k)', gradeFilter: 'url(#g)', stylizeFilter: 'url(#s)', blurPixels: 3 }))
      .toBe('url(#k) url(#g) url(#s) saturate(120%) blur(3px)');
  });
});

describe('pixelate', () => {
  it('is off at zero and makes coarser blocks as the amount rises', () => {
    expect(pixelateCells(0, 1920, 1080)).toBeNull();
    const fine = pixelateCells(10, 1920, 1080);
    const coarse = pixelateCells(90, 1920, 1080);
    expect(coarse.columns).toBeLessThan(fine.columns);
    expect(coarse.rows).toBeLessThan(fine.rows);
  });

  it('keeps square blocks on any frame shape and never collapses to nothing', () => {
    const wide = pixelateCells(50, 1600, 900);
    expect(wide.columns / wide.rows).toBeCloseTo(1600 / 900, 0);
    const tall = pixelateCells(50, 900, 1600);
    expect(tall.rows).toBeGreaterThan(tall.columns);
    expect(pixelateCells(100, 20, 20, 3).columns).toBeGreaterThanOrEqual(4);
  });

  it('draws blocks from a small copy of the picture when there is a canvas to make it on', async () => {
    const { drawFrame } = await import('./compositor.js');
    const { createProject } = await import('./project.js');
    const calls = [];
    const context = new Proxy({ canvas: { width: 640, height: 360 }, filter: 'none' }, {
      get: (target, key) => (key in target ? target[key] : (...args) => { calls.push([key, ...args]); return { addColorStop() {} }; }),
      set: (target, key, value) => { target[key] = value; return true; },
    });
    const scratch = { width: 0, height: 0, ownerDocument: null, getContext: () => new Proxy({}, { get: () => () => {}, set: () => true }) };
    const doc = { createElement: () => scratch, createElementNS: () => null };
    scratch.ownerDocument = doc;
    const clip = {
      id: 'a', assetId: 'm', kind: 'video', track: 0, start: 0, duration: 4, sourceStart: 0, speed: 1,
      effects: { scale: 100, opacity: 100, pixelate: 60 }, transition: { type: 'cut', duration: 0.6 }, textOverlays: [],
    };
    const project = createProject({ width: 1280, height: 720, clips: [clip], media: [{ id: 'm', kind: 'video', width: 1920, height: 1080 }] });
    drawFrame(context, { project, time: 1, getSource: () => ({ videoWidth: 1920, videoHeight: 1080 }), doc });
    const drawn = calls.find((call) => call[0] === 'drawImage');
    expect(drawn[1]).toBe(scratch);
    expect(scratch.width).toBeLessThan(200);
    expect(scratch.width).toBeGreaterThan(4);
  });
});

describe('stylize looks', () => {
  it('applies a look over all six controls and detects it again', () => {
    for (const key of Object.keys(STYLIZE_PRESETS)) {
      expect(activeStylizePreset(applyStylizePreset({ blur: 4 }, key))).toBe(key);
    }
    const vhs = applyStylizePreset({ blur: 4, sharpen: 90 }, 'vhs');
    expect(vhs).toMatchObject({ blur: 4, sharpen: 0, aberration: 42, grain: 30 });
    expect(activeStylizePreset({ ...vhs, grain: 31 })).toBe('');
    expect(activeStylizePreset({})).toBe('none');
  });
});
