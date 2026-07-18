import { useState } from 'react';
import {
  mediaSelectionBox,
  positionDeltaFromPointer,
  scaleFromCornerPointer,
} from '../lib/preview-transform.js';

const corners = [
  ['top-left', 'Resize from top left'],
  ['top-right', 'Resize from top right'],
  ['bottom-left', 'Resize from bottom left'],
  ['bottom-right', 'Resize from bottom right'],
];

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function oneDecimal(value) {
  return Math.round(value * 10) / 10;
}

export default function PreviewTransformControls({ clip, asset, stageWidth, stageHeight, onBeginEdit, onChange }) {
  const [gesture, setGesture] = useState(null);
  if (!clip || !asset || clip.kind === 'audio') return null;

  const effects = clip.effects || {};
  const box = mediaSelectionBox({ asset, fit: clip.fit, effects, stageWidth, stageHeight });

  function stageRect(element) {
    return element.closest('.preview-stage__frame')?.getBoundingClientRect();
  }

  function beginMove(event) {
    if (event.button !== 0 || event.target.closest('.preview-transform__handle')) return;
    const rect = stageRect(event.currentTarget);
    if (!rect) return;
    event.preventDefault();
    event.stopPropagation();
    const initialPointer = { x: event.clientX, y: event.clientY };
    const initialEffects = { ...effects };
    setGesture('move');
    onBeginEdit?.();

    const move = (moveEvent) => {
      const delta = positionDeltaFromPointer({
        deltaX: moveEvent.clientX - initialPointer.x,
        deltaY: moveEvent.clientY - initialPointer.y,
        stageWidth: rect.width,
        stageHeight: rect.height,
      });
      onChange({
        effects: {
          ...initialEffects,
          positionX: oneDecimal(clamp((initialEffects.positionX || 0) + delta.x, -100, 100)),
          positionY: oneDecimal(clamp((initialEffects.positionY || 0) + delta.y, -100, 100)),
        },
      });
    };
    const stop = () => {
      setGesture(null);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', stop);
      window.removeEventListener('pointercancel', stop);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', stop, { once: true });
    window.addEventListener('pointercancel', stop, { once: true });
  }

  function beginScale(event) {
    if (event.button !== 0) return;
    const rect = stageRect(event.currentTarget);
    if (!rect) return;
    event.preventDefault();
    event.stopPropagation();
    const initialEffects = { ...effects };
    const geometry = {
      initialScale: initialEffects.scale ?? 100,
      centerX: rect.left + (box.centerX / 100) * rect.width,
      centerY: rect.top + (box.centerY / 100) * rect.height,
      startX: event.clientX,
      startY: event.clientY,
    };
    setGesture('scale');
    onBeginEdit?.();

    const move = (moveEvent) => {
      const scale = scaleFromCornerPointer({
        ...geometry,
        currentX: moveEvent.clientX,
        currentY: moveEvent.clientY,
      });
      onChange({ effects: { ...initialEffects, scale: oneDecimal(scale) } });
    };
    const stop = () => {
      setGesture(null);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', stop);
      window.removeEventListener('pointercancel', stop);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', stop, { once: true });
    window.addEventListener('pointercancel', stop, { once: true });
  }

  return (
    <div className="preview-transform-layer" aria-live="off">
      <div
        className={`preview-transform ${gesture ? 'is-transforming' : ''}`}
        role="group"
        aria-label={`Transform ${clip.name}`}
        style={{
          left: `${box.centerX}%`,
          top: `${box.centerY}%`,
          width: `${box.width}%`,
          height: `${box.height}%`,
          transform: `translate3d(-50%, -50%, 0) rotate(${box.rotation}deg)`,
        }}
        onPointerDown={beginMove}
      >
        <span className="preview-transform__label">{Math.round(effects.scale ?? 100)}%</span>
        {corners.map(([corner, label]) => (
          <button
            type="button"
            key={corner}
            className={`preview-transform__handle preview-transform__handle--${corner}`}
            aria-label={label}
            onPointerDown={beginScale}
          />
        ))}
      </div>
    </div>
  );
}
