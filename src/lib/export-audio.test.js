import { describe, expect, it } from 'vitest';

let audioExport = {};
try {
  audioExport = await import('./export-audio.js');
} catch {
  audioExport = {};
}

describe('timeline audio export', () => {
  it('keeps the audio mix as long as the full visual timeline', () => {
    expect(typeof audioExport.audioRenderDuration).toBe('function');
    expect(audioExport.audioRenderDuration({ clips: [
      { kind: 'audio', start: 0, duration: 2 },
      { kind: 'image', start: 0, duration: 8 },
    ] })).toBe(8);
  });

  it('maps clip timing, source range, speed, and volume into an offline schedule', () => {
    expect(typeof audioExport.clipAudioSchedule).toBe('function');
    expect(audioExport.clipAudioSchedule({
      start: 3,
      duration: 4,
      sourceStart: 2,
      sourceEnd: 10,
      speed: 2,
      effects: { volume: 75 },
    })).toEqual({
      when: 3,
      offset: 2,
      sourceDuration: 8,
      playbackRate: 2,
      gain: 0.75,
      localStart: 0,
    });
  });

  it('schedules only the part of a clip inside an export range', () => {
    expect(audioExport.clipAudioSchedule({
      start: 3,
      duration: 4,
      sourceStart: 2,
      sourceEnd: 10,
      speed: 2,
      effects: { volume: 100 },
    }, { start: 4, end: 6 })).toMatchObject({ when: 0, offset: 4, sourceDuration: 4, localStart: 1 });
  });

  it('samples fades and volume keyframes into a gain curve', () => {
    const clip = { duration: 2, fadeIn: 1, effects: { volume: 50 }, keyframes: {} };
    expect(audioExport.clipNeedsGainCurve(clip)).toBe(true);
    expect(audioExport.clipNeedsGainCurve({ effects: { volume: 50 } })).toBe(false);
    const curve = audioExport.clipGainCurve(clip, 0, 2, 2);
    expect(Array.from(curve)).toEqual([0, 0.25, 0.5, 0.5, 0.5]);
  });

  it('serializes stereo samples as a valid 16-bit PCM WAV file', () => {
    expect(typeof audioExport.audioBufferToWav).toBe('function');
    const wav = audioExport.audioBufferToWav({
      numberOfChannels: 2,
      length: 2,
      sampleRate: 48_000,
      getChannelData: (channel) => channel === 0
        ? Float32Array.from([-1, 0.5])
        : Float32Array.from([1, -0.5]),
    });
    const bytes = new Uint8Array(wav);
    const view = new DataView(wav);
    expect(new TextDecoder().decode(bytes.slice(0, 4))).toBe('RIFF');
    expect(new TextDecoder().decode(bytes.slice(8, 12))).toBe('WAVE');
    expect(view.getUint16(22, true)).toBe(2);
    expect(view.getUint32(24, true)).toBe(48_000);
    expect(view.getUint32(40, true)).toBe(8);
    expect(bytes.byteLength).toBe(52);
  });
});
