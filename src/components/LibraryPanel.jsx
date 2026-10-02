import { useMemo, useState } from 'react';
import {
  DotsThree,
  DownloadSimple,
  FilmStrip,
  FolderOpen,
  ImageSquare,
  MagnifyingGlass,
  Microphone,
  MusicNotes,
  PaintBucket,
  Plus,
  PlusCircle,
  SpinnerGap,
  TextT,
  Trash,
} from '@phosphor-icons/react';
import { fontStack } from '../lib/fonts.js';
import { GRADIENTS, SOLID_COLORS } from '../lib/generators.js';
import { fileTypeLabel, formatTime } from '../lib/media.js';
import { resolveTextStyle, TEXT_PRESETS } from '../lib/text.js';
import { Button, IconButton, Menu, Segmented } from './ui.jsx';

const KIND_ICONS = { video: FilmStrip, image: ImageSquare, audio: MusicNotes };
const FILTERS = [['all', 'All'], ['video', 'Video'], ['audio', 'Audio'], ['image', 'Images']];

function setPresetDrag(event, payload) {
  event.dataTransfer.effectAllowed = 'copy';
  event.dataTransfer.setData('application/x-pixelwave-preset', JSON.stringify(payload));
}

function MediaTab({ media, importing, error, usage, onImport, onAddToTimeline, onReveal, onRemove, onRecordVoice }) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [menu, setMenu] = useState(null);
  const filtered = useMemo(() => media.filter((item) => (
    (filter === 'all' || item.kind === filter)
    && item.name.toLowerCase().includes(query.trim().toLowerCase())
  )), [filter, media, query]);

  const openMenu = (event, item) => {
    event.preventDefault();
    event.stopPropagation();
    setMenu({ x: event.clientX, y: event.clientY, item });
  };

  return (
    <div className="library-tab">
      <div className="library-tools">
        <label className="search">
          <MagnifyingGlass size={14} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search media" aria-label="Search media" />
        </label>
        <IconButton label="Import media" shortcut="Ctrl+I" onClick={onImport} disabled={importing}>
          {importing ? <SpinnerGap size={16} className="spin" /> : <Plus size={16} />}
        </IconButton>
      </div>
      {media.length > 0 && (
        <Segmented size="sm" className="library-filter" label="Filter media" value={filter} onChange={setFilter} options={FILTERS} />
      )}
      {error && <p className="library-error" role="alert">{error}</p>}

      <div className="library-scroll">
        {media.length === 0 && !importing ? (
          <button type="button" className="drop-hint" onClick={onImport}>
            <DownloadSimple size={22} />
            <strong>Import media</strong>
            <span>Or drop video, audio and image files anywhere in the window.</span>
          </button>
        ) : (
          <div className="media-grid">
            {filtered.map((item) => {
              const KindIcon = KIND_ICONS[item.kind] || FilmStrip;
              const used = usage.get(item.id) || 0;
              return (
                <article
                  key={item.id}
                  className="media-card"
                  draggable
                  tabIndex={0}
                  aria-label={`${item.name}. Press Enter to add to the timeline.`}
                  onDragStart={(event) => {
                    event.dataTransfer.effectAllowed = 'copy';
                    event.dataTransfer.setData('application/x-pixelwave-media', item.id);
                  }}
                  onDoubleClick={() => onAddToTimeline(item.id)}
                  onKeyDown={(event) => { if (event.key === 'Enter' && event.target === event.currentTarget) onAddToTimeline(item.id); }}
                  onContextMenu={(event) => openMenu(event, item)}
                >
                  <div className={`media-card__thumb media-card__thumb--${item.kind}`}>
                    {item.thumbnail ? <img src={item.thumbnail} alt="" draggable={false} /> : <KindIcon size={22} />}
                    {item.kind !== 'image' && <span className="media-card__duration mono">{formatTime(item.duration)}</span>}
                    {used > 0 && <span className="media-card__used" title={`Used ${used} ${used === 1 ? 'time' : 'times'} on the timeline`}>{used}</span>}
                    <button type="button" className="media-card__add" aria-label={`Add ${item.name} to timeline`} title="Add at the end of the timeline" onClick={(event) => { event.stopPropagation(); onAddToTimeline(item.id); }}>
                      <Plus size={14} weight="bold" />
                    </button>
                  </div>
                  <div className="media-card__meta">
                    <span className="media-card__name" title={item.name}>{item.name.replace(/\.[^.]+$/, '')}</span>
                    <button type="button" className="media-card__more" aria-label={`More actions for ${item.name}`} onClick={(event) => openMenu(event, item)}>
                      <DotsThree size={16} weight="bold" />
                    </button>
                  </div>
                  <span className="media-card__detail">{item.generator ? 'Generated' : fileTypeLabel(item)}{item.optimized ? ', proxy' : ''}</span>
                </article>
              );
            })}
            {importing && <div className="media-card media-card--loading" aria-label="Importing"><div className="media-card__thumb" /></div>}
            {!filtered.length && !importing && <p className="library-empty">No media matches.</p>}
          </div>
        )}
      </div>
      <div className="library-footer">
        <Button variant="ghost" size="sm" onClick={onRecordVoice}><Microphone size={14} /> Record voiceover</Button>
        <span className="mono">{media.length} {media.length === 1 ? 'file' : 'files'}</span>
      </div>
      {menu && (
        <Menu
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          items={[
            { label: 'Add to timeline', icon: PlusCircle, onSelect: () => onAddToTimeline(menu.item.id) },
            !menu.item.generator && { label: 'Show in folder', icon: FolderOpen, onSelect: () => onReveal(menu.item.id) },
            { separator: true },
            { label: 'Remove from project', icon: Trash, danger: true, onSelect: () => onRemove(menu.item.id) },
          ]}
        />
      )}
    </div>
  );
}

