import { describe, expect, it } from 'vitest';
import {
  hexToRgba,
  layoutTextOverlay,
  resolveTextStyle,
  revealLines,
  TEXT_PRESETS,
  textAnimationState,
  textFont,
  wrapTextLines,
} from './text.js';

const measure = (value) => value.length * 10;

function fakeContext() {
  return { font: '', letterSpacing: '0px', measureText: (value) => ({ width: measure(value) }) };
}

describe('text styles', () => {
  it('keeps the legacy boxed look for overlays from older projects', () => {
    expect(resolveTextStyle({ text: 'Old', fontSize: 40 })).toMatchObject({
      fontFamily: 'Geist',
      fontWeight: 650,
      backgroundEnabled: true,
      fontSize: 40,
    });
  });

  it('snaps weights to what the bundled font provides', () => {
    expect(resolveTextStyle({ fontFamily: 'Anton', fontWeight: 900 }).fontWeight).toBe(400);
    expect(textFont(resolveTextStyle({ fontFamily: 'Montserrat', fontWeight: 800, italic: true }), 50))
      .toBe("italic 800 50px 'Montserrat Variable', 'Montserrat', sans-serif");
  });

  it('ships presets that each resolve to a complete style', () => {
    for (const preset of TEXT_PRESETS) {
      const style = resolveTextStyle(preset.style);
      expect(style.fontSize, preset.id).toBeGreaterThan(20);
      expect(style.text).toBe('Your text');
    }
  });

  it('converts hex colors to rgba', () => {
    expect(hexToRgba('#ff8000', 0.5)).toBe('rgba(255, 128, 0, 0.5)');
    expect(hexToRgba('#fff', 2)).toBe('rgba(255, 255, 255, 1)');
  });
});

describe('text layout', () => {
  it('wraps on spaces, respects newlines and breaks very long words', () => {
    expect(wrapTextLines(measure, 'one two three', 70)).toEqual(['one two', 'three']);
    expect(wrapTextLines(measure, 'top\nbottom', 500)).toEqual(['top', 'bottom']);
    expect(wrapTextLines(measure, 'abcdefghij', 40)).toEqual(['abcd', 'efgh', 'ij']);
  });

  it('positions text in project pixels scaled from a 720p reference', () => {
    const layout = layoutTextOverlay(fakeContext(), { text: 'Hello', fontSize: 72, positionX: 25, positionY: 50 }, { width: 1920, height: 1080 });
    expect(layout.size).toBe(108);
    expect(layout.centerX).toBe(480);
    expect(layout.centerY).toBe(540);
    expect(layout.lines).toEqual(['Hello']);
  });

  it('uppercases display text without changing what is stored', () => {
    const layout = layoutTextOverlay(fakeContext(), { text: 'loud', uppercase: true }, { width: 1280, height: 720 });
    expect(layout.lines).toEqual(['LOUD']);
  });
});

describe('text animation', () => {
  it('animates in and out over the configured duration', () => {
    const style = resolveTextStyle({ animationIn: 'fade', animationOut: 'pop', animationDuration: 0.5 });
    expect(textAnimationState(style, 0, 4).alpha).toBe(0);
    expect(textAnimationState(style, 1, 4)).toMatchObject({ alpha: 1, scale: 1 });
    expect(textAnimationState(style, 4, 4).alpha).toBe(0);
  });

  it('types characters on across lines', () => {
    expect(revealLines(['abcd', 'ef'], 0.5)).toEqual(['abc', '']);
    expect(revealLines(['abcd', 'ef'], 1)).toEqual(['abcd', 'ef']);
  });
});
