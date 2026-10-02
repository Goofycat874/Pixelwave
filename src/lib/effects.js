// Stylize effects: sharpen, glow, film grain, chromatic aberration, glitch and pixelate.
// Sharpen, glow, grain, aberration and glitch share one SVG filter that the compositor places in
// the canvas filter chain, so the monitor and the exporter render them identically. Pixelate
// needs to resample the picture, so the compositor does it on the canvas before the filter runs.
//
// Every length is in canvas pixels. `unit` is how many canvas pixels one pixel of a 720p frame
// covers (project scale times preview or export scale), which keeps an effect looking the same
// at any resolution.

export const STYLIZE_DEFAULTS = Object.freeze({
  sharpen: 0,
  glow: 0,
  grain: 0,
  aberration: 0,
  glitch: 0,
  pixelate: 0,
});

export const STYLIZE_KEYS = Object.freeze(Object.keys(STYLIZE_DEFAULTS));

// Grain flickers at film rate and glitch jumps a few times a second, both from the timeline time,
// so a still frame is the same on every render and the export matches the monitor.
const GRAIN_FPS = 24;
const GLITCH_FPS = 8;
const MAX_FRINGE_SHIFT = 48;
const MAX_GRAIN_FREQUENCY = 0.65;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function round(value) {
  return Math.round(value * 1000) / 1000;
}

export function stylizeAmounts(effects = {}) {
  const amounts = {};
  for (const key of STYLIZE_KEYS) amounts[key] = clamp(Math.round(Number(effects[key]) || 0), 0, 100);
  return amounts;
}

export function hasStylizeFilter(amounts) {
  return Boolean(amounts.sharpen || amounts.glow || amounts.grain || amounts.aberration || amounts.glitch);
}

export function stylizeSeeds(time = 0) {
  const seconds = Math.max(0, Number(time) || 0);
  return { grain: Math.floor(seconds * GRAIN_FPS) % 16, glitch: Math.floor(seconds * GLITCH_FPS) % 12 };
}

// The cache key for one built filter: only what the filter actually contains.
export function stylizeKey(amounts, unit, seeds) {
  return [
    'stylize',
    round(unit),
    amounts.sharpen,
    amounts.glow,
    amounts.grain ? `${amounts.grain}@${seeds.grain}` : 0,
    amounts.aberration,
    amounts.glitch ? `${amounts.glitch}@${seeds.glitch}` : 0,
  ].join(':');
}

// Pixelate as a grid of blocks over the fitted picture. Returns null when it is off.
export function pixelateCells(amount, width, height, refScale = 1) {
  if (!amount || amount < 1) return null;
  const block = (3 + clamp(amount, 0, 100) * 0.45) * Math.max(0.1, refScale);
  const columns = Math.max(4, Math.round(width / block));
  const rows = Math.max(2, Math.round((columns * height) / Math.max(1, width)));
  return { columns, rows };
}

// ---------- filter ----------

// Matrix rows for the alpha channel: keep the input's alpha, or force it fully opaque.
const KEEP_ALPHA = '0 0 0 1 0';
const OPAQUE = '0 0 0 0 1';

function setAttributes(element, attributes) {
  for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, String(value));
  return element;
}

