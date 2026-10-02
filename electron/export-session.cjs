const QUALITY_CRF = { high: 16, standard: 20, small: 26 };

function exportCrf(quality, format) {
  const crf = QUALITY_CRF[quality] ?? QUALITY_CRF.standard;
  // VP9 needs a higher CRF than H.264 for a similar file size.
  return format === 'webm' ? crf + 12 : crf;
}

function buildFrameExportArgs({ format, frameRate, width, height, quality = 'standard', audioPath, outputPath }) {
  const args = [
    '-y',
    '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${width}x${height}`, '-framerate', String(frameRate || 30), '-i', 'pipe:0',
  ];

  if (format === 'gif') {
    args.push(
      '-filter_complex', '[0:v]split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle',
      '-loop', '0', '-f', 'gif', outputPath,
    );
    return args;
  }

  if (audioPath) {
    args.push('-i', audioPath, '-map', '0:v:0', '-map', '1:a:0');
  }

  if (format === 'webm') {
    args.push('-c:v', 'libvpx-vp9', '-crf', String(exportCrf(quality, format)), '-b:v', '0', '-row-mt', '1', '-deadline', 'good', '-cpu-used', '4', '-pix_fmt', 'yuv420p');
    if (audioPath) args.push('-c:a', 'libopus', '-b:a', '192k', '-shortest');
    else args.push('-an');
    args.push('-f', 'webm', outputPath);
    return args;
  }

  args.push('-c:v', 'libx264', '-preset', 'medium', '-crf', String(exportCrf(quality, format)), '-pix_fmt', 'yuv420p');
  if (audioPath) args.push('-c:a', 'aac', '-b:a', '192k', '-shortest');
  else args.push('-an');
  args.push('-movflags', '+faststart', '-f', format === 'mov' ? 'mov' : 'mp4', outputPath);
  return args;
}

function buildAudioExportArgs({ inputPath, outputPath, format }) {
  if (format === 'mp3') return ['-y', '-i', inputPath, '-c:a', 'libmp3lame', '-b:a', '256k', outputPath];
  return ['-y', '-i', inputPath, '-c:a', 'pcm_s16le', outputPath];
}

function expectedFrameBytes(width, height) {
  return Math.max(0, Math.round(Number(width) || 0)) * Math.max(0, Math.round(Number(height) || 0)) * 4;
}

function writeFrame(stream, bytes) {
  return new Promise((resolve, reject) => {
    if (!stream || stream.destroyed || stream.writableEnded) {
      reject(new Error('FFmpeg is no longer accepting video frames.'));
      return;
    }
    const onError = (error) => {
      stream.off('drain', onDrain);
      reject(error);
    };
    const onDrain = () => {
      stream.off('error', onError);
      resolve();
    };
    stream.once('error', onError);
    if (stream.write(Buffer.from(bytes))) {
      stream.off('error', onError);
      resolve();
    } else {
      stream.once('drain', onDrain);
    }
  });
}

module.exports = { buildAudioExportArgs, buildFrameExportArgs, expectedFrameBytes, exportCrf, writeFrame };
