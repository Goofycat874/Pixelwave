import { ArrowCounterClockwise } from '@phosphor-icons/react';
import { gradeColor } from '../lib/color.js';
import {
  activeColorPreset,
  applyColorPreset,
  defaultEffects,
  defaultPrimaryWheels,
  isLiveWheelDrag,
  resetColorEffects,
} from '../lib/editor.js';
import CurveEditor from './CurveEditor.jsx';
import Scopes from './Scopes.jsx';
import { PropertyRow, Section } from './ui.jsx';

const effectDefaults = defaultEffects();
const wheelDefaults = defaultPrimaryWheels();

const presetOptions = [
  ['original', 'Original'],
  ['warm', 'Warm'],
  ['cool', 'Cool'],
  ['punch', 'Punch'],
  ['fade', 'Faded'],
  ['mono', 'Black and white'],
  ['cinema', 'Teal and orange'],
  ['film', 'Film'],
  ['bleach', 'Bleach bypass'],
  ['moody', 'Moody'],
  ['golden', 'Golden hour'],
  ['matte', 'Matte'],
];

const basicControls = [
  ['Exposure', 'exposure', -50, 50, 1, ''],
  ['Contrast', 'contrast', 0, 200, 1, '%'],
  ['Saturation', 'saturation', 0, 200, 1, '%'],
  ['Temperature', 'temperature', -100, 100, 1, ''],
  ['Tint', 'tint', -100, 100, 1, ''],
];

const toneControls = [
  ['Highlights', 'highlights', -100, 100, 1, ''],
  ['Shadows', 'shadows', -100, 100, 1, ''],
  ['Whites', 'whites', -100, 100, 1, ''],
  ['Blacks', 'blacks', -100, 100, 1, ''],
];

// A look's swatch is four reference colors (sky, foliage, skin, a bright neutral) run through
// the real grade, so each swatch shows what the look does instead of a painted guess.
const swatchColors = [[0.36, 0.55, 0.82], [0.28, 0.5, 0.26], [0.86, 0.62, 0.5], [0.9, 0.9, 0.88]];

function swatchBackground(look) {
  const effects = applyColorPreset(defaultEffects(), look);
  const stops = swatchColors.map((rgb) => `rgb(${gradeColor(rgb, effects).map((value) => Math.round(value * 255)).join(',')})`);
  const step = 100 / stops.length;
  return `linear-gradient(90deg, ${stops.map((color, index) => `${color} ${index * step}% ${(index + 1) * step}%`).join(', ')})`;
}

const swatches = Object.fromEntries(presetOptions.map(([key]) => [key, swatchBackground(key)]));

function roundAxis(value) {
  return Math.round(Math.max(-1, Math.min(1, value)) * 100) / 100;
}

function ColorWheel({ label, value, onChange, onBeginEdit }) {
  const updateFromPointer = (target, clientX, clientY) => {
    const bounds = target.getBoundingClientRect();
    const radius = bounds.width * 0.42;
    const x = (clientX - bounds.left - bounds.width / 2) / radius;
    const y = (bounds.top + bounds.height / 2 - clientY) / radius;
    const distance = Math.hypot(x, y);
    const scale = distance > 1 ? 1 / distance : 1;
    onChange({ ...value, x: roundAxis(x * scale), y: roundAxis(y * scale) });
  };

  const onKeyDown = (event) => {
    const step = event.shiftKey ? 0.1 : 0.03;
    const directions = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
    const direction = directions[event.key];
    if (!direction) return;
    event.preventDefault();
    onBeginEdit();
    onChange({ ...value, x: roundAxis(value.x + direction[0]), y: roundAxis(value.y + direction[1]) });
  };

  return (
    <div className="wheel">
      <div
        className="wheel__disc"
        role="slider"
        tabIndex={0}
        aria-label={`${label} color balance`}
        aria-valuetext={`${value.x.toFixed(2)}, ${value.y.toFixed(2)}`}
        onKeyDown={onKeyDown}
        onDoubleClick={() => { onBeginEdit(); onChange({ ...value, x: 0, y: 0 }); }}
        onPointerDown={(event) => {
          event.preventDefault();
          event.currentTarget.setPointerCapture(event.pointerId);
          onBeginEdit();
          updateFromPointer(event.currentTarget, event.clientX, event.clientY);
        }}
        onPointerMove={(event) => {
          if (isLiveWheelDrag(event, event.currentTarget.hasPointerCapture(event.pointerId))) {
            updateFromPointer(event.currentTarget, event.clientX, event.clientY);
          }
        }}
        onPointerUp={(event) => event.currentTarget.releasePointerCapture(event.pointerId)}
      >
        <span className="wheel__puck" style={{ left: `${50 + value.x * 42}%`, top: `${50 - value.y * 42}%` }} />
      </div>
      <span className="wheel__label">{label}</span>
      <input
        className="wheel__luma"
        type="range"
        min={-1}
        max={1}
        step={0.01}
        value={value.luma}
        aria-label={`${label} brightness`}
        onPointerDown={onBeginEdit}
        onDoubleClick={() => { onBeginEdit(); onChange({ ...value, luma: 0 }); }}
        onChange={(event) => onChange({ ...value, luma: Number(event.target.value) })}
      />
    </div>
  );
}

