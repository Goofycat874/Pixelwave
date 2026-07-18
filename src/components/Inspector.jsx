import { useEffect, useState } from 'react';
import { ArrowsHorizontal, ArrowsVertical, Microphone, Palette, SlidersHorizontal, TextT } from '@phosphor-icons/react';
import { defaultEffects } from '../lib/editor.js';
import ColorWorkspace from './ColorWorkspace.jsx';
import TranscriptionControls from './TranscriptionControls.jsx';

const effectDefaults = defaultEffects();

const finishControls = [
  ['Blur', 'blur', 0, 16, 0.5, ' px'],
  ['Vignette', 'vignette', 0, 100, 1, '%'],
];

const transformControls = [
  ['Scale', 'scale', 25, 200, 1, '%'],
  ['Rotation', 'rotation', -180, 180, 1, '°'],
  ['Position X', 'positionX', -100, 100, 1, '%'],
  ['Position Y', 'positionY', -100, 100, 1, '%'],
  ['Opacity', 'opacity', 0, 100, 1, '%'],
  ['Volume', 'volume', 0, 150, 1, '%'],
];

const audioControls = [['Volume', 'volume', 0, 150, 1, '%']];

function RangeControl({ label, value, min, max, step, suffix, onChange }) {
  const progress = ((value - min) / (max - min)) * 100;
  return (
    <label className="range-control">
      <span><strong>{label}</strong><output>{value}{suffix}</output></span>
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

function ControlGroup({ title, values, clip, onUpdate }) {
  return (
    <section className="inspector-section">
      <div className="inspector-section__title"><h3>{title}</h3><span>{values.length}</span></div>
      <div className="inspector-controls">
        {values.map(([label, key, min, max, step, suffix]) => (
          <RangeControl
            key={key}
            label={label}
            value={clip.effects[key] ?? effectDefaults[key]}
            min={min}
            max={max}
            step={step}
            suffix={suffix}
            onChange={(value) => onUpdate({ effects: { ...clip.effects, [key]: value } })}
          />
        ))}
      </div>
    </section>
  );
}

function EditControls({ clip, selectedText, onTextUpdate, onUpdate, onSpeedChange }) {
  const text = selectedText || clip.title || {};
  const updateText = selectedText
    ? onTextUpdate
    : (nextText) => onUpdate({ title: nextText });

  return (
    <>
      <section className="inspector-section inspector-section--transition">
        <div className="inspector-section__title"><h3>Entry transition</h3></div>
        <div className="segmented-control">
          {[
            ['cut', 'Cut'],
            ['dissolve', 'Dissolve'],
            ['dip', 'Dip'],
            ['slide', 'Slide'],
            ['zoom', 'Zoom'],
            ['wipe', 'Wipe'],
          ].map(([value, label]) => (
            <button
              type="button"
              className={clip.transition.type === value ? 'is-active' : ''}
              key={value}
              onClick={() => onUpdate({ transition: { ...clip.transition, type: value } })}
            >{label}</button>
          ))}
        </div>
        {clip.transition.type !== 'cut' && (
          <RangeControl label="Duration" value={clip.transition.duration} min={0.2} max={2} step={0.1} suffix=" s" onChange={(duration) => onUpdate({ transition: { ...clip.transition, duration } })} />
        )}
      </section>

      <section className="inspector-section">
        <div className="inspector-section__title"><h3>Timing {clip.kind !== 'audio' && '& frame'}</h3><span>{clip.speed || 1}×</span></div>
        <RangeControl label="Playback speed" value={clip.speed || 1} min={0.25} max={4} step={0.25} suffix="×" onChange={onSpeedChange} />
        {clip.kind !== 'audio' && (
          <div className="frame-controls">
            <div className="segmented-control segmented-control--fit">
              {['contain', 'cover'].map((fit) => (
                <button type="button" className={(clip.fit || 'contain') === fit ? 'is-active' : ''} key={fit} onClick={() => onUpdate({ fit })}>{fit === 'contain' ? 'Fit' : 'Fill'}</button>
              ))}
            </div>
            <button type="button" className={`frame-toggle ${clip.effects.flipX ? 'is-active' : ''}`} onClick={() => onUpdate({ effects: { ...clip.effects, flipX: !clip.effects.flipX } })}><ArrowsHorizontal size={14} /> Flip H</button>
            <button type="button" className={`frame-toggle ${clip.effects.flipY ? 'is-active' : ''}`} onClick={() => onUpdate({ effects: { ...clip.effects, flipY: !clip.effects.flipY } })}><ArrowsVertical size={14} /> Flip V</button>
          </div>
        )}
      </section>

      {clip.kind !== 'audio' && (
        <section className="inspector-section title-controls">
          <div className="inspector-section__title"><h3><TextT size={13} /> {selectedText ? 'Selected text' : 'Clip title'}</h3><span>{text.text?.length || 0}</span></div>
          <label className="inspector-field">
            <span>Text</span>
            <input type="text" maxLength={80} placeholder="Add a title to this clip" value={text.text || ''} onChange={(event) => updateText({ ...text, text: event.target.value })} />
          </label>
          <label className="inspector-field">
            <span>Color</span>
            <input type="color" value={text.color || '#ffffff'} onChange={(event) => updateText({ ...text, color: event.target.value })} />
          </label>
          <RangeControl label="Size" value={text.fontSize || 54} min={12} max={180} step={2} suffix=" px" onChange={(fontSize) => updateText({ ...text, fontSize })} />
          <RangeControl label="Horizontal position" value={text.positionX ?? 50} min={0} max={100} step={1} suffix="%" onChange={(positionX) => updateText({ ...text, positionX })} />
          <RangeControl label="Vertical position" value={text.positionY ?? 78} min={0} max={100} step={1} suffix="%" onChange={(positionY) => updateText({ ...text, positionY })} />
          <RangeControl label="Text opacity" value={text.opacity ?? 100} min={0} max={100} step={1} suffix="%" onChange={(opacity) => updateText({ ...text, opacity })} />
        </section>
      )}

      {clip.kind !== 'audio' && <ControlGroup title="Finish" values={finishControls} clip={clip} onUpdate={onUpdate} />}
      <ControlGroup title={clip.kind === 'audio' ? 'Sound' : 'Transform & sound'} values={clip.kind === 'audio' ? audioControls : transformControls} clip={clip} onUpdate={onUpdate} />
    </>
  );
}

export default function Inspector({ clip, asset, selectedText, onUpdate, onTextUpdate, onLiveUpdate, onBeginEdit, onSpeedChange }) {
  const [activeTab, setActiveTab] = useState('edit');

  useEffect(() => {
    if ((activeTab === 'color' && clip?.kind === 'audio') || (activeTab === 'voice' && clip?.kind === 'image')) setActiveTab('edit');
  }, [activeTab, clip?.kind]);

  if (!clip) {
    return (
      <aside className="inspector panel inspector--empty">
        <div className="panel__header"><div><p className="eyebrow">Adjust</p><h2>Inspector</h2></div></div>
        <div className="inspector-empty__body">
          <SlidersHorizontal size={25} weight="duotone" />
          <p>Select a timeline clip</p>
          <span>Edit, Color, and Voice tools will appear here.</span>
        </div>
      </aside>
    );
  }

  return (
    <aside className={`inspector panel inspector--${activeTab}`}>
      <div className="panel__header inspector__header">
        <div><p className="eyebrow">Selected clip</p><h2 title={clip.name}>{clip.name.replace(/\.[^.]+$/, '')}</h2></div>
        <button type="button" className="reset-button" onClick={() => onUpdate({ effects: undefined }, true)}>Reset effects</button>
      </div>
      <nav className="inspector-tabs" aria-label="Inspector workspaces">
        <button type="button" className={activeTab === 'edit' ? 'is-active' : ''} onClick={() => setActiveTab('edit')}><SlidersHorizontal size={13} /> Edit</button>
        <button type="button" disabled={clip.kind === 'audio'} className={activeTab === 'color' ? 'is-active' : ''} onClick={() => setActiveTab('color')}><Palette size={13} /> Color</button>
        <button type="button" disabled={clip.kind === 'image'} className={activeTab === 'voice' ? 'is-active' : ''} onClick={() => setActiveTab('voice')}><Microphone size={13} /> Voice</button>
      </nav>

      {activeTab === 'edit' && <EditControls clip={clip} selectedText={selectedText} onTextUpdate={onTextUpdate} onUpdate={onUpdate} onSpeedChange={onSpeedChange} />}
      {activeTab === 'color' && clip.kind !== 'audio' && (
        <ColorWorkspace clip={clip} onUpdate={onUpdate} onLiveUpdate={onLiveUpdate} onBeginEdit={onBeginEdit} />
      )}
      {activeTab === 'voice' && clip.kind !== 'image' && <TranscriptionControls clip={clip} asset={asset} onUpdate={onUpdate} />}
    </aside>
  );
}
