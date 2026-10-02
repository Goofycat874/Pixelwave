import { describe, expect, it } from 'vitest';
import * as exporter from './exporter.js';
import { createProject } from './project.js';

describe('export planning', () => {
  it('sorts clips into render order and calculates the full sequence duration', () => {
    const plan = exporter.buildRenderPlan([
      { id: 'late', start: 8, duration: 3 },
      { id: 'early', start: 1, duration: 2 },
    ]);
    expect(plan.clips.map((clip) => clip.id)).toEqual(['early', 'late']);
    expect(plan.duration).toBe(11);
  });

  it('orders simultaneous clips from the base layer to the top layer', () => {
    const plan = exporter.buildRenderPlan([
      { id: 'top', kind: 'video', track: 2, start: 0, duration: 4 },
      { id: 'base', kind: 'video', track: 0, start: 0, duration: 4 },
      { id: 'middle', kind: 'video', track: 1, start: 0, duration: 4 },
    ]);
    expect(plan.clips.map((clip) => clip.id)).toEqual(['base', 'middle', 'top']);
  });

  it('plans one deterministic render timestamp per output frame', () => {
    expect(exporter.exportFrameTimes(0.1, 30)).toEqual([0, 0.033333, 0.066667]);
    expect(exporter.exportFrameTimes(1, 2)).toEqual([0, 0.5]);
    expect(exporter.exportFrameTimes(1, 2, 3)).toEqual([3, 3.5]);
  });

  it('clamps export ranges to the timeline', () => {
    const project = createProject({ clips: [{ id: 'a', start: 0, duration: 10 }] });
    expect(exporter.exportRange(project)).toEqual({ start: 0, end: 10, duration: 10 });
    expect(exporter.exportRange(project, { start: 2, end: 40 })).toEqual({ start: 2, end: 10, duration: 8 });
  });

  it('offers output sizes by the short side for any canvas shape', () => {
    const vertical = exporter.exportResolutions({ width: 1080, height: 1920 });
    expect(vertical.find((option) => option.native)).toMatchObject({ label: '1080p', width: 1080, height: 1920 });
    expect(vertical.find((option) => option.id === '720')).toMatchObject({ width: 720, height: 1280 });
    const odd = exporter.exportResolutions({ width: 1000, height: 750 });
    expect(odd.every((option) => option.width % 2 === 0 && option.height % 2 === 0)).toBe(true);
  });

  it('describes video, GIF and audio output formats', () => {
    expect(exporter.exportProfile('webm')).toMatchObject({ extension: 'webm', kind: 'video' });
    expect(exporter.exportProfile('gif')).toMatchObject({ kind: 'gif' });
    expect(exporter.exportProfile('mp3')).toMatchObject({ kind: 'audio' });
    expect(exporter.exportProfile('avi')).toBeNull();
    expect(exporter.exportQuality('nope').id).toBe('standard');
  });

  it('collects the fonts a project needs before rendering', () => {
    const fonts = exporter.projectFontRequests({
      clips: [{ kind: 'text', textOverlays: [{ text: 'Hi', fontFamily: 'Anton' }] }, { transcript: { text: 'hey', fontFamily: 'Oswald' } }],
    });
    expect(fonts).toEqual(["400 48px 'Anton', 'Anton', sans-serif", "700 48px 'Oswald Variable', 'Oswald', sans-serif"]);
  });
});
