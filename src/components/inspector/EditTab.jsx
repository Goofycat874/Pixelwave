import {
  ArrowsHorizontal,
  ArrowsVertical,
  Plus,
  SpeakerSimpleHigh,
  SpeakerSimpleSlash,
  TextT,
  Waveform,
} from '@phosphor-icons/react';
import { clearKeyframes } from '../../lib/animation.js';
import { TRANSITIONS } from '../../lib/compositor.js';
import {
  activeStylizePreset,
  applyStylizePreset,
  STYLIZE_KEYS,
  STYLIZE_PRESET_LABELS,
} from '../../lib/effects.js';
import { clipTextOverlays, setClipSpeed } from '../../lib/editor.js';
import { Button, IconButton, PropertyRow, Section, Segmented } from '../ui.jsx';

const PIP = 34;
const PIP_OFFSET = 100 - PIP - 8;

export const LAYOUT_PRESETS = Object.freeze([
  { id: 'full', label: 'Full', effects: { scale: 100, positionX: 0, positionY: 0, radius: 0, shadow: 0 } },
  { id: 'center', label: 'Inset', effects: { scale: 72, positionX: 0, positionY: 0, radius: 6, shadow: 40 } },
  { id: 'top-left', label: 'Top left', effects: { scale: PIP, positionX: -PIP_OFFSET, positionY: -PIP_OFFSET, radius: 10, shadow: 45 } },
  { id: 'top-right', label: 'Top right', effects: { scale: PIP, positionX: PIP_OFFSET, positionY: -PIP_OFFSET, radius: 10, shadow: 45 } },
  { id: 'bottom-left', label: 'Bottom left', effects: { scale: PIP, positionX: -PIP_OFFSET, positionY: PIP_OFFSET, radius: 10, shadow: 45 } },
  { id: 'bottom-right', label: 'Bottom right', effects: { scale: PIP, positionX: PIP_OFFSET, positionY: PIP_OFFSET, radius: 10, shadow: 45 } },
  { id: 'left-half', label: 'Left half', effects: { scale: 100, positionX: -50, positionY: 0, cropLeft: 25, cropRight: 25, radius: 0, shadow: 0 } },
  { id: 'right-half', label: 'Right half', effects: { scale: 100, positionX: 50, positionY: 0, cropLeft: 25, cropRight: 25, radius: 0, shadow: 0 } },
]);

const CROP_RESET = { cropTop: 0, cropRight: 0, cropBottom: 0, cropLeft: 0 };
const SPEEDS = [0.5, 1, 1.5, 2, 4];

function LayoutGlyph({ id }) {
  const boxes = {
    full: [0, 0, 100, 100],
    center: [14, 14, 72, 72],
    'top-left': [6, 8, 36, 36],
    'top-right': [58, 8, 36, 36],
    'bottom-left': [6, 56, 36, 36],
    'bottom-right': [58, 56, 36, 36],
    'left-half': [0, 0, 50, 100],
    'right-half': [50, 0, 50, 100],
  };
  const [left, top, width, height] = boxes[id];
  return (
    <span className="layout-glyph" aria-hidden="true">
      <span style={{ left: `${left}%`, top: `${top}%`, width: `${width}%`, height: `${height}%` }} />
    </span>
  );
}

