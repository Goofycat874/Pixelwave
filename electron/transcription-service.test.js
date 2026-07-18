import { EventEmitter } from 'node:events';
import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
let createTranscriptionService;
let createTranscriptionIpcHandler;
try {
  ({ createTranscriptionService, createTranscriptionIpcHandler } = require('./transcription-service.cjs'));
} catch {
  createTranscriptionService = undefined;
  createTranscriptionIpcHandler = undefined;
}

class FakeUtilityProcess extends EventEmitter {
  constructor() {
    super();
    this.postMessage = vi.fn();
    this.kill = vi.fn();
  }
}

describe('transcription background service', () => {
  it('runs transcription through a utility process and forwards its progress', async () => {
    expect(typeof createTranscriptionService).toBe('function');

    const child = new FakeUtilityProcess();
    const fork = vi.fn(() => child);
    const onStatus = vi.fn();
    const service = createTranscriptionService({
      fork,
      workerPath: '/app/transcription-worker.cjs',
      ffmpegPath: '/app/ffmpeg',
      cacheDir: '/tmp/speech-models',
    });

    const request = { filePath: '/tmp/video.mp4', startTime: 0, endTime: 10 };
    const pending = service.transcribe(request, { onStatus });
    const outbound = child.postMessage.mock.calls[0][0];

    child.emit('message', { id: outbound.id, type: 'progress', status: { stage: 'transcribing', progress: 0.65 } });
    child.emit('message', { id: outbound.id, type: 'result', result: { text: 'hello', words: [] } });

    await expect(pending).resolves.toEqual({ text: 'hello', words: [] });
    expect(fork).toHaveBeenCalledOnce();
    expect(outbound).toMatchObject({
      type: 'transcribe',
      request,
      ffmpegPath: '/app/ffmpeg',
      cacheDir: '/tmp/speech-models',
    });
    expect(onStatus).toHaveBeenCalledWith({ stage: 'transcribing', progress: 0.65 });
  });

  it('forwards utility-process progress to the requesting renderer', async () => {
    expect(typeof createTranscriptionIpcHandler).toBe('function');

    const service = {
      transcribe: vi.fn(async (_request, { onStatus }) => {
        onStatus({ stage: 'extracting', progress: 0.05 });
        return { text: 'hello', words: [] };
      }),
    };
    const sender = { isDestroyed: () => false, send: vi.fn() };
    const handler = createTranscriptionIpcHandler({
      service,
      authorizedPaths: new Set(['/tmp/video.mp4']),
    });

    await expect(handler({ sender }, {
      requestId: 'renderer-1',
      filePath: '/tmp/video.mp4',
      startTime: 0,
      endTime: 10,
    })).resolves.toEqual({ text: 'hello', words: [] });
    expect(sender.send).toHaveBeenCalledWith('transcription:progress', {
      stage: 'extracting',
      progress: 0.05,
      requestId: 'renderer-1',
    });
  });

  it('rejects media paths that were not imported into Pixelwave', async () => {
    const service = { transcribe: vi.fn() };
    const handler = createTranscriptionIpcHandler({
      service,
      authorizedPaths: new Set(['/tmp/imported.mp4']),
    });

    await expect(handler({ sender: { isDestroyed: () => false, send: vi.fn() } }, {
      filePath: '/tmp/private.mp4',
    })).rejects.toThrow('not authorized');
    expect(service.transcribe).not.toHaveBeenCalled();
  });
});
