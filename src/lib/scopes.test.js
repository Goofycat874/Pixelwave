import { describe, expect, it } from 'vitest';
import {
  analyzeFrame,
  chromaOf,
  HISTOGRAM_BINS,
  traceIntensity,
  VECTOR_SIZE,
  VECTOR_TARGETS,
  vectorPosition,
  WAVEFORM_COLUMNS,
  WAVEFORM_LEVELS,
} from './scopes.js';

function solid(width, height, [r, g, b]) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i += 1) data.set([r, g, b, 255], i * 4);
  return data;
}

const total = (counts) => counts.reduce((sum, value) => sum + value, 0);

describe('scope analysis', () => {
  it('puts a neutral gray in one histogram bin and on the center of the vectorscope', () => {
    const analysis = analyzeFrame(solid(16, 9, [128, 128, 128]), 16, 9);
    const bin = Math.round((128 / 255) * (HISTOGRAM_BINS - 1));
    expect(analysis.histogram.luma[bin]).toBe(144);
    expect(total(analysis.histogram.red)).toBe(144);
    const center = Math.round(0.5 * (VECTOR_SIZE - 1));
    expect(analysis.vector.counts[center * VECTOR_SIZE + center]).toBe(144);
    expect(analysis.stats.mean).toBeCloseTo(128 / 255, 3);
  });

  it('places the primaries at the vectorscope targets', () => {
    expect(vectorPosition(1, 1, 1)).toEqual([0.5, 0.5]);
    const red = VECTOR_TARGETS.find((target) => target.label === 'R').position;
    const blue = VECTOR_TARGETS.find((target) => target.label === 'B').position;
    expect(red[1]).toBeCloseTo(0, 6);
    expect(red[0]).toBeLessThan(0.5);
    expect(blue[0]).toBeCloseTo(1, 6);
    expect(blue[1]).toBeGreaterThan(0.5);
    expect(chromaOf(1, 0, 0).cr).toBeCloseTo(0.5, 6);
  });

  it('draws a waveform column per image column at the pixel level', () => {
    const width = 8;
    const height = 4;
    const data = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) data.set(x < 4 ? [0, 0, 0, 255] : [255, 255, 255, 255], (y * width + x) * 4);
    }
    const { waveform } = analyzeFrame(data, width, height);
    expect(waveform.luma[(WAVEFORM_LEVELS - 1) * WAVEFORM_COLUMNS]).toBe(4);
    expect(waveform.luma[Math.floor((7 / width) * WAVEFORM_COLUMNS)]).toBe(4);
    expect(total(waveform.luma)).toBe(width * height);
  });

  it('measures clipping and the black and white points', () => {
    const data = solid(10, 10, [255, 255, 255]);
    data.set([0, 0, 0, 255], 0);
    const { stats } = analyzeFrame(data, 10, 10);
    expect(stats.clippedHigh).toBe(99);
    expect(stats.clippedLow).toBe(1);
    expect(stats.min).toBe(0);
    expect(stats.max).toBeCloseTo(1, 6);
  });

  it('copes with an empty frame and keeps thin traces visible', () => {
    expect(analyzeFrame(null, 0, 0).stats.pixels).toBe(0);
    expect(traceIntensity(0, 10)).toBe(0);
    expect(traceIntensity(1, 100)).toBeGreaterThan(0.05);
    expect(traceIntensity(1000, 10)).toBe(1);
  });
});
