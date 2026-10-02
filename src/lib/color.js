// Color grading math. Every control that works one channel at a time (exposure, white balance,
// lift/gamma/gain, shadows/highlights/whites/blacks, contrast and the curves) is evaluated in a
// fixed order and baked into one 256-entry transfer table per channel. The compositor turns the
// tables into an SVG feComponentTransfer, so the monitor and the exporter grade pixels identically.
//
// Order of operations, per channel:
//   1. decode sRGB to linear light, apply exposure (stops) and white balance there, re-encode
//   2. lift / gamma / gain wheels in encoded space
//   3. shadows, highlights, whites and blacks as a monotone tone spline
//   4. contrast as an S-curve around mid-gray that never clips
//   5. master curve, then the red, green or blue curve
// Saturation needs all three channels at once, so it stays a CSS saturate() in the filter chain.

export const TABLE_SIZE = 256;

const LUMA = [0.2126, 0.7152, 0.0722];
const CONTRAST_PIVOT = 0.46;
const GRADE_CACHE_LIMIT = 24;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function round(value) {
  return Math.round(value * 10000) / 10000;
}

function srgbToLinear(value) {
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function linearToSrgb(value) {
  if (value <= 0) return 0;
  return value <= 0.0031308 ? value * 12.92 : 1.055 * value ** (1 / 2.4) - 0.055;
}

// Fully saturated RGB (0 to 1) for a hue in degrees: 0 red, 60 yellow, 120 green, 180 cyan, 240 blue, 300 magenta.
export function hueToRgb(hue) {
  const sector = (((hue % 360) + 360) % 360) / 60;
  const x = 1 - Math.abs((sector % 2) - 1);
  if (sector < 1) return [1, x, 0];
  if (sector < 2) return [x, 1, 0];
  if (sector < 3) return [0, 1, x];
  if (sector < 4) return [0, x, 1];
  if (sector < 5) return [x, 0, 1];
  return [1, 0, x];
}

// The wheel is drawn red at the right and runs clockwise (yellow, green, cyan, blue, magenta),
// with y pointing up. A puck dragged toward a color pushes the picture toward that color:
// the result is that color's RGB minus its average, scaled by how far the puck is from center.
export function wheelVector({ x = 0, y = 0 } = {}) {
  const strength = Math.min(1, Math.hypot(x, y));
  if (strength < 0.0005) return [0, 0, 0];
  const hue = (-Math.atan2(y, x) * 180) / Math.PI;
  const rgb = hueToRgb(hue);
  const mean = (rgb[0] + rgb[1] + rgb[2]) / 3;
  return rgb.map((value) => (value - mean) * strength);
}

// The puck position that pushes toward a hue, for looks that are defined by color instead of by x and y.
export function wheelPuck(hue, strength, luma = 0) {
  const radians = (hue * Math.PI) / 180;
  return { x: round(Math.cos(radians) * strength), y: round(-Math.sin(radians) * strength), luma };
}

function wheelOf(wheels, key) {
  return { x: 0, y: 0, luma: 0, ...(wheels?.[key] || {}) };
}

// ---------- curves ----------

export const IDENTITY_CURVE = [[0, 0], [1, 1]];

export function defaultCurves() {
  return {
    master: IDENTITY_CURVE.map((point) => [...point]),
    red: IDENTITY_CURVE.map((point) => [...point]),
    green: IDENTITY_CURVE.map((point) => [...point]),
    blue: IDENTITY_CURVE.map((point) => [...point]),
  };
}

// Sorted, clamped control points with distinct x. Anything unusable falls back to the identity.
export function normalizeCurve(points) {
  const cleaned = (Array.isArray(points) ? points : [])
    .map((point) => [Number(point?.[0]), Number(point?.[1])])
    .filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y))
    .map(([x, y]) => [clamp(x, 0, 1), clamp(y, 0, 1)])
    .sort((a, b) => a[0] - b[0]);
  const result = [];
  for (const point of cleaned) {
    if (result.length && point[0] - result[result.length - 1][0] < 0.001) result[result.length - 1] = point;
    else result.push(point);
  }
  return result.length >= 2 ? result : IDENTITY_CURVE.map((point) => [...point]);
}

export function isIdentityCurve(points) {
  return normalizeCurve(points).every(([x, y]) => Math.abs(x - y) < 0.0005);
}

