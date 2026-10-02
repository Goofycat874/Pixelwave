import { useEffect, useRef, useState } from 'react';
import { Microphone, Stop } from '@phosphor-icons/react';
import { formatRecordingDuration, selectRecordingMime } from '../lib/recording.js';
import { Button, Dialog } from './ui.jsx';

const COPY = {
  ready: 'Your take is saved to the media library and placed at the playhead.',
  recording: 'Speak naturally. Press stop when you are done and the take lands on the timeline.',
  saving: 'Saving the take and placing it on the timeline.',
  error: '',
};

export default function VoiceRecorder({ open, onClose, onComplete }) {
  const [status, setStatus] = useState('ready');
  const [elapsed, setElapsed] = useState(0);
  const [level, setLevel] = useState(0);
  const [error, setError] = useState('');
  const recorderRef = useRef(null);
  const streamRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);
  const meterRef = useRef(null);
  const audioContextRef = useRef(null);
  const startedAtRef = useRef(0);
  const cancelledRef = useRef(false);

  const stopTracks = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (meterRef.current) window.clearInterval(meterRef.current);
    meterRef.current = null;
    audioContextRef.current?.close().catch(() => {});
    audioContextRef.current = null;
    setLevel(0);
  };

  const clearTimer = () => {
    if (timerRef.current) window.clearInterval(timerRef.current);
    timerRef.current = null;
  };

  useEffect(() => () => {
    cancelledRef.current = true;
    clearTimer();
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
    stopTracks();
  }, []);

  useEffect(() => {
    if (!open) return;
    setStatus('ready');
    setElapsed(0);
    setError('');
    chunksRef.current = [];
    cancelledRef.current = false;
  }, [open]);

  if (!open) return null;

  const watchLevel = (stream) => {
    try {
      const context = new AudioContext();
      const analyser = context.createAnalyser();
      analyser.fftSize = 512;
      context.createMediaStreamSource(stream).connect(analyser);
      const samples = new Uint8Array(analyser.fftSize);
      audioContextRef.current = context;
      meterRef.current = window.setInterval(() => {
        analyser.getByteTimeDomainData(samples);
        let peak = 0;
        for (const sample of samples) peak = Math.max(peak, Math.abs(sample - 128) / 128);
        setLevel(Math.min(1, peak * 1.6));
      }, 60);
    } catch {
      // The level meter is optional; recording still works without it.
    }
  };

  const startRecording = async () => {
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      setStatus('error');
      setError('Microphone recording is not available in this build.');
      return;
    }
    setError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      streamRef.current = stream;
      watchLevel(stream);
      const mimeType = selectRecordingMime((type) => MediaRecorder.isTypeSupported(type));
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType, audioBitsPerSecond: 192_000 } : undefined);
      recorderRef.current = recorder;
      chunksRef.current = [];
      cancelledRef.current = false;

      recorder.addEventListener('dataavailable', (event) => {
        if (event.data.size) chunksRef.current.push(event.data);
      });
      recorder.addEventListener('error', () => {
        clearTimer();
        stopTracks();
        setStatus('error');
        setError('The microphone stopped unexpectedly. Try another take.');
      });
      recorder.addEventListener('stop', async () => {
        clearTimer();
        stopTracks();
        recorderRef.current = null;
        if (cancelledRef.current) return;
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || mimeType || 'audio/webm' });
        if (!blob.size) {
          setStatus('error');
          setError('No audio was captured. Check your microphone and try again.');
          return;
        }
        setStatus('saving');
        try {
          await onComplete(blob);
          onClose();
        } catch (saveError) {
          setStatus('error');
          setError(saveError.message || 'Pixelwave could not save this take.');
        }
      }, { once: true });

      recorder.start(250);
      startedAtRef.current = performance.now();
      setElapsed(0);
      setStatus('recording');
      timerRef.current = window.setInterval(() => {
        setElapsed((performance.now() - startedAtRef.current) / 1000);
      }, 200);
    } catch (recordError) {
      stopTracks();
      setStatus('error');
      setError(recordError.name === 'NotAllowedError'
        ? 'Microphone access was blocked. Allow access for Pixelwave and try again.'
        : 'Pixelwave could not open your microphone.');
    }
  };

  const finishRecording = () => {
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
  };

  const cancel = () => {
    cancelledRef.current = true;
    clearTimer();
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
    else stopTracks();
    onClose();
  };

  return (
    <Dialog
      title={status === 'recording' ? 'Recording' : status === 'saving' ? 'Saving take' : 'Record voiceover'}
      description={COPY[status] || undefined}
      onClose={cancel}
      width={420}
    >
      <div className="recorder">
        <output className="recorder__time">{formatRecordingDuration(elapsed)}</output>
        <div className={`recorder__meter ${level > 0.92 ? 'is-hot' : ''}`} aria-label="Microphone level" role="meter" aria-valuemin={0} aria-valuemax={1} aria-valuenow={level}>
          <span style={{ transform: `scaleX(${Math.max(0.01, level)})` }} />
        </div>
        {error && <p className="error-text" role="alert">{error}</p>}
        <div className="recorder__actions">
          {status === 'recording' ? (
            <Button variant="primary" onClick={finishRecording} data-autofocus><Stop size={15} weight="fill" /> Stop and add</Button>
          ) : (
            <Button className="recorder__record" disabled={status === 'saving'} onClick={startRecording} data-autofocus>
              <Microphone size={15} weight="fill" /> {status === 'error' ? 'Try again' : 'Start recording'}
            </Button>
          )}
          <Button variant="ghost" disabled={status === 'saving'} onClick={cancel}>Cancel</Button>
        </div>
      </div>
    </Dialog>
  );
}
