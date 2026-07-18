const { transcribeClip } = require('./clip-transcription.cjs');

async function handleTranscriptionMessage(message, { transcribe = transcribeClip, postMessage }) {
  if (message?.type !== 'transcribe') return;
  try {
    const result = await transcribe(message.request, {
      authorizedPaths: new Set([message.request?.filePath]),
      ffmpegPath: message.ffmpegPath,
      cacheDir: message.cacheDir,
      onStatus: (status) => postMessage({ id: message.id, type: 'progress', status }),
    });
    postMessage({ id: message.id, type: 'result', result });
  } catch (error) {
    postMessage({ id: message.id, type: 'error', error: error?.message || 'The transcription process failed.' });
  }
}

if (process.parentPort) {
  process.parentPort.on('message', (event) => {
    handleTranscriptionMessage(event.data, {
      postMessage: (message) => process.parentPort.postMessage(message),
    });
  });
}

module.exports = { handleTranscriptionMessage };
