import { useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle, SpinnerGap, TrashSimple, UploadSimple, Waveform } from '@phosphor-icons/react';
import {
  buildClipTranscriptionRequest,
  CAPTION_FONTS,
  captionBoxEnabled,
  captionFontStack,
  clipTranscriptionStatusMessage,
  loadCustomCaptionFont,
} from '../lib/transcription.js';
import { formatTime } from '../lib/media.js';
import { Button, ColorField, PropertyRow, Section, SelectField, Switch } from './ui.jsx';

const languages = [
  ['en-US', 'English (US)'],
  ['en-IN', 'English (India)'],
  ['hi-IN', 'Hindi'],
  ['bn-IN', 'Bengali'],
  ['es-ES', 'Spanish'],
  ['fr-FR', 'French'],
];

function readableError(error) {
  const message = String(error?.message || 'Pixelwave could not transcribe this clip.');
  return message
    .replace(/^Error invoking remote method '[^']+': Error: /, '')
    .replace(/^Error: /, '');
}

function countWords(text) {
  return String(text || '').trim().split(/\s+/).filter(Boolean).length;
}

export default function TranscriptionControls({ clip, asset, onUpdate, onLiveUpdate = onUpdate, onBeginEdit = () => {}, defaultPositionY = 86 }) {
  const transcript = useMemo(() => ({
    text: '',
    words: [],
    language: 'en-US',
    showAsCaptions: true,
    fontFamily: 'Outfit',
    customFont: null,
    fontSize: 54,
    color: '#ffffff',
    backgroundEnabled: true,
    ...(clip.transcript || {}),
  }), [clip.transcript]);
  const [processing, setProcessing] = useState(false);
  const [status, setStatus] = useState({ stage: 'idle', progress: 0 });
  const [error, setError] = useState('');
  const [fontLoading, setFontLoading] = useState(false);
  const [fontError, setFontError] = useState('');
  const activeRequestRef = useRef(null);
  const canTranscribe = Boolean(asset?.path && window.pixelwave?.transcribeClip);
  const wordCount = transcript.words?.length || countWords(transcript.text);

  useEffect(() => {
    const unsubscribe = window.pixelwave?.onTranscriptionProgress?.((nextStatus) => {
      if (nextStatus?.requestId === activeRequestRef.current) setStatus(nextStatus);
    });
    return typeof unsubscribe === 'function' ? unsubscribe : undefined;
  }, []);

  useEffect(() => {
    activeRequestRef.current = null;
    setProcessing(false);
    setStatus({ stage: 'idle', progress: 0 });
    setError('');
    setFontError('');
  }, [clip.id]);

  const patchTranscript = (patch) => onUpdate({ transcript: { ...transcript, ...patch } });
  const liveTranscript = (patch) => onLiveUpdate({ transcript: { ...transcript, ...patch } });

  const transcribeSelectedClip = async () => {
    if (!canTranscribe || processing) return;
    const requestId = globalThis.crypto?.randomUUID?.() || `transcription-${Date.now()}`;
    activeRequestRef.current = requestId;
    setProcessing(true);
    setError('');
    setStatus({ stage: 'extracting', progress: 0.05 });
    try {
      const request = { ...buildClipTranscriptionRequest(clip, asset), requestId };
      const result = await window.pixelwave.transcribeClip(request);
      if (activeRequestRef.current !== requestId) return;
      patchTranscript({ text: result.text, words: result.words || [] });
      setStatus({ stage: 'complete', progress: 1 });
    } catch (transcriptionError) {
      if (activeRequestRef.current === requestId) {
        setStatus({ stage: 'idle', progress: 0 });
        setError(readableError(transcriptionError));
      }
    } finally {
      if (activeRequestRef.current === requestId) {
        activeRequestRef.current = null;
        setProcessing(false);
      }
    }
  };

  const chooseCustomFont = async () => {
    if (fontLoading) return;
    setFontLoading(true);
    setFontError('');
    try {
      const customFont = await window.pixelwave?.openCaptionFont?.();
      if (!customFont) return;
      const loaded = await loadCustomCaptionFont(customFont);
      if (!loaded) throw new Error('Pixelwave could not load that font file.');
      patchTranscript({ customFont, fontFamily: customFont.family });
    } catch (fontLoadError) {
      setFontError(readableError(fontLoadError));
    } finally {
      setFontLoading(false);
    }
  };

  const fontOptions = [
    ...CAPTION_FONTS.map(({ family }) => [family, family]),
    ...(transcript.customFont ? [[transcript.customFont.family, transcript.customFont.name || 'Custom font']] : []),
  ];

  return (
    <div className="captions-panel">
      <Section id="captions-transcribe" title="Auto captions">
        <div className="transcribe-card">
          <div className="transcribe-card__text">
            <strong>Speech to text</strong>
            <span>Runs on this computer. {formatTime(clip.duration)} of audio, {wordCount} {wordCount === 1 ? 'word' : 'words'} so far.</span>
          </div>
          <Button variant="primary" size="sm" disabled={!canTranscribe || processing} onClick={transcribeSelectedClip}>
            {processing ? <SpinnerGap size={14} className="spin" /> : transcript.words?.length ? <CheckCircle size={14} /> : <Waveform size={14} />}
            {processing ? 'Working' : transcript.text ? 'Redo' : 'Transcribe'}
          </Button>
        </div>
        <p className={`status-line ${processing ? 'is-busy' : status.stage === 'complete' ? 'is-done' : ''}`}>
          {clipTranscriptionStatusMessage(status.stage, status.progress)}
        </p>
        {processing && <div className="progress"><span style={{ transform: `scaleX(${Math.max(0.03, status.progress)})` }} /></div>}
        {error && <p className="error-text" role="alert">{error}</p>}
        {!canTranscribe && <p className="hint">The original media file for this clip is not available, so it cannot be transcribed.</p>}
        <SelectField label="Language" value={transcript.language} options={languages} onChange={(language) => patchTranscript({ language })} />
      </Section>

      <Section
        id="captions-text"
        title="Transcript"
        actions={transcript.text ? (
          <button type="button" className="link-btn" disabled={processing} onClick={() => { patchTranscript({ text: '', words: [] }); setStatus({ stage: 'idle', progress: 0 }); }}>
            <TrashSimple size={12} /> Clear
          </button>
        ) : null}
      >
        <label className="text-area">
          <span className="sr-only">Transcript</span>
          <textarea
            rows={5}
            value={transcript.text}
            readOnly={processing}
            placeholder="Transcribed speech appears here. You can also type captions yourself."
            onFocus={onBeginEdit}
            onChange={(event) => liveTranscript({ text: event.target.value, words: [] })}
          />
        </label>
        {transcript.text && !transcript.words?.length && <p className="hint">Edited captions show as one block. Transcribe again for word-by-word timing.</p>}
      </Section>

      <Section id="captions-style" title="Caption style">
        <Switch label="Show captions" checked={transcript.showAsCaptions} onChange={(showAsCaptions) => patchTranscript({ showAsCaptions })} />
        <div className={`caption-sample ${captionBoxEnabled(transcript) ? '' : 'is-plain'}`}>
          <span style={{ color: transcript.color, fontFamily: captionFontStack(transcript.fontFamily, transcript.customFont) }}>
            {transcript.words?.[0]?.text || transcript.text.trim().split(/\s+/)[0] || 'Caption'}
          </span>
        </div>
        <SelectField label="Font" value={transcript.fontFamily} options={fontOptions} onChange={(fontFamily) => patchTranscript({ fontFamily })} />
        <Button size="sm" disabled={fontLoading || !window.pixelwave?.openCaptionFont} onClick={chooseCustomFont}>
          <UploadSimple size={14} /> {fontLoading ? 'Loading font' : 'Use a font file'}
        </Button>
        {fontError && <p className="error-text" role="alert">{fontError}</p>}
        <PropertyRow label="Size" value={transcript.fontSize} min={20} max={120} step={1} unit="px" defaultValue={54} onBegin={onBeginEdit} onChange={(fontSize) => liveTranscript({ fontSize })} />
        <PropertyRow label="Height" value={transcript.positionY ?? defaultPositionY} min={10} max={95} step={1} unit="%" defaultValue={defaultPositionY} onBegin={onBeginEdit} onChange={(positionY) => liveTranscript({ positionY })} />
        <ColorField label="Color" value={transcript.color} onBegin={onBeginEdit} onChange={(color) => liveTranscript({ color })} />
        <Switch label="Caption box" description="Dark box behind the words" checked={captionBoxEnabled(transcript)} onChange={(backgroundEnabled) => patchTranscript({ backgroundEnabled })} />
      </Section>
    </div>
  );
}