export function TransformSection({ clip, edit, onCommitClip, showLayouts = true }) {
  const applyLayout = (preset) => onCommitClip(clip.id, (current) => {
    const cleared = clearKeyframes(current, ['positionX', 'positionY', 'scale']);
    return { ...cleared, effects: { ...cleared.effects, ...CROP_RESET, ...preset.effects } };
  }, `Layout: ${preset.label}`);

  return (
    <Section id="transform" title="Transform">
      {showLayouts && (
        <div className="layout-grid" role="group" aria-label="Quick layouts">
          {LAYOUT_PRESETS.map((preset) => (
            <button key={preset.id} type="button" title={preset.label} onClick={() => applyLayout(preset)}>
              <LayoutGlyph id={preset.id} />
              <span>{preset.label}</span>
            </button>
          ))}
        </div>
      )}
      {!edit.playheadInside && <p className="hint">Move the playhead over this clip to add keyframes.</p>}
      <PropertyRow {...edit.effectRow('positionX', 'Position X', -200, 200, 0.5)} />
      <PropertyRow {...edit.effectRow('positionY', 'Position Y', -200, 200, 0.5)} />
      <PropertyRow {...edit.effectRow('scale', 'Scale', 5, 400, 1, '%')} />
      <PropertyRow {...edit.effectRow('rotation', 'Rotation', -180, 180, 1, '°')} />
      <PropertyRow {...edit.effectRow('opacity', 'Opacity', 0, 100, 1, '%')} />
      {clip.kind !== 'text' && (
        <div className="row-actions">
          <Segmented
            size="sm"
            label="Frame fit"
            value={clip.fit || 'contain'}
            options={[['contain', 'Fit'], ['cover', 'Fill']]}
            onChange={(fit) => edit.patch({ fit }, fit === 'cover' ? 'Fill frame' : 'Fit frame')}
          />
          <span className="row-actions__spacer" />
          <IconButton label="Flip horizontally" size="sm" active={clip.effects?.flipX} onClick={() => edit.patchEffects({ flipX: !clip.effects?.flipX }, 'Flip horizontally')}><ArrowsHorizontal size={15} /></IconButton>
          <IconButton label="Flip vertically" size="sm" active={clip.effects?.flipY} onClick={() => edit.patchEffects({ flipY: !clip.effects?.flipY }, 'Flip vertically')}><ArrowsVertical size={15} /></IconButton>
        </div>
      )}
    </Section>
  );
}

function CropSection({ edit }) {
  const cropped = ['cropTop', 'cropRight', 'cropBottom', 'cropLeft'].some((key) => edit.value(key) > 0);
  return (
    <Section
      id="crop"
      title="Crop and shape"
      defaultOpen={false}
      actions={cropped ? <button type="button" className="link-btn" onClick={() => edit.patchEffects(CROP_RESET, 'Reset crop')}>Reset crop</button> : null}
    >
      <PropertyRow {...edit.effectRow('cropTop', 'Crop top', 0, 90, 0.5, '%')} />
      <PropertyRow {...edit.effectRow('cropBottom', 'Crop bottom', 0, 90, 0.5, '%')} />
      <PropertyRow {...edit.effectRow('cropLeft', 'Crop left', 0, 90, 0.5, '%')} />
      <PropertyRow {...edit.effectRow('cropRight', 'Crop right', 0, 90, 0.5, '%')} />
      <PropertyRow {...edit.effectRow('radius', 'Corners', 0, 100, 1, '%')} />
      <PropertyRow {...edit.effectRow('shadow', 'Shadow', 0, 100, 1, '%')} />
    </Section>
  );
}

function StylizeSection({ clip, edit, onCommitClip }) {
  const effects = Object.fromEntries(STYLIZE_KEYS.map((key) => [key, edit.value(key)]));
  const active = activeStylizePreset(effects);
  const applyPreset = ([key, label]) => onCommitClip(clip.id, (current) => {
    const cleared = clearKeyframes(current, STYLIZE_KEYS);
    return { ...cleared, effects: applyStylizePreset(cleared.effects, key) };
  }, key === 'none' ? 'Remove stylize effects' : `Stylize: ${label}`);

  return (
    <Section
      id="stylize"
      title="Stylize"
      badge={active === 'none' ? null : STYLIZE_PRESET_LABELS.find(([key]) => key === active)?.[1] || 'Custom'}
    >
      <div className="chip-grid chip-grid--4" role="group" aria-label="Stylize looks">
        {STYLIZE_PRESET_LABELS.map((preset) => (
          <button key={preset[0]} type="button" className={active === preset[0] ? 'is-active' : ''} onClick={() => applyPreset(preset)}>{preset[1]}</button>
        ))}
      </div>
      <PropertyRow {...edit.effectRow('sharpen', 'Sharpen', 0, 100, 1, '%')} />
      <PropertyRow {...edit.effectRow('glow', 'Glow', 0, 100, 1, '%')} />
      <PropertyRow {...edit.effectRow('grain', 'Film grain', 0, 100, 1, '%')} />
      <PropertyRow {...edit.effectRow('aberration', 'Color fringe', 0, 100, 1, '%')} />
      <PropertyRow {...edit.effectRow('glitch', 'Glitch', 0, 100, 1, '%')} />
      <PropertyRow {...edit.effectRow('pixelate', 'Pixelate', 0, 100, 1, '%')} />
    </Section>
  );
}