function TextTab({ onAddText }) {
  return (
    <div className="library-tab">
      <p className="library-note">Click to add at the playhead, or drag onto the timeline.</p>
      <div className="library-scroll">
        <div className="text-preset-grid">
          {TEXT_PRESETS.map((preset) => {
            const style = resolveTextStyle(preset.style);
            return (
              <button
                key={preset.id}
                type="button"
                className="text-preset"
                draggable
                onDragStart={(event) => setPresetDrag(event, { type: 'text', presetId: preset.id })}
                onClick={() => onAddText(preset.id)}
              >
                <span className="text-preset__stage">
                  <span
                    style={{
                      fontFamily: fontStack(style.fontFamily),
                      fontWeight: style.fontWeight,
                      fontStyle: style.italic ? 'italic' : 'normal',
                      color: style.color,
                      background: style.backgroundEnabled ? style.backgroundColor : 'transparent',
                      padding: style.backgroundEnabled ? '2px 8px' : 0,
                      borderRadius: style.backgroundEnabled ? 3 : 0,
                      letterSpacing: `${style.letterSpacing / 100}em`,
                      textTransform: style.uppercase ? 'uppercase' : 'none',
                      WebkitTextStroke: style.strokeWidth ? `${Math.min(2, style.strokeWidth / 4)}px ${style.strokeColor}` : undefined,
                      paintOrder: 'stroke fill',
                      textShadow: style.glow ? `0 0 10px ${style.color}` : style.shadow ? '0 1px 4px rgba(0,0,0,0.6)' : 'none',
                    }}
                  >{preset.sample}</span>
                </span>
                <span className="text-preset__label">{preset.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function BackgroundsTab({ onAddBackground }) {
  const [custom, setCustom] = useState('#3e63dd');
  return (
    <div className="library-tab">
      <p className="library-note">Backgrounds are 5 second clips you can stretch to any length.</p>
      <div className="library-scroll">
        <h3 className="library-heading">Colors</h3>
        <div className="swatch-grid">
          {SOLID_COLORS.map(([color, label]) => (
            <button
              key={color}
              type="button"
              className="swatch"
              title={label}
              aria-label={`${label} background`}
              style={{ background: color }}
              draggable
              onDragStart={(event) => setPresetDrag(event, { type: 'background', generator: { type: 'solid', color } })}
              onClick={() => onAddBackground({ type: 'solid', color })}
            />
          ))}
          <label className="swatch swatch--custom" title="Pick any color">
            <input type="color" value={custom} onChange={(event) => setCustom(event.target.value)} aria-label="Custom color" />
            <PaintBucket size={14} />
          </label>
        </div>
        <Button size="sm" onClick={() => onAddBackground({ type: 'solid', color: custom })}>
          <span className="swatch-dot" style={{ background: custom }} /> Add {custom.toUpperCase()}
        </Button>
        <h3 className="library-heading">Gradients</h3>
        <div className="gradient-grid">
          {GRADIENTS.map((gradient) => {
            const generator = { type: 'gradient', id: gradient.id, colors: gradient.colors, angle: gradient.angle };
            return (
              <button
                key={gradient.id}
                type="button"
                className="gradient-card"
                draggable
                onDragStart={(event) => setPresetDrag(event, { type: 'background', generator })}
                onClick={() => onAddBackground(generator)}
              >
                <span style={{ background: `linear-gradient(${gradient.angle}deg, ${gradient.colors.join(', ')})` }} />
                <small>{gradient.label}</small>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default function LibraryPanel({ tab, onTab, ...props }) {
  return (
    <aside className="panel library" aria-label="Library">
      <nav className="tabs tabs--library" role="tablist" aria-label="Library">
        {[['media', 'Media', FilmStrip], ['text', 'Text', TextT], ['backgrounds', 'Backgrounds', PaintBucket]].map(([id, label, Icon]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} className={tab === id ? 'is-active' : ''} onClick={() => onTab(id)}>
            <Icon size={14} /> {label}
          </button>
        ))}
      </nav>
      {tab === 'media' && <MediaTab {...props} />}
      {tab === 'text' && <TextTab onAddText={props.onAddText} />}
      {tab === 'backgrounds' && <BackgroundsTab onAddBackground={props.onAddBackground} />}
    </aside>
  );
}
