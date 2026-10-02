import { useEffect, useRef, useState } from 'react';
import {
  Camera,
  CaretDown,
  CaretLineLeft,
  CaretLineRight,
  ClockCounterClockwise,
  CornersIn,
  CornersOut,
  DownloadSimple,
  FolderOpen,
  GridFour,
  Pause,
  Play,
  Repeat,
  SkipBack,
  SkipForward,
  TextT,
  X,
} from '@phosphor-icons/react';
import { formatTime, parseTimecode } from '../lib/media.js';
import { aspectLabel, CANVAS_FORMATS } from '../lib/project.js';
import FormatPicker from './FormatPicker.jsx';
import Preview from './Preview.jsx';
import { Button, IconButton, Kbd, Popover } from './ui.jsx';

function TimecodeField({ value, fps, onCommit }) {
  const [draft, setDraft] = useState(null);
  const display = formatTime(value, true, fps);
  return (
    <input
      className="timecode mono"
      aria-label="Current time. Type a time and press Enter to jump."
      title="Type a time to jump, like 1:30 or 00:01:30:12"
      value={draft ?? display}
      onFocus={(event) => { setDraft(display); event.target.select(); }}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => setDraft(null)}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          const parsed = parseTimecode(draft, fps);
          if (parsed !== null) onCommit(parsed);
          event.currentTarget.blur();
        }
        if (event.key === 'Escape') event.currentTarget.blur();
        event.stopPropagation();
      }}
    />
  );
}

