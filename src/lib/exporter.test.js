import { describe, expect, it } from 'vitest';
import { buildRenderPlan, canvasFilter } from './exporter.js';
import * as exporter from './exporter.js';

describe('export planning', () => {
  it('sorts clips into render order and calculates the full sequence duration', () => {
    const plan = buildRenderPlan([
      { id: 'late', start: 8, duration: 3 },
      { id: 'early', start: 1, duration: 2 },
    ]);
    expect(plan.clips.map((clip) => clip.id)).toEqual(['early', 'late']);
    expect(plan.duration).toBe(11);
  });

  it('orders simultaneous clips from the base layer to the top layer', () => {
    const plan = buildRenderPlan([
      { id: 'top', kind: 'video', track: 2, start: 0, duration: 4 },
      { id: 'base', kind: 'video', track: 0, start: 0, duration: 4 },
      { id: 'middle', kind: 'video', track: 1, start: 0, duration: 4 },
    ]);
    expect(plan.clips.map((clip) => clip.id)).toEqual(['base', 'middle', 'top']);
  });

  it('plans one deterministic render timestamp per output frame', () => {
    expect(exporter.exportFrameTimes(0.1, 30)).toEqual([0, 0.033333, 0.066667]);
    expect(exporter.exportFrameTimes(1, 2)).toEqual([0, 0.5]);
  });

  it('maps editor color controls to a canvas filter', () => {
    expect(canvasFilter({ exposure: 12, contrast: 93, saturation: 121, temperature: 20, tint: 10, blur: 2 }))
      .toBe('brightness(112%) contrast(93%) saturate(121%) sepia(4%) hue-rotate(2.5deg) blur(2px)');
  });

  it('places titles using both horizontal and vertical percentages', () => {
    expect(exporter.titleCanvasPosition({ positionX: 24, positionY: 66 }, { width: 1280, height: 720 }))
      .toEqual({ x: 307.2, y: 475.2 });
  });

  it('exports every text overlay while keeping legacy clip titles', () => {
    expect(exporter.exportTextOverlays({
      title: { text: 'Legacy title' },
      textOverlays: [
        { id: 'first', text: 'First overlay' },
        { id: 'second', text: 'Second overlay' },
      ],
    }).map((text) => text.text)).toEqual([
      'Legacy title',
      'First overlay',
      'Second overlay',
    ]);
  });

  it('wraps a transcript into centered export caption lines', () => {
    const context = { measureText: (text) => ({ width: text.length * 10 }) };
    expect(exporter.captionLines(context, 'Build something worth watching today', 110)).toEqual([
      'Build',
      'something',
      'worth…',
    ]);
  });

  it('keeps custom fonts and transparent caption boxes in the export style', () => {
    expect(exporter.captionRenderStyle({
      fontFamily: 'Pixelwave Custom Studio Sans',
      customFont: {
        family: 'Pixelwave Custom Studio Sans',
        src: 'pixelwave-media://local/font',
      },
      backgroundEnabled: false,
    })).toEqual({
      drawBackground: false,
      fontStack: "'Pixelwave Custom Studio Sans', sans-serif",
    });
  });

  it('describes supported WebM, MP4, and MOV output profiles', () => {
    expect(exporter.exportProfile('webm')).toMatchObject({ extension: 'webm', label: 'WebM' });
    expect(exporter.exportProfile('mp4')).toMatchObject({ extension: 'mp4', label: 'MP4 · H.264' });
    expect(exporter.exportProfile('mov')).toMatchObject({ extension: 'mov', label: 'MOV · H.264' });
    expect(exporter.exportProfile('avi')).toBeNull();
  });

});
