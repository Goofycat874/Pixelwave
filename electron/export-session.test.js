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
  it('builds an H.264 MP4 command from raw RGBA stdin and optional WAV audio', () => {
    expect(typeof buildFrameExportArgs).toBe('function');
    const args = buildFrameExportArgs({
      format: 'mp4',
      frameRate: 30,
      width: 1920,
      height: 1080,
      quality: 'high',
      audioPath: '/tmp/mix.wav',
      outputPath: '/tmp/cut.mp4',
    });

    expect(args).toEqual([
      '-y',
      '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', '1920x1080', '-framerate', '30', '-i', 'pipe:0',
      '-i', '/tmp/mix.wav',
      '-map', '0:v:0', '-map', '1:a:0',
      '-c:v', 'libx264', '-preset', 'medium', '-crf', '16', '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-b:a', '192k', '-shortest',
      '-movflags', '+faststart', '-f', 'mp4', '/tmp/cut.mp4',
    ]);
  });

  it('builds a palette-optimised looping GIF without audio', () => {
    const args = buildFrameExportArgs({ format: 'gif', frameRate: 15, width: 480, height: 270, audioPath: '/tmp/mix.wav', outputPath: '/tmp/loop.gif' });
    expect(args).toContain('-filter_complex');
    expect(args).not.toContain('/tmp/mix.wav');
    expect(args.slice(-5)).toEqual(['-loop', '0', '-f', 'gif', '/tmp/loop.gif']);
  });

  it('maps quality presets to encoder settings and validates frame sizes', () => {
    const session = require('./export-session.cjs');
    expect(session.exportCrf('small', 'mp4')).toBe(26);
    expect(session.exportCrf('standard', 'webm')).toBe(32);
    expect(session.expectedFrameBytes(4, 2)).toBe(32);
    expect(session.buildAudioExportArgs({ inputPath: '/a.wav', outputPath: '/b.mp3', format: 'mp3' })).toContain('libmp3lame');
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
