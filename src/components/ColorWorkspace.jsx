import { ArrowCounterClockwise, Palette } from '@phosphor-icons/react';
import {
  applyColorPreset,
  COLOR_PRESETS,
  computedColorAdjustments,
  defaultEffects,
  defaultPrimaryWheels,
  isLiveWheelDrag,
  resetColorEffects,
} from '../lib/editor.js';

const effectDefaults = defaultEffects();
const wheelDefaults = defaultPrimaryWheels();

const presetOptions = [
  ['original', 'Original'],
  ['warm', 'Warm'],
  ['cool', 'Cool'],
  ['punch', 'Punch'],
  ['fade', 'Fade'],
  ['mono', 'B&W'],
];

const basicControls = [
  ['Exposure', 'exposure', -50, 50, 1, ''],
  ['Contrast', 'contrast', 0, 200, 1, '%'],
  ['Saturation', 'saturation', 0, 200, 1, '%'],
  ['Temperature', 'temperature', -100, 100, 1, ''],
  ['Tint', 'tint', -100, 100, 1, ''],
];

function roundAxis(value) {
  return Math.round(Math.max(-1, Math.min(1, value)) * 100) / 100;
}

function RangeControl({ label, value, min, max, step, suffix, onChange }) {
  const progress = ((value - min) / (max - min)) * 100;
  return (
    <label className="range-control color-range-control">
      <span><strong>{label}</strong><output>{value > 0 && min < 0 ? '+' : ''}{value}{suffix}</output></span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        style={{ '--range-progress': `${progress}%` }}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

function ColorWheel({ label, value, onChange, onBeginEdit }) {
  const updateFromPointer = (target, clientX, clientY) => {
    const bounds = target.getBoundingClientRect();
    const radius = bounds.width * 0.36;
    const x = (clientX - bounds.left - bounds.width / 2) / radius;
    const y = (bounds.top + bounds.height / 2 - clientY) / radius;
    const distance = Math.hypot(x, y);
    const scale = distance > 1 ? 1 / distance : 1;
    onChange({ ...value, x: roundAxis(x * scale), y: roundAxis(y * scale) }, true);
  };

  const onKeyDown = (event) => {
    const step = event.shiftKey ? 0.1 : 0.03;
    const directions = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, step],
      ArrowDown: [0, -step],
    };
    const direction = directions[event.key];
    if (!direction) return;
    event.preventDefault();
    onBeginEdit();
    onChange({ ...value, x: roundAxis(value.x + direction[0]), y: roundAxis(value.y + direction[1]) }, true);
  };

  return (
    <div className="primary-wheel-group">
      <div className="primary-wheel-label"><strong>{label}</strong><span>{value.x.toFixed(2)} · {value.y.toFixed(2)}</span></div>
      <div
        className="primary-color-wheel"
        role="slider"
        tabIndex={0}
        aria-label={`${label} color balance`}
        aria-valuetext={`${value.x.toFixed(2)}, ${value.y.toFixed(2)}`}
        onKeyDown={onKeyDown}
        onDoubleClick={() => onChange({ ...value, x: 0, y: 0 })}
        onPointerDown={(event) => {
          event.preventDefault();
          event.currentTarget.setPointerCapture(event.pointerId);
          onBeginEdit();
          updateFromPointer(event.currentTarget, event.clientX, event.clientY);
        }}
        onPointerMove={(event) => {
          const captured = event.currentTarget.hasPointerCapture(event.pointerId);
          if (isLiveWheelDrag(event, captured)) updateFromPointer(event.currentTarget, event.clientX, event.clientY);
        }}
        onPointerUp={(event) => event.currentTarget.releasePointerCapture(event.pointerId)}
      >
        <span className="primary-wheel-axis primary-wheel-axis--x" />
        <span className="primary-wheel-axis primary-wheel-axis--y" />
        <span
          className="primary-wheel-puck"
          style={{ transform: `translate3d(${value.x * 24}px, ${value.y * -24}px, 0)` }}
        />
      </div>
      <label className="wheel-luma-control">
        <span>Luma</span>
        <input
          type="range"
          min={-1}
          max={1}
          step={0.01}
          value={value.luma}
          onChange={(event) => onChange({ ...value, luma: Number(event.target.value) })}
        />
        <output>{value.luma > 0 ? '+' : ''}{value.luma.toFixed(2)}</output>
      </label>
    </div>
  );
}

