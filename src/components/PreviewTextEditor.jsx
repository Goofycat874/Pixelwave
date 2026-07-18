import { useEffect, useRef } from 'react';
import { DotsSixVertical } from '@phosphor-icons/react';
import { textOverlayWidth, textPositionFromPointer, textSizeFromCornerPointer } from '../lib/preview-transform.js';

const corners = ['top-left', 'top-right', 'bottom-left', 'bottom-right'];

export default function PreviewTextEditor({ textOverlay, clipName, editing = false, onBeginEdit, onChange, onEdit, onFinish }) {
  const inputRef = useRef(null);
  const title = textOverlay || {};

  useEffect(() => {
    if (!editing) return;
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [editing, title.id]);

  useEffect(() => {
    const field = inputRef.current;
    if (!editing || !field) return;
    field.style.height = '0px';
    field.style.height = `${field.scrollHeight}px`;
  }, [editing, title.fontSize, title.text]);

  function beginMove(event) {
    if (event.button !== 0) return;
    const frame = event.currentTarget.closest('.preview-stage__frame');
    const rect = frame?.getBoundingClientRect();
    if (!rect) return;
    event.preventDefault();
    event.stopPropagation();
    const initialPointer = { x: event.clientX, y: event.clientY };
    const initialTitle = { ...title };
    onBeginEdit?.();

    const move = (moveEvent) => {
      const position = textPositionFromPointer({
        initialX: initialTitle.positionX ?? 50,
        initialY: initialTitle.positionY ?? 78,
        deltaX: moveEvent.clientX - initialPointer.x,
        deltaY: moveEvent.clientY - initialPointer.y,
        stageWidth: rect.width,
        stageHeight: rect.height,
      });
      onChange({ ...initialTitle, positionX: position.x, positionY: position.y });
    };
    const stop = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', stop);
      window.removeEventListener('pointercancel', stop);
      inputRef.current?.focus();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', stop, { once: true });
    window.addEventListener('pointercancel', stop, { once: true });
  }

  function beginResize(event) {
    if (event.button !== 0) return;
    const editor = event.currentTarget.closest('.preview-text-editor');
    const rect = editor?.getBoundingClientRect();
    if (!rect) return;
    event.preventDefault();
    event.stopPropagation();
    const initialTitle = { ...title };
    const geometry = {
      initialFontSize: initialTitle.fontSize || 54,
      centerX: rect.left + rect.width / 2,
      centerY: rect.top + rect.height / 2,
      startX: event.clientX,
      startY: event.clientY,
    };
    onBeginEdit?.();

    const move = (moveEvent) => {
      const fontSize = textSizeFromCornerPointer({
        ...geometry,
        currentX: moveEvent.clientX,
        currentY: moveEvent.clientY,
      });
      onChange({ ...initialTitle, fontSize: Math.round(fontSize * 10) / 10 });
    };
    const stop = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', stop);
      window.removeEventListener('pointercancel', stop);
      inputRef.current?.focus();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', stop, { once: true });
    window.addEventListener('pointercancel', stop, { once: true });
  }

  return (
    <div
      className="preview-text-editor"
      style={{
        left: `${title.positionX ?? 50}%`,
        top: `${title.positionY ?? 78}%`,
        opacity: (title.opacity ?? 100) / 100,
      }}
    >
      <button type="button" className="preview-text-editor__grip" aria-label="Move text" onPointerDown={beginMove}>
        <DotsSixVertical size={12} weight="bold" />
        <span>DRAG</span>
      </button>
      {editing ? (
        <textarea
          ref={inputRef}
          rows={1}
          maxLength={80}
          aria-label={`Text overlay on ${clipName}`}
          value={title.text || ''}
          style={{
            width: textOverlayWidth(title.text),
            color: title.color || '#ffffff',
            fontSize: `${(title.fontSize || 54) / 12.8}cqw`,
          }}
          onChange={(event) => onChange({ ...title, text: event.target.value })}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === 'Escape') {
              event.preventDefault();
              onFinish?.();
            }
          }}
        />
      ) : (
        <div
          className="preview-text-editor__text"
          role="button"
          tabIndex={0}
          aria-label={`Move or resize text on ${clipName}. Double-click to edit.`}
          style={{
            width: textOverlayWidth(title.text),
            color: title.color || '#ffffff',
            fontSize: `${(title.fontSize || 54) / 12.8}cqw`,
          }}
          onPointerDown={beginMove}
          onDoubleClick={onEdit}
          onKeyDown={(event) => {
            if (event.key === 'Enter') onEdit?.();
          }}
        >{title.text}</div>
      )}
      {corners.map((corner) => (
        <button
          type="button"
          key={corner}
          className={`preview-text-editor__resize preview-text-editor__resize--${corner}`}
          aria-label={`Resize text from ${corner.replace('-', ' ')}`}
          onPointerDown={beginResize}
        />
      ))}
      <span className="preview-text-editor__hint">{editing ? 'ENTER TO FINISH' : 'DRAG · CORNERS RESIZE · DOUBLE CLICK TO TYPE'}</span>
    </div>
  );
}
