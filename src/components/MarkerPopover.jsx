import { useState } from 'react';
import { Trash } from '@phosphor-icons/react';
import { formatTime } from '../lib/media.js';
import { Button, Popover } from './ui.jsx';

export const MARKER_COLORS = ['#f2b33d', '#e5484d', '#30a46c', '#3e63dd', '#d6409f', '#a1a4ab'];

export default function MarkerPopover({ marker, anchorRect, frameRate, onSave, onDelete, onClose }) {
  const [label, setLabel] = useState(marker.label || '');
  const [color, setColor] = useState(marker.color || MARKER_COLORS[0]);
  const save = () => {
    onSave({ ...marker, label: label.trim(), color });
    onClose();
  };
  return (
    <Popover anchorRect={anchorRect} onClose={save} width={260}>
      <div className="popover__header">
        <strong>Marker</strong>
        <span className="mono">{formatTime(marker.time, true, frameRate)}</span>
      </div>
      <div className="popover__body">
        <input
          className="input"
          autoFocus
          value={label}
          placeholder="Name this moment"
          aria-label="Marker name"
          onChange={(event) => setLabel(event.target.value)}
          onKeyDown={(event) => {
            event.stopPropagation();
            if (event.key === 'Enter') save();
            if (event.key === 'Escape') onClose();
          }}
        />
        <div className="marker-colors" role="radiogroup" aria-label="Marker color">
          {MARKER_COLORS.map((swatch) => (
            <button key={swatch} type="button" role="radio" aria-checked={color === swatch} aria-label={swatch} className={color === swatch ? 'is-active' : ''} style={{ background: swatch }} onClick={() => setColor(swatch)} />
          ))}
        </div>
        <div className="popover__actions">
          <Button size="sm" variant="danger-soft" onClick={() => { onDelete(marker.id); onClose(); }}><Trash size={13} /> Delete</Button>
          <Button size="sm" variant="primary" onClick={save}>Done</Button>
        </div>
      </div>
    </Popover>
  );
}
