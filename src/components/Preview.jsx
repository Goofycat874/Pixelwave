import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { MusicNotes } from '@phosphor-icons/react';
import { animatedEffects, applyEffectChanges, clipLocalTime } from '../lib/animation.js';
import { drawFrame, framePlan, hitTest } from '../lib/compositor.js';
import { clipTextOverlays, updateClipTextOverlay } from '../lib/editor.js';
import { projectFontRequests } from '../lib/exporter.js';
import { fontStack } from '../lib/fonts.js';
import PreviewSourcePool from '../lib/preview-sources.js';
import { isClipLocked } from '../lib/project.js';
import { resolveTextStyle } from '../lib/text.js';
import { loadCustomCaptionFont } from '../lib/transcription.js';

const STAGE_PADDING = 20;
const SNAP_THRESHOLD = 1.2;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function round(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function boxFromCorners(corners) {
  const [a, b, , d] = corners;
  const centerX = corners.reduce((sum, point) => sum + point[0], 0) / 4;
  const centerY = corners.reduce((sum, point) => sum + point[1], 0) / 4;
  return {
    centerX,
    centerY,
    width: Math.hypot(b[0] - a[0], b[1] - a[1]),
    height: Math.hypot(d[0] - a[0], d[1] - a[1]),
    rotation: (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI,
  };
}

function sameBox(a, b) {
  if (!a || !b) return a === b;
  return ['centerX', 'centerY', 'width', 'height', 'rotation'].every((key) => Math.abs(a[key] - b[key]) < 0.05)
    && a.clipId === b.clipId && a.textId === b.textId;
}

function dragWithPointer(event, { onMove, onEnd }) {
  const startX = event.clientX;
  const startY = event.clientY;
  let moved = false;
  const move = (moveEvent) => {
    const dx = moveEvent.clientX - startX;
    const dy = moveEvent.clientY - startY;
    if (!moved && Math.hypot(dx, dy) < 2) return;
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

const corners = ['nw', 'ne', 'se', 'sw'];

export default function Preview({
  project,
  playhead,
  playing,
  selectedClipIds = [],
  selectedTextId = null,
  editingText = null,
  guides = false,
  onSelect,
  onClearSelection,
  onEditText,
  onFinishText,
  onBeginEdit,
  onLiveClip,
  children,
}) {
  const rootRef = useRef(null);
  const canvasRef = useRef(null);
  const poolRef = useRef(null);
  const hitsRef = useRef({ media: [], texts: [] });
  const dirtyRef = useRef(true);
  const latest = useRef({});
  const [stage, setStage] = useState({ width: 0, height: 0 });
  const [selectionBox, setSelectionBox] = useState(null);
  const [snapGuides, setSnapGuides] = useState({ x: false, y: false });
  const width = project.width || 1920;
  const height = project.height || 1080;
  const primaryId = selectedClipIds.at(-1) || null;

  latest.current = { project, playhead, playing, editingText, primaryId, selectedTextId, stage };
  dirtyRef.current = true;

  useLayoutEffect(() => {
    const element = rootRef.current;
    if (!element) return undefined;
    const measure = () => {
      const availableWidth = Math.max(0, element.clientWidth - STAGE_PADDING * 2);
      const availableHeight = Math.max(0, element.clientHeight - STAGE_PADDING * 2);
      const scale = Math.min(availableWidth / width, availableHeight / height);
      setStage({ width: Math.max(1, Math.floor(width * scale)), height: Math.max(1, Math.floor(height * scale)) });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [width, height]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !stage.width) return;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const backingWidth = Math.min(width, Math.round(stage.width * ratio));
    canvas.width = Math.max(2, backingWidth);
    canvas.height = Math.max(2, Math.round(backingWidth * (height / width)));
    dirtyRef.current = true;
  }, [stage.width, width, height]);

  useEffect(() => {
    const pool = new PreviewSourcePool({ onChange: () => { dirtyRef.current = true; } });
    poolRef.current = pool;
    let frame = 0;
    let waitingSince = null;

    const draw = () => {
      const canvas = canvasRef.current;
      const state = latest.current;
      if (!canvas || !state.project) return;
      const context = canvas.getContext('2d', { alpha: false });
      const hits = drawFrame(context, {
        project: state.project,
        time: state.playhead,
        getSource: pool.getSource,
        skipText: state.editingText,
      });
      hitsRef.current = hits;
      let nextBox = null;
      if (state.selectedTextId) {
        const hit = hits.texts.find((entry) => entry.textId === state.selectedTextId && entry.clipId === state.primaryId);
        if (hit) nextBox = { ...boxFromCorners(hit.corners), clipId: hit.clipId, textId: hit.textId, type: 'text', fontPixels: hit.fontPixels };
      } else if (state.primaryId) {
        const hit = hits.media.find((entry) => entry.clipId === state.primaryId);
        if (hit) nextBox = { ...boxFromCorners(hit.corners), clipId: hit.clipId, type: 'media' };
        const textHit = !hit && hits.texts.find((entry) => entry.clipId === state.primaryId);
        if (textHit) nextBox = { ...boxFromCorners(textHit.corners), clipId: textHit.clipId, textId: textHit.textId, type: 'text', fontPixels: textHit.fontPixels };
      }
      setSelectionBox((current) => (sameBox(current, nextBox) ? current : nextBox));
    };

    const loop = () => {
      const state = latest.current;
      if (state.project && (state.playing || dirtyRef.current)) {
        pool.sync({ project: state.project, time: state.playhead, playing: state.playing });
        const now = performance.now();
        const ready = state.playing || pool.isFrameReady(state.project, state.playhead);
        if (ready || (waitingSince && now - waitingSince > 350)) {
          dirtyRef.current = false;
          waitingSince = null;
          draw();
        } else if (!waitingSince) {
          waitingSince = now;
        }
      }
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    const onFonts = () => { dirtyRef.current = true; };
    document.fonts?.addEventListener?.('loadingdone', onFonts);
    return () => {
      cancelAnimationFrame(frame);
      document.fonts?.removeEventListener?.('loadingdone', onFonts);
      pool.dispose();
    };
  }, []);

  const fontKey = useMemo(() => projectFontRequests(project).join('|'), [project]);
  useEffect(() => {
    if (!document.fonts?.load) return;
    Promise.all([
      ...fontKey.split('|').filter(Boolean).map((font) => document.fonts.load(font).catch(() => null)),
      ...project.clips.map((clip) => loadCustomCaptionFont(clip.transcript?.customFont).catch(() => null)),
    ]).then(() => { dirtyRef.current = true; });
    // Custom caption fonts only change when the font key changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fontKey]);

  const scale = stage.width / width;
  const toProject = (event) => {
    const rect = canvasRef.current.getBoundingClientRect();
    return [((event.clientX - rect.left) / rect.width) * width, ((event.clientY - rect.top) / rect.height) * height];
  };

  function findClip(clipId) {
    return latest.current.project.clips.find((clip) => clip.id === clipId) || null;
  }

  function lockedFilter(hits) {
    const clips = latest.current.project;
    const locked = (clipId) => {
      const clip = clips.clips.find((candidate) => candidate.id === clipId);
      return !clip || isClipLocked(clips, clip);
    };
    return {
      media: hits.media.filter((hit) => !locked(hit.clipId)),
      texts: hits.texts.filter((hit) => !locked(hit.clipId)),
    };
  }

  function beginMediaMove(event, clipId) {
    const clip = findClip(clipId);
    if (!clip) return;
    const local = clipLocalTime(clip, latest.current.playhead);
    const start = animatedEffects(clip, local);
    let began = false;
    dragWithPointer(event, {
      onMove: (moveEvent, dx, dy) => {
        if (!began) { began = true; onBeginEdit?.('Move clip'); }
        let deltaX = (dx / stage.width) * 200;
        let deltaY = (dy / stage.height) * 200;
        if (moveEvent.shiftKey) {
          if (Math.abs(deltaX) > Math.abs(deltaY)) deltaY = 0;
          else deltaX = 0;
        }
        let positionX = round((start.positionX || 0) + deltaX);
        let positionY = round((start.positionY || 0) + deltaY);
        const snapX = !moveEvent.altKey && Math.abs(positionX) < SNAP_THRESHOLD;
        const snapY = !moveEvent.altKey && Math.abs(positionY) < SNAP_THRESHOLD;
        if (snapX) positionX = 0;
        if (snapY) positionY = 0;
        setSnapGuides({ x: snapX, y: snapY });
        onLiveClip?.(clipId, (current) => applyEffectChanges(current, { positionX, positionY }, local));
      },
      onEnd: () => setSnapGuides({ x: false, y: false }),
    });
  }

  function beginTextMove(event, clipId, textId) {
    const clip = findClip(clipId);
    const overlay = clipTextOverlays(clip).find((text) => text.id === textId);
    if (!overlay) return;
    const startX = Number(overlay.positionX ?? 50);
    const startY = Number(overlay.positionY ?? 50);
    let began = false;
    dragWithPointer(event, {
      onMove: (moveEvent, dx, dy) => {
        if (!began) { began = true; onBeginEdit?.('Move text'); }
        let positionX = clamp(round(startX + (dx / stage.width) * 100), -50, 150);
        let positionY = clamp(round(startY + (dy / stage.height) * 100), -50, 150);
        const snapX = !moveEvent.altKey && Math.abs(positionX - 50) < SNAP_THRESHOLD / 2;
        const snapY = !moveEvent.altKey && Math.abs(positionY - 50) < SNAP_THRESHOLD / 2;
        if (snapX) positionX = 50;
        if (snapY) positionY = 50;
        setSnapGuides({ x: snapX, y: snapY });
        onLiveClip?.(clipId, (current) => {
          const text = clipTextOverlays(current).find((candidate) => candidate.id === textId);
          return text ? updateClipTextOverlay(current, textId, { ...text, positionX, positionY }) : current;
        });
      },
      onEnd: () => setSnapGuides({ x: false, y: false }),
    });
  }

  function handleStagePointerDown(event) {
    if (event.button !== 0 || event.target.closest('[data-preview-handle]')) return;
    if (latest.current.editingText && event.target.closest('textarea')) return;
    const point = toProject(event);
    const hit = hitTest(lockedFilter(hitsRef.current), point);
    if (latest.current.editingText) onFinishText?.();
    if (!hit) {
      onClearSelection?.();
      return;
    }
    event.preventDefault();
    if (hit.type === 'text') {
      onSelect?.({ clipId: hit.clipId, textId: hit.textId, additive: event.shiftKey });
      beginTextMove(event, hit.clipId, hit.textId);
    } else {
      onSelect?.({ clipId: hit.clipId, additive: event.shiftKey });
      if (!event.shiftKey) beginMediaMove(event, hit.clipId);
    }
  }

  function handleDoubleClick(event) {
    const hit = hitTest(lockedFilter(hitsRef.current), toProject(event));
    if (hit?.type === 'text') onEditText?.(hit.clipId, hit.textId);
  }

  function beginScale(event) {
    event.preventDefault();
    event.stopPropagation();
    const box = selectionBox;
    if (!box) return;
    const clip = findClip(box.clipId);
    if (!clip) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const centerX = rect.left + box.centerX * scale;
    const centerY = rect.top + box.centerY * scale;
    const startDistance = Math.max(1, Math.hypot(event.clientX - centerX, event.clientY - centerY));
    const local = clipLocalTime(clip, latest.current.playhead);
    const startScale = animatedEffects(clip, local).scale ?? 100;
    const overlay = box.textId ? clipTextOverlays(clip).find((text) => text.id === box.textId) : null;
    const startFont = Number(overlay?.fontSize) || 54;
    onBeginEdit?.(box.type === 'text' ? 'Resize text' : 'Scale clip');
    dragWithPointer(event, {
      onMove: (moveEvent) => {
        const ratio = Math.hypot(moveEvent.clientX - centerX, moveEvent.clientY - centerY) / startDistance;
        if (box.type === 'text') {
          const fontSize = clamp(round(startFont * ratio, 1), 8, 480);
          onLiveClip?.(clip.id, (current) => {
            const text = clipTextOverlays(current).find((candidate) => candidate.id === box.textId);
            return text ? updateClipTextOverlay(current, box.textId, { ...text, fontSize }) : current;
          });
        } else {
          const nextScale = clamp(round(startScale * ratio, 1), 5, 500);
          onLiveClip?.(clip.id, (current) => applyEffectChanges(current, { scale: nextScale }, local));
        }
      },
    });
  }

  function beginRotate(event) {
    event.preventDefault();
    event.stopPropagation();
    const box = selectionBox;
    const clip = box && findClip(box.clipId);
    if (!clip) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const centerX = rect.left + box.centerX * scale;
    const centerY = rect.top + box.centerY * scale;
    const local = clipLocalTime(clip, latest.current.playhead);
    const startRotation = animatedEffects(clip, local).rotation || 0;
    const startAngle = Math.atan2(event.clientY - centerY, event.clientX - centerX);
    onBeginEdit?.('Rotate clip');
    dragWithPointer(event, {
      onMove: (moveEvent) => {
        const angle = Math.atan2(moveEvent.clientY - centerY, moveEvent.clientX - centerX);
        let rotation = startRotation + ((angle - startAngle) * 180) / Math.PI;
        if (moveEvent.shiftKey) rotation = Math.round(rotation / 15) * 15;
        rotation = round(((rotation + 540) % 360) - 180, 1);
        onLiveClip?.(clip.id, (current) => applyEffectChanges(current, { rotation }, local));
      },
    });
  }

  const editingClip = editingText ? project.clips.find((clip) => clip.id === editingText.clipId) : null;
  const editingOverlay = editingClip ? clipTextOverlays(editingClip).find((text) => text.id === editingText.textId) : null;
  const plan = framePlan(project, playhead);
  const audioOnly = !plan.layers.length && plan.audible.length > 0;
  const selectedClip = selectionBox ? project.clips.find((clip) => clip.id === selectionBox.clipId) : null;
  const canRotate = selectionBox && (selectionBox.type === 'media' || selectedClip?.kind === 'text');

  return (
    <div className="viewer-stage-area" ref={rootRef}>
      <div
        className="viewer-stage"
        style={{ width: stage.width, height: stage.height }}
        onPointerDown={handleStagePointerDown}
        onDoubleClick={handleDoubleClick}
      >
        <canvas ref={canvasRef} className="viewer-canvas" aria-label="Program monitor" />
        {guides && (
          <div className="viewer-guides" aria-hidden="true">
            <span className="viewer-guides__safe viewer-guides__safe--action" />
            <span className="viewer-guides__safe viewer-guides__safe--title" />
            <span className="viewer-guides__third viewer-guides__third--v1" />
            <span className="viewer-guides__third viewer-guides__third--v2" />
            <span className="viewer-guides__third viewer-guides__third--h1" />
            <span className="viewer-guides__third viewer-guides__third--h2" />
          </div>
        )}
        {snapGuides.x && <span className="viewer-snap viewer-snap--x" aria-hidden="true" />}
        {snapGuides.y && <span className="viewer-snap viewer-snap--y" aria-hidden="true" />}
        {audioOnly && (
          <div className="viewer-audio-only">
            <MusicNotes size={22} />
            <span>Audio only at this point</span>
          </div>
        )}
        {selectionBox && !editingText && selectedClip && !isClipLocked(project, selectedClip) && (
          <div
            className={`viewer-selection viewer-selection--${selectionBox.type}`}
            style={{
              left: selectionBox.centerX * scale,
              top: selectionBox.centerY * scale,
              width: selectionBox.width * scale,
              height: selectionBox.height * scale,
              transform: `translate(-50%, -50%) rotate(${selectionBox.rotation}deg)`,
            }}
          >
            {corners.map((corner) => (
              <button
                key={corner}
                type="button"
                data-preview-handle
                className={`viewer-handle viewer-handle--${corner}`}
                aria-label={selectionBox.type === 'text' ? 'Resize text' : 'Scale clip'}
                onPointerDown={beginScale}
              />
            ))}
            {canRotate && (
              <button
                type="button"
                data-preview-handle
                className="viewer-handle viewer-handle--rotate"
                aria-label="Rotate"
                onPointerDown={beginRotate}
              />
            )}
          </div>
        )}
        {editingOverlay && selectionBox?.type === 'text' && (
          <TextEditField
            overlay={editingOverlay}
            box={selectionBox}
            scale={scale}
            onChange={(text) => onLiveClip?.(editingClip.id, (current) => {
              const existing = clipTextOverlays(current).find((candidate) => candidate.id === editingOverlay.id);
              if (!existing) return current;
              const next = updateClipTextOverlay(current, editingOverlay.id, { ...existing, text });
              return current.kind === 'text' ? { ...next, name: text.split('\n')[0].slice(0, 40) || 'Text' } : next;
            })}
            onFinish={onFinishText}
          />
        )}
        {children}
      </div>
    </div>
  );
}

function TextEditField({ overlay, box, scale, onChange, onFinish }) {
  const fieldRef = useRef(null);
  const style = resolveTextStyle(overlay);

  useEffect(() => {
    fieldRef.current?.focus();
    fieldRef.current?.select();
  }, [overlay.id]);

  useLayoutEffect(() => {
    const field = fieldRef.current;
    if (!field) return;
    field.style.height = '0px';
    field.style.height = `${field.scrollHeight}px`;
  });

  const fontPixels = (box.fontPixels || 40) * scale;
  return (
    <textarea
      ref={fieldRef}
      className="viewer-text-field"
      rows={1}
      value={overlay.text || ''}
      aria-label="Edit text"
      spellCheck={false}
      style={{
        left: box.centerX * scale,
        top: box.centerY * scale,
        minWidth: Math.max(80, box.width * scale),
        fontFamily: fontStack(style.fontFamily),
        fontWeight: style.fontWeight,
        fontStyle: style.italic ? 'italic' : 'normal',
        fontSize: fontPixels,
        lineHeight: style.lineHeight,
        letterSpacing: `${(style.letterSpacing / 100) * fontPixels}px`,
        textTransform: style.uppercase ? 'uppercase' : 'none',
        textAlign: style.align,
        color: style.color,
        transform: `translate(-50%, -50%) rotate(${box.rotation}deg)`,
      }}
      onPointerDown={(event) => event.stopPropagation()}
      onChange={(event) => onChange(event.target.value)}
      onKeyDown={(event) => {
        event.stopPropagation();
        if ((event.key === 'Enter' && !event.shiftKey) || event.key === 'Escape') {
          event.preventDefault();
          onFinish?.();
        }
      }}
      onBlur={() => onFinish?.()}
    />
  );
}