function Welcome({ project, mediaCount, recent, restore, shortcuts, onFormat, onImport, onAddText, onOpen, onOpenRecent, onRestore, onDiscardRestore, onAddAllMedia }) {
  const quickFormats = CANVAS_FORMATS.slice(0, 4);
  return (
    <div className="welcome">
      <div className="welcome__inner">
        {restore && (
          <div className="welcome__restore" role="status">
            <ClockCounterClockwise size={18} />
            <div>
              <strong>Recovered unsaved work</strong>
              <span>{restore.name || 'Untitled project'}, autosaved {new Date(restore.savedAt).toLocaleString()}</span>
            </div>
            <Button size="sm" variant="primary" onClick={onRestore}>Restore</Button>
            <IconButton size="sm" label="Discard recovered work" onClick={onDiscardRestore}><X size={14} /></IconButton>
          </div>
        )}
        <h1>{mediaCount ? 'Put your clips on the timeline' : 'Start a new video'}</h1>
        <p>{mediaCount ? 'Drag files from the library onto the timeline, or add them all at once.' : 'Choose the shape of your video, then bring in your footage.'}</p>
        <div className="welcome__formats" role="radiogroup" aria-label="Video shape">
          {quickFormats.map((format) => {
            const active = project.width === format.width && project.height === format.height;
            const scale = 46 / Math.max(format.width, format.height);
            return (
              <button key={format.id} type="button" role="radio" aria-checked={active} className={active ? 'is-active' : ''} onClick={() => onFormat(format)}>
                <span className="welcome__shape"><span style={{ width: format.width * scale, height: format.height * scale }} /></span>
                <strong>{format.label}</strong>
                <small>{format.ratio}, {format.detail}</small>
              </button>
            );
          })}
        </div>
        <div className="welcome__actions">
          {mediaCount ? (
            <Button variant="primary" onClick={onAddAllMedia}><DownloadSimple size={16} /> Add {mediaCount} {mediaCount === 1 ? 'file' : 'files'} to timeline</Button>
          ) : (
            <Button variant="primary" onClick={onImport}><DownloadSimple size={16} /> Import media <Kbd>{shortcuts.import}</Kbd></Button>
          )}
          <Button onClick={onAddText}><TextT size={16} /> Add a title</Button>
          <Button variant="ghost" onClick={onOpen}><FolderOpen size={16} /> Open project</Button>
        </div>
        {!mediaCount && <p className="welcome__tip">You can also drop files anywhere in this window.</p>}
        {recent.length > 0 && (
          <div className="welcome__recent">
            <h2>Recent projects</h2>
            {recent.slice(0, 5).map((item) => (
              <button key={item.path} type="button" onClick={() => onOpenRecent(item.path)} disabled={item.missing} title={item.path}>
                <span>{item.name}</span>
                <small>{item.missing ? 'File not found' : new Date(item.openedAt).toLocaleDateString()}</small>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function Viewer({
  project,
  playhead,
  playing,
  duration,
  loop,
  inPoint,
  outPoint,
  guides,
  selectedClipIds,
  selectedTextId,
  editingText,
  shortcuts,
  welcome,
  onTogglePlay,
  onSeek,
  onStepEdit,
  onToggleLoop,
  onClearRange,
  onToggleGuides,
  onSnapshot,
  onFormat,
  onFrameRate,
  previewHandlers,
}) {
  const viewerRef = useRef(null);
  const [formatAnchor, setFormatAnchor] = useState(null);
  const [fullscreen, setFullscreen] = useState(false);
  const fps = project.frameRate || 30;
  const hasClips = project.clips.length > 0;

  useEffect(() => {
    const onChange = () => setFullscreen(document.fullscreenElement === viewerRef.current);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  const toggleFullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen?.();
    else viewerRef.current?.requestFullscreen?.();
  };

  return (
    <section className={`panel viewer ${fullscreen ? 'is-fullscreen' : ''}`} ref={viewerRef} aria-label="Viewer">
      <div className="viewer-toolbar">
        <button type="button" className="format-button" onClick={(event) => setFormatAnchor(event.currentTarget.getBoundingClientRect())} aria-haspopup="dialog">
          <strong>{aspectLabel(project.width, project.height)}</strong>
          <span className="mono">{project.width} × {project.height}</span>
          <span className="mono">{fps} fps</span>
          <CaretDown size={11} />
        </button>
        <span className="viewer-toolbar__spacer" />
        <IconButton label="Safe area and thirds guides" shortcut={shortcuts.guides} active={guides} onClick={onToggleGuides}><GridFour size={16} /></IconButton>
        <IconButton label="Save this frame as an image" onClick={onSnapshot} disabled={!hasClips}><Camera size={16} /></IconButton>
        <IconButton label={fullscreen ? 'Exit full screen' : 'Full screen'} shortcut={shortcuts.fullscreen} onClick={toggleFullscreen}>
          {fullscreen ? <CornersIn size={16} /> : <CornersOut size={16} />}
        </IconButton>
      </div>

      <div className="viewer-body">
        <Preview
          project={project}
          playhead={playhead}
          playing={playing}
          selectedClipIds={selectedClipIds}
          selectedTextId={selectedTextId}
          editingText={editingText}
          guides={guides}
          {...previewHandlers}
        />
        {!hasClips && welcome && <Welcome project={project} shortcuts={shortcuts} onFormat={onFormat} {...welcome} />}
      </div>

      <div className="transport">
        <div className="transport__time">
          <TimecodeField value={playhead} fps={fps} onCommit={onSeek} />
          <span className="mono transport__duration">/ {formatTime(duration, true, fps)}</span>
        </div>
        <div className="transport__controls">
          <IconButton label="Go to start" shortcut="Home" onClick={() => onSeek(0)}><SkipBack size={16} weight="fill" /></IconButton>
          <IconButton label="Previous cut" shortcut="↑" onClick={() => onStepEdit(-1)}><CaretLineLeft size={16} /></IconButton>
          <button type="button" className="play-btn" aria-label={playing ? 'Pause' : 'Play'} title={`${playing ? 'Pause' : 'Play'} (Space)`} onClick={onTogglePlay} disabled={!hasClips}>
            {playing ? <Pause size={18} weight="fill" /> : <Play size={18} weight="fill" />}
          </button>
          <IconButton label="Next cut" shortcut="↓" onClick={() => onStepEdit(1)}><CaretLineRight size={16} /></IconButton>
          <IconButton label="Go to end" shortcut="End" onClick={() => onSeek(duration)}><SkipForward size={16} weight="fill" /></IconButton>
        </div>
        <div className="transport__extras">
          {(inPoint !== null || outPoint !== null) && (
            <span className="range-pill mono" title="Playback and export range">
              {inPoint !== null ? formatTime(inPoint, true, fps) : 'start'} to {outPoint !== null ? formatTime(outPoint, true, fps) : 'end'}
              <button type="button" aria-label="Clear in and out points" onClick={onClearRange}><X size={11} /></button>
            </span>
          )}
          <IconButton label="Loop playback" shortcut={shortcuts.loop} active={loop} onClick={onToggleLoop}><Repeat size={16} /></IconButton>
        </div>
      </div>

      {formatAnchor && (
        <Popover anchorRect={formatAnchor} onClose={() => setFormatAnchor(null)} width={340}>
          <div className="popover__header"><strong>Canvas</strong><span>Clips keep their framing when you switch.</span></div>
          <FormatPicker
            width={project.width}
            height={project.height}
            frameRate={fps}
            onFormat={(format) => { onFormat(format); setFormatAnchor(null); }}
            onFrameRate={onFrameRate}
          />
        </Popover>
      )}
    </section>
  );
}