function EffectsSection({ edit }) {
  const keyMode = edit.value('keyMode') || 'off';
  return (
    <Section id="effects" title="Effects" defaultOpen={false}>
      <PropertyRow {...edit.effectRow('blur', 'Blur', 0, 40, 0.5, 'px')} />
      <PropertyRow {...edit.effectRow('vignette', 'Vignette', 0, 100, 1, '%')} />
      <PropertyRow {...edit.effectRow('hue', 'Hue shift', -180, 180, 1, '°')} />
      <PropertyRow {...edit.effectRow('invert', 'Invert', 0, 100, 1, '%')} />
      <div className="subsection">
        <div className="subsection__title">
          <span>Green screen</span>
          <Segmented
            size="sm"
            label="Chroma key"
            value={keyMode}
            options={[['off', 'Off'], ['green', 'Green'], ['blue', 'Blue']]}
            onChange={(mode) => edit.patchEffects({ keyMode: mode }, mode === 'off' ? 'Remove key' : `Key out ${mode}`)}
          />
        </div>
        {keyMode !== 'off' && (
          <>
            <PropertyRow {...edit.effectRow('keyStrength', 'Strength', 0, 100, 1, '%')} />
            <PropertyRow {...edit.effectRow('keySoftness', 'Softness', 0, 100, 1, '%')} />
            <PropertyRow {...edit.effectRow('keySpill', 'Spill', 0, 100, 1, '%')} />
          </>
        )}
      </div>
    </Section>
  );
}

export function FadeSection({ clip, edit }) {
  const max = Math.max(0.1, Math.min(10, clip.duration));
  return (
    <Section id="fades" title="Fade in and out">
      <PropertyRow
        label="Fade in"
        value={clip.fadeIn || 0}
        min={0}
        max={max}
        step={0.05}
        unit="s"
        defaultValue={0}
        onBegin={edit.begin('Fade in')}
        onChange={(fadeIn) => edit.liveClip({ fadeIn: Math.min(max, Math.max(0, fadeIn)) })}
      />
      <PropertyRow
        label="Fade out"
        value={clip.fadeOut || 0}
        min={0}
        max={max}
        step={0.05}
        unit="s"
        defaultValue={0}
        onBegin={edit.begin('Fade out')}
        onChange={(fadeOut) => edit.liveClip({ fadeOut: Math.min(max, Math.max(0, fadeOut)) })}
      />
    </Section>
  );
}

export function TransitionSection({ clip, edit }) {
  const transition = clip.transition || { type: 'cut', duration: 0.6 };
  return (
    <Section id="transition" title="Transition in" defaultOpen={false} badge={transition.type !== 'cut' ? TRANSITIONS.find(([id]) => id === transition.type)?.[1] : null}>
      <div className="chip-grid chip-grid--4">
        {TRANSITIONS.map(([type, label]) => (
          <button
            key={type}
            type="button"
            className={transition.type === type ? 'is-active' : ''}
            onClick={() => edit.patch({ transition: { ...transition, type } }, `Transition: ${label}`)}
          >{label}</button>
        ))}
      </div>
      {transition.type !== 'cut' && (
        <PropertyRow
          label="Duration"
          value={transition.duration}
          min={0.1}
          max={3}
          step={0.05}
          unit="s"
          defaultValue={0.6}
          onBegin={edit.begin('Transition duration')}
          onChange={(duration) => edit.liveClip({ transition: { ...transition, duration } })}
        />
      )}
    </Section>
  );
}

