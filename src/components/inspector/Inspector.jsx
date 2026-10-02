import { useEffect, useState } from 'react';
import {
  FilmStrip,
  ImageSquare,
  MusicNotes,
  Palette,
  ClosedCaptioning,
  Sparkle,
  SlidersHorizontal,
  SpeakerSimpleSlash,
  TextT,
  Trash,
} from '@phosphor-icons/react';
import { defaultCaptionPosition } from '../../lib/compositor.js';
import { clipTextOverlays } from '../../lib/editor.js';
import { formatTime } from '../../lib/media.js';
import ColorWorkspace from '../ColorWorkspace.jsx';
import TranscriptionControls from '../TranscriptionControls.jsx';
import { Button } from '../ui.jsx';
import { clipEditing } from './clip-editing.js';
import EditTab, { FadeSection, TransformSection, TransitionSection } from './EditTab.jsx';
import MotionTab from './MotionTab.jsx';
import ProjectPanel from './ProjectPanel.jsx';
import TextTab from './TextTab.jsx';

const KIND_ICONS = { video: FilmStrip, image: ImageSquare, audio: MusicNotes, text: TextT };
const KIND_LABELS = { video: 'Video clip', image: 'Image', audio: 'Audio clip', text: 'Text' };

const TAB_META = {
  edit: ['Edit', SlidersHorizontal],
  text: ['Text', TextT],
  motion: ['Animate', Sparkle],
  color: ['Color', Palette],
  captions: ['Captions', ClosedCaptioning],
};

function tabsFor(clip, hasSelectedText) {
  if (clip.kind === 'text') return ['text', 'motion'];
  if (clip.kind === 'audio') return ['edit', 'captions'];
  const tabs = ['edit', 'motion', 'color'];
  if (clip.kind === 'video') tabs.push('captions');
  return hasSelectedText ? ['text', ...tabs] : tabs;
}

function MultiPanel({ clips, handlers }) {
  const allMuted = clips.every((clip) => clip.muted);
  const apply = (label, updater) => handlers.onCommitClips(clips.map((clip) => clip.id), updater, label);
  return (
    <div className="multi-panel">
      <div className="inspector-intro">
        <SlidersHorizontal size={18} />
        <p>{clips.length} clips selected. Changes here apply to all of them.</p>
      </div>
      <div className="multi-panel__actions">
        <Button onClick={() => apply('Fade in', (clip) => ({ ...clip, fadeIn: Math.min(0.5, clip.duration / 2) }))}>Fade in all</Button>
        <Button onClick={() => apply('Fade out', (clip) => ({ ...clip, fadeOut: Math.min(0.5, clip.duration / 2) }))}>Fade out all</Button>
        <Button onClick={() => apply(allMuted ? 'Unmute clips' : 'Mute clips', (clip) => ({ ...clip, muted: !allMuted }))}>
          <SpeakerSimpleSlash size={14} /> {allMuted ? 'Unmute all' : 'Mute all'}
        </Button>
        <Button onClick={() => apply('Remove fades', (clip) => ({ ...clip, fadeIn: 0, fadeOut: 0 }))}>Remove fades</Button>
        <Button variant="danger-soft" onClick={handlers.onDeleteSelected}><Trash size={14} /> Delete</Button>
        <Button variant="danger-soft" onClick={handlers.onRippleDelete}>Ripple delete</Button>
      </div>
    </div>
  );
}