export default function ColorWorkspace({ clip, onUpdate, onLiveUpdate = onUpdate, onBeginEdit = () => {} }) {
  const effects = { ...effectDefaults, ...(clip.effects || {}) };
  const wheels = { ...wheelDefaults, ...(effects.primaryWheels || {}) };
  const activePreset = activeColorPreset(effects);
  const slider = ([label, key, min, max, step, unit]) => (
    <PropertyRow
      key={key}
      label={label}
      value={effects[key] ?? effectDefaults[key]}
      min={min}
      max={max}
      step={step}
      unit={unit}
      defaultValue={effectDefaults[key]}
      onBegin={onBeginEdit}
      onChange={(value) => onLiveUpdate({ effects: { ...effects, [key]: value } })}
    />
  );

  return (
    <div className="color-workspace">
      <Section id="color-scopes" title="Scopes">
        <Scopes />
      </Section>

      <Section
        id="color-looks"
        title="Looks"
        actions={<button type="button" className="link-btn" onClick={() => onUpdate({ effects: resetColorEffects(effects) })}><ArrowCounterClockwise size={12} /> Reset color</button>}
      >
        <div className="look-grid">
          {presetOptions.map(([key, label]) => (
            <button
              type="button"
              key={key}
              className={activePreset === key ? 'is-active' : ''}
              onClick={() => onUpdate({ effects: applyColorPreset(effects, key) })}
            >
              <span className="look-swatch" style={{ background: swatches[key] }} aria-hidden="true" />
              <span>{label}</span>
            </button>
          ))}
        </div>
      </Section>

      <Section id="color-wheels" title="Color wheels">
        <div className="wheels">
          {['lift', 'gamma', 'gain'].map((key) => (
            <ColorWheel
              key={key}
              label={{ lift: 'Shadows', gamma: 'Midtones', gain: 'Highlights' }[key]}
              value={{ ...wheelDefaults[key], ...(wheels[key] || {}) }}
              onChange={(value) => onLiveUpdate({ effects: { ...effects, primaryWheels: { ...wheels, [key]: value } } })}
              onBeginEdit={onBeginEdit}
            />
          ))}
        </div>
        <p className="hint">Drag a wheel to tint, use the slider under it for brightness. Double-click to reset.</p>
      </Section>

      <Section id="color-basic" title="Adjust">
        {basicControls.map(slider)}
      </Section>

      <Section id="color-tone" title="Tone">
        {toneControls.map(slider)}
      </Section>

      <Section id="color-curves" title="Curves">
        <CurveEditor
          curves={effects.curves}
          onBeginEdit={onBeginEdit}
          onChange={(curves) => onLiveUpdate({ effects: { ...effects, curves } })}
        />
      </Section>
    </div>
  );
}
