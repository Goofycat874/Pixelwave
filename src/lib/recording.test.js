import { describe, expect, it } from 'vitest';
import { formatRecordingDuration, selectRecordingMime } from './recording.js';

describe('voice recording helpers', () => {
  it('chooses the first supported high-quality audio format', () => {
    const supported = new Set(['audio/webm;codecs=opus', 'audio/webm']);
    expect(selectRecordingMime((type) => supported.has(type))).toBe('audio/webm;codecs=opus');
  });

  it('falls back to the browser default when no listed MIME type is supported', () => {
    expect(selectRecordingMime(() => false)).toBe('');
  });

  it('formats a recorder timer without fractional seconds', () => {
    expect(formatRecordingDuration(4.9)).toBe('00:04');
    expect(formatRecordingDuration(65.2)).toBe('01:05');
  });
});
