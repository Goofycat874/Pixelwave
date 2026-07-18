import { EventEmitter } from 'node:events';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
let buildFrameExportArgs;
let writeFrame;
try {
  ({ buildFrameExportArgs, writeFrame } = require('./export-session.cjs'));
} catch {
  buildFrameExportArgs = undefined;
  writeFrame = undefined;
}

describe('direct FFmpeg frame export', () => {
  it('builds an H.264 MP4 command from PNG stdin and optional WAV audio', () => {
    expect(typeof buildFrameExportArgs).toBe('function');
    const args = buildFrameExportArgs({
      format: 'mp4',
      frameRate: 30,
      audioPath: '/tmp/mix.wav',
      outputPath: '/tmp/cut.mp4',
    });

    expect(args).toEqual([
      '-y',
      '-f', 'image2pipe', '-framerate', '30', '-vcodec', 'png', '-i', 'pipe:0',
      '-i', '/tmp/mix.wav',
      '-map', '0:v:0', '-map', '1:a:0',
      '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-b:a', '192k', '-shortest',
      '-movflags', '+faststart', '-f', 'mp4', '/tmp/cut.mp4',
    ]);
  });

  it('waits for stdin drain when FFmpeg applies backpressure', async () => {
    expect(typeof writeFrame).toBe('function');
    const stream = new EventEmitter();
    stream.write = () => false;
    const writing = writeFrame(stream, Uint8Array.from([1, 2, 3]));
    let settled = false;
    writing.then(() => { settled = true; });
    await Promise.resolve();
    expect(settled).toBe(false);
    stream.emit('drain');
    await expect(writing).resolves.toBeUndefined();
  });
});
