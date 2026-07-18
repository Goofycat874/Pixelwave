export function getSpeechRecognitionConstructor(runtime = globalThis) {
  return runtime?.SpeechRecognition || runtime?.webkitSpeechRecognition || null;
}

export const CAPTION_FONTS = [
  { family: 'Outfit', category: 'sans-serif' },
  { family: 'Space Grotesk', category: 'sans-serif' },
  { family: 'DM Sans', category: 'sans-serif' },
  { family: 'Bebas Neue', category: 'sans-serif' },
  { family: 'Anton', category: 'sans-serif' },
  { family: 'Oswald', category: 'sans-serif' },
  { family: 'Playfair Display', category: 'serif' },
  { family: 'Noto Sans', category: 'sans-serif' },
];

function quotedFontFamily(family) {
  return `'${String(family || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

export function captionFontStack(requestedFamily, customFont = null) {
  if (customFont?.src && customFont.family === requestedFamily) {
    return `${quotedFontFamily(customFont.family)}, sans-serif`;
  }
  const font = CAPTION_FONTS.find(({ family }) => family === requestedFamily) || CAPTION_FONTS[0];
  return `'${font.family}', ${font.category}`;
}

export async function loadCustomCaptionFont(customFont, {
  FontFaceCtor = globalThis.FontFace,
  fonts = globalThis.document?.fonts,
} = {}) {
  if (!customFont?.family || !customFont?.src || typeof FontFaceCtor !== 'function' || !fonts?.add) return null;
  const source = String(customFont.src).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  const face = new FontFaceCtor(customFont.family, `url("${source}")`);
  const loaded = await face.load();
  fonts.add(loaded);
  return loaded;
}

export function captionBoxEnabled(transcript = {}) {
  return transcript?.backgroundEnabled !== false;
}

export function activeTranscriptWord(words = [], localClipTime = 0, speed = 1) {
  if (!Array.isArray(words) || !words.length || localClipTime < 0) return '';
  const sourceTime = localClipTime * Math.max(0.01, Number(speed) || 1);
  let activeIndex = -1;
  for (let index = 0; index < words.length; index += 1) {
    if (Number(words[index]?.start) <= sourceTime) activeIndex = index;
    else break;
  }
  if (activeIndex < 0) return '';
  const active = words[activeIndex];
  const nextStart = Number(words[activeIndex + 1]?.start);
  const cutoff = Number.isFinite(nextStart) ? nextStart : Number(active.end || active.start) + 0.5;
  return sourceTime < cutoff ? String(active.text || '').trim() : '';
}

export function captionTextForClip(clip, timelineTime) {
  const transcript = clip?.transcript;
  if (!transcript?.showAsCaptions || !transcript.text) return '';
  const localTime = Number(timelineTime) - Number(clip.start || 0);
  if (localTime < 0 || localTime >= Number(clip.duration || 0)) return '';
  if (!Array.isArray(transcript.words) || !transcript.words.length) return transcript.text;
  return activeTranscriptWord(transcript.words, localTime, clip.speed || 1);
}

export function buildClipTranscriptionRequest(clip, asset) {
  if (clip?.kind === 'image' || asset?.kind === 'image') {
    throw new Error('Audio and video clips can be transcribed.');
  }
  if (!asset?.path) throw new Error('Pixelwave could not find this clip’s source file.');
  const startTime = Math.max(0, Number(clip?.sourceStart) || 0);
  const fallbackEnd = startTime + Math.max(0.1, Number(clip?.duration) || 0.1);
  const endTime = Math.max(startTime + 0.1, Number(clip?.sourceEnd) || fallbackEnd);
  return {
    filePath: asset.path,
    startTime,
    endTime,
    language: clip?.transcript?.language || 'en-US',
  };
}

export function clipTranscriptionStatusMessage(stage, progress = 0) {
  if (stage === 'extracting') return 'Reading the selected clip’s audio…';
  if (stage === 'loading-model') return `Downloading the local speech model… ${Math.round(Math.max(0, Math.min(1, progress)) * 100)}%`;
  if (stage === 'transcribing') return 'Turning this clip’s speech into text…';
  if (stage === 'complete') return 'Transcript ready — you can edit it below.';
  return 'Transcribe the speech already inside this selected clip.';
}

export function isElectronSpeechRuntime(runtime = globalThis) {
  return /Electron\//i.test(runtime?.navigator?.userAgent || '');
}

export async function ensureOnDeviceRecognition(Recognition, language, runtime = globalThis) {
  if (isElectronSpeechRuntime(runtime)) return { ready: false, reason: 'electron-unsafe' };
  if (typeof Recognition?.available !== 'function') return { ready: false, reason: 'unsupported' };
  const options = { langs: [language], processLocally: true };
  try {
    const availability = await Recognition.available(options);
    if (availability === 'available') return { ready: true, installed: false };
    if (['downloadable', 'downloading'].includes(availability) && typeof Recognition.install === 'function') {
      const installed = await Recognition.install(options);
      return installed ? { ready: true, installed: true } : { ready: false, reason: 'install-failed' };
    }
    return { ready: false, reason: availability || 'unavailable' };
  } catch {
    return { ready: false, reason: 'unavailable' };
  }
}

function cleanText(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

export function extractRecognitionUpdate(event) {
  const finalParts = [];
  const interimParts = [];
  const start = Number.isInteger(event?.resultIndex) ? event.resultIndex : 0;
  const results = event?.results || [];

  for (let index = start; index < results.length; index += 1) {
    const result = results[index];
    const text = cleanText(result?.[0]?.transcript);
    if (!text) continue;
    if (result.isFinal) finalParts.push(text);
    else interimParts.push(text);
  }

  return {
    finalText: finalParts.join(' '),
    interimText: interimParts.join(' '),
  };
}

export function joinTranscript(existing, addition) {
  return [cleanText(existing), cleanText(addition)].filter(Boolean).join(' ');
}

export function speechRecognitionErrorMessage(code) {
  const messages = {
    'not-allowed': 'Microphone access was blocked. Allow microphone access for Pixelwave and try again.',
    'service-not-allowed': 'Speech recognition is not allowed on this system.',
    'audio-capture': 'Pixelwave could not find an available microphone.',
    'no-speech': 'Pixelwave did not hear any speech. Try again a little closer to the microphone.',
    network: 'The remote speech service is unavailable. Restart transcription to use Pixelwave’s on-device language pack.',
    aborted: 'Transcription stopped.',
  };
  return messages[code] || 'Voice transcription could not continue. Please try again.';
}
