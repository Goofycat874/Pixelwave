function createTranscriptionService({ fork, workerPath, ffmpegPath, cacheDir }) {
  let child = null;
  let nextRequestId = 0;
  const pending = new Map();

  const rejectPending = (error) => {
    for (const { reject } of pending.values()) reject(error);
    pending.clear();
  };

  const ensureChild = () => {
    if (child) return child;
    child = fork(workerPath, [], {
      serviceName: 'Pixelwave Transcription',
      stdio: 'pipe',
    });
    child.on('message', (message) => {
      const request = pending.get(message?.id);
      if (!request) return;
      if (message.type === 'progress') {
        request.onStatus?.(message.status);
        return;
      }
      pending.delete(message.id);
      if (message.type === 'result') request.resolve(message.result);
      else request.reject(new Error(message.error || 'The transcription process failed.'));
    });
    child.on('error', (_type, _location, report) => {
      rejectPending(new Error(report || 'The transcription process crashed.'));
    });
    child.on('exit', (code) => {
      const exited = child;
      child = null;
      if (exited && pending.size) {
        rejectPending(new Error(`The transcription process exited unexpectedly (${code}).`));
      }
    });
    return child;
  };

  return {
    transcribe(request, { onStatus } = {}) {
      const id = `transcription-${Date.now()}-${nextRequestId += 1}`;
      const worker = ensureChild();
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject, onStatus });
        worker.postMessage({
          id,
          type: 'transcribe',
          request,
          ffmpegPath,
          cacheDir,
        });
      });
    },
    dispose() {
      if (!child) return;
      rejectPending(new Error('Transcription stopped because Pixelwave is closing.'));
      child.kill();
      child = null;
    },
  };
}

function createTranscriptionIpcHandler({ service, authorizedPaths }) {
  return async (event, request) => {
    if (!request?.filePath || !authorizedPaths?.has(request.filePath)) {
      throw new Error('This media file is not authorized for transcription.');
    }
    return service.transcribe(request, {
    onStatus: (status) => {
      if (!event.sender.isDestroyed()) {
        event.sender.send('transcription:progress', { ...status, requestId: request?.requestId });
      }
    },
    });
  };
}

module.exports = { createTranscriptionIpcHandler, createTranscriptionService };
