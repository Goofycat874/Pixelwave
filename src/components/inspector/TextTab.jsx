import {
  TextAlignCenter,
  TextAlignLeft,
  TextAlignRight,
  TextItalic,
  TextAa,
  Trash,
} from '@phosphor-icons/react';
import { updateClipTextOverlay } from '../../lib/editor.js';
import { fontEntry, fontStack, TEXT_FONTS } from '../../lib/fonts.js';
import {
  resolveTextStyle,
  TEXT_ANIMATIONS_IN,
  TEXT_ANIMATIONS_OUT,
  TEXT_PRESETS,
} from '../../lib/text.js';
import { ColorField, IconButton, PropertyRow, Section, Segmented, SelectField, Switch } from '../ui.jsx';

const PRESET_STYLE_KEYS = [
  'fontFamily', 'fontWeight', 'fontSize', 'italic', 'uppercase', 'color', 'align', 'letterSpacing', 'lineHeight',
  'backgroundEnabled', 'backgroundColor', 'backgroundOpacity', 'strokeWidth', 'strokeColor', 'shadow', 'glow',
  'animationIn', 'animationOut', 'positionX', 'positionY',
];

const WEIGHT_NAMES = { 100: 'Thin', 200: 'Extra light', 300: 'Light', 400: 'Regular', 500: 'Medium', 600: 'Semibold', 700: 'Bold', 800: 'Extra bold', 900: 'Black' };

export function presetPatch(presetId) {
  const preset = TEXT_PRESETS.find((item) => item.id === presetId);
  if (!preset) return {};
  const base = resolveTextStyle({});
  return Object.fromEntries(PRESET_STYLE_KEYS.map((key) => [key, preset.style[key] ?? (key === 'backgroundEnabled' ? false : base[key])]));
}

