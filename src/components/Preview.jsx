import { Fragment, useEffect, useMemo, useRef } from 'react';
import { MusicNotes, Play } from '@phosphor-icons/react';
import {
  activeClipsAt,
  clipTextOverlays,
  clipTrack,
  computedColorAdjustments,
  getTransitionProgress,
  LEGACY_TEXT_ID,
  resolveTextControlEntry,
  updateClipTextOverlay,
} from '../lib/editor.js';
import {
  captionBoxEnabled,
  captionFontStack,
  captionTextForClip,
  loadCustomCaptionFont,
} from '../lib/transcription.js';
import PreviewTransformControls from './PreviewTransformControls.jsx';
import PreviewTextEditor from './PreviewTextEditor.jsx';
import { textOverlayWidth } from '../lib/preview-transform.js';

function filterFor(effects = {}) {
  const grade = computedColorAdjustments(effects);
  const hue = (grade.temperature < 0 ? 185 : 0) + grade.tint * 0.25;
  return [
    `brightness(${100 + grade.exposure}%)`,
    `contrast(${grade.contrast}%)`,
    `saturate(${grade.saturation}%)`,
    `sepia(${Math.abs(grade.temperature) * 0.2}%)`,
    `hue-rotate(${hue}deg)`,
    `blur(${effects.blur || 0}px)`,
  ].join(' ');
}

function MediaLayer({ clip, asset, playhead, playing, style, className = '', hiddenAudio = false, onSelect }) {
  const mediaRef = useRef(null);
  const localTime = Math.max(0, clip.sourceStart + (playhead - clip.start) * (clip.speed || 1));
  const effects = clip.effects || {};

  useEffect(() => {
    const element = mediaRef.current;
    if (!element || asset.kind === 'image') return;
    const target = Math.min(localTime, Math.max(0, (asset.duration || localTime) - 0.04));
    if (Math.abs(element.currentTime - target) > (playing ? 0.35 : 0.04)) element.currentTime = target;
    element.volume = Math.max(0, Math.min(1, (effects.volume ?? 100) / 100));
    element.playbackRate = clip.speed || 1;
    if (playing) element.play().catch(() => {});
    else element.pause();
  }, [asset, clip.speed, effects.volume, localTime, playing]);

  const layerStyle = {
    ...style,
    filter: filterFor(effects),
    opacity: ((effects.opacity ?? 100) / 100) * (style?.opacity ?? 1),
    objectFit: clip.fit || 'contain',
    transform: `${style?.transform || ''} translate3d(${(effects.positionX || 0) / 2}%, ${(effects.positionY || 0) / 2}%, 0) rotate(${effects.rotation || 0}deg) scale(${((effects.scale ?? 100) / 100) * (effects.flipX ? -1 : 1)}, ${((effects.scale ?? 100) / 100) * (effects.flipY ? -1 : 1)})`,
  };

  if (asset.kind === 'audio') {
    if (hiddenAudio) {
      return <audio ref={mediaRef} className="preview-audio-element" src={asset.src} preload="auto" crossOrigin="anonymous" />;
    }
    return (
      <div className={`preview-layer preview-layer--audio ${className}`} style={layerStyle}>
        <audio ref={mediaRef} src={asset.src} preload="auto" crossOrigin="anonymous" />
        <MusicNotes size={42} weight="duotone" />
        <span>{asset.name}</span>
      </div>
    );
  }

  if (asset.kind === 'image') {
    return <img className={`preview-layer ${className}`} src={asset.src} alt="" style={layerStyle} crossOrigin="anonymous" onPointerDown={() => onSelect?.(clip.id)} />;
  }

  return <video ref={mediaRef} className={`preview-layer ${className}`} src={asset.src} preload="auto" style={layerStyle} crossOrigin="anonymous" onPointerDown={() => onSelect?.(clip.id)} />;
}

