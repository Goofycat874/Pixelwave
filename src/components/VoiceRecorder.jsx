import { useEffect, useRef, useState } from 'react';
import { Microphone, Record, Stop, X } from '@phosphor-icons/react';
import { formatRecordingDuration, selectRecordingMime } from '../lib/recording.js';

const waveformBars = Array.from({ length: 24 }, (_, index) => index);

export default function VoiceRecorder({ open, onClose, onComplete }) {
  const [status, setStatus] = useState('ready');
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState('');
  const recorderRef = useRef(null);
  const streamRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);
  const startedAtRef = useRef(0);
  const cancelledRef = useRef(false);

  const stopTracks = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
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
        setError('The microphone stopped unexpectedly. Please try another take.');
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
    <div className="voice-recorder-overlay" role="dialog" aria-modal="true" aria-label="Record voice">
      <div className="voice-recorder-dialog">
        <button type="button" className="voice-recorder-close" aria-label="Close recorder" onClick={cancel}><X size={15} /></button>
        <div className={`voice-recorder-mark is-${status}`}>
          {status === 'recording' ? <Record size={20} weight="fill" /> : <Microphone size={22} weight="duotone" />}
        </div>
        <p className="eyebrow">Voice recorder</p>
        <h2>{status === 'recording' ? 'Recording take' : status === 'saving' ? 'Saving take' : status === 'error' ? 'Recording paused' : 'Add your voice'}</h2>
        <p className="voice-recorder-copy">
          {status === 'recording'
            ? 'Speak naturally. Stop when you are ready to add this take at the playhead.'
            : status === 'saving'
              ? 'Pixelwave is preparing the audio and placing it on your timeline.'
              : 'Your take will be saved to the media bin and inserted at the current playhead.'}
        </p>

        <div className={`voice-waveform ${status === 'recording' ? 'is-live' : ''}`} aria-hidden="true">
          {waveformBars.map((bar) => <span key={bar} style={{ '--bar-index': bar }} />)}
        </div>
        <output className="voice-recorder-time">{formatRecordingDuration(elapsed)}</output>
        {error && <p className="voice-recorder-error" role="alert">{error}</p>}

        <div className="voice-recorder-actions">
          {status === 'recording' ? (
            <button type="button" className="voice-stop-button" onClick={finishRecording}><Stop size={15} weight="fill" /> Stop & add</button>
          ) : (
            <button type="button" className="voice-start-button" disabled={status === 'saving'} onClick={startRecording}><Microphone size={15} weight="fill" /> {status === 'error' ? 'Try again' : 'Start recording'}</button>
          )}
          <button type="button" className="voice-cancel-button" disabled={status === 'saving'} onClick={cancel}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