function SpeedSection({ clip, onCommitClip, onBeginEdit, onLiveClip }) {
  const speed = clip.speed || 1;
  return (
    <Section id="speed" title="Speed" defaultOpen={false} badge={speed !== 1 ? `${speed}×` : null}>
      <PropertyRow
        label="Speed"
        value={speed}
        min={0.25}
        max={4}
        step={0.05}
        unit="×"
        defaultValue={1}
        onBegin={() => onBeginEdit('Change speed')}
        onChange={(next) => onLiveClip(clip.id, (current) => setClipSpeed(current, next))}
      />
      <div className="chip-grid chip-grid--5">
        {SPEEDS.map((value) => (
          <button
            key={value}
            type="button"
            className={speed === value ? 'is-active' : ''}
            onClick={() => onCommitClip(clip.id, (current) => setClipSpeed(current, value), `Speed ${value}×`)}
          >{value}×</button>
        ))}
      </div>
    </Section>
  );
}

function AudioSection({ clip, edit, onDetachAudio }) {
  return (
    <Section id="audio" title="Audio">
      <PropertyRow {...edit.effectRow('volume', 'Volume', 0, 150, 1, '%')} disabled={clip.muted} />
      <div className="row-actions">
        <Button size="sm" variant={clip.muted ? 'accent-soft' : 'default'} onClick={() => edit.patch({ muted: !clip.muted }, clip.muted ? 'Unmute clip' : 'Mute clip')}>
          {clip.muted ? <SpeakerSimpleSlash size={14} /> : <SpeakerSimpleHigh size={14} />}
          {clip.muted ? 'Muted' : 'Mute'}
        </Button>
        {clip.kind === 'video' && onDetachAudio && (
          <Button size="sm" onClick={() => onDetachAudio(clip.id)} disabled={clip.muted}>
            <Waveform size={14} /> Detach audio
          </Button>
        )}
      </div>
    </Section>
  );
}

function ClipTextSection({ clip, onAddText, onSelectText }) {
  const overlays = clipTextOverlays(clip);
  return (
    <Section id="clip-text" title="Text on this clip" defaultOpen={false} badge={overlays.length || null}>
      {overlays.map((overlay) => (
        <button key={overlay.id} type="button" className="list-btn" onClick={() => onSelectText(clip.id, overlay.id)}>
          <TextT size={14} />
          <span>{overlay.text || 'Empty text'}</span>
        </button>
      ))}
      <Button size="sm" onClick={() => onAddText(clip.id)}><Plus size={14} /> Add text to clip</Button>
      <p className="hint">For titles that move on their own, use the Text button in the timeline toolbar.</p>
    </Section>
  );
}

export default function EditTab({ clip, edit, handlers }) {
  const visual = clip.kind === 'video' || clip.kind === 'image';
  return (
    <>
      {visual && <TransformSection clip={clip} edit={edit} onCommitClip={handlers.onCommitClip} />}
      {visual && <CropSection edit={edit} />}
      {visual && <StylizeSection clip={clip} edit={edit} onCommitClip={handlers.onCommitClip} />}
      {visual && <EffectsSection edit={edit} />}
      {(clip.kind === 'video' || clip.kind === 'audio') && <AudioSection clip={clip} edit={edit} onDetachAudio={handlers.onDetachAudio} />}
      <FadeSection clip={clip} edit={edit} />
      {visual && <TransitionSection clip={clip} edit={edit} />}
      {clip.kind !== 'image' && (
        <SpeedSection clip={clip} onCommitClip={handlers.onCommitClip} onBeginEdit={handlers.onBeginEdit} onLiveClip={handlers.onLiveClip} />
      )}
      {visual && <ClipTextSection clip={clip} onAddText={handlers.onAddTextToClip} onSelectText={handlers.onSelectText} />}
    </>
  );
}
