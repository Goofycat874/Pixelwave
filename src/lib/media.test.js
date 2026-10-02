import { describe, expect, it } from 'vitest';
import * as mediaTools from './media.js';

describe('media element configuration', () => {
  it('opts custom-protocol media into anonymous CORS before setting its source', () => {
    const element = { crossOrigin: null, src: '' };
    mediaTools.configureMediaElement(element, 'pixelwave-media://local/file?path=clip.mp4');
    expect(element).toMatchObject({ crossOrigin: 'anonymous', src: 'pixelwave-media://local/file?path=clip.mp4' });
  });
});

describe('timecodes', () => {
  it('formats frames using the project frame rate', () => {
    expect(mediaTools.formatTime(3.5, true, 30)).toBe('00:03:15');
    expect(mediaTools.formatTime(3.5, true, 24)).toBe('00:03:12');
    expect(mediaTools.formatTime(3725, false)).toBe('01:02:05');
    expect(mediaTools.formatTime(0.9999999, true, 30)).toBe('00:01:00');
  });

  it('parses seconds, minutes and frame timecodes', () => {
    expect(mediaTools.parseTimecode('75')).toBe(75);
    expect(mediaTools.parseTimecode('1:15')).toBe(75);
    expect(mediaTools.parseTimecode('00:03:15', 30)).toBe(3.5);
    expect(mediaTools.parseTimecode('01:00:00:12', 24)).toBe(3600.5);
    expect(mediaTools.parseTimecode('nope')).toBeNull();
  });
});
