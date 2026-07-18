import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
let buildMediaFetchInit;
let isSupportedCaptionFontPath;
let resolveMediaByteRange;
try {
  ({ buildMediaFetchInit, isSupportedCaptionFontPath, resolveMediaByteRange } = require('./media-protocol.cjs'));
} catch {
  buildMediaFetchInit = undefined;
  isSupportedCaptionFontPath = undefined;
  resolveMediaByteRange = undefined;
}

describe('local media protocol', () => {
  it('forwards Chromium byte-range requests to the local file fetch', () => {
    expect(typeof buildMediaFetchInit).toBe('function');
    const headers = new Headers({ Range: 'bytes=1048576-2097151' });

    const init = buildMediaFetchInit({ method: 'GET', headers });

    expect(init.method).toBe('GET');
    expect(init.headers.get('Range')).toBe('bytes=1048576-2097151');
  });

  it('describes the partial response Chromium needs to continue playback', () => {
    expect(typeof resolveMediaByteRange).toBe('function');
    expect(resolveMediaByteRange('bytes=1048576-2097151', 81787036)).toEqual({
      start: 1048576,
      end: 2097151,
      length: 1048576,
      contentRange: 'bytes 1048576-2097151/81787036',
    });
  });

  it('accepts common web and desktop caption font files only', () => {
    expect(typeof isSupportedCaptionFontPath).toBe('function');
    expect(isSupportedCaptionFontPath('/tmp/My Font.ttf')).toBe(true);
    expect(isSupportedCaptionFontPath('/tmp/My Font.OTF')).toBe(true);
    expect(isSupportedCaptionFontPath('/tmp/My Font.woff2')).toBe(true);
    expect(isSupportedCaptionFontPath('/tmp/not-a-font.mp4')).toBe(false);
  });
});
