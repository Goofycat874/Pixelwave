import { useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle, Sparkle, TrashSimple, UploadSimple, Waveform } from '@phosphor-icons/react';
import {
  buildClipTranscriptionRequest,
  CAPTION_FONTS,
  captionBoxEnabled,
  captionFontStack,
  clipTranscriptionStatusMessage,
  loadCustomCaptionFont,
} from '../lib/transcription.js';
import { formatTime } from '../lib/media.js';

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

export default function TranscriptionControls({ clip, asset, onUpdate }) {
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
  const sampleWord = transcript.words?.[0]?.text || transcript.text.trim().split(/\s+/)[0] || 'Your words';

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

  return (
    <div className="transcription-workspace">
      <section className="transcription-hero">
        <div className="transcription-hero__icon"><Waveform size={18} weight="duotone" /></div>
        <div className="transcription-hero__copy">
          <span>Local Whisper</span>
          <h3>Speech to captions</h3>
          <p>{formatTime(clip.duration)} clip · {wordCount || 0} {wordCount === 1 ? 'word' : 'words'}</p>
        </div>
        <button type="button" disabled={!canTranscribe || processing} onClick={transcribeSelectedClip}>
          {processing ? <Sparkle size={13} weight="fill" /> : transcript.words?.length ? <CheckCircle size={13} weight="fill" /> : <Waveform size={13} weight="bold" />}
          {processing ? 'Working' : transcript.text ? 'Again' : 'Transcribe'}
        </button>
      </section>

      <section className="transcription-workspace__section transcription-workspace__section--status">
        <div className={`transcription-status ${processing ? 'is-processing' : status.stage === 'complete' ? 'is-complete' : ''}`}>
          <span className="transcription-status__dot" />
          <p>{clipTranscriptionStatusMessage(status.stage, status.progress)}</p>
          <strong>{processing ? `${Math.round(status.progress * 100)}%` : transcript.words?.length ? `${transcript.words.length} timed` : ''}</strong>
        </div>
        {processing && (
          <div className="transcription-progress" aria-label="Transcription progress">
            <span style={{ transform: `scaleX(${Math.max(0.03, status.progress)})` }} />
          </div>
        )}
        {error && <p className="transcription-error" role="alert">{error}</p>}
        {!canTranscribe && <p className="transcription-error">The original media file is not available for this clip.</p>}
      </section>

      <section className="transcription-workspace__section">
        <div className="transcription-section-heading">
          <div><strong>Transcript</strong><span>{transcript.words?.length ? 'Word timing ready' : 'Editable text'}</span></div>
          <button
            type="button"
            disabled={!transcript.text || processing}
            onClick={() => {
              patchTranscript({ text: '', words: [] });
              setStatus({ stage: 'idle', progress: 0 });
            }}
          ><TrashSimple size={12} /> Clear</button>
        </div>
        <label className="inspector-field">
          <span>Spoken language</span>
          <select value={transcript.language} disabled={processing} onChange={(event) => patchTranscript({ language: event.target.value })}>
            {languages.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label className="inspector-field transcript-editor">
          <span><span>Words</span><output>{countWords(transcript.text)}</output></span>
          <textarea
            rows={5}
            value={transcript.text}
            readOnly={processing}
            placeholder="Transcribed speech will appear here"
            onChange={(event) => patchTranscript({ text: event.target.value, words: [] })}
          />
          {transcript.text && !transcript.words?.length && <small>Transcribe again to generate word-by-word timing.</small>}
        </label>
      </section>

      <section className="transcription-workspace__section caption-designer">
        <div className="transcription-section-heading">
          <div><strong>Caption style</strong><span>Google Fonts</span></div>
          <label className="caption-switch">
            <input type="checkbox" checked={transcript.showAsCaptions} onChange={(event) => patchTranscript({ showAsCaptions: event.target.checked })} />
            <span />
          </label>
        </div>

        <div className={`caption-style-preview ${captionBoxEnabled(transcript) ? '' : 'caption-style-preview--no-box'}`}>
          <span style={{
            color: transcript.color,
            fontFamily: captionFontStack(transcript.fontFamily, transcript.customFont),
            fontSize: `${Math.max(17, (transcript.fontSize || 54) * 0.42)}px`,
          }}>{sampleWord}</span>
          <small>WORD-BY-WORD PREVIEW</small>
        </div>

        <div className="caption-font-grid" role="group" aria-label="Google caption fonts">
          {CAPTION_FONTS.map(({ family }) => (
            <button
              key={family}
              type="button"
              className={transcript.fontFamily === family ? 'is-active' : ''}
              style={{ fontFamily: captionFontStack(family) }}
              onClick={() => patchTranscript({ fontFamily: family })}
            ><b>Aa</b><span>{family}</span></button>
          ))}
        </div>

        <button
          type="button"
          className={`caption-custom-font ${transcript.customFont && transcript.fontFamily === transcript.customFont.family ? 'is-active' : ''}`}
          disabled={fontLoading || !window.pixelwave?.openCaptionFont}
          onClick={chooseCustomFont}
        >
          <span className="caption-custom-font__icon"><UploadSimple size={13} weight="bold" /></span>
          <span className="caption-custom-font__copy">
            <strong>{transcript.customFont?.name || 'Custom font'}</strong>
            <small>{transcript.customFont ? 'Loaded from your computer' : 'TTF, OTF, WOFF, or WOFF2'}</small>
          </span>
          <span className="caption-custom-font__action">{fontLoading ? 'Loading' : transcript.customFont ? 'Change' : 'Choose'}</span>
        </button>
        {fontError && <p className="transcription-error" role="alert">{fontError}</p>}

        <label className="caption-size-control">
          <span><strong>Size</strong><output>{transcript.fontSize}px</output></span>
          <input type="range" min="28" max="92" step="2" value={transcript.fontSize} onChange={(event) => patchTranscript({ fontSize: Number(event.target.value) })} />
        </label>

        <label className="caption-color-control">
          <span>Text color</span>
          <input type="color" value={transcript.color} onChange={(event) => patchTranscript({ color: event.target.value })} />
          <output>{transcript.color.toUpperCase()}</output>
        </label>
        <label className="caption-box-control">
          <span><strong>Caption box</strong><small>Dark background behind the words</small></span>
          <span className="caption-switch">
            <input
              type="checkbox"
              checked={captionBoxEnabled(transcript)}
              onChange={(event) => patchTranscript({ backgroundEnabled: event.target.checked })}
            />
            <span />
          </span>
        </label>
        <p className="transcription-note">Timed words follow the speaker in the monitor and in exported video.</p>
      </section>
    </div>
  );
}
