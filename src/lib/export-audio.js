function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function clipAudioSchedule(clip = {}) {
  const playbackRate = clamp(Number(clip.speed) || 1, 0.25, 4);
  const available = Math.max(0, (Number(clip.sourceEnd) || 0) - (Number(clip.sourceStart) || 0));
  return {
    when: Math.max(0, Number(clip.start) || 0),
    offset: Math.max(0, Number(clip.sourceStart) || 0),
    sourceDuration: Math.min(available, Math.max(0, Number(clip.duration) || 0) * playbackRate),
    playbackRate,
    gain: clamp((clip.effects?.volume ?? 100) / 100, 0, 1.5),
  };
}

export function audioRenderDuration(project = {}) {
  return Math.max(...(project.clips || []).map((clip) => clip.start + clip.duration), 0);
}

function writeAscii(view, offset, value) {
  for (let index = 0; index < value.length; index += 1) {
    view.setUint8(offset + index, value.charCodeAt(index));
  }
}

export function audioBufferToWav(audioBuffer) {
  const channels = Math.max(1, Math.min(2, Number(audioBuffer.numberOfChannels) || 1));
  const frames = Math.max(0, Number(audioBuffer.length) || 0);
  const sampleRate = Math.max(8_000, Number(audioBuffer.sampleRate) || 48_000);
  const bytesPerSample = 2;
  const dataBytes = frames * channels * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataBytes);
  const view = new DataView(buffer);
  writeAscii(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataBytes, true);
  writeAscii(view, 8, 'WAVE');
  writeAscii(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * channels * bytesPerSample, true);
  view.setUint16(32, channels * bytesPerSample, true);
  view.setUint16(34, 16, true);
  writeAscii(view, 36, 'data');
  view.setUint32(40, dataBytes, true);

  const channelData = Array.from({ length: channels }, (_, channel) => audioBuffer.getChannelData(channel));
  let offset = 44;
  for (let frame = 0; frame < frames; frame += 1) {
    for (let channel = 0; channel < channels; channel += 1) {
      const sample = clamp(channelData[channel][frame] || 0, -1, 1);
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      offset += bytesPerSample;
    }
  }
  return buffer;
}

export async function renderTimelineAudio(project) {
  const clips = (project.clips || []).filter((clip) => clip.kind !== 'image' && (clip.effects?.volume ?? 100) > 0);
  if (!clips.length) return null;
  const duration = audioRenderDuration(project);
  const OfflineContext = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  if (!OfflineContext) throw new Error('This system cannot render timeline audio for export.');
  const sampleRate = 48_000;
  const context = new OfflineContext(2, Math.max(1, Math.ceil(duration * sampleRate)), sampleRate);
  const assetById = new Map((project.media || []).map((asset) => [asset.id, asset]));
  const decodedByAsset = new Map();

  async function decodedAsset(asset) {
    if (!decodedByAsset.has(asset.id)) {
      decodedByAsset.set(asset.id, (async () => {
        const response = await fetch(asset.src);
        if (!response.ok) throw new Error(`Could not read audio from ${asset.name}.`);
        return context.decodeAudioData(await response.arrayBuffer());
      })());
    }
    return decodedByAsset.get(asset.id);
  }

  for (const clip of clips) {
    const asset = assetById.get(clip.assetId);
    if (!asset) throw new Error(`Missing media for ${clip.name}.`);
    let buffer;
    try {
      buffer = await decodedAsset(asset);
    } catch (error) {
      if (asset.kind === 'video') continue;
      throw error;
    }
    const schedule = clipAudioSchedule(clip);
    const sourceDuration = Math.min(schedule.sourceDuration, Math.max(0, buffer.duration - schedule.offset));
    if (sourceDuration <= 0) continue;
    const source = context.createBufferSource();
    const gain = context.createGain();
    source.buffer = buffer;
    source.playbackRate.value = schedule.playbackRate;
    gain.gain.value = schedule.gain;
    source.connect(gain).connect(context.destination);
    source.start(schedule.when, schedule.offset, sourceDuration);
  }

  return audioBufferToWav(await context.startRendering());
}
