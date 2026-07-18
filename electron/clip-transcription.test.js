import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const {
  WHISPER_MODEL,
  buildAudioExtractionArgs,
  cleanTranscriptResult,
  createMonotonicProgressReporter,
  languageCodeForLocale,
  normalizeTranscriptionRequest,
  normalizeTranscriptWords,
  pcmBufferToFloat32Array,
  transcriberSessionOptions,
  transcriptionInferenceOptions,
} = require('./clip-transcription.cjs');

describe('clip transcription engine', () => {
  it('uses the ONNX export that includes timestamp attention outputs', () => {
    expect(WHISPER_MODEL).toBe('onnx-community/whisper-base_timestamped');
  });

  it('accepts only authorized media paths and clamps the selected source range', () => {
    const allowedPaths = new Set(['/tmp/voice.webm']);
    expect(normalizeTranscriptionRequest({
      filePath: '/tmp/voice.webm',
      startTime: -2,
      endTime: 5.25,
      language: 'en-IN',
    }, allowedPaths)).toEqual({
      filePath: '/tmp/voice.webm',
      startTime: 0,
      endTime: 5.25,
      language: 'en-IN',
    });
    expect(() => normalizeTranscriptionRequest({ filePath: '/tmp/private.wav' }, allowedPaths))
      .toThrow('not authorized');
  });

  it('builds FFmpeg arguments for mono 16 kHz floating-point clip audio', () => {
    expect(buildAudioExtractionArgs({
      filePath: '/tmp/voice.webm',
      startTime: 1.5,
      endTime: 4,
    })).toEqual([
      '-v', 'error', '-ss', '1.5', '-t', '2.5', '-i', '/tmp/voice.webm',
      '-vn', '-ac', '1', '-ar', '16000', '-f', 'f32le', '-acodec', 'pcm_f32le', 'pipe:1',
    ]);
  });

  it('turns little-endian PCM bytes into the Float32Array Whisper expects', () => {
    const buffer = Buffer.alloc(8);
    buffer.writeFloatLE(0.25, 0);
    buffer.writeFloatLE(-0.5, 4);
    expect(Array.from(pcmBufferToFloat32Array(buffer))).toEqual([0.25, -0.5]);
  });

  it('maps UI locales to Whisper language codes and cleans its output', () => {
    expect(languageCodeForLocale('hi-IN')).toBe('hi');
    expect(languageCodeForLocale('en-US')).toBe('en');
    expect(cleanTranscriptResult({ text: '  hello   from Pixelwave  ' })).toBe('hello from Pixelwave');
  });

  it('suppresses duplicate model progress events before they reach the renderer', () => {
    const updates = [];
    const report = createMonotonicProgressReporter((status) => updates.push(status), 0.01);
    report({ stage: 'loading-model', progress: 0.12 });
    report({ stage: 'loading-model', progress: 0.1201 });
    report({ stage: 'loading-model', progress: 0.25 });
    report({ stage: 'loading-model', progress: 0.25 });
    report({ stage: 'transcribing', progress: 0.65 });
    expect(updates).toEqual([
      { stage: 'loading-model', progress: 0.12 },
      { stage: 'loading-model', progress: 0.25 },
      { stage: 'transcribing', progress: 0.65 },
    ]);
  });

  it('normalizes Whisper word chunks into durable timestamp entries', () => {
    expect(normalizeTranscriptWords([
      { text: ' Hi', timestamp: [0, 0.42] },
      { text: '  my ', timestamp: [0.42, 0.71] },
      { text: '', timestamp: [0.71, 0.8] },
      { text: 'name', timestamp: [0.8, null] },
    ])).toEqual([
      { text: 'Hi', start: 0, end: 0.42 },
      { text: 'my', start: 0.42, end: 0.71 },
      { text: 'name', start: 0.8, end: 1.15 },
    ]);
  });

  it('requests word timestamps from multilingual Whisper inference', () => {
    expect(transcriptionInferenceOptions('hi-IN')).toMatchObject({
      language: 'hi',
      task: 'transcribe',
      return_timestamps: 'word',
    });
  });

  it('keeps Whisper from starving video playback of CPU time', () => {
    expect(transcriberSessionOptions()).toEqual({
      intraOpNumThreads: 1,
      interOpNumThreads: 1,
    });
  });
});
