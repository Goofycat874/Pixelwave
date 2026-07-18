import { useMemo, useRef, useState } from 'react';
import {
  CornersOut,
  Copy,
  CrosshairSimple,
  FilmStrip,
  MagnetStraight,
  Minus,
  MusicNotes,
  Plus,
  Scissors,
  Trash,
} from '@phosphor-icons/react';
import { formatTime } from '../lib/media.js';
import {
  clipTextOverlays,
  clipTrack,
  resizeClipEnd,
  snapTimelineTime,
  TIMELINE_TRACKS,
  timelineTimeFromPointer,
  timelineZoomForDuration,
  trackAcceptsKind,
} from '../lib/editor.js';
import IconButton from './IconButton.jsx';

const MIN_DURATION = 0.1;

export default function Timeline({
  clips,
  media,
  selectedClipId,
  playhead,
  duration,
  zoom,
  onZoom,
  onSelect,
  onSeek,
  onBeginEdit,
  onPatchClip,
  onSplit,
  onDuplicate,
  onDelete,
  onDropAsset,
}) {
  const scrollRef = useRef(null);
  const [snapping, setSnapping] = useState(true);
  const pixelsPerSecond = 64 * zoom;
  const timelineDuration = Math.max(30, Math.ceil(duration + 8));
  const canvasWidth = timelineDuration * pixelsPerSecond;
  const ticks = useMemo(() => Array.from({ length: timelineDuration + 1 }, (_, index) => index), [timelineDuration]);

  function timeFromPointer(event) {
    const rect = scrollRef.current.getBoundingClientRect();
    return timelineTimeFromPointer({
      clientX: event.clientX,
      viewportLeft: rect.left,
      scrollLeft: scrollRef.current.scrollLeft,
      pixelsPerSecond,
    });
  }

  function snapped(value, excludedClipId = null) {
    return snapTimelineTime(value, clips, pixelsPerSecond, excludedClipId, snapping);
  }

  function fitSequence() {
    const viewport = scrollRef.current;
    if (!viewport) return;
    onZoom(timelineZoomForDuration(duration, viewport.clientWidth));
    requestAnimationFrame(() => viewport.scrollTo({ left: 0, behavior: 'smooth' }));
  }

  function findPlayhead() {
    const viewport = scrollRef.current;
    if (!viewport) return;
    const left = 84 + playhead * pixelsPerSecond - viewport.clientWidth / 2;
    viewport.scrollTo({ left: Math.max(0, left), behavior: 'smooth' });
  }

  function beginScrub(event) {
    if (event.button !== 0) return;
    onSeek(timeFromPointer(event));
    const scrub = (moveEvent) => onSeek(timeFromPointer(moveEvent));
    const stop = () => {
      window.removeEventListener('pointermove', scrub);
      window.removeEventListener('pointerup', stop);
    };
    window.addEventListener('pointermove', scrub);
    window.addEventListener('pointerup', stop, { once: true });
  }

  function beginMove(event, clip) {
    if (event.button !== 0 || event.target.closest('.trim-handle')) return;
    event.stopPropagation();
    onSelect(clip.id);
    const initialX = event.clientX;
    const initialStart = clip.start;
    let editingStarted = false;
    let moved = false;
    const onMove = (moveEvent) => {
      const deltaX = moveEvent.clientX - initialX;
      if (Math.abs(deltaX) < 2) return;
      moved = true;
      if (!editingStarted) {
        editingStarted = true;
        onBeginEdit();
      }
      const next = snapped(initialStart + deltaX / pixelsPerSecond, clip.id);
      const lane = document.elementFromPoint(moveEvent.clientX, moveEvent.clientY)?.closest?.('[data-timeline-kind]');
      const nextTrack = lane && trackAcceptsKind(lane.dataset.timelineKind, clip.kind)
        ? Number(lane.dataset.timelineTrack)
        : clipTrack(clip);
      onPatchClip(clip.id, { start: Math.round(next * 1000) / 1000, track: nextTrack });
    };
    const stop = (upEvent) => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', stop);
      if (!moved) onSeek(timeFromPointer(upEvent));
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', stop, { once: true });
  }

  function beginTrim(event, clip, edge) {
    event.stopPropagation();
    onSelect(clip.id);
    onBeginEdit();
    const initialX = event.clientX;
    const onMove = (moveEvent) => {
      const rawDelta = (moveEvent.clientX - initialX) / pixelsPerSecond;
      if (edge === 'start') {
        const speed = clip.speed || 1;
        const removed = Math.max(-clip.sourceStart / speed, Math.min(clip.duration - MIN_DURATION, rawDelta));
        onPatchClip(clip.id, {
          start: clip.start + removed,
          sourceStart: clip.sourceStart + removed * speed,
          duration: clip.duration - removed,
        });
      } else {
        const sourceDuration = media.find((item) => item.id === clip.assetId)?.duration || clip.sourceEnd;
        onPatchClip(clip.id, resizeClipEnd(clip, sourceDuration, rawDelta));
      }
    };
    const stop = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', stop);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', stop, { once: true });
  }

  function handleDrop(event) {
    event.preventDefault();
    const assetId = event.dataTransfer.getData('application/x-pixelwave-media');
    const asset = media.find((item) => item.id === assetId);
    if (assetId && asset) onDropAsset(assetId, snapped(timeFromPointer(event)), 0);
  }

  function handleLaneDrop(event, definition) {
    event.preventDefault();
    event.stopPropagation();
    const assetId = event.dataTransfer.getData('application/x-pixelwave-media');
    const asset = media.find((item) => item.id === assetId);
    if (asset && trackAcceptsKind(definition.kind, asset.kind)) {
      onDropAsset(assetId, snapped(timeFromPointer(event)), definition.track);
    }
  }

  function renderTrack(definition) {
    const { kind, label, track } = definition;
    const Icon = kind === 'audio' ? MusicNotes : FilmStrip;
    const trackClips = clips.filter((clip) => trackAcceptsKind(kind, clip.kind) && clipTrack(clip) === track);
    const detail = kind === 'audio' ? (track === 0 ? 'Main' : 'Mix') : (track === 0 ? 'Base' : 'Overlay');
    return (
      <div className={`timeline-row timeline-row--${kind} ${track === 0 ? 'timeline-row--base' : ''}`} key={`${kind}-${track}`}>
        <div className="timeline-row__label"><Icon size={15} /><span><strong>{label}</strong><small>{detail}</small></span></div>
        <div
          className="timeline-row__lane"
          data-timeline-kind={kind}
          data-timeline-track={track}
          style={{ width: canvasWidth }}
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => handleLaneDrop(event, definition)}
          onPointerDown={(event) => event.target === event.currentTarget && beginScrub(event)}
        >
          {trackClips.map((clip) => {
            const asset = media.find((item) => item.id === clip.assetId);
            return (
              <div
                key={clip.id}
                className={`timeline-clip timeline-clip--${clip.kind} ${selectedClipId === clip.id ? 'is-selected' : ''}`}
                style={{ left: clip.start * pixelsPerSecond, width: Math.max(18, clip.duration * pixelsPerSecond), '--clip-image': asset?.thumbnail ? `url("${asset.thumbnail}")` : 'none' }}
                onPointerDown={(event) => beginMove(event, clip)}
                onDoubleClick={() => onSeek(clip.start)}
              >
                <button className="trim-handle trim-handle--start" type="button" aria-label={`Trim start of ${clip.name}`} onPointerDown={(event) => beginTrim(event, clip, 'start')} />
                <div className="timeline-clip__content">
                  <strong>{clip.name.replace(/\.[^.]+$/, '')}</strong>
                  <span>{formatTime(clip.duration)}</span>
                </div>
                {clip.transition.type !== 'cut' && <span className="timeline-clip__transition">{clip.transition.type}</span>}
                {(clip.speed || 1) !== 1 && <span className="timeline-clip__speed">{clip.speed}×</span>}
                {clipTextOverlays(clip).length > 0 && <span className="timeline-clip__title-mark">T</span>}
                <button className="trim-handle trim-handle--end" type="button" aria-label={`Trim end of ${clip.name}`} onPointerDown={(event) => beginTrim(event, clip, 'end')} />
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <section className="timeline panel" aria-label="Timeline">
      <div className="timeline-toolbar">
        <div className="timeline-toolbar__title">
          <p className="eyebrow">Sequence 01</p>
          <strong>{formatTime(duration, true)}</strong>
          <span className="timeline-layer-count">3 VIDEO · 3 AUDIO</span>
        </div>
        <div className="timeline-toolbar__tools">
          <IconButton label="Split at playhead" shortcut="S" onClick={onSplit} disabled={!selectedClipId}><Scissors size={16} /></IconButton>
          <IconButton label="Duplicate selected clip" shortcut="⌘D" onClick={onDuplicate} disabled={!selectedClipId}><Copy size={16} /></IconButton>
          <IconButton label="Delete selected clip" shortcut="Delete" onClick={onDelete} disabled={!selectedClipId}><Trash size={16} /></IconButton>
          <span className="toolbar-divider" />
          <IconButton label="Toggle snapping" active={snapping} onClick={() => setSnapping((value) => !value)}><MagnetStraight size={16} /></IconButton>
          <IconButton label="Fit sequence" onClick={fitSequence}><CornersOut size={16} /></IconButton>
          <IconButton label="Center playhead" onClick={findPlayhead}><CrosshairSimple size={16} /></IconButton>
          <IconButton label="Zoom out" onClick={() => onZoom(Math.max(0.15, zoom - 0.15))}><Minus size={16} /></IconButton>
          <div className="zoom-meter" aria-label={`Timeline zoom ${Math.round(zoom * 100)} percent`}><span style={{ width: `${((zoom - 0.15) / 1.85) * 100}%` }} /></div>
          <span className="zoom-readout">{Math.round(zoom * 100)}%</span>
          <IconButton label="Zoom in" onClick={() => onZoom(Math.min(2, zoom + 0.15))}><Plus size={16} /></IconButton>
        </div>
      </div>

      <div
        className="timeline-scroll"
        ref={scrollRef}
        onDragOver={(event) => event.preventDefault()}
        onDrop={handleDrop}
      >
        <div className="timeline-canvas" style={{ width: canvasWidth + 84 }}>
          <div className="timeline-ruler-label" />
          <div className="timeline-ruler" style={{ width: canvasWidth }} onPointerDown={beginScrub}>
            {ticks.map((tick) => (
              <span className={`timeline-tick ${tick % 5 === 0 ? 'is-major' : ''}`} key={tick} style={{ left: tick * pixelsPerSecond }}>
                {tick % 5 === 0 && <small>{formatTime(tick)}</small>}
              </span>
            ))}
          </div>
          {TIMELINE_TRACKS.map(renderTrack)}
          <div className="timeline-playhead" style={{ transform: `translate3d(${playhead * pixelsPerSecond}px, 0, 0)` }}>
            <span />
          </div>
        </div>
      </div>
    </section>
  );
}
