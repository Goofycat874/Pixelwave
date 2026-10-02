import { memo, useEffect } from 'react';
import { Lock, SpeakerSimpleSlash, Sparkle } from '@phosphor-icons/react';
import { keyframeTimes } from '../../lib/animation.js';
import { clipTextOverlays } from '../../lib/editor.js';
import { fontStack } from '../../lib/fonts.js';
import {
  filmstripKey,
  nearestFilmstripFrame,
  requestFilmstrip,
  requestWaveform,
  waveformKey,
  waveformPath,
} from '../../lib/media-analysis.js';
import { resolveTextStyle } from '../../lib/text.js';
import useMediaAnalysis from '../../hooks/useMediaAnalysis.js';

function Filmstrip({ clip, asset, width, height }) {
  const filmstrip = useMediaAnalysis(asset ? filmstripKey(asset) : null);
  useEffect(() => { if (asset) requestFilmstrip(asset); }, [asset]);
  if (filmstrip?.status !== 'ready') {
    return asset?.thumbnail ? <div className="clip-film clip-film--single" style={{ backgroundImage: `url("${asset.thumbnail}")` }} /> : null;
  }
  const tileWidth = Math.max(24, height * (filmstrip.aspect || 16 / 9));
  const count = Math.min(80, Math.max(1, Math.ceil(width / tileWidth)));
  const speed = clip.speed || 1;
  return (
    <div className="clip-film">
      {Array.from({ length: count }, (_, index) => {
        const timelineOffset = ((index + 0.5) * tileWidth) / Math.max(1, width) * clip.duration;
        const frame = nearestFilmstripFrame(filmstrip, clip.sourceStart + timelineOffset * speed);
        return <span key={index} style={{ width: tileWidth, backgroundImage: frame ? `url("${frame}")` : undefined }} />;
      })}
    </div>
  );
}

function WaveformView({ clip, asset }) {
  const waveform = useMediaAnalysis(asset ? waveformKey(asset) : null);
  useEffect(() => { if (asset) requestWaveform(asset); }, [asset]);
  if (waveform?.status !== 'ready') return <div className="clip-wave clip-wave--pending" />;
  const path = waveformPath(waveform, clip.sourceStart, clip.sourceStart + clip.duration * (clip.speed || 1));
  return (
    <svg className="clip-wave" viewBox="0 0 1000 100" preserveAspectRatio="none" aria-hidden="true">
      <path d={path} />
    </svg>
  );
}

function TextSample({ clip }) {
  const overlay = clipTextOverlays(clip)[0];
  if (!overlay) return null;
  const style = resolveTextStyle(overlay);
  return (
    <div className="clip-text-sample" style={{ fontFamily: fontStack(style.fontFamily), fontWeight: style.fontWeight, fontStyle: style.italic ? 'italic' : 'normal' }}>
      {overlay.text || 'Empty text'}
    </div>
  );
}

function FadeOverlay({ clip, pixelsPerSecond, width, onFadePointerDown, interactive }) {
  const fadeIn = Math.min(clip.duration, clip.fadeIn || 0) * pixelsPerSecond;
  const fadeOut = Math.min(clip.duration, clip.fadeOut || 0) * pixelsPerSecond;
  return (
    <>
      {(fadeIn > 0 || fadeOut > 0) && (
        <svg className="clip-fades" viewBox={`0 0 ${Math.max(1, width)} 100`} preserveAspectRatio="none" aria-hidden="true">
          {fadeIn > 0 && <path d={`M0 0 L${fadeIn} 0 L0 100 Z`} />}
          {fadeOut > 0 && <path d={`M${width} 0 L${width - fadeOut} 0 L${width} 100 Z`} />}
        </svg>
      )}
      {interactive && width > 36 && (
        <>
          <button
            type="button"
            className="fade-handle"
            style={{ left: Math.min(width - 12, fadeIn) }}
            aria-label={`Fade in ${clip.name}`}
            title="Drag to fade in"
            onPointerDown={(event) => onFadePointerDown(event, clip, 'in')}
          />
          <button
            type="button"
            className="fade-handle"
            style={{ left: Math.max(0, width - fadeOut) }}
            aria-label={`Fade out ${clip.name}`}
            title="Drag to fade out"
            onPointerDown={(event) => onFadePointerDown(event, clip, 'out')}
          />
        </>
      )}
    </>
  );
}

