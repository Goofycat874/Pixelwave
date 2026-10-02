import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowsInLineHorizontal,
  BookmarkSimple,
  CornersOut,
  CursorClick,
  Eye,
  EyeSlash,
  FilmStrip,
  LockSimple,
  LockSimpleOpen,
  MagnetStraight,
  Microphone,
  MinusCircle,
  MusicNotes,
  Plus,
  PlusCircle,
  Scissors,
  SpeakerSimpleHigh,
  SpeakerSimpleSlash,
  TextT,
  Trash,
} from '@phosphor-icons/react';
import {
  clipTrack,
  getProjectDuration,
  pasteClipAt,
  resizeClipEnd,
  timelineCanvasDuration,
  TIMELINE_GUTTER,
  timelineTracks,
  timelineZoomForDuration,
  trackAcceptsKind,
  trimClipStart,
} from '../../lib/editor.js';
import { formatTime } from '../../lib/media.js';
import { clipTrackState, laneKind, snapToFrame, trackState } from '../../lib/project.js';
import {
  anchoredScroll,
  PIXELS_PER_SECOND,
  rulerTicks,
  sliderToZoom,
  stepZoom,
  TRACK_HEIGHTS,
  zoomToSlider,
} from '../../lib/timeline-math.js';
import { IconButton, Menu, Segmented } from '../ui.jsx';
import TimelineClip from './TimelineClip.jsx';

const RULER_HEIGHT = 30;
const SNAP_PIXELS = 8;
const DRAG_TYPES = ['application/x-pixelwave-media', 'application/x-pixelwave-preset', 'Files'];

function round(value) {
  return Math.round(value * 1000) / 1000;
}

function dragWithPointer(event, { onMove, onEnd }) {
  const startX = event.clientX;
  const startY = event.clientY;
  let moved = false;
  const move = (moveEvent) => {
    const dx = moveEvent.clientX - startX;
    const dy = moveEvent.clientY - startY;
    if (!moved && Math.hypot(dx, dy) < 3) return;
    moved = true;
    onMove(moveEvent, dx, dy);
  };
  const stop = (upEvent) => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', stop);
    window.removeEventListener('pointercancel', stop);
    onEnd?.(upEvent, moved);
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', stop);
  window.addEventListener('pointercancel', stop);
}

function TrackHeader({ definition, state, onToggle }) {
  const { kind, track, label } = definition;
  const Icon = kind === 'audio' ? MusicNotes : FilmStrip;
  return (
    <div className={`track-header track-header--${kind} ${state.locked ? 'is-locked' : ''}`}>
      <span className="track-header__label"><Icon size={13} /> {label}</span>
      <span className="track-header__tools">
        {kind === 'video' && (
          <IconButton size="xs" label={state.hidden ? `Show ${label}` : `Hide ${label}`} active={state.hidden} onClick={() => onToggle(kind, track, 'hidden')}>
            {state.hidden ? <EyeSlash size={13} /> : <Eye size={13} />}
          </IconButton>
        )}
        <IconButton size="xs" label={state.muted ? `Unmute ${label}` : `Mute ${label}`} active={state.muted} onClick={() => onToggle(kind, track, 'muted')}>
          {state.muted ? <SpeakerSimpleSlash size={13} /> : <SpeakerSimpleHigh size={13} />}
        </IconButton>
        <IconButton size="xs" label={state.locked ? `Unlock ${label}` : `Lock ${label}`} active={state.locked} onClick={() => onToggle(kind, track, 'locked')}>
          {state.locked ? <LockSimple size={13} /> : <LockSimpleOpen size={13} />}
        </IconButton>
      </span>
    </div>
  );
}

