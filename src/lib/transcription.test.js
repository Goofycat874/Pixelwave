import { describe, expect, it, vi } from 'vitest';
import {
  activeTranscriptWord,
  buildClipTranscriptionRequest,
  captionBoxEnabled,
  captionFontStack,
  captionTextForClip,
  clipTranscriptionStatusMessage,
  ensureOnDeviceRecognition,
  extractRecognitionUpdate,
  getSpeechRecognitionConstructor,
  joinTranscript,
  loadCustomCaptionFont,
  speechRecognitionErrorMessage,
} from './transcription.js';

describe('voice transcription helpers', () => {
  it('detects both standard and Chromium-prefixed speech recognition', () => {
    class StandardRecognition {}
    class ChromiumRecognition {}
    expect(getSpeechRecognitionConstructor({ SpeechRecognition: StandardRecognition })).toBe(StandardRecognition);
    expect(getSpeechRecognitionConstructor({ webkitSpeechRecognition: ChromiumRecognition })).toBe(ChromiumRecognition);
    expect(getSpeechRecognitionConstructor({})).toBeNull();
  });

  it('separates final and interim recognition text', () => {
    const update = extractRecognitionUpdate({
      resultIndex: 0,
      results: [
        { 0: { transcript: '  hello world ' }, isFinal: true },
        { 0: { transcript: ' from Pixelwave ' }, isFinal: false },
      ],
    });
    expect(update).toEqual({ finalText: 'hello world', interimText: 'from Pixelwave' });
  });

  it('joins recognition segments without duplicating whitespace', () => {
    expect(joinTranscript('A first line. ', '  A second line.')).toBe('A first line. A second line.');
    expect(joinTranscript('', 'New words')).toBe('New words');
  });

  it('turns recognition failures into actionable messages', () => {
    expect(speechRecognitionErrorMessage('not-allowed')).toContain('Microphone access');
    expect(speechRecognitionErrorMessage('no-speech')).toContain('did not hear');
    expect(speechRecognitionErrorMessage('network')).toContain('on-device');
  });

  it('uses an already installed on-device language pack', async () => {
    const Recognition = { available: vi.fn().mockResolvedValue('available') };
    await expect(ensureOnDeviceRecognition(Recognition, 'en-IN')).resolves.toEqual({ ready: true, installed: false });
    expect(Recognition.available).toHaveBeenCalledWith({ langs: ['en-IN'], processLocally: true });
  });

  it('installs a downloadable on-device language pack', async () => {
    const Recognition = {
      available: vi.fn().mockResolvedValue('downloadable'),
      install: vi.fn().mockResolvedValue(true),
    };
    await expect(ensureOnDeviceRecognition(Recognition, 'en-US')).resolves.toEqual({ ready: true, installed: true });
    expect(Recognition.install).toHaveBeenCalledWith({ langs: ['en-US'], processLocally: true });
  });

  it('reports when this Chromium build has no local recognizer', async () => {
    await expect(ensureOnDeviceRecognition({}, 'en-US')).resolves.toEqual({ ready: false, reason: 'unsupported' });
  });

  it('never calls the crash-prone on-device API inside Electron', async () => {
    const Recognition = {
      available: vi.fn().mockResolvedValue('available'),
      install: vi.fn().mockResolvedValue(true),
    };
    const runtime = { navigator: { userAgent: 'Mozilla/5.0 Electron/43.1.0' } };

    await expect(ensureOnDeviceRecognition(Recognition, 'en-US', runtime)).resolves.toEqual({
      ready: false,
      reason: 'electron-unsafe',
    });
    expect(Recognition.available).not.toHaveBeenCalled();
    expect(Recognition.install).not.toHaveBeenCalled();
  });

  it('builds a transcription request from the selected clip and its media file', () => {
    const clip = {
      assetId: 'media-1',
      kind: 'audio',
      sourceStart: 1.25,
      sourceEnd: 4.75,
      transcript: { language: 'hi-IN' },
    };
    const asset = { id: 'media-1', kind: 'audio', path: '/tmp/voice-take.webm' };

    expect(buildClipTranscriptionRequest(clip, asset)).toEqual({
      filePath: '/tmp/voice-take.webm',
      startTime: 1.25,
      endTime: 4.75,
      language: 'hi-IN',
    });
  });

  it('rejects clips that do not have a readable audio source', () => {
    expect(() => buildClipTranscriptionRequest(
      { kind: 'audio', sourceStart: 0, sourceEnd: 3 },
      { kind: 'audio' },
    )).toThrow('source file');
    expect(() => buildClipTranscriptionRequest(
      { kind: 'image', sourceStart: 0, sourceEnd: 3 },
      { kind: 'image', path: '/tmp/photo.png' },
    )).toThrow('Audio and video');
  });

  it('describes each clip transcription stage clearly', () => {
    expect(clipTranscriptionStatusMessage('extracting', 0.05)).toBe('Reading the selected clip’s audio…');
    expect(clipTranscriptionStatusMessage('loading-model', 0.42)).toBe('Downloading the local speech model… 42%');
    expect(clipTranscriptionStatusMessage('transcribing', 0.65)).toBe('Turning this clip’s speech into text…');
  });

  it('shows one timestamped word at a time and respects playback speed', () => {
    const words = [
      { text: 'Hi', start: 0, end: 0.32 },
      { text: 'my', start: 0.5, end: 0.72 },
      { text: 'name', start: 0.8, end: 1.2 },
    ];
    expect(activeTranscriptWord(words, 0.2, 1)).toBe('Hi');
    expect(activeTranscriptWord(words, 0.55, 1)).toBe('my');
    expect(activeTranscriptWord(words, 0.3, 2)).toBe('my');
    expect(activeTranscriptWord(words, 2, 1)).toBe('');
  });

  it('resolves timed captions from timeline time with a legacy full-text fallback', () => {
    const timedClip = {
      start: 4,
      duration: 3,
      speed: 1,
      transcript: {
        text: 'Hi my name',
        showAsCaptions: true,
        words: [{ text: 'Hi', start: 0, end: 0.3 }, { text: 'my', start: 0.4, end: 0.7 }],
      },
    };
    expect(captionTextForClip(timedClip, 4.1)).toBe('Hi');
    expect(captionTextForClip(timedClip, 4.5)).toBe('my');
    expect(captionTextForClip({ ...timedClip, transcript: { text: 'Legacy caption', showAsCaptions: true } }, 4.5)).toBe('Legacy caption');
  });

  it('uses a safe Google Font stack for captions', () => {
    expect(captionFontStack('Bebas Neue')).toBe("'Bebas Neue', sans-serif");
    expect(captionFontStack('Made Up Font')).toBe("'Outfit', sans-serif");
  });

  it('uses an imported custom font only when it matches the selected family', () => {
    const customFont = { family: 'Pixelwave Custom', src: 'pixelwave-media://font' };
    expect(captionFontStack('Pixelwave Custom', customFont)).toBe("'Pixelwave Custom', sans-serif");
    expect(captionFontStack('Made Up Font', customFont)).toBe("'Outfit', sans-serif");
  });

  it('registers an imported font with the browser font set', async () => {
    const loadedFace = { family: 'Pixelwave Custom' };
    const load = vi.fn().mockResolvedValue(loadedFace);
    const FontFaceCtor = vi.fn(() => ({ load }));
    const fonts = { add: vi.fn() };

    await expect(loadCustomCaptionFont({
      family: 'Pixelwave Custom',
      src: 'pixelwave-media://local/font.woff2',
    }, { FontFaceCtor, fonts })).resolves.toBe(loadedFace);
    expect(FontFaceCtor).toHaveBeenCalledWith('Pixelwave Custom', 'url("pixelwave-media://local/font.woff2")');
    expect(fonts.add).toHaveBeenCalledWith(loadedFace);
  });

  it('shows the dark caption box unless the user turns it off', () => {
    expect(captionBoxEnabled({})).toBe(true);
    expect(captionBoxEnabled({ backgroundEnabled: false })).toBe(false);
  });
});
