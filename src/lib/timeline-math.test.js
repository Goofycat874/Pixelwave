import { describe, expect, it } from 'vitest';
import { anchoredScroll, rulerSteps, rulerTicks, sliderToZoom, stepZoom, zoomToSlider } from './timeline-math.js';
import { MAX_TIMELINE_ZOOM, MIN_TIMELINE_ZOOM } from './editor.js';

describe('timeline ruler', () => {
  it('spaces labels at least 84 pixels apart at any zoom', () => {
    expect(rulerSteps(64)).toEqual({ major: 2, minor: 0.2 });
    expect(rulerSteps(640).major).toBe(0.2);
    expect(rulerSteps(3.2).major).toBe(30);
    for (const pps of [1, 5, 20, 64, 300, 768]) {
      const { major, minor } = rulerSteps(pps);
      expect(major * pps).toBeGreaterThanOrEqual(84);
      expect(minor * pps).toBeGreaterThanOrEqual(9);
    }
  });

  it('marks major ticks inside the requested window', () => {
    const { ticks } = rulerTicks(10, 14, 64);
    expect(ticks[0]).toEqual({ time: 10, major: true });
    expect(ticks.filter((tick) => tick.major).map((tick) => tick.time)).toEqual([10, 12, 14]);
  });
});

describe('timeline zoom', () => {
  it('maps zoom to a logarithmic slider and back', () => {
    expect(zoomToSlider(MIN_TIMELINE_ZOOM)).toBe(0);
    expect(zoomToSlider(MAX_TIMELINE_ZOOM)).toBe(100);
    expect(sliderToZoom(zoomToSlider(1))).toBeCloseTo(1, 1);
  });

  it('steps zoom within limits', () => {
    expect(stepZoom(1, 1)).toBe(1.25);
    expect(stepZoom(MAX_TIMELINE_ZOOM, 1)).toBe(MAX_TIMELINE_ZOOM);
  });

  it('keeps the time under the pointer in place', () => {
    expect(anchoredScroll({ time: 10, pointerOffset: 300, gutter: 148, pixelsPerSecond: 128 })).toBe(1128);
  });
});
