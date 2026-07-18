const recordingMimeTypes = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/ogg;codecs=opus',
  'audio/mp4',
];

export function selectRecordingMime(isTypeSupported) {
  if (typeof isTypeSupported !== 'function') return '';
  return recordingMimeTypes.find((type) => isTypeSupported(type)) || '';
}

export function formatRecordingDuration(seconds) {
  const safe = Math.max(0, Math.floor(Number(seconds) || 0));
  const minutes = Math.floor(safe / 60);
  const remaining = safe % 60;
  return `${String(minutes).padStart(2, '0')}:${String(remaining).padStart(2, '0')}`;
}
