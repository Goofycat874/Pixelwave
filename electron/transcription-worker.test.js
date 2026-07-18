import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
let handleTranscriptionMessage;
try {
  ({ handleTranscriptionMessage } = require('./transcription-worker.cjs'));
} catch {
  handleTranscriptionMessage = undefined;
}

describe('transcription utility worker', () => {
  it('executes the engine and sends progress and result messages to its parent', async () => {
    expect(typeof handleTranscriptionMessage).toBe('function');

    const postMessage = vi.fn();
    const transcribe = vi.fn(async (_request, options) => {
      options.onStatus({ stage: 'extracting', progress: 0.05 });
      return { text: 'hello', words: [{ text: 'hello', start: 0, end: 0.4 }] };
    });
    const message = {
      id: 'request-1',
      type: 'transcribe',
      request: { filePath: '/tmp/video.mp4', startTime: 0, endTime: 2 },
      ffmpegPath: '/app/ffmpeg',
      cacheDir: '/tmp/speech-models',
    };

    await handleTranscriptionMessage(message, { transcribe, postMessage });

    expect(transcribe).toHaveBeenCalledWith(message.request, expect.objectContaining({
      authorizedPaths: new Set(['/tmp/video.mp4']),
      ffmpegPath: '/app/ffmpeg',
      cacheDir: '/tmp/speech-models',
    }));
    expect(postMessage).toHaveBeenNthCalledWith(1, {
      id: 'request-1',
      type: 'progress',
      status: { stage: 'extracting', progress: 0.05 },
    });
    expect(postMessage).toHaveBeenNthCalledWith(2, {
      id: 'request-1',
      type: 'result',
      result: { text: 'hello', words: [{ text: 'hello', start: 0, end: 0.4 }] },
    });
  });

  it('returns engine errors without taking down the utility process', async () => {
    const postMessage = vi.fn();
    const transcribe = vi.fn(async () => {
      throw new Error('No spoken words were detected.');
    });

    await handleTranscriptionMessage({
      id: 'request-2',
      type: 'transcribe',
      request: { filePath: '/tmp/silent.mp4' },
    }, { transcribe, postMessage });

    expect(postMessage).toHaveBeenCalledWith({
      id: 'request-2',
      type: 'error',
      error: 'No spoken words were detected.',
    });
  });
});
