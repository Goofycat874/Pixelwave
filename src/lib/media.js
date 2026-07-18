export function formatTime(seconds, precise = false) {
  const safe = Math.max(0, Number.isFinite(seconds) ? seconds : 0);
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const wholeSeconds = Math.floor(safe % 60);
  const frames = Math.floor((safe % 1) * 30);
  const prefix = hours ? `${String(hours).padStart(2, '0')}:` : '';
  const base = `${prefix}${String(minutes).padStart(2, '0')}:${String(wholeSeconds).padStart(2, '0')}`;
  return precise ? `${base}:${String(frames).padStart(2, '0')}` : base;
}

export function configureMediaElement(element, src) {
  element.crossOrigin = 'anonymous';
  element.src = src;
  return element;
}

function waitFor(element, event, errorEvent = 'error') {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      element.removeEventListener(event, onReady);
      element.removeEventListener(errorEvent, onError);
    };
    const onReady = () => { cleanup(); resolve(); };
    const onError = () => { cleanup(); reject(new Error('The media file could not be read.')); };
    element.addEventListener(event, onReady, { once: true });
    element.addEventListener(errorEvent, onError, { once: true });
  });
}

export async function probeMedia(item) {
  if (item.kind === 'image') {
    const image = new Image();
    configureMediaElement(image, item.src);
    await waitFor(image, 'load');
    return { ...item, duration: 5, width: image.naturalWidth, height: image.naturalHeight, thumbnail: item.src };
  }

  const media = document.createElement(item.kind === 'audio' ? 'audio' : 'video');
  media.preload = 'metadata';
  configureMediaElement(media, item.src);
  await waitFor(media, 'loadedmetadata');
  const result = {
    ...item,
    duration: Number.isFinite(media.duration) ? media.duration : 5,
    width: media.videoWidth || 0,
    height: media.videoHeight || 0,
  };

  if (item.kind === 'video') {
    media.currentTime = Math.min(0.5, Math.max(0, media.duration / 4));
    await waitFor(media, 'seeked');
    const canvas = document.createElement('canvas');
    canvas.width = 320;
    canvas.height = 180;
    const context = canvas.getContext('2d');
    context.drawImage(media, 0, 0, canvas.width, canvas.height);
    result.thumbnail = canvas.toDataURL('image/jpeg', 0.72);
  }

  media.removeAttribute('src');
  media.load();
  return result;
}

export function fileTypeLabel(item) {
  if (item.kind === 'video') return item.height ? `${item.height}p` : 'VIDEO';
  if (item.kind === 'audio') return 'AUDIO';
  return item.width && item.height ? `${item.width} × ${item.height}` : 'IMAGE';
}
