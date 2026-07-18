const { spawn } = require('node:child_process');

const WHISPER_MODEL = 'onnx-community/whisper-base_timestamped';
const MAX_AUDIO_BYTES = 512 * 1024 * 1024;
let transcriberPromise = null;

function finiteTime(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function normalizeTranscriptionRequest(request, authorizedPaths) {
  const filePath = typeof request?.filePath === 'string' ? request.filePath : '';
  if (!filePath || !authorizedPaths?.has(filePath)) {
    throw new Error('This media file is not authorized for transcription.');
  }
  const startTime = Math.max(0, finiteTime(request.startTime));
  const endTime = Math.max(startTime + 0.1, finiteTime(request.endTime, startTime + 0.1));
  return {
    filePath,
    startTime,
    endTime,
    language: typeof request.language === 'string' && request.language ? request.language : 'en-US',
  };
}

function buildAudioExtractionArgs({ filePath, startTime, endTime }) {
  const duration = Math.max(0.1, endTime - startTime);
  return [
    '-v', 'error', '-ss', String(startTime), '-t', String(duration), '-i', filePath,
    '-vn', '-ac', '1', '-ar', '16000', '-f', 'f32le', '-acodec', 'pcm_f32le', 'pipe:1',
  ];
}

function pcmBufferToFloat32Array(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 4) return new Float32Array();
  const usableBytes = buffer.length - (buffer.length % 4);
  const bytes = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + usableBytes);
  return new Float32Array(bytes);
}

function languageCodeForLocale(locale) {
  return String(locale || 'en').split('-')[0].toLowerCase();
}

function cleanTranscriptResult(result) {
  return String(result?.text || '').trim().replace(/\s+/g, ' ');
}

function normalizeTranscriptWords(chunks = []) {
  return chunks.flatMap((chunk) => {
    const text = String(chunk?.text || '').trim().replace(/\s+/g, ' ');
    if (!text) return [];
    const start = Number.isFinite(chunk?.timestamp?.[0]) ? Math.max(0, chunk.timestamp[0]) : 0;
    const suppliedEnd = Number.isFinite(chunk?.timestamp?.[1]) ? chunk.timestamp[1] : start + 0.35;
    return [{ text, start, end: Math.max(start + 0.04, suppliedEnd) }];
  });
}

function transcriptionInferenceOptions(locale) {
  return {
    language: languageCodeForLocale(locale),
    task: 'transcribe',
    return_timestamps: 'word',
    chunk_length_s: 30,
    stride_length_s: 5,
  };
}

function transcriberSessionOptions() {
  return {
    intraOpNumThreads: 1,
    interOpNumThreads: 1,
  };
}

function createMonotonicProgressReporter(callback, minimumDelta = 0.01) {
  let lastStage = '';
  let lastProgress = -1;
  return (status) => {
    if (typeof callback !== 'function' || !status) return;
    const progress = Math.max(0, Math.min(1, finiteTime(status.progress)));
    const stageChanged = status.stage !== lastStage;
    if (!stageChanged && progress < lastProgress + minimumDelta) return;
    lastStage = status.stage;
    lastProgress = progress;
    callback({ ...status, progress });
  };
}

function extractClipAudio(ffmpegPath, request) {
  return new Promise((resolve, reject) => {
    const child = spawn(ffmpegPath, buildAudioExtractionArgs(request), { windowsHide: true });
    const chunks = [];
    let byteLength = 0;
    let stderr = '';
    let settled = false;

    const fail = (error) => {
      if (settled) return;
      settled = true;
      child.kill();
      reject(error);
    };

    child.stdout.on('data', (chunk) => {
      byteLength += chunk.length;
      if (byteLength > MAX_AUDIO_BYTES) {
        fail(new Error('This clip is too long to transcribe in one pass.'));
        return;
      }
      chunks.push(chunk);
    });
    child.stderr.on('data', (chunk) => {
      stderr = `${stderr}${chunk}`.slice(-8000);
    });
    child.once('error', fail);
    child.once('close', (code) => {
      if (settled) return;
      settled = true;
      if (code !== 0) {
        reject(new Error(`Pixelwave could not read this clip’s audio. ${stderr.trim()}`));
        return;
      }
      const audio = pcmBufferToFloat32Array(Buffer.concat(chunks, byteLength));
      if (audio.length < 1600) {
        reject(new Error('Pixelwave could not detect enough audio in this clip.'));
        return;
      }
      resolve(audio);
    });
  });
}

async function loadTranscriber(cacheDir, progressCallback) {
  if (!transcriberPromise) {
    transcriberPromise = (async () => {
      const { env, pipeline } = await import('@huggingface/transformers');
      env.cacheDir = cacheDir;
      env.allowRemoteModels = true;
      return pipeline('automatic-speech-recognition', WHISPER_MODEL, {
        dtype: 'q8',
        progress_callback: progressCallback,
        session_options: transcriberSessionOptions(),
      });
    })().catch((error) => {
      transcriberPromise = null;
      throw error;
    });
  }
  return transcriberPromise;
}

async function transcribeClip(request, options) {
  const normalized = normalizeTranscriptionRequest(request, options.authorizedPaths);
  const reportStatus = createMonotonicProgressReporter(options.onStatus);
  reportStatus({ stage: 'extracting', progress: 0.05 });
  const audio = await extractClipAudio(options.ffmpegPath, normalized);
  reportStatus({ stage: 'loading-model', progress: 0.12 });
  const transcriber = await loadTranscriber(options.cacheDir, (event) => {
    if (event?.status === 'progress' && Number.isFinite(event.progress)) {
      reportStatus({ stage: 'loading-model', progress: 0.12 + (event.progress / 100) * 0.48 });
    }
  });
  reportStatus({ stage: 'transcribing', progress: 0.65 });
  const result = await transcriber(audio, transcriptionInferenceOptions(normalized.language));
  const text = cleanTranscriptResult(result);
  if (!text) throw new Error('No spoken words were detected in this clip.');
  const words = normalizeTranscriptWords(result?.chunks);
  reportStatus({ stage: 'complete', progress: 1 });
  return { text, words };
}

module.exports = {
  WHISPER_MODEL,
  buildAudioExtractionArgs,
  cleanTranscriptResult,
  createMonotonicProgressReporter,
  languageCodeForLocale,
  normalizeTranscriptionRequest,
  normalizeTranscriptWords,
  pcmBufferToFloat32Array,
  transcriberSessionOptions,
  transcriptionInferenceOptions,
  transcribeClip,
};
