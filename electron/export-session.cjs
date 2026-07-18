function buildFrameExportArgs({ format, frameRate, audioPath, outputPath }) {
  const args = [
    '-y',
    '-f', 'image2pipe', '-framerate', String(frameRate || 30), '-vcodec', 'png', '-i', 'pipe:0',
  ];
  if (audioPath) {
    args.push('-i', audioPath, '-map', '0:v:0', '-map', '1:a:0');
  }

  if (format === 'webm') {
    args.push('-c:v', 'libvpx-vp9', '-crf', '24', '-b:v', '0', '-pix_fmt', 'yuv420p');
    if (audioPath) args.push('-c:a', 'libopus', '-b:a', '192k', '-shortest');
    else args.push('-an');
    args.push('-f', 'webm', outputPath);
    return args;
  }

  args.push('-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p');
  if (audioPath) args.push('-c:a', 'aac', '-b:a', '192k', '-shortest');
  else args.push('-an');
  args.push('-movflags', '+faststart', '-f', format === 'mov' ? 'mov' : 'mp4', outputPath);
  return args;
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

module.exports = { buildFrameExportArgs, writeFrame };
