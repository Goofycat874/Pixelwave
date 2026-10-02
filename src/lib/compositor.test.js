import { describe, expect, it } from 'vitest';
import {
  chromaKeyMatrix,
  drawFrame,
  ensureGradeFilter,
  framePlan,
  hitTest,
  mediaFilter,
  mediaGeometry,
  pointInPolygon,
  registeredFilter,
  resetFilterRegistry,
  sourceTimeAt,
  transitionProgress,
} from './compositor.js';
import { createProject } from './project.js';

function applyMatrix(values, [r, g, b]) {
  const row = (index) => values.slice(index * 5, index * 5 + 5);
  const channel = (index) => {
    const [cr, cg, cb, ca, offset] = row(index);
    return Math.min(1, Math.max(0, cr * r + cg * g + cb * b + ca + offset));
  };
  return [channel(0), channel(1), channel(2), channel(3)];
}

function recordingContext(width = 640, height = 360) {
  const calls = [];
  const context = {
    canvas: { width, height },
    calls,
    font: '',
    filter: 'none',
    globalAlpha: 1,
    letterSpacing: '0px',
    measureText: (value) => ({ width: String(value).length * 10 }),
  };
  for (const name of ['save', 'restore', 'setTransform', 'fillRect', 'translate', 'rotate', 'scale', 'beginPath', 'rect', 'roundRect', 'clip', 'fill', 'drawImage', 'fillText', 'strokeText']) {
    context[name] = (...args) => calls.push([name, ...args]);
  }
  context.createRadialGradient = () => ({ addColorStop() {} });
  return context;
}

const media = { id: 'm', kind: 'video', width: 1920, height: 1080 };
const baseClip = {
  id: 'a',
  assetId: 'm',
  kind: 'video',
  track: 0,
  start: 0,
  duration: 4,
  sourceStart: 2,
  speed: 2,
  effects: { scale: 100, opacity: 100 },
  transition: { type: 'cut', duration: 0.6 },
  textOverlays: [],
};

describe('chroma key matrix', () => {
  it('removes saturated green and keeps neutral and skin tones', () => {
    const matrix = chromaKeyMatrix({ keyMode: 'green', keyStrength: 40, keySoftness: 30 });
    expect(applyMatrix(matrix, [0.1, 0.9, 0.1])[3]).toBe(0);
    expect(applyMatrix(matrix, [0.5, 0.5, 0.5])[3]).toBe(1);
    expect(applyMatrix(matrix, [0.92, 0.66, 0.55])[3]).toBe(1);
  });

  it('keys blue screens on the blue channel', () => {
    const matrix = chromaKeyMatrix({ keyMode: 'blue' });
    expect(applyMatrix(matrix, [0.1, 0.2, 0.95])[3]).toBe(0);
    expect(applyMatrix(matrix, [0.1, 0.9, 0.1])[3]).toBe(1);
  });
});

describe('media filters and geometry', () => {
  it('puts SVG filters first, then saturation, then blur', () => {
    expect(mediaFilter({ exposure: 12, contrast: 93, saturation: 121, hue: 20, invert: 10 }, { blurPixels: 2, keyFilter: 'url(#k)', gradeFilter: 'url(#g)' }))
      .toBe('url(#k) url(#g) saturate(121%) hue-rotate(20deg) invert(10%) blur(2px)');
  });

  it('leaves exposure and contrast to the grade tables and filters nothing when neutral', () => {
    expect(mediaFilter({ exposure: 12, contrast: 93 })).toBe('none');
    expect(mediaFilter({})).toBe('none');
  });

  it('no longer fakes white balance with sepia or a large hue rotation', () => {
    const filter = mediaFilter({ temperature: -100, tint: 100 });
    expect(filter).not.toMatch(/sepia|hue-rotate/);
  });

  it('crops inside the fitted frame without moving the picture', () => {
    const geometry = mediaGeometry({
      sourceWidth: 1920,
      sourceHeight: 1080,
      clip: { fit: 'contain' },
      effects: { cropLeft: 25, cropTop: 10, scale: 50, positionX: 50 },
      width: 1280,
      height: 720,
    });
    expect(geometry.rect).toMatchObject({ x: -320, y: -288, width: 960, height: 648 });
    expect(geometry).toMatchObject({ centerX: 960, centerY: 360, scale: 0.5 });
  });

  it('maps timeline time into source time through speed', () => {
    expect(sourceTimeAt(baseClip, 1)).toBe(4);
  });
});

describe('frame planning', () => {
  it('pairs an entering transition with the clip it replaces', () => {
    const before = { ...baseClip, id: 'before', start: 0, duration: 3 };
    const after = { ...baseClip, id: 'after', start: 3, duration: 3, transition: { type: 'dissolve', duration: 1 } };
    const project = createProject({ clips: [before, after] });
    const plan = framePlan(project, 3.5);
    expect(plan.layers).toHaveLength(1);
    expect(plan.layers[0].previous.clip.id).toBe('before');
    expect(plan.layers[0].previous.time).toBe(2.5);
    expect(transitionProgress(after, 3.5)).toBe(0.5);
  });

  it('skips hidden tracks but keeps their audio', () => {
    const project = createProject({ clips: [baseClip], tracks: { 'video-0': { hidden: true } } });
    const plan = framePlan(project, 1);
    expect(plan.layers).toHaveLength(0);
    expect(plan.audible.map((clip) => clip.id)).toEqual(['a']);
  });
});