// Appends the filter primitives for the active effects. Each stage reads the one before it, and
// stages that mix pictures with arithmetic hand the alpha channel back from the stage's input,
// so transparent areas of a clip never pick up color.
export function buildStylizeFilter(filter, create, amounts, { unit = 1, seeds = { grain: 0, glitch: 0 } } = {}) {
  // The default filter region reaches past the picture, which would let edge-repeating stages
  // repeat transparency. Keeping the region to the picture also stops glow from spilling outside it.
  setAttributes(filter, { x: 0, y: 0, width: '100%', height: '100%' });
  let last = 'SourceGraphic';
  let serial = 0;
  const next = () => {
    serial += 1;
    return `s${serial}`;
  };
  const add = (name, attributes = {}, children = []) => {
    const element = setAttributes(create(name), attributes);
    children.forEach((child) => element.appendChild(child));
    filter.appendChild(element);
    return element;
  };
  const stage = (name, attributes = {}, children = []) => {
    const result = next();
    add(name, { in: last, ...attributes, result }, children);
    last = result;
    return result;
  };
  const restoreAlpha = (from) => stage('feComposite', { in: last, in2: from, operator: 'in' });
  const functions = (names, attributes) => names.map((name) => setAttributes(create(name), attributes));

  if (amounts.glitch) {
    // Noise stretched across the frame, mostly thin bands. The noise's alpha drives the sideways
    // push (its color channels are premultiplied by that alpha, so they are not centered on 0.5)
    // and the other channels sit at the neutral 0.5, so the picture only ever moves horizontally.
    const amount = amounts.glitch / 100;
    const noise = next();
    add('feTurbulence', {
      type: 'fractalNoise',
      baseFrequency: `${round(0.0025 / unit)} ${round(Math.min(0.5, 0.05 / unit))}`,
      numOctaves: 2,
      seed: seeds.glitch + 1,
      result: noise,
    });
    const flat = next();
    add('feColorMatrix', { in: noise, type: 'matrix', values: `0 0 0 1 0  0 0 0 0 0.5  0 0 0 0 0.5  ${OPAQUE}`, result: flat });
    const bands = next();
    add('feComponentTransfer', { in: flat, result: bands }, functions(['feFuncR'], {
      type: 'table',
      tableValues: '0 0 0.5 0.5 0.5 1 1',
    }));
    const source = last;
    stage('feDisplacementMap', {
      in: source,
      in2: bands,
      scale: round(amount * 70 * unit),
      xChannelSelector: 'R',
      yChannelSelector: 'G',
    });
  }

  if (amounts.aberration) {
    // Red and blue slide apart horizontally while green stays put, like a lens that fails at the edges.
    // The slide is a one-tap convolution rather than an offset, because a convolution can repeat
    // the edge pixels instead of leaving a colored strip where the shifted channel ran out.
    const shift = Math.min(MAX_FRINGE_SHIFT, Math.round((amounts.aberration / 100) * 14 * unit));
    const source = last;
    const channel = (matrix, dx) => {
      const isolated = next();
      add('feColorMatrix', { in: source, type: 'matrix', values: matrix, result: isolated });
      if (!dx) return isolated;
      const taps = Math.abs(dx) * 2 + 1;
      const kernel = new Array(taps).fill(0);
      // The kernel is applied flipped, so the last tap moves the picture right and the first moves it left.
      kernel[dx > 0 ? taps - 1 : 0] = 1;
      const moved = next();
      add('feConvolveMatrix', {
        in: isolated,
        order: `${taps} 1`,
        kernelMatrix: kernel.join(' '),
        divisor: 1,
        targetX: Math.abs(dx),
        targetY: 0,
        edgeMode: 'duplicate',
        preserveAlpha: 'true',
        result: moved,
      });
      return moved;
    };
    const red = channel(`1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  ${KEEP_ALPHA}`, shift);
    const green = channel(`0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  ${KEEP_ALPHA}`, 0);
    const blue = channel(`0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  ${KEEP_ALPHA}`, -shift);
    const redGreen = next();
    add('feBlend', { in: red, in2: green, mode: 'screen', result: redGreen });
    stage('feBlend', { in: redGreen, in2: blue, mode: 'screen' });
  }

  if (amounts.sharpen) {
    // Unsharp mask: add back the difference between the picture and a softened copy.
    const strength = (amounts.sharpen / 100) * 1.6;
    const before = last;
    const soft = next();
    add('feGaussianBlur', { in: before, stdDeviation: round(Math.max(0.5, 1.1 * unit)), result: soft });
    stage('feComposite', { in: before, in2: soft, operator: 'arithmetic', k1: 0, k2: round(1 + strength), k3: round(-strength), k4: 0 });
    restoreAlpha(before);
  }

  if (amounts.glow) {
    // Keep only the bright parts, blur them wide, and screen them back over the picture.
    const amount = amounts.glow / 100;
    const before = last;
    const bright = next();
    add('feComponentTransfer', { in: before, result: bright }, functions(['feFuncR', 'feFuncG', 'feFuncB'], { type: 'linear', slope: 2.4, intercept: -1.3 }));
    const wide = next();
    add('feGaussianBlur', { in: bright, stdDeviation: round((8 + amount * 22) * unit), result: wide });
    const scaled = next();
    add('feComponentTransfer', { in: wide, result: scaled }, functions(['feFuncR', 'feFuncG', 'feFuncB'], { type: 'linear', slope: round(0.4 + amount * 1.3), intercept: 0 }));
    stage('feBlend', { in: before, in2: scaled, mode: 'screen' });
  }

  if (amounts.grain) {
    // Fine noise centered on gray (read from the noise's alpha, see glitch), added to the picture,
    // with the picture's own alpha kept.
    const amount = (amounts.grain / 100) * 0.5;
    const before = last;
    const noise = next();
    add('feTurbulence', {
      type: 'fractalNoise',
      // Noise is flat at whole-pixel frequencies, so the grain never gets finer than about 1.5 canvas pixels.
      baseFrequency: round(Math.min(MAX_GRAIN_FREQUENCY, 0.75 / unit)),
      numOctaves: 2,
      seed: seeds.grain + 1,
      stitchTiles: 'stitch',
      result: noise,
    });
    const gray = next();
    add('feColorMatrix', {
      in: noise,
      type: 'matrix',
      values: `0 0 0 2.5 -0.75  0 0 0 2.5 -0.75  0 0 0 2.5 -0.75  ${OPAQUE}`,
      result: gray,
    });
    stage('feComposite', { in: before, in2: gray, operator: 'arithmetic', k1: 0, k2: 1, k3: round(amount), k4: round(-amount / 2) });
    restoreAlpha(before);
  }
}

// ---------- looks ----------

export const STYLIZE_PRESETS = Object.freeze({
  none: {},
  crisp: { sharpen: 55 },
  film: { grain: 42, glow: 12 },
  dream: { glow: 72, grain: 10 },
  vhs: { aberration: 42, grain: 30, glitch: 10, glow: 14 },
  glitch: { glitch: 62, aberration: 55 },
  pixel: { pixelate: 55 },
});

export const STYLIZE_PRESET_LABELS = Object.freeze([
  ['none', 'None'],
  ['crisp', 'Crisp'],
  ['film', 'Grain'],
  ['dream', 'Dreamy'],
  ['vhs', 'VHS'],
  ['glitch', 'Glitch'],
  ['pixel', 'Pixelate'],
]);

export function applyStylizePreset(effects = {}, preset = 'none') {
  return { ...effects, ...STYLIZE_DEFAULTS, ...(STYLIZE_PRESETS[preset] || {}) };
}

// The preset whose amounts match the effects exactly, or '' when they have been tuned by hand.
export function activeStylizePreset(effects = {}) {
  const current = JSON.stringify(stylizeAmounts(effects));
  return Object.keys(STYLIZE_PRESETS).find((key) => JSON.stringify(stylizeAmounts(applyStylizePreset({}, key))) === current) || '';
}