export default function TextTab({ clip, overlay, handlers, onDeleteText }) {
  const style = resolveTextStyle(overlay);
  const write = (changes, live = false, label = 'Edit text') => {
    const updater = (current) => {
      const existing = (current.textOverlays || []).find((text) => text.id === overlay.id) || (current.title && overlay.legacy ? current.title : null);
      const next = updateClipTextOverlay(current, overlay.id, { ...(existing || overlay), ...changes });
      if (current.kind === 'text' && changes.text !== undefined) return { ...next, name: String(changes.text).split('\n')[0].slice(0, 40) || 'Text' };
      return next;
    };
    if (live) handlers.onLiveClip(clip.id, updater);
    else handlers.onCommitClip(clip.id, updater, label);
  };
  const begin = (label) => () => handlers.onBeginEdit(label);
  const row = (key, label, min, max, step = 1, unit = '') => ({
    label,
    min,
    max,
    step,
    unit,
    value: style[key],
    defaultValue: resolveTextStyle({})[key],
    onBegin: begin(`Change ${label.toLowerCase()}`),
    onChange: (value) => write({ [key]: value }, true),
  });
  const font = fontEntry(style.fontFamily) || TEXT_FONTS[0];
  const weights = font.range ? [300, 400, 500, 600, 700, 800, 900].filter((weight) => weight >= font.range[0] && weight <= font.range[1]) : font.weights;

  return (
    <>
      <Section id="text-content" title="Text">
        <label className="text-area">
          <span className="sr-only">Text content</span>
          <textarea
            rows={3}
            value={overlay.text || ''}
            placeholder="Type your text"
            onFocus={begin('Edit text')}
            onChange={(event) => write({ text: event.target.value }, true)}
            style={{ fontFamily: fontStack(style.fontFamily) }}
          />
        </label>
        <div className="preset-strip" role="group" aria-label="Text styles">
          {TEXT_PRESETS.map((preset) => {
            const presetStyle = resolveTextStyle(preset.style);
            return (
              <button
                key={preset.id}
                type="button"
                title={preset.label}
                onClick={() => write(presetPatch(preset.id), false, `Style: ${preset.label}`)}
              >
                <span
                  className="preset-strip__sample"
                  style={{
                    fontFamily: fontStack(presetStyle.fontFamily),
                    fontWeight: presetStyle.fontWeight,
                    fontStyle: presetStyle.italic ? 'italic' : 'normal',
                    color: presetStyle.color,
                    background: presetStyle.backgroundEnabled ? presetStyle.backgroundColor : 'transparent',
                    textTransform: presetStyle.uppercase ? 'uppercase' : 'none',
                    WebkitTextStroke: presetStyle.strokeWidth ? `1px ${presetStyle.strokeColor}` : undefined,
                    textShadow: presetStyle.glow ? `0 0 8px ${presetStyle.color}` : undefined,
                  }}
                >Aa</span>
                <span className="preset-strip__label">{preset.label}</span>
              </button>
            );
          })}
        </div>
        {onDeleteText && overlay && clip.kind !== 'text' && (
          <button type="button" className="link-btn link-btn--danger" onClick={onDeleteText}><Trash size={13} /> Remove this text</button>
        )}
      </Section>

      <Section id="text-font" title="Font">
        <SelectField
          label="Family"
          value={style.fontFamily}
          options={TEXT_FONTS.map((entry) => [entry.family, entry.family])}
          onChange={(fontFamily) => write({ fontFamily }, false, 'Change font')}
        />
        <SelectField
          label="Weight"
          value={String(style.fontWeight)}
          options={weights.map((weight) => [String(weight), WEIGHT_NAMES[weight] || weight])}
          onChange={(fontWeight) => write({ fontWeight: Number(fontWeight) }, false, 'Change weight')}
        />
        <PropertyRow {...row('fontSize', 'Size', 8, 300, 1, 'px')} />
        <ColorField label="Color" value={style.color} onBegin={begin('Text color')} onChange={(color) => write({ color }, true)} />
        <div className="row-actions">
          <Segmented
            size="sm"
            label="Alignment"
            value={style.align}
            options={[['left', '', TextAlignLeft, 'Align left'], ['center', '', TextAlignCenter, 'Align center'], ['right', '', TextAlignRight, 'Align right']]}
            onChange={(align) => write({ align }, false, 'Align text')}
          />
          <span className="row-actions__spacer" />
          <IconButton label="Italic" size="sm" active={style.italic} onClick={() => write({ italic: !style.italic }, false, 'Italic')}><TextItalic size={15} /></IconButton>
          <IconButton label="All caps" size="sm" active={style.uppercase} onClick={() => write({ uppercase: !style.uppercase }, false, 'All caps')}><TextAa size={15} /></IconButton>
        </div>
        <PropertyRow {...row('letterSpacing', 'Spacing', -10, 60, 1)} />
        <PropertyRow {...row('lineHeight', 'Line height', 0.8, 2, 0.02)} />
      </Section>

      <Section id="text-look" title="Box, outline and glow" defaultOpen={false}>
        <Switch label="Background box" checked={style.backgroundEnabled} onChange={(backgroundEnabled) => write({ backgroundEnabled }, false, 'Text background')} />
        {style.backgroundEnabled && (
          <>
            <ColorField label="Box color" value={style.backgroundColor} onBegin={begin('Box color')} onChange={(backgroundColor) => write({ backgroundColor }, true)} />
            <PropertyRow {...row('backgroundOpacity', 'Box opacity', 0, 100, 1, '%')} />
          </>
        )}
        <PropertyRow {...row('strokeWidth', 'Outline', 0, 24, 0.5, 'px')} />
        {style.strokeWidth > 0 && (
          <ColorField label="Outline color" value={style.strokeColor} onBegin={begin('Outline color')} onChange={(strokeColor) => write({ strokeColor }, true)} />
        )}
        <Switch label="Drop shadow" checked={style.shadow} onChange={(shadow) => write({ shadow }, false, 'Text shadow')} />
        <Switch label="Glow" description="Uses the text color" checked={style.glow} onChange={(glow) => write({ glow }, false, 'Text glow')} />
      </Section>

      <Section id="text-animation" title="Animate text">
        <div className="field-stack">
          <span className="field-stack__label">In</span>
          <div className="chip-grid chip-grid--4">
            {TEXT_ANIMATIONS_IN.map(([value, label]) => (
              <button key={value} type="button" className={style.animationIn === value ? 'is-active' : ''} onClick={() => write({ animationIn: value }, false, 'Text animation')}>{label}</button>
            ))}
          </div>
        </div>
        <div className="field-stack">
          <span className="field-stack__label">Out</span>
          <div className="chip-grid chip-grid--3">
            {TEXT_ANIMATIONS_OUT.map(([value, label]) => (
              <button key={value} type="button" className={style.animationOut === value ? 'is-active' : ''} onClick={() => write({ animationOut: value }, false, 'Text animation')}>{label}</button>
            ))}
          </div>
        </div>
        <PropertyRow {...row('animationDuration', 'Duration', 0.1, 2, 0.05, 's')} />
      </Section>

      <Section id="text-position" title="Position" defaultOpen={clip.kind !== 'text'}>
        <PropertyRow {...row('positionX', 'Horizontal', 0, 100, 0.5, '%')} />
        <PropertyRow {...row('positionY', 'Vertical', 0, 100, 0.5, '%')} />
        <div className="chip-grid chip-grid--3">
          {[['Top', 18], ['Middle', 50], ['Bottom', 82]].map(([label, positionY]) => (
            <button key={label} type="button" onClick={() => write({ positionX: 50, positionY }, false, `Move text to ${label.toLowerCase()}`)}>{label}</button>
          ))}
        </div>
      </Section>
    </>
  );
}
