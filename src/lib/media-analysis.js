// Background analysis for timeline visuals: audio waveforms and video filmstrips.
// Results are cached in memory per asset and recomputed after a project is reopened.

const MAX_WAVEFORM_SECONDS = 60 * 45;
const PEAKS_PER_SECOND = 60;
const store = new Map();
const listeners = new Set();
let queue = Promise.resolve();

function emit() {
  for (const listener of listeners) listener();
}

function setEntry(key, value) {
  store.set(key, value);
  emit();
}

export function subscribeAnalysis(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getAnalysis(key) {
  return store.get(key) || null;
}

function enqueue(key, task) {
  if (store.has(key)) return;
  setEntry(key, { status: 'pending' });
  queue = queue.then(task).then(
    (data) => setEntry(key, { status: 'ready', ...data }),
    () => setEntry(key, { status: 'failed' }),
  );
}

export function computePeaks(channels, sampleRate, peaksPerSecond = PEAKS_PER_SECOND) {
  const length = channels[0]?.length || 0;
  const bucket = Math.max(1, Math.floor(sampleRate / peaksPerSecond));
  const count = Math.ceil(length / bucket);
  const peaks = new Float32Array(count);
  for (let index = 0; index < count; index += 1) {
    let max = 0;
    const start = index * bucket;
    const end = Math.min(length, start + bucket);
    for (const channel of channels) {
      for (let sample = start; sample < end; sample += 4) {
        const value = Math.abs(channel[sample]);
        if (value > max) max = value;
      }
    }
    peaks[index] = max;
  }
  return peaks;
}

export function waveformKey(asset) {
  return `wave:${asset.id}`;
}

export function filmstripKey(asset) {
  return `film:${asset.id}`;
}

export function requestWaveform(asset) {
  if (!asset?.src || asset.kind === 'image' || (asset.duration || 0) > MAX_WAVEFORM_SECONDS) return;
  enqueue(waveformKey(asset), async () => {
    const response = await fetch(asset.src);
    if (!response.ok) throw new Error('unreadable');
    const Context = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    const context = new Context(1, 1, 44_100);
    const buffer = await context.decodeAudioData(await response.arrayBuffer());
    const channels = Array.from({ length: Math.min(2, buffer.numberOfChannels) }, (_, index) => buffer.getChannelData(index));
    const peaks = computePeaks(channels, buffer.sampleRate);
    let loudest = 0;
    for (const value of peaks) if (value > loudest) loudest = value;
    return { peaks, peaksPerSecond: PEAKS_PER_SECOND, normalize: loudest > 0 ? 1 / loudest : 1 };
  });
}

function seek(video, time) {
  return new Promise((resolve, reject) => {
    const done = () => { cleanup(); resolve(); };
    const fail = () => { cleanup(); reject(new Error('seek failed')); };
    const cleanup = () => {
      video.removeEventListener('seeked', done);
      video.removeEventListener('error', fail);
    };
    video.addEventListener('seeked', done, { once: true });
    video.addEventListener('error', fail, { once: true });
    video.currentTime = time;
  });
}

export function requestFilmstrip(asset) {
  if (!asset?.src || asset.kind !== 'video') return;
  enqueue(filmstripKey(asset), async () => {
    const video = document.createElement('video');
    video.muted = true;
    video.preload = 'auto';
    video.crossOrigin = 'anonymous';
    video.src = asset.src;
    await new Promise((resolve, reject) => {
      video.addEventListener('loadeddata', resolve, { once: true });
      video.addEventListener('error', reject, { once: true });
    });
    const duration = Number.isFinite(video.duration) ? video.duration : asset.duration || 1;
    const count = Math.max(6, Math.min(48, Math.round(duration / 1.5)));
    const height = 72;
    const width = Math.max(32, Math.round(height * ((video.videoWidth || 16) / (video.videoHeight || 9))));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    const times = [];
    const frames = [];
    for (let index = 0; index < count; index += 1) {
      const time = Math.min(duration - 0.05, ((index + 0.5) / count) * duration);
      await seek(video, Math.max(0, time));
      context.drawImage(video, 0, 0, width, height);
      times.push(time);
      frames.push(canvas.toDataURL('image/jpeg', 0.72));
    }
    video.removeAttribute('src');
    video.load();
    return { times, frames, aspect: width / height };
  });
}

export function nearestFilmstripFrame(filmstrip, sourceTime) {
  if (!filmstrip?.frames?.length) return null;
  let best = 0;
  for (let index = 1; index < filmstrip.times.length; index += 1) {
    if (Math.abs(filmstrip.times[index] - sourceTime) < Math.abs(filmstrip.times[best] - sourceTime)) best = index;
  }
  return filmstrip.frames[best];
}

export function waveformPath(waveform, sourceStart, sourceEnd, points = 400) {
  if (!waveform?.peaks?.length || sourceEnd <= sourceStart) return '';
  const { peaks, peaksPerSecond, normalize = 1 } = waveform;
  const first = Math.max(0, Math.floor(sourceStart * peaksPerSecond));
  const last = Math.min(peaks.length, Math.ceil(sourceEnd * peaksPerSecond));
  const span = Math.max(1, last - first);
  const count = Math.max(2, Math.min(points, span));
  const step = span / count;
  const top = [];
  for (let index = 0; index < count; index += 1) {
    let max = 0;
    const from = first + Math.floor(index * step);
    const to = Math.max(from + 1, first + Math.floor((index + 1) * step));
    for (let peak = from; peak < to && peak < peaks.length; peak += 1) max = Math.max(max, peaks[peak]);
    const amplitude = Math.min(1, Math.sqrt(max * normalize)) * 48;
    top.push([((index + 0.5) / count) * 1000, 50 - amplitude]);
  }
  const bottom = [...top].reverse().map(([x, y]) => [x, 100 - y]);
  return `M0 50 ${top.map(([x, y]) => `L${x.toFixed(1)} ${y.toFixed(1)}`).join(' ')} L1000 50 ${bottom.map(([x, y]) => `L${x.toFixed(1)} ${y.toFixed(1)}`).join(' ')} Z`;
}