function TimelineClip({
  clip,
  asset,
  pixelsPerSecond,
  height,
  selected,
  locked,
  hidden,
  muted,
  bladeMode,
  onClipPointerDown,
  onTrimPointerDown,
  onFadePointerDown,
  onKeyframeClick,
  onContextMenu,
  onDoubleClick,
}) {
  const width = Math.max(4, clip.duration * pixelsPerSecond);
  const keyTimes = keyframeTimes(clip);
  const transition = clip.transition?.type && clip.transition.type !== 'cut' ? clip.transition : null;
  const bodyHeight = height - 21;
  const interactive = selected && !locked && !bladeMode;

  return (
    <div
      className={[
        'clip',
        `clip--${clip.kind}`,
        selected && 'is-selected',
        locked && 'is-locked',
        hidden && 'is-hidden',
        muted && 'is-muted',
        bladeMode && 'is-blade',
        width < 40 && 'is-narrow',
      ].filter(Boolean).join(' ')}
      style={{ left: clip.start * pixelsPerSecond, width, height: height - 4 }}
      data-clip-id={clip.id}
      onPointerDown={(event) => onClipPointerDown(event, clip)}
      onContextMenu={(event) => onContextMenu(event, clip)}
      onDoubleClick={(event) => onDoubleClick?.(event, clip)}
    >
      <div className="clip__header">
        {transition && <span className="clip__transition" style={{ width: Math.min(width, transition.duration * pixelsPerSecond) }} title={`${transition.type} in`} />}
        <span className="clip__name">{clip.name?.replace(/\.[^.]+$/, '') || 'Clip'}</span>
        {(clip.speed || 1) !== 1 && <span className="clip__badge">{clip.speed}×</span>}
        {keyTimes.length > 0 && <span className="clip__badge clip__badge--icon" title="Animated"><Sparkle size={10} weight="fill" /></span>}
        {clip.muted && <span className="clip__badge clip__badge--icon" title="Muted"><SpeakerSimpleSlash size={10} /></span>}
        {locked && <span className="clip__badge clip__badge--icon" title="Track locked"><Lock size={10} /></span>}
      </div>
      <div className="clip__body">
        {clip.kind === 'video' && <Filmstrip clip={clip} asset={asset} width={width} height={bodyHeight} />}
        {clip.kind === 'image' && asset?.thumbnail && <div className="clip-film clip-film--single" style={{ backgroundImage: `url("${asset.thumbnail}")` }} />}
        {clip.kind === 'audio' && <WaveformView clip={clip} asset={asset} />}
        {clip.kind === 'text' && <TextSample clip={clip} />}
      </div>
      <FadeOverlay clip={clip} pixelsPerSecond={pixelsPerSecond} width={width} onFadePointerDown={onFadePointerDown} interactive={interactive} />
      {keyTimes.length > 0 && (
        <div className="clip__keys">
          {keyTimes.map((time) => (
            <button
              key={time}
              type="button"
              tabIndex={-1}
              className="clip__key"
              style={{ left: Math.min(width - 4, Math.max(4, time * pixelsPerSecond)) }}
              aria-label={`Keyframe at ${time.toFixed(2)} seconds`}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => { event.stopPropagation(); onKeyframeClick(clip, time); }}
            />
          ))}
        </div>
      )}
      {!locked && !bladeMode && (
        <>
          <span className="clip__trim clip__trim--start" onPointerDown={(event) => onTrimPointerDown(event, clip, 'start')} />
          <span className="clip__trim clip__trim--end" onPointerDown={(event) => onTrimPointerDown(event, clip, 'end')} />
        </>
      )}
    </div>
  );
}

export default memo(TimelineClip);