export default function Timeline({
  project,
  playhead,
  playing,
  selectedClipIds,
  zoom,
  tool,
  snapping,
  inPoint,
  outPoint,
  shortcuts,
  onZoom,
  onTool,
  onSnapping,
  onSeek,
  onSelect,
  onBeginEdit,
  onLiveProject,
  onBlade,
  onDrop,
  onClipContextMenu,
  onLaneContextMenu,
  onMarkerContextMenu,
  onEditMarker,
  onToggleTrack,
  onAddTrack,
  actions,
  onResizeStart,
}) {
  const scrollRef = useRef(null);
  const zoomAnchor = useRef(null);
  const [viewport, setViewport] = useState({ left: 0, width: 1200 });
  const [snapTime, setSnapTime] = useState(null);
  const [marquee, setMarquee] = useState(null);
  const [dropTarget, setDropTarget] = useState(null);
  const [cornerMenu, setCornerMenu] = useState(null);
  const pixelsPerSecond = PIXELS_PER_SECOND * zoom;
  const duration = getProjectDuration(project.clips);
  const tracks = useMemo(() => timelineTracks(project.trackCounts), [project.trackCounts]);
  const assetById = useMemo(() => new Map(project.media.map((asset) => [asset.id, asset])), [project.media]);
  const canvasDuration = timelineCanvasDuration(duration, (viewport.width - TIMELINE_GUTTER) / pixelsPerSecond);
  const canvasWidth = canvasDuration * pixelsPerSecond;
  const markers = project.markers || [];
  const selectedSet = useMemo(() => new Set(selectedClipIds), [selectedClipIds]);
  const fps = project.frameRate || 30;

  const rows = useMemo(() => {
    let top = RULER_HEIGHT;
    return tracks.map((definition, index) => {
      const height = TRACK_HEIGHTS[definition.kind];
      const row = { ...definition, top, height, divider: index > 0 && tracks[index - 1].kind !== definition.kind };
      top += height + (row.divider ? 6 : 0);
      if (row.divider) row.top += 6;
      return row;
    });
  }, [tracks]);
  const contentHeight = rows.length ? rows.at(-1).top + rows.at(-1).height + 24 : RULER_HEIGHT;

  // ---------- geometry helpers ----------
  const timeFromClientX = useCallback((clientX) => {
    const rect = scrollRef.current.getBoundingClientRect();
    return Math.max(0, (clientX - rect.left + scrollRef.current.scrollLeft - TIMELINE_GUTTER) / pixelsPerSecond);
  }, [pixelsPerSecond]);

  const rowFromClientY = useCallback((clientY) => {
    const rect = scrollRef.current.getBoundingClientRect();
    const y = clientY - rect.top + scrollRef.current.scrollTop;
    return rows.find((row) => y >= row.top && y < row.top + row.height) || null;
  }, [rows]);

  const snapPoints = useCallback((excluded = []) => {
    const excludedSet = new Set(excluded);
    const points = [0, playhead, ...markers.map((marker) => marker.time)];
    if (inPoint !== null && inPoint !== undefined) points.push(inPoint);
    if (outPoint !== null && outPoint !== undefined) points.push(outPoint);
    for (const clip of project.clips) {
      if (excludedSet.has(clip.id)) continue;
      points.push(clip.start, clip.start + clip.duration);
    }
    return points;
  }, [inPoint, markers, outPoint, playhead, project.clips]);

  const snapValue = useCallback((value, points) => {
    let best = null;
    for (const point of points) {
      const distance = Math.abs(point - value) * pixelsPerSecond;
      if (distance <= SNAP_PIXELS && (!best || distance < best.distance)) best = { point, distance };
    }
    return best;
  }, [pixelsPerSecond]);

  // ---------- viewport ----------
  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return undefined;
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setViewport({ left: element.scrollLeft, width: element.clientWidth }));
    };
    update();
    element.addEventListener('scroll', update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => {
      cancelAnimationFrame(frame);
      element.removeEventListener('scroll', update);
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return undefined;
    const onWheel = (event) => {
      if (!(event.ctrlKey || event.metaKey)) return;
      event.preventDefault();
      const rect = element.getBoundingClientRect();
      const pointerOffset = event.clientX - rect.left;
      const time = Math.max(0, (pointerOffset + element.scrollLeft - TIMELINE_GUTTER) / pixelsPerSecond);
      zoomAnchor.current = { time, pointerOffset };
      onZoom(stepZoom(zoom, event.deltaY < 0 ? 1 : -1));
    };
    element.addEventListener('wheel', onWheel, { passive: false });
    return () => element.removeEventListener('wheel', onWheel);
  }, [onZoom, pixelsPerSecond, zoom]);

  useLayoutEffect(() => {
    const anchor = zoomAnchor.current;
    const element = scrollRef.current;
    if (!anchor || !element) return;
    zoomAnchor.current = null;
    element.scrollLeft = anchoredScroll({ ...anchor, gutter: TIMELINE_GUTTER, pixelsPerSecond });
  }, [pixelsPerSecond]);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element || !playing) return;
    const x = TIMELINE_GUTTER + playhead * pixelsPerSecond;
    if (x > element.scrollLeft + element.clientWidth - 48) element.scrollLeft = x - TIMELINE_GUTTER - 80;
    else if (x < element.scrollLeft + TIMELINE_GUTTER) element.scrollLeft = Math.max(0, x - TIMELINE_GUTTER - 80);
  }, [pixelsPerSecond, playhead, playing]);

  const zoomAroundPlayhead = (nextZoom) => {
    const element = scrollRef.current;
    if (element) {
      const offset = Math.min(element.clientWidth - 40, Math.max(TIMELINE_GUTTER + 40, TIMELINE_GUTTER + playhead * pixelsPerSecond - element.scrollLeft));
      zoomAnchor.current = { time: playhead, pointerOffset: offset };
    }
    onZoom(nextZoom);
  };

  const fitToWindow = () => {
    const element = scrollRef.current;
    if (!element) return;
    onZoom(timelineZoomForDuration(duration, element.clientWidth));
    requestAnimationFrame(() => { element.scrollLeft = 0; });
  };

  // ---------- interactions ----------
  const isLocked = (clip) => clipTrackState(project, clip).locked;

  function beginScrub(event) {
    if (event.button !== 0) return;
    event.preventDefault();
    onSeek(timeFromClientX(event.clientX), { scrub: true });
    dragWithPointer(event, { onMove: (moveEvent) => onSeek(timeFromClientX(moveEvent.clientX), { scrub: true }) });
  }

  function beginClipDrag(event, clip) {
    if (event.button !== 0) return;
    event.stopPropagation();
    if (tool === 'blade') {
      if (isLocked(clip)) return;
      const time = timeFromClientX(event.clientX);
      const snapped = snapping ? snapValue(time, [playhead, ...markers.map((marker) => marker.time)])?.point ?? time : time;
      onBlade(clip.id, snapToFrame(snapped, fps));
      return;
    }
    if (isLocked(clip)) return;
    if (event.shiftKey || event.metaKey || event.ctrlKey) {
      onSelect([clip.id], 'toggle');
      return;
    }
    let ids = selectedClipIds;
    if (!selectedSet.has(clip.id)) {
      ids = [clip.id];
      onSelect(ids, 'replace');
    }
    const movable = project.clips.filter((candidate) => ids.includes(candidate.id) && !isLocked(candidate));
    if (!movable.length) return;
    const duplicate = event.altKey;
    let moving = new Map(movable.map((item) => [item.id, { start: item.start, track: clipTrack(item), kind: laneKind(item) }]));
    const groupStart = Math.min(...movable.map((item) => item.start));
    const groupEnd = Math.max(...movable.map((item) => item.start + item.duration));
    const points = snapPoints(movable.map((item) => item.id));
    const single = movable.length === 1;
    let began = false;

    dragWithPointer(event, {
      onMove: (moveEvent, dx) => {
        if (!began) {
          began = true;
          onBeginEdit(duplicate ? 'Duplicate clips' : 'Move clips');
          if (duplicate) {
            const copies = movable.map((item) => pasteClipAt(item, item.start));
            moving = new Map(copies.map((copy) => [copy.id, { start: copy.start, track: clipTrack(copy), kind: laneKind(copy) }]));
            onLiveProject((current) => ({ ...current, clips: [...current.clips, ...copies] }));
            onSelect(copies.map((copy) => copy.id), 'replace');
          }
        }
        let delta = dx / pixelsPerSecond;
        let snappedTo = null;
        if (snapping) {
          const startSnap = snapValue(groupStart + delta, points);
          const endSnap = snapValue(groupEnd + delta, points);
          const best = [startSnap && { ...startSnap, delta: startSnap.point - groupStart }, endSnap && { ...endSnap, delta: endSnap.point - groupEnd }]
            .filter(Boolean)
            .sort((a, b) => a.distance - b.distance)[0];
          if (best) {
            delta = best.delta;
            snappedTo = best.point;
          }
        }
        delta = Math.max(-groupStart, delta);
        setSnapTime(snappedTo);
        let nextTrack = null;
        if (single) {
          const row = rowFromClientY(moveEvent.clientY);
          const [entry] = moving.values();
          if (row && trackAcceptsKind(row.kind, entry.kind === 'audio' ? 'audio' : 'video') && !trackState(project, row.kind, row.track).locked) nextTrack = row.track;
        }
        onLiveProject((current) => ({
          ...current,
          clips: current.clips.map((item) => {
            const origin = moving.get(item.id);
            if (!origin) return item;
            return { ...item, start: round(origin.start + delta), track: nextTrack ?? origin.track };
          }),
        }));
      },
      onEnd: () => setSnapTime(null),
    });
  }

  function beginTrim(event, clip, edge) {
    if (event.button !== 0) return;
    event.stopPropagation();
    if (!selectedSet.has(clip.id)) onSelect([clip.id], 'replace');
    const asset = assetById.get(clip.assetId);
    const sourceDuration = clip.kind === 'video' || clip.kind === 'audio' ? asset?.duration || clip.sourceEnd : Number.POSITIVE_INFINITY;
    const points = snapPoints([clip.id]);
    let began = false;
    dragWithPointer(event, {
      onMove: (_moveEvent, dx) => {
        if (!began) { began = true; onBeginEdit('Trim clip'); }
        let delta = dx / pixelsPerSecond;
        const edgeTime = edge === 'start' ? clip.start : clip.start + clip.duration;
        const snap = snapping ? snapValue(edgeTime + delta, points) : null;
        if (snap) delta = snap.point - edgeTime;
        setSnapTime(snap?.point ?? null);
        const patch = edge === 'start' ? trimClipStart(clip, delta) : resizeClipEnd(clip, sourceDuration, delta);
        onLiveProject((current) => ({ ...current, clips: current.clips.map((item) => (item.id === clip.id ? { ...item, ...patch } : item)) }));
      },
      onEnd: () => setSnapTime(null),
    });
  }

  function beginFade(event, clip, which) {
    if (event.button !== 0) return;
    event.stopPropagation();
    let began = false;
    const initial = which === 'in' ? clip.fadeIn || 0 : clip.fadeOut || 0;
    const other = which === 'in' ? clip.fadeOut || 0 : clip.fadeIn || 0;
    dragWithPointer(event, {
      onMove: (_moveEvent, dx) => {
        if (!began) { began = true; onBeginEdit(which === 'in' ? 'Fade in' : 'Fade out'); }
        const change = (which === 'in' ? dx : -dx) / pixelsPerSecond;
        const value = round(Math.min(Math.max(0, clip.duration - other), Math.max(0, initial + change)));
        onLiveProject((current) => ({
          ...current,
          clips: current.clips.map((item) => (item.id === clip.id ? { ...item, [which === 'in' ? 'fadeIn' : 'fadeOut']: value } : item)),
        }));
      },
    });
  }

  function beginLanePointer(event) {
    if (event.button !== 0 || event.target.closest('.clip')) return;
    const rect = scrollRef.current.getBoundingClientRect();
    const origin = {
      x: event.clientX - rect.left + scrollRef.current.scrollLeft,
      y: event.clientY - rect.top + scrollRef.current.scrollTop,
    };
    const additive = event.shiftKey || event.metaKey || event.ctrlKey;
    const base = additive ? selectedClipIds : [];
    dragWithPointer(event, {
      onMove: (moveEvent) => {
        const x = moveEvent.clientX - rect.left + scrollRef.current.scrollLeft;
        const y = moveEvent.clientY - rect.top + scrollRef.current.scrollTop;
        const box = { left: Math.min(origin.x, x), top: Math.min(origin.y, y), width: Math.abs(x - origin.x), height: Math.abs(y - origin.y) };
        setMarquee(box);
        const startTime = (box.left - TIMELINE_GUTTER) / pixelsPerSecond;
        const endTime = (box.left + box.width - TIMELINE_GUTTER) / pixelsPerSecond;
        const hit = project.clips.filter((clip) => {
          if (isLocked(clip)) return false;
          const row = rows.find((candidate) => candidate.kind === laneKind(clip) && candidate.track === clipTrack(clip));
          if (!row) return false;
          const overlapsY = row.top < box.top + box.height && row.top + row.height > box.top;
          return overlapsY && clip.start < endTime && clip.start + clip.duration > startTime;
        }).map((clip) => clip.id);
        onSelect([...new Set([...base, ...hit])], 'replace');
      },
      onEnd: (upEvent, moved) => {
        setMarquee(null);
        if (!moved) {
          if (!additive) onSelect([], 'replace');
          onSeek(timeFromClientX(upEvent.clientX), { scrub: false });
        }
      },
    });
  }

  function beginMarkerDrag(event, marker) {
    if (event.button !== 0) return;
    event.stopPropagation();
    const points = snapPoints().filter((point) => point !== marker.time);
    let began = false;
    dragWithPointer(event, {
      onMove: (moveEvent) => {
        if (!began) { began = true; onBeginEdit('Move marker'); }
        let time = timeFromClientX(moveEvent.clientX);
        const snap = snapping ? snapValue(time, points) : null;
        if (snap) time = snap.point;
        onLiveProject((current) => ({ ...current, markers: current.markers.map((item) => (item.id === marker.id ? { ...item, time: round(time) } : item)) }));
      },
      onEnd: (_upEvent, moved) => { if (!moved) onSeek(marker.time, { scrub: false }); },
    });
  }

  function laneContextMenu(event) {
    if (event.target.closest('.clip')) return;
    event.preventDefault();
    const row = rowFromClientY(event.clientY);
    onLaneContextMenu?.(event, { time: timeFromClientX(event.clientX), kind: row?.kind, track: row?.track });
  }

  // ---------- drag and drop ----------
  const acceptsDrag = (event) => DRAG_TYPES.some((type) => event.dataTransfer?.types?.includes(type));

  function handleDragOver(event) {
    if (!acceptsDrag(event)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
    const row = rowFromClientY(event.clientY);
    let time = timeFromClientX(event.clientX);
    const snap = snapping ? snapValue(time, snapPoints()) : null;
    if (snap) time = snap.point;
    setDropTarget({ time, kind: row?.kind || 'video', track: row?.track ?? 0 });
  }

  function handleDrop(event) {
    if (!acceptsDrag(event)) return;
    event.preventDefault();
    // Keep the window-level file drop handler from importing the same files a second time.
    event.stopPropagation();
    const target = dropTarget || { time: timeFromClientX(event.clientX), kind: 'video', track: 0 };
    setDropTarget(null);
    onDrop?.(event.dataTransfer, target);
  }

  // ---------- render ----------
  const visibleStart = Math.max(0, (viewport.left - TIMELINE_GUTTER) / pixelsPerSecond);
  const visibleEnd = (viewport.left + viewport.width) / pixelsPerSecond;
  const { ticks, major } = rulerTicks(visibleStart, Math.min(canvasDuration, visibleEnd), pixelsPerSecond);
  const labelPrecise = major < 1;
  const playheadX = TIMELINE_GUTTER + playhead * pixelsPerSecond;
  const hasRange = inPoint !== null && inPoint !== undefined && outPoint !== null && outPoint !== undefined && outPoint > inPoint;

  return (
    <section className="panel timeline" aria-label="Timeline">
      <div className="timeline__resize" onPointerDown={onResizeStart} role="separator" aria-orientation="horizontal" aria-label="Resize timeline" />
      <div className="timeline-toolbar">
        <div className="timeline-toolbar__group">
          <Segmented
            size="sm"
            label="Timeline tool"
            value={tool}
            onChange={onTool}
            options={[
              ['select', '', CursorClick, `Select (${shortcuts.select})`],
              ['blade', '', Scissors, `Blade: click a clip to cut it (${shortcuts.blade})`],
            ]}
          />
          <span className="toolbar-divider" />
          <IconButton label="Split at playhead" shortcut={shortcuts.split} onClick={actions.split}><Scissors size={16} /></IconButton>
          <IconButton label="Delete" shortcut={shortcuts.delete} onClick={actions.delete} disabled={!selectedClipIds.length}><Trash size={16} /></IconButton>
          <IconButton label="Ripple delete: remove and close the gap" shortcut={shortcuts.rippleDelete} onClick={actions.rippleDelete} disabled={!selectedClipIds.length}><ArrowsInLineHorizontal size={16} /></IconButton>
          <span className="toolbar-divider" />
          <IconButton label="Add marker" shortcut={shortcuts.marker} onClick={actions.addMarker}><BookmarkSimple size={16} /></IconButton>
          <IconButton label="Add text" shortcut={shortcuts.text} onClick={actions.addText}><TextT size={16} /></IconButton>
          <IconButton label="Record voiceover" onClick={actions.recordVoice}><Microphone size={16} /></IconButton>
        </div>
        <div className="timeline-toolbar__time mono">
          {formatTime(playhead, true, fps)}
          <span> / {formatTime(duration, true, fps)}</span>
        </div>
        <div className="timeline-toolbar__group">
          <IconButton label="Snapping" shortcut={shortcuts.snapping} active={snapping} onClick={() => onSnapping(!snapping)}><MagnetStraight size={16} /></IconButton>
          <span className="toolbar-divider" />
          <IconButton label="Zoom out" shortcut="-" onClick={() => zoomAroundPlayhead(stepZoom(zoom, -1))}><MinusCircle size={16} /></IconButton>
          <input
            className="zoom-slider"
            type="range"
            min={0}
            max={100}
            step={0.5}
            aria-label="Timeline zoom"
            value={zoomToSlider(zoom)}
            style={{ '--fill': `${zoomToSlider(zoom)}%` }}
            onChange={(event) => zoomAroundPlayhead(sliderToZoom(Number(event.target.value)))}
          />
          <IconButton label="Zoom in" shortcut="=" onClick={() => zoomAroundPlayhead(stepZoom(zoom, 1))}><PlusCircle size={16} /></IconButton>
          <IconButton label="Fit timeline to window" shortcut={shortcuts.fit} onClick={fitToWindow}><CornersOut size={16} /></IconButton>
        </div>
      </div>

      <div
        className={`timeline-scroll ${tool === 'blade' ? 'is-blade' : ''}`}
        ref={scrollRef}
        onDragOver={handleDragOver}
        onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setDropTarget(null); }}
        onDrop={handleDrop}
      >
        <div className="timeline-canvas" style={{ width: TIMELINE_GUTTER + canvasWidth, height: contentHeight }}>
          <div className="timeline-ruler-row" style={{ height: RULER_HEIGHT }}>
            <div className="timeline-corner">
              <IconButton size="xs" label="Add track" onClick={(event) => {
                const rect = event.currentTarget.getBoundingClientRect();
                setCornerMenu({ x: rect.left, y: rect.bottom + 4 });
              }}><Plus size={13} /></IconButton>
              <span>Tracks</span>
            </div>
            <div className="timeline-ruler" style={{ width: canvasWidth }} onPointerDown={beginScrub}>
              {hasRange && (
                <span className="timeline-range" style={{ left: inPoint * pixelsPerSecond, width: (outPoint - inPoint) * pixelsPerSecond }} />
              )}
              {ticks.map((tick) => (
                <span key={tick.time} className={`ruler-tick ${tick.major ? 'is-major' : ''}`} style={{ left: tick.time * pixelsPerSecond }}>
                  {tick.major && <small>{formatTime(tick.time, labelPrecise, fps)}</small>}
                </span>
              ))}
              {markers.map((marker) => (
                <button
                  key={marker.id}
                  type="button"
                  className="ruler-marker"
                  style={{ left: marker.time * pixelsPerSecond, '--marker-color': marker.color || 'var(--accent)' }}
                  title={marker.label || 'Marker'}
                  aria-label={`Marker ${marker.label || ''} at ${formatTime(marker.time)}`}
                  onPointerDown={(event) => beginMarkerDrag(event, marker)}
                  onDoubleClick={(event) => onEditMarker?.(marker, event.currentTarget.getBoundingClientRect())}
                  onContextMenu={(event) => { event.preventDefault(); onMarkerContextMenu?.(event, marker); }}
                >
                  {marker.label && pixelsPerSecond > 20 && <span>{marker.label}</span>}
                </button>
              ))}
              {inPoint !== null && inPoint !== undefined && <span className="ruler-bound ruler-bound--in" style={{ left: inPoint * pixelsPerSecond }} title="In point" />}
              {outPoint !== null && outPoint !== undefined && <span className="ruler-bound ruler-bound--out" style={{ left: outPoint * pixelsPerSecond }} title="Out point" />}
            </div>
          </div>

          {rows.map((row) => {
            const state = trackState(project, row.kind, row.track);
            const laneClips = project.clips.filter((clip) => laneKind(clip) === row.kind && clipTrack(clip) === row.track);
            const isDrop = dropTarget && dropTarget.kind === row.kind && dropTarget.track === row.track;
            return (
              <div
                key={`${row.kind}-${row.track}`}
                className={`track-row track-row--${row.kind} ${row.divider ? 'has-divider' : ''} ${state.locked ? 'is-locked' : ''} ${isDrop ? 'is-drop' : ''}`}
                style={{ top: row.top, height: row.height }}
              >
                <TrackHeader definition={row} state={state} onToggle={onToggleTrack} />
                <div
                  className="track-lane"
                  style={{ width: canvasWidth }}
                  onPointerDown={beginLanePointer}
                  onContextMenu={laneContextMenu}
                >
                  {laneClips.map((clip) => (
                    <TimelineClip
                      key={clip.id}
                      clip={clip}
                      asset={assetById.get(clip.assetId)}
                      pixelsPerSecond={pixelsPerSecond}
                      height={row.height}
                      selected={selectedSet.has(clip.id)}
                      locked={state.locked}
                      hidden={state.hidden}
                      muted={state.muted || clip.muted}
                      bladeMode={tool === 'blade'}
                      onClipPointerDown={beginClipDrag}
                      onTrimPointerDown={beginTrim}
                      onFadePointerDown={beginFade}
                      onKeyframeClick={(target, time) => onSeek(target.start + time, { scrub: false })}
                      onContextMenu={(event, target) => { event.preventDefault(); event.stopPropagation(); onClipContextMenu?.(event, target); }}
                    />
                  ))}
                </div>
              </div>
            );
          })}

          {hasRange && (
            <span className="timeline-range-shade" style={{ left: TIMELINE_GUTTER + inPoint * pixelsPerSecond, width: (outPoint - inPoint) * pixelsPerSecond, top: RULER_HEIGHT, height: contentHeight - RULER_HEIGHT }} />
          )}
          {snapTime !== null && <span className="timeline-snap" style={{ left: TIMELINE_GUTTER + snapTime * pixelsPerSecond, height: contentHeight }} />}
          {dropTarget && <span className="timeline-drop" style={{ left: TIMELINE_GUTTER + dropTarget.time * pixelsPerSecond, height: contentHeight }} />}
          {marquee && <span className="timeline-marquee" style={marquee} />}
          <div className="timeline-playhead" style={{ transform: `translateX(${playheadX}px)`, height: contentHeight }}>
            <span className="timeline-playhead__head" onPointerDown={beginScrub} />
          </div>
        </div>
      </div>
      {cornerMenu && (
        <Menu
          x={cornerMenu.x}
          y={cornerMenu.y}
          onClose={() => setCornerMenu(null)}
          items={[
            { label: 'Add video track', icon: FilmStrip, onSelect: () => onAddTrack('video'), disabled: (project.trackCounts?.video || 3) >= 6 },
            { label: 'Add audio track', icon: MusicNotes, onSelect: () => onAddTrack('audio'), disabled: (project.trackCounts?.audio || 2) >= 6 },
          ]}
        />
      )}
    </section>
  );
}