// Monotone cubic interpolation (Fritsch-Carlson): a smooth line through the points that never
// overshoots between them, so a curve that rises at every point never dips or clips in between.
export function curveFunction(points) {
  const pts = normalizeCurve(points);
  const count = pts.length;
  const gaps = [];
  const slopes = [];
  for (let i = 0; i < count - 1; i += 1) {
    gaps[i] = pts[i + 1][0] - pts[i][0];
    slopes[i] = (pts[i + 1][1] - pts[i][1]) / gaps[i];
  }
  const tangents = new Array(count);
  tangents[0] = slopes[0];
  tangents[count - 1] = slopes[count - 2];
  for (let i = 1; i < count - 1; i += 1) {
    if (slopes[i - 1] * slopes[i] <= 0) {
      tangents[i] = 0;
    } else {
      const w1 = 2 * gaps[i] + gaps[i - 1];
      const w2 = gaps[i] + 2 * gaps[i - 1];
      tangents[i] = (w1 + w2) / (w1 / slopes[i - 1] + w2 / slopes[i]);
    }
  }
  return (x) => {
    if (x <= pts[0][0]) return pts[0][1];
    if (x >= pts[count - 1][0]) return pts[count - 1][1];
    let segment = 0;
    while (segment < count - 2 && x > pts[segment + 1][0]) segment += 1;
    const t = (x - pts[segment][0]) / gaps[segment];
    const t2 = t * t;
    const t3 = t2 * t;
    return (
      (2 * t3 - 3 * t2 + 1) * pts[segment][1]
      + (t3 - 2 * t2 + t) * gaps[segment] * tangents[segment]
      + (-2 * t3 + 3 * t2) * pts[segment + 1][1]
      + (t3 - t2) * gaps[segment] * tangents[segment + 1]
    );
  };
}

// Points for drawing a curve in the editor.
export function sampleCurve(points, samples = 64) {
  const fn = curveFunction(points);
  return Array.from({ length: samples + 1 }, (_, index) => {
    const x = index / samples;
    return [x, clamp(fn(x), 0, 1)];
  });
}

function curveOf(curves, key) {
  return curves?.[key];
}

// ---------- tone ----------

// Shadows, highlights, whites and blacks move fixed points on the tone scale and a monotone
// spline runs through them. Values are -100 to 100. Because the points never cross, pulling
// highlights down or lifting shadows can flatten the picture but never invert it.
function toneFunction({ shadows, highlights, whites, blacks }) {
  if (!shadows && !highlights && !whites && !blacks) return null;
  const s = clamp(shadows / 100, -1, 1);
  const h = clamp(highlights / 100, -1, 1);
  const w = clamp(whites / 100, -1, 1);
  const b = clamp(blacks / 100, -1, 1);
  const raw = [
    [0, Math.max(0, 0.12 * b)],
    [0.08, 0.08 + 0.08 * b],
    [0.25, 0.25 + 0.2 * s],
    [0.5, 0.5],
    [0.75, 0.75 + 0.2 * h],
    [0.92, 0.92 + 0.08 * w],
    [1, Math.min(1, 1 + 0.12 * w)],
  ];
  let floor = 0;
  const points = raw.map(([x, y]) => {
    floor = Math.max(floor, clamp(y, 0, 1));
    return [x, floor];
  });
  return curveFunction(points);
}

// Contrast above 100 steepens the middle with a soft toe and shoulder; below 100 it flattens
// linearly, which lifts the blacks and lowers the whites the way a faded print does.
function contrastFunction(contrast) {
  const amount = clamp(contrast / 100, 0.2, 2.2);
  if (Math.abs(amount - 1) < 0.0005) return null;
  const pivot = CONTRAST_PIVOT;
  if (amount < 1) return (x) => pivot + (x - pivot) * amount;
  return (x) => (x < pivot
    ? pivot * (x / pivot) ** amount
    : 1 - (1 - pivot) * ((1 - x) / (1 - pivot)) ** amount);
}

// ---------- white balance ----------

// Warm raises red and lowers blue; the gains are scaled to keep luminance, so moving temperature
// changes color without changing brightness. Positive tint leans magenta by lowering green and
// nudging red and blue up, the way a green channel gain does on a camera.
function whiteBalance(temperature, tint) {
  const warmth = [2 ** (0.55 * temperature), 1, 2 ** (-0.55 * temperature)];
  const luma = warmth[0] * LUMA[0] + warmth[1] * LUMA[1] + warmth[2] * LUMA[2];
  const lean = [2 ** (0.12 * tint), 2 ** (-0.6 * tint), 2 ** (0.12 * tint)];
  return warmth.map((gain, index) => (gain / luma) * lean[index]);
}

// ---------- grade ----------

function gradeParameters(effects = {}) {
  const lift = wheelOf(effects.primaryWheels, 'lift');
  const gamma = wheelOf(effects.primaryWheels, 'gamma');
  const gain = wheelOf(effects.primaryWheels, 'gain');
  return {
    exposure: clamp(Number(effects.exposure) || 0, -70, 70) / 25,
    contrast: clamp(Number(effects.contrast ?? 100), 0, 220),
    temperature: clamp((Number(effects.temperature) || 0) / 100, -1, 1),
    tint: clamp((Number(effects.tint) || 0) / 100, -1, 1),
    shadows: Number(effects.shadows) || 0,
    highlights: Number(effects.highlights) || 0,
    whites: Number(effects.whites) || 0,
    blacks: Number(effects.blacks) || 0,
    lift,
    gamma,
    gain,
    curves: effects.curves || null,
  };
}