describe('drawing frames', () => {
  it('draws media scaled from project pixels to the canvas and reports hit areas', () => {
    const project = createProject({ width: 1280, height: 720, clips: [baseClip], media: [media] });
    const context = recordingContext(640, 360);
    const source = { videoWidth: 1920, videoHeight: 1080 };
    const hits = drawFrame(context, { project, time: 1, getSource: () => source, doc: null });
    expect(context.calls.find((call) => call[0] === 'setTransform')).toEqual(['setTransform', 0.5, 0, 0, 0.5, 0, 0]);
    expect(context.calls.filter((call) => call[0] === 'drawImage')).toHaveLength(1);
    expect(hitTest(hits, [640, 360])).toEqual({ type: 'media', clipId: 'a' });
    expect(hitTest(hits, [-10, -10])).toBeNull();
  });

  it('draws text clips and leaves the text being edited to the DOM editor', () => {
    const textClip = {
      ...baseClip,
      id: 't',
      kind: 'text',
      assetId: null,
      track: 1,
      textOverlays: [{ id: 'x', text: 'Hello there', positionX: 50, positionY: 50 }],
    };
    const project = createProject({ width: 1280, height: 720, clips: [textClip] });
    const drawn = recordingContext();
    const hits = drawFrame(drawn, { project, time: 1, doc: null });
    expect(drawn.calls.some((call) => call[0] === 'fillText' && call[1] === 'Hello there')).toBe(true);
    expect(hitTest(hits, [640, 360])).toEqual({ type: 'text', clipId: 't', textId: 'x' });

    const skipped = recordingContext();
    drawFrame(skipped, { project, time: 1, doc: null, skipText: { clipId: 't', textId: 'x' } });
    expect(skipped.calls.some((call) => call[0] === 'fillText')).toBe(false);
  });

  it('tests points against rotated polygons', () => {
    const diamond = [[0, -10], [10, 0], [0, 10], [-10, 0]];
    expect(pointInPolygon([0, 0], diamond)).toBe(true);
    expect(pointInPolygon([9, 9], diamond)).toBe(false);
  });
});

function fakeDocument() {
  const byId = new Map();
  const make = (name) => {
    const element = {
      name,
      attributes: {},
      children: [],
      style: {},
      setAttribute(key, value) { this.attributes[key] = value; if (key === 'id') byId.set(value, this); },
      appendChild(child) { this.children.push(child); child.parent = this; return child; },
      append(...children) { children.forEach((child) => this.appendChild(child)); },
      remove() { if (this.attributes.id) byId.delete(this.attributes.id); this.parent?.children.splice(this.parent.children.indexOf(this), 1); },
    };
    return element;
  };
  const body = make('body');
  return { body, createElementNS: (_ns, name) => make(name), getElementById: (id) => byId.get(id) || null };
}

describe('grade filter registry', () => {
  it('adds nothing for a neutral grade', () => {
    resetFilterRegistry();
    expect(ensureGradeFilter({ temperature: 0, tint: 0 }, fakeDocument())).toBeNull();
  });

  it('builds one lookup table per channel and reuses identical grades', () => {
    resetFilterRegistry();
    const doc = fakeDocument();
    const first = ensureGradeFilter({ temperature: 60 }, doc);
    expect(first).toMatch(/^url\(#pw-fx-\d+\)$/);
    expect(ensureGradeFilter({ temperature: 60 }, doc)).toBe(first);
    expect(ensureGradeFilter({ temperature: -60 }, doc)).not.toBe(first);
    const svg = doc.body.children[0];
    const filter = svg.children[0];
    expect(filter.attributes['color-interpolation-filters']).toBe('sRGB');
    expect(filter.children.map((stage) => stage.name)).toEqual(['feComponentTransfer']);
    const tables = filter.children[0].children;
    expect(tables.map((fn) => fn.name)).toEqual(['feFuncR', 'feFuncG', 'feFuncB']);
    expect(tables.map((fn) => fn.attributes.type)).toEqual(['table', 'table', 'table']);
    tables.forEach((fn) => expect(fn.attributes.tableValues.split(' ')).toHaveLength(256));
  });

  it('keeps only the most recently used filters while a slider is dragged', () => {
    resetFilterRegistry();
    const doc = fakeDocument();
    for (let value = 1; value <= 120; value += 1) ensureGradeFilter({ temperature: value * 0.8 }, doc);
    expect(doc.body.children[0].children.length).toBeLessThanOrEqual(48);
    expect(registeredFilter('custom', () => {}, null)).toBeNull();
  });
});