export default function Inspector({ project, selectedClipIds, selectedTextId, playhead, handlers }) {
  const [tab, setTab] = useState('edit');
  const clips = selectedClipIds.map((id) => project.clips.find((clip) => clip.id === id)).filter(Boolean);
  const clip = clips.length === 1 ? clips[0] : null;
  const overlay = clip && selectedTextId ? clipTextOverlays(clip).find((text) => text.id === selectedTextId) : null;
  const textOverlay = clip?.kind === 'text' ? clipTextOverlays(clip)[0] : overlay;

  useEffect(() => {
    if (selectedTextId) setTab('text');
  }, [selectedTextId]);

  if (!clips.length) {
    return (
      <aside className="panel inspector" aria-label="Inspector">
        <header className="panel-header"><h2>Project</h2></header>
        <div className="inspector__scroll">
          <ProjectPanel project={project} onCommitProject={handlers.onCommitProject} onLiveProject={handlers.onLiveProject} onBeginEdit={handlers.onBeginEdit} />
        </div>
      </aside>
    );
  }

  if (!clip) {
    return (
      <aside className="panel inspector" aria-label="Inspector">
        <header className="panel-header"><h2>Selection</h2></header>
        <div className="inspector__scroll"><MultiPanel clips={clips} handlers={handlers} /></div>
      </aside>
    );
  }

  const tabs = tabsFor(clip, Boolean(overlay));
  const activeTab = tabs.includes(tab) ? tab : tabs[0];
  const edit = clipEditing(clip, playhead, handlers);
  const asset = project.media.find((item) => item.id === clip.assetId) || null;
  const KindIcon = KIND_ICONS[clip.kind] || FilmStrip;

  return (
    <aside className="panel inspector" aria-label="Inspector">
      <header className="inspector__header">
        <span className={`kind-chip kind-chip--${clip.kind}`}><KindIcon size={14} /></span>
        <div className="inspector__title">
          <input
            aria-label="Clip name"
            value={clip.name || ''}
            onFocus={() => handlers.onBeginEdit('Rename clip')}
            onChange={(event) => handlers.onLiveClip(clip.id, (current) => ({ ...current, name: event.target.value }))}
            onKeyDown={(event) => { if (event.key === 'Enter' || event.key === 'Escape') event.currentTarget.blur(); }}
          />
          <span>{KIND_LABELS[clip.kind]} <span className="mono">{formatTime(clip.duration, true, project.frameRate)}</span></span>
        </div>
      </header>
      {tabs.length > 1 && (
        <nav className="tabs" role="tablist" aria-label="Inspector tabs">
          {tabs.map((id) => {
            const [label, Icon] = TAB_META[id];
            return (
              <button key={id} type="button" role="tab" aria-selected={activeTab === id} className={activeTab === id ? 'is-active' : ''} onClick={() => setTab(id)}>
                {tabs.length <= 3 && <Icon size={14} />} {label}
              </button>
            );
          })}
        </nav>
      )}
      <div className="inspector__scroll" key={`${clip.id}-${activeTab}`}>
        {activeTab === 'edit' && <EditTab clip={clip} edit={edit} handlers={handlers} />}
        {activeTab === 'text' && textOverlay && (
          <>
            <TextTab
              clip={clip}
              overlay={textOverlay}
              handlers={handlers}
              onDeleteText={clip.kind !== 'text' ? () => handlers.onDeleteText(clip.id, textOverlay.id) : null}
            />
            {clip.kind === 'text' && (
              <>
                <FadeSection clip={clip} edit={edit} />
                <TransitionSection clip={clip} edit={edit} />
              </>
            )}
          </>
        )}
        {activeTab === 'motion' && (
          <>
            {clip.kind === 'text' && <TransformSection clip={clip} edit={edit} onCommitClip={handlers.onCommitClip} showLayouts={false} />}
            <MotionTab clip={clip} edit={edit} handlers={handlers} />
          </>
        )}
        {activeTab === 'color' && (
          <ColorWorkspace
            clip={clip}
            onUpdate={(patch) => handlers.onCommitClip(clip.id, (current) => ({ ...current, ...patch }), 'Color')}
            onLiveUpdate={(patch) => handlers.onLiveClip(clip.id, (current) => ({ ...current, ...patch }))}
            onBeginEdit={() => handlers.onBeginEdit('Color')}
          />
        )}
        {activeTab === 'captions' && (
          <TranscriptionControls
            clip={clip}
            asset={asset}
            defaultPositionY={defaultCaptionPosition(project)}
            onUpdate={(patch) => handlers.onCommitClip(clip.id, (current) => ({ ...current, ...patch }), 'Captions')}
            onLiveUpdate={(patch) => handlers.onLiveClip(clip.id, (current) => ({ ...current, ...patch }))}
            onBeginEdit={() => handlers.onBeginEdit('Captions')}
          />
        )}
      </div>
    </aside>
  );
}
