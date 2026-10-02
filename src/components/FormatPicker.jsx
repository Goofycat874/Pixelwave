import { CANVAS_FORMATS, FRAME_RATES } from '../lib/project.js';
import { Segmented } from './ui.jsx';

function RatioGlyph({ width, height }) {
  const max = 22;
  const scale = max / Math.max(width, height);
  return (
    <span className="ratio-glyph" aria-hidden="true">
      <span style={{ width: Math.max(6, Math.round(width * scale)), height: Math.max(6, Math.round(height * scale)) }} />
    </span>
  );
}

export default function FormatPicker({ width, height, frameRate, onFormat, onFrameRate, compact = false }) {
  const formats = compact ? CANVAS_FORMATS.slice(0, 5) : CANVAS_FORMATS;
  return (
    <div className="format-picker">
      <div className="format-list" role="radiogroup" aria-label="Canvas size">
        {formats.map((format) => {
          const active = format.width === width && format.height === height;
          return (
            <button
              key={format.id}
              type="button"
              role="radio"
              aria-checked={active}
              className={`format-option ${active ? 'is-active' : ''}`}
              onClick={() => onFormat(format)}
            >
              <RatioGlyph width={format.width} height={format.height} />
              <span className="format-option__text">
                <strong>{format.label} <em>{format.ratio}</em></strong>
                <small>{format.detail}</small>
              </span>
              <span className="format-option__size">{format.width}×{format.height}</span>
            </button>
          );
        })}
      </div>
      {onFrameRate && (
        <div className="field-stack">
          <span className="field-stack__label">Frame rate</span>
          <Segmented
            size="sm"
            label="Frame rate"
            value={frameRate}
            options={FRAME_RATES.map((rate) => [rate, String(rate)])}
            onChange={onFrameRate}
          />
        </div>
      )}
    </div>
  );
}