function buildChannelTable(index, shared) {
  const { exposureGain, balance, wheels, tone, contrast, curves } = shared;
  const wheel = wheels[index];
  const curve = curves[index];
  const table = new Array(TABLE_SIZE);
  for (let i = 0; i < TABLE_SIZE; i += 1) {
    let value = linearToSrgb(srgbToLinear(i / (TABLE_SIZE - 1)) * exposureGain * balance[index]);
    value = clamp(value, 0, 1);
    value = clamp(value * wheel.slope + wheel.intercept, 0, 1) ** wheel.exponent;
    if (tone) value = tone(value);
    if (contrast) value = contrast(value);
    for (const fn of curve) value = fn(clamp(value, 0, 1));
    table[i] = round(clamp(value, 0, 1));
  }
  return table;
}

function isIdentityTable(table) {
  return table.every((value, index) => Math.abs(value - index / (TABLE_SIZE - 1)) < 0.0005);
}

export function isNeutralChannels(channels) {
  return channels.every(isIdentityTable);
}

const gradeCache = new Map();

function gradeCacheKey(params) {
  return JSON.stringify([
    params.exposure, params.contrast, params.temperature, params.tint,
    params.shadows, params.highlights, params.whites, params.blacks,
    params.lift, params.gamma, params.gain, params.curves,
  ]);
}

// Returns three 256-entry tables (red, green, blue) mapping an input level 0 to 1 to an output
// level 0 to 1, or null when the grade does nothing.
export function gradeChannels(effects = {}) {
  const params = gradeParameters(effects);
  const cacheKey = gradeCacheKey(params);
  if (gradeCache.has(cacheKey)) {
    const cached = gradeCache.get(cacheKey);
    gradeCache.delete(cacheKey);
    gradeCache.set(cacheKey, cached);
    return cached;
  }

  const vectors = [params.lift, params.gamma, params.gain].map(wheelVector);
  const wheels = [0, 1, 2].map((index) => {
    // Lift is anchored at white: out = in * (1 - offset) + offset.
    const offset = clamp(0.3 * vectors[0][index] + 0.12 * params.lift.luma, -0.4, 0.4);
    const gainMultiplier = Math.max(0.05, 1 + 0.45 * vectors[2][index] + 0.5 * params.gain.luma);
    const power = clamp(1 + 0.9 * vectors[1][index] + 0.7 * params.gamma.luma, 0.45, 2.2);
    return {
      slope: Math.max(0.02, gainMultiplier * (1 - offset)),
      intercept: offset,
      exponent: 1 / power,
    };
  });
  const curveKeys = ['red', 'green', 'blue'];
  const shared = {
    exposureGain: 2 ** params.exposure,
    balance: whiteBalance(params.temperature, params.tint),
    wheels,
    tone: toneFunction(params),
    contrast: contrastFunction(params.contrast),
    curves: curveKeys.map((key) => [
      curveOf(params.curves, 'master'),
      curveOf(params.curves, key),
    ].filter((points) => points && !isIdentityCurve(points)).map(curveFunction)),
  };
  const channels = [0, 1, 2].map((index) => buildChannelTable(index, shared));
  const result = isNeutralChannels(channels) ? null : channels;
  gradeCache.set(cacheKey, result);
  while (gradeCache.size > GRADE_CACHE_LIMIT) gradeCache.delete(gradeCache.keys().next().value);
  return result;
}

const keyCache = new WeakMap();

export function gradeKey(channels) {
  let key = keyCache.get(channels);
  if (!key) {
    key = channels.map((table) => table.join(',')).join('|');
    keyCache.set(channels, key);
  }
  return key;
}

function lookup(table, value) {
  const position = clamp(value, 0, 1) * (TABLE_SIZE - 1);
  const low = Math.floor(position);
  const high = Math.min(TABLE_SIZE - 1, low + 1);
  return table[low] + (table[high] - table[low]) * (position - low);
}

// The same transfer the SVG filter applies, for tests and for the scopes.
export function applyGrade(rgb, channels) {
  if (!channels) return [...rgb];
  return rgb.map((value, index) => lookup(channels[index], value));
}

// Rec. 709 saturation, the same matrix CSS saturate() uses.
export function applySaturation(rgb, saturation = 100) {
  const amount = clamp(saturation, 0, 220) / 100;
  const luma = rgb[0] * LUMA[0] + rgb[1] * LUMA[1] + rgb[2] * LUMA[2];
  return rgb.map((value) => clamp(luma + (value - luma) * amount, 0, 1));
}

// A full grade on one color (0 to 1 per channel), for look swatches.
export function gradeColor(rgb, effects = {}) {
  return applySaturation(applyGrade(rgb, gradeChannels(effects)), effects.saturation ?? 100);
}