export default function Preview({
  clips,
  media,
  playhead,
  playing,
  selectedClipId,
  selectedTextId,
  textEditingClipId,
  textEditingTextId,
  onSelectClip,
  onSelectText,
  onBeginEdit,
  onEditText,
  onFinishText,
  onTransformClip,
  width = 1280,
  height = 720,
}) {
  const activeClips = useMemo(
    () => activeClipsAt(clips, playhead),
    [clips, playhead],
  );
  const visualLayers = activeClips.filter((clip) => clip.kind !== 'audio');
  const audioLayers = activeClips.filter((clip) => clip.kind === 'audio');
  const captionClip = [...activeClips].reverse().find((clip) => clip.transcript?.showAsCaptions && clip.transcript?.text);
  const captionText = captionClip ? captionTextForClip(captionClip, playhead) : '';
  const selectedVisual = activeClips.find((clip) => clip.id === selectedClipId && clip.kind !== 'audio');
  const selectedAsset = selectedVisual ? media.find((item) => item.id === selectedVisual.assetId) : null;
  const visibleTexts = visualLayers.flatMap((clip) => (
    clipTextOverlays(clip).map((textOverlay) => ({ clip, textOverlay }))
  ));
  const textControlEntry = resolveTextControlEntry(visualLayers, {
    selectedClipId,
    selectedTextId,
    textEditingClipId,
    textEditingTextId,
  });

  useEffect(() => {
    loadCustomCaptionFont(captionClip?.transcript?.customFont).catch(() => {});
  }, [captionClip?.transcript?.customFont]);

  return (
    <div className="preview-stage">
      <div className="preview-stage__checker" />
      <div className="preview-stage__frame">
        {visualLayers.map((clip) => {
          const asset = media.find((item) => item.id === clip.assetId);
          if (!asset) return null;
          const progress = getTransitionProgress(clip, playhead);
          const transition = clip.transition?.type || 'cut';
          const currentStyle = transition === 'dissolve' ? { opacity: progress }
            : transition === 'slide' ? { transform: `translate3d(${(1 - progress) * 100}%, 0, 0)` }
              : transition === 'zoom' ? { transform: `scale(${0.72 + progress * 0.28})`, opacity: progress }
                : transition === 'wipe' ? { clipPath: `inset(0 ${(1 - progress) * 100}% 0 0)` }
                  : {};
          currentStyle.zIndex = clipTrack(clip) + 1;
          const previous = clips.find((candidate) => (
            candidate.id !== clip.id
            && candidate.kind !== 'audio'
            && clipTrack(candidate) === clipTrack(clip)
            && Math.abs(candidate.start + candidate.duration - clip.start) < 0.05
          ));
          const previousAsset = previous ? media.find((item) => item.id === previous.assetId) : null;
          const previousStyle = transition === 'dissolve' ? { opacity: 1 - progress, zIndex: clipTrack(clip) + 1 }
            : transition === 'slide' ? { transform: `translate3d(${progress * -22}%, 0, 0)`, opacity: 1 - progress * 0.4, zIndex: clipTrack(clip) + 1 }
              : undefined;
          return (
            <Fragment key={clip.id}>
              {previous && previousAsset && progress < 1 && (
                <MediaLayer clip={previous} asset={previousAsset} playhead={previous.start + previous.duration - (clip.start + (clip.transition?.duration || 0) - playhead)} playing={playing} style={previousStyle} onSelect={onSelectClip} />
              )}
              <MediaLayer clip={clip} asset={asset} playhead={playhead} playing={playing} style={currentStyle} className="preview-layer--current" onSelect={onSelectClip} />
            </Fragment>
          );
        })}
        {audioLayers.map((clip, index) => {
          const asset = media.find((item) => item.id === clip.assetId);
          if (!asset) return null;
          return <MediaLayer key={clip.id} clip={clip} asset={asset} playhead={playhead} playing={playing} hiddenAudio={visualLayers.length > 0 || index < audioLayers.length - 1} />;
        })}
        {!activeClips.length && (
          <div className="preview-stage__idle">
            <span><Play size={18} weight="fill" /></span>
            <p>Preview monitor</p>
            <small>Place media on the timeline to begin</small>
          </div>
        )}
        {visualLayers.map((clip) => {
          const progress = getTransitionProgress(clip, playhead);
          return clip.transition?.type === 'dip' && progress < 1
            ? <div key={`dip-${clip.id}`} className="preview-stage__dip" style={{ opacity: Math.sin(progress * Math.PI), zIndex: clipTrack(clip) + 1.5 }} />
            : null;
        })}
        {visualLayers.filter((clip) => clip.effects?.vignette > 0).map((clip) => (
          <div key={`vignette-${clip.id}`} className="preview-stage__vignette" style={{ opacity: clip.effects.vignette / 100, zIndex: clipTrack(clip) + 1.6 }} />
        ))}
        {visibleTexts.filter(({ clip, textOverlay }) => (
          clip.id !== textControlEntry?.clip.id || textOverlay.id !== textControlEntry?.textOverlay.id
        )).map(({ clip, textOverlay }) => (
          <div
            key={`title-${clip.id}-${textOverlay.id}`}
            className={`preview-title ${selectedClipId === clip.id && selectedTextId === textOverlay.id ? 'is-selected' : ''}`}
            style={{
              left: `${textOverlay.positionX ?? 50}%`,
              top: `${textOverlay.positionY ?? 78}%`,
              color: textOverlay.color || '#ffffff',
              fontSize: `${(textOverlay.fontSize || 54) / 12.8}cqw`,
              width: textOverlayWidth(textOverlay.text),
              opacity: (textOverlay.opacity ?? 100) / 100,
              zIndex: clipTrack(clip) + 3,
            }}
            onPointerDown={(event) => {
              event.stopPropagation();
              onSelectText?.(clip.id, textOverlay.id);
            }}
            onDoubleClick={() => onEditText?.(clip.id, textOverlay.id)}
          >{textOverlay.text}</div>
        ))}
        {textControlEntry && (
          <PreviewTextEditor
            key={`text-editor-${textControlEntry.clip.id}-${textControlEntry.textOverlay.id}`}
            textOverlay={textControlEntry.textOverlay}
            clipName={textControlEntry.clip.name}
            editing={textControlEntry.editing}
            onBeginEdit={onBeginEdit}
            onEdit={() => onEditText?.(textControlEntry.clip.id, textControlEntry.textOverlay.id)}
            onChange={(nextText) => {
              const updatedClip = updateClipTextOverlay(
                textControlEntry.clip,
                textControlEntry.textOverlay.id,
                nextText,
              );
              onTransformClip?.(
                textControlEntry.clip.id,
                textControlEntry.textOverlay.id === LEGACY_TEXT_ID
                  ? { title: updatedClip.title }
                  : { textOverlays: updatedClip.textOverlays },
              );
            }}
            onFinish={onFinishText}
          />
        )}
        {captionText && (
          <div
            key={`${captionClip.id}-${captionText}`}
            className={`preview-caption ${captionBoxEnabled(captionClip.transcript) ? '' : 'preview-caption--no-box'}`}
            style={{
              color: captionClip.transcript.color || '#ffffff',
              fontFamily: captionFontStack(captionClip.transcript.fontFamily, captionClip.transcript.customFont),
              fontSize: `${(captionClip.transcript.fontSize || 54) / 12.8}cqw`,
            }}
          >{captionText}</div>
        )}
        {selectedVisual && selectedAsset && !selectedTextId && (
          <PreviewTransformControls
            clip={selectedVisual}
            asset={selectedAsset}
            stageWidth={width}
            stageHeight={height}
            onBeginEdit={onBeginEdit}
            onChange={(patch) => onTransformClip?.(selectedVisual.id, patch)}
          />
        )}
      </div>
      <div className="preview-stage__safe-area" aria-hidden="true" />
    </div>
  );
}