function activeColorPreset(effects = {}) {
  const wheels = { ...wheelDefaults, ...(effects.primaryWheels || {}) };
  const wheelsAreNeutral = Object.values(wheels).every((wheel) => !wheel.x && !wheel.y && !wheel.luma);
  if (!wheelsAreNeutral) return '';
  return presetOptions.find(([key]) => Object.entries(COLOR_PRESETS[key]).every(([control, value]) => (
    (effects[control] ?? effectDefaults[control]) === value
  )))?.[0] || '';
}

export default function ColorWorkspace({ clip, onUpdate, onLiveUpdate = onUpdate, onBeginEdit = () => {} }) {
  const effects = { ...effectDefaults, ...(clip.effects || {}) };
  const wheels = { ...wheelDefaults, ...(effects.primaryWheels || {}) };
  const grade = computedColorAdjustments(effects);
  const activePreset = activeColorPreset(effects);

  const updateWheel = (key, value, live = false) => (live ? onLiveUpdate : onUpdate)({
    effects: {
      ...effects,
      primaryWheels: { ...wheels, [key]: value },
    },
  });

  return (
    <div className="color-workspace">
      <section className="color-workspace__hero">
        <div>
          <p className="eyebrow">Primary grade</p>
          <h3><Palette size={15} weight="duotone" /> Color</h3>
        </div>
        <button type="button" onClick={() => onUpdate({ effects: resetColorEffects(effects) })}><ArrowCounterClockwise size={13} /> Reset</button>
      </section>

      <div className="grade-readout" aria-label="Computed grade values">
        <span><small>EXP</small><strong>{grade.exposure > 0 ? '+' : ''}{grade.exposure}</strong></span>
        <span><small>CON</small><strong>{grade.contrast}</strong></span>
        <span><small>SAT</small><strong>{grade.saturation}</strong></span>
        <span><small>TEMP</small><strong>{grade.temperature > 0 ? '+' : ''}{grade.temperature}</strong></span>
      </div>

      <section className="color-workspace__section">
        <div className="color-workspace__section-title"><strong>Looks</strong><span>6 presets</span></div>
        <div className="color-presets color-presets--workspace" aria-label="Color presets">
          {presetOptions.map(([key, label]) => (
            <button
              type="button"
              key={key}
              className={activePreset === key ? 'is-active' : ''}
              onClick={() => onUpdate({ effects: applyColorPreset(effects, key) })}
            ><span className={`color-preset-swatch color-preset-swatch--${key}`} />{label}</button>
          ))}
        </div>
      </section>

      <section className="color-workspace__section color-workspace__section--wheels">
        <div className="color-workspace__section-title"><strong>Primary wheels</strong><span>Double-click to center</span></div>
        <div className="primary-wheels">
          {['lift', 'gamma', 'gain'].map((key) => (
            <ColorWheel
              key={key}
              label={key[0].toUpperCase() + key.slice(1)}
              value={{ ...wheelDefaults[key], ...(wheels[key] || {}) }}
              onChange={(value, live) => updateWheel(key, value, live)}
              onBeginEdit={onBeginEdit}
            />
          ))}
        </div>
      </section>

      <section className="color-workspace__section">
        <div className="color-workspace__section-title"><strong>Primary bars</strong><span>Fine tune</span></div>
        <div className="inspector-controls">
          {basicControls.map(([label, key, min, max, step, suffix]) => (
            <RangeControl
              key={key}
              label={label}
              value={effects[key] ?? effectDefaults[key]}
              min={min}
              max={max}
              step={step}
              suffix={suffix}
              onChange={(value) => onUpdate({ effects: { ...effects, [key]: value } })}
            />
          ))}
        </div>
      </section>
    </div>
  );
}
