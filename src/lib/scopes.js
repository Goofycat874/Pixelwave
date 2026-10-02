// Video scope math. Everything here works on a plain RGBA byte array so it can be tested without a
// canvas; src/components/Scopes.jsx grabs the program monitor's pixels and draws the results.

const LUMA = [0.2126, 0.7152, 0.0722];

export const HISTOGRAM_BINS = 64;
export const WAVEFORM_COLUMNS = 160;
export const WAVEFORM_LEVELS = 128;
export const VECTOR_SIZE = 128;

// Rec. 709 chroma, each axis -0.5 to 0.5.
export function chromaOf(r, g, b) {
  const y = LUMA[0] * r + LUMA[1] * g + LUMA[2] * b;
  return { y, cb: (b - y) / 1.8556, cr: (r - y) / 1.5748 };
}

// Where a color lands on the vectorscope, as 0 to 1 from the left and from the top.
export function vectorPosition(r, g, b) {
  const { cb, cr } = chromaOf(r, g, b);
  return [0.5 + cb, 0.5 - cr];
}

// The six color targets (R, Y, G, C, B, M) at full saturation, as vectorscope positions.
export const VECTOR_TARGETS = [
  ['R', [1, 0, 0]],
  ['Y', [1, 1, 0]],
  ['G', [0, 1, 0]],
  ['C', [0, 1, 1]],
  ['B', [0, 0, 1]],
  ['M', [1, 0, 1]],
].map(([label, rgb]) => ({ label, rgb, position: vectorPosition(...rgb) }));

// Skin tones sit along one line from the center of the vectorscope. This is the point on it at
// the edge of the 75% targets, in the same 0 to 1 position space.
export const SKIN_LINE_END = (() => {
  const angle = (123 * Math.PI) / 180;
  return [0.5 + Math.cos(angle) * 0.42, 0.5 - Math.sin(angle) * 0.42];
})();

export function analyzeFrame(data, width, height) {
  const histogram = {
    luma: new Uint32Array(HISTOGRAM_BINS),
    red: new Uint32Array(HISTOGRAM_BINS),
    green: new Uint32Array(HISTOGRAM_BINS),
    blue: new Uint32Array(HISTOGRAM_BINS),
  };
  const waveform = {
    columns: WAVEFORM_COLUMNS,
    levels: WAVEFORM_LEVELS,
    luma: new Uint32Array(WAVEFORM_COLUMNS * WAVEFORM_LEVELS),
    red: new Uint32Array(WAVEFORM_COLUMNS * WAVEFORM_LEVELS),
    green: new Uint32Array(WAVEFORM_COLUMNS * WAVEFORM_LEVELS),
    blue: new Uint32Array(WAVEFORM_COLUMNS * WAVEFORM_LEVELS),
  };
  const vector = { size: VECTOR_SIZE, counts: new Uint32Array(VECTOR_SIZE * VECTOR_SIZE) };
  const stats = { min: 1, max: 0, mean: 0, clippedHigh: 0, clippedLow: 0, pixels: 0 };
  if (!data || !width || !height) return { histogram, waveform, vector, stats: { ...stats, min: 0 } };

  const binMax = HISTOGRAM_BINS - 1;
  const levelMax = WAVEFORM_LEVELS - 1;
  const vectorMax = VECTOR_SIZE - 1;
  let sum = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      const r = data[offset] / 255;
      const g = data[offset + 1] / 255;
      const b = data[offset + 2] / 255;
      const luma = LUMA[0] * r + LUMA[1] * g + LUMA[2] * b;
      histogram.luma[Math.round(luma * binMax)] += 1;
      histogram.red[Math.round(r * binMax)] += 1;
      histogram.green[Math.round(g * binMax)] += 1;
      histogram.blue[Math.round(b * binMax)] += 1;

      const column = Math.min(WAVEFORM_COLUMNS - 1, Math.floor((x / width) * WAVEFORM_COLUMNS));
      waveform.luma[(levelMax - Math.round(luma * levelMax)) * WAVEFORM_COLUMNS + column] += 1;
      waveform.red[(levelMax - Math.round(r * levelMax)) * WAVEFORM_COLUMNS + column] += 1;
      waveform.green[(levelMax - Math.round(g * levelMax)) * WAVEFORM_COLUMNS + column] += 1;
      waveform.blue[(levelMax - Math.round(b * levelMax)) * WAVEFORM_COLUMNS + column] += 1;

      const [px, py] = vectorPosition(r, g, b);
      const vx = Math.min(vectorMax, Math.max(0, Math.round(px * vectorMax)));
      const vy = Math.min(vectorMax, Math.max(0, Math.round(py * vectorMax)));
      vector.counts[vy * VECTOR_SIZE + vx] += 1;

      sum += luma;
      if (luma < stats.min) stats.min = luma;
      if (luma > stats.max) stats.max = luma;
      if (data[offset] >= 254 || data[offset + 1] >= 254 || data[offset + 2] >= 254) stats.clippedHigh += 1;
      if (data[offset] <= 1 && data[offset + 1] <= 1 && data[offset + 2] <= 1) stats.clippedLow += 1;
    }
  }
  stats.pixels = width * height;
  stats.mean = sum / stats.pixels;
  return { histogram, waveform, vector, stats };
}

// A count to a 0 to 1 brightness. The square root keeps a thin trace visible next to a dense one.
export function traceIntensity(count, reference) {
  if (!count) return 0;
  return Math.min(1, Math.sqrt(count / Math.max(1, reference)));
}
