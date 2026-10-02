import { CaretLeft, CaretRight, Sparkle, Trash } from '@phosphor-icons/react';
import {
  ANIMATABLE_PROPERTIES,
  applyMotionPreset,
  clearKeyframes,
  EASINGS,
  keyframeIndexAt,
  MOTION_PRESETS,
  setKeyframeEasing,
  sortKeyframes,
} from '../../lib/animation.js';
import { Button, IconButton, Section } from '../ui.jsx';

const GROUPS = ['Entrance', 'Continuous', 'Exit'];

export default function MotionTab({ clip, edit, handlers }) {
  const animated = Object.entries(clip.keyframes || {}).filter(([, list]) => list?.length);
  const seekTo = (time) => handlers.onSeek(clip.start + time);

  return (
    <>
      <Section id="motion-presets" title="One-click animation">
        {GROUPS.map((group) => (
          <div className="field-stack" key={group}>
            <span className="field-stack__label">{group}</span>
            <div className="chip-grid chip-grid--2">
              {MOTION_PRESETS.filter((preset) => preset.group === group).map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => handlers.onCommitClip(clip.id, (current) => applyMotionPreset(current, preset.id), `Animation: ${preset.label}`)}
                >{preset.label}</button>
              ))}
            </div>
          </div>
        ))}
      </Section>

      <Section
        id="motion-keyframes"
        title="Keyframes"
        badge={animated.length || null}
        actions={animated.length ? (
          <button type="button" className="link-btn" onClick={() => handlers.onCommitClip(clip.id, (current) => clearKeyframes(current), 'Remove animation')}>
            <Trash size={12} /> Clear all
          </button>
        ) : null}
      >
        {!animated.length && (
          <div className="empty-note">
            <Sparkle size={18} />
            <p>Nothing is animated yet. Pick an animation above, or click the diamond next to any property in the Edit tab to set a keyframe at the playhead.</p>
          </div>
        )}
        {animated.map(([property, list]) => {
          const frames = sortKeyframes(list);
          const index = keyframeIndexAt(frames, edit.local);
          const current = frames[index];
          const previous = [...frames].reverse().find((frame) => frame.time < edit.local - 0.004);
          const next = frames.find((frame) => frame.time > edit.local + 0.004);
          return (
            <div className="keyframe-row" key={property}>
              <div className="keyframe-row__head">
                <span className={`keyframe-dot ${current ? 'is-on' : ''}`} aria-hidden="true" />
                <strong>{ANIMATABLE_PROPERTIES[property]?.label || property}</strong>
                <span className="keyframe-row__count">{frames.length} keys</span>
                <IconButton label="Previous keyframe" size="xs" disabled={!previous} onClick={() => previous && seekTo(previous.time)}><CaretLeft size={11} weight="bold" /></IconButton>
                <IconButton label="Next keyframe" size="xs" disabled={!next} onClick={() => next && seekTo(next.time)}><CaretRight size={11} weight="bold" /></IconButton>
                <IconButton label={`Remove ${property} animation`} size="xs" onClick={() => handlers.onCommitClip(clip.id, (value) => clearKeyframes(value, [property]), 'Remove animation')}><Trash size={12} /></IconButton>
              </div>
              <div className="keyframe-row__track" aria-hidden="true">
                {frames.map((frame) => (
                  <button
                    key={frame.time}
                    type="button"
                    tabIndex={-1}
                    className={`keyframe-row__key ${current === frame ? 'is-current' : ''}`}
                    style={{ left: `${Math.min(100, Math.max(0, (frame.time / Math.max(0.001, clip.duration)) * 100))}%` }}
                    onClick={() => seekTo(frame.time)}
                  />
                ))}
                <span className="keyframe-row__playhead" style={{ left: `${Math.min(100, Math.max(0, (edit.local / Math.max(0.001, clip.duration)) * 100))}%` }} />
              </div>
              {current && (
                <div className="easing-row" role="group" aria-label="Easing after this keyframe">
                  {EASINGS.map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      className={(current.easing || 'linear') === value ? 'is-active' : ''}
                      onClick={() => handlers.onCommitClip(clip.id, (clipValue) => setKeyframeEasing(clipValue, property, current.time, value), 'Change easing')}
                    >{label}</button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
        {animated.length > 0 && (
          <Button size="sm" variant="ghost" onClick={() => handlers.onSeek(clip.start)}>Jump to clip start</Button>
        )}
      </Section>
    </>
  );
}
