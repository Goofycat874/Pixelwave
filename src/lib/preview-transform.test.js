import { describe, expect, it } from 'vitest';
import {
  mediaSelectionBox,
  positionDeltaFromPointer,
  scaleFromCornerPointer,
  textOverlayWidth,
  textPositionFromPointer,
  textSizeFromCornerPointer,
} from './preview-transform.js';

describe('preview transform geometry', () => {
  it('uses the same bounded text box width before and after editing', () => {
    expect(textOverlayWidth('Hi')).toBe('8ch');
    expect(textOverlayWidth('A title that is long enough to wrap across two lines in the monitor')).toBe('32ch');
  });

  it('fits landscape and portrait media inside the monitor', () => {
    expect(mediaSelectionBox({
      asset: { width: 1920, height: 1080 },
      fit: 'contain',
      effects: {},
      stageWidth: 1280,
      stageHeight: 720,
    })).toEqual({ centerX: 50, centerY: 50, width: 100, height: 100, rotation: 0 });

    expect(mediaSelectionBox({
      asset: { width: 1080, height: 1920 },
      fit: 'contain',
      effects: { positionX: 20, positionY: -10, scale: 150, rotation: 12 },
      stageWidth: 1280,
      stageHeight: 720,
    })).toEqual({ centerX: 60, centerY: 45, width: 47.4609, height: 150, rotation: 12 });
  });

  it('uses the visible frame as the transform box in fill mode', () => {
    expect(mediaSelectionBox({
      asset: { width: 1080, height: 1920 },
      fit: 'cover',
      effects: { scale: 80 },
      stageWidth: 1280,
      stageHeight: 720,
    })).toMatchObject({ width: 80, height: 80 });
  });

  it('converts pointer movement into the existing half-frame position scale', () => {
    expect(positionDeltaFromPointer({ deltaX: 64, deltaY: -36, stageWidth: 1280, stageHeight: 720 }))
      .toEqual({ x: 10, y: -10 });
  });

  it('scales proportionally from a corner and respects inspector limits', () => {
    const input = { initialScale: 100, centerX: 0, centerY: 0, startX: 3, startY: 4 };
    expect(scaleFromCornerPointer({ ...input, currentX: 6, currentY: 8 })).toBe(200);
    expect(scaleFromCornerPointer({ ...input, currentX: 30, currentY: 40 })).toBe(200);
    expect(scaleFromCornerPointer({ ...input, currentX: 0.1, currentY: 0.1 })).toBe(25);
  });

  it('moves text in frame percentages and clamps it to the monitor', () => {
    expect(textPositionFromPointer({
      initialX: 50,
      initialY: 78,
      deltaX: 128,
      deltaY: -72,
      stageWidth: 1280,
      stageHeight: 720,
    })).toEqual({ x: 60, y: 68 });
    expect(textPositionFromPointer({
      initialX: 98,
      initialY: 2,
      deltaX: 200,
      deltaY: -100,
      stageWidth: 1280,
      stageHeight: 720,
    })).toEqual({ x: 100, y: 0 });
  });

  it('resizes text proportionally from any corner with readable limits', () => {
    const input = { initialFontSize: 54, centerX: 0, centerY: 0, startX: 3, startY: 4 };
    expect(textSizeFromCornerPointer({ ...input, currentX: 6, currentY: 8 })).toBe(108);
    expect(textSizeFromCornerPointer({ ...input, currentX: 30, currentY: 40 })).toBe(180);
    expect(textSizeFromCornerPointer({ ...input, currentX: 0.1, currentY: 0.1 })).toBe(12);
  });
});
