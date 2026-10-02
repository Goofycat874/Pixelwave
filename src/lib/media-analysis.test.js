import { describe, expect, it } from 'vitest';
import { computePeaks, nearestFilmstripFrame, waveformPath } from './media-analysis.js';

describe('waveform peaks', () => {
  it('reduces samples to the loudest value per bucket across channels', () => {
    const left = new Float32Array(1200).fill(0);
    const right = new Float32Array(1200).fill(0);
    left.fill(0.5, 8, 24);
    right.fill(-0.8, 68, 84);
    const peaks = computePeaks([left, right], 600, 10);
    expect(peaks.length).toBe(20);
    expect(peaks[0]).toBeCloseTo(0.5, 5);
    expect(peaks[1]).toBeCloseTo(0.8, 5);
    expect(peaks[5]).toBe(0);
  });
});

describe('waveform path', () => {
  const waveform = { peaks: Float32Array.from([0, 0.25, 1, 0.25, 0, 0, 0.5, 0]), peaksPerSecond: 2, normalize: 1 };

  it('draws a closed mirrored shape for the visible source range', () => {
    const path = waveformPath(waveform, 0, 2, 4);
    expect(path.startsWith('M0 50')).toBe(true);
    expect(path.endsWith('Z')).toBe(true);
    expect(path.match(/L/g).length).toBeGreaterThanOrEqual(8);
  });

  it('returns nothing when there is no audio or no range', () => {
    expect(waveformPath(null, 0, 1)).toBe('');
    expect(waveformPath(waveform, 2, 2)).toBe('');
  });
});

describe('filmstrip lookup', () => {
  it('picks the stored frame nearest to a source time', () => {
    const filmstrip = { times: [0.5, 2.5, 4.5], frames: ['a', 'b', 'c'] };
    expect(nearestFilmstripFrame(filmstrip, 0.1)).toBe('a');
    expect(nearestFilmstripFrame(filmstrip, 2.2)).toBe('b');
    expect(nearestFilmstripFrame(filmstrip, 99)).toBe('c');
    expect(nearestFilmstripFrame(null, 1)).toBeNull();
  });
});
