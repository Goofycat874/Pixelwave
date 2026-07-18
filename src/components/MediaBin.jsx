import { useEffect, useMemo, useRef, useState } from 'react';
import {
  DotsThree,
  FolderOpen,
  ImageSquare,
  MagnifyingGlass,
  MusicNotes,
  Plus,
  PlusCircle,
  SpinnerGap,
  Trash,
  VideoCamera,
} from '@phosphor-icons/react';
import { fileTypeLabel, formatTime } from '../lib/media.js';
import IconButton from './IconButton.jsx';

const kindIcons = {
  video: VideoCamera,
  image: ImageSquare,
  audio: MusicNotes,
};

export default function MediaBin({ media, importing, error, onImport, onAddToTimeline, onReveal, onRemove }) {
  const [query, setQuery] = useState('');
  const [openMenuId, setOpenMenuId] = useState(null);
  const menuRootRef = useRef(null);
  const filtered = useMemo(() => media.filter((item) => item.name.toLowerCase().includes(query.toLowerCase())), [media, query]);

  useEffect(() => {
    if (!openMenuId) return undefined;
    const closeMenu = (event) => {
      if (event.key === 'Escape' || (event.type === 'pointerdown' && !menuRootRef.current?.contains(event.target))) {
        setOpenMenuId(null);
      }
    };
    window.addEventListener('pointerdown', closeMenu);
    window.addEventListener('keydown', closeMenu);
    return () => {
      window.removeEventListener('pointerdown', closeMenu);
      window.removeEventListener('keydown', closeMenu);
    };
  }, [openMenuId]);

  return (
    <aside className="media-bin panel" aria-label="Media library">
      <div className="panel__header">
        <div>
          <p className="eyebrow">Project</p>
          <h2>Media</h2>
        </div>
        <IconButton label="Import media" onClick={onImport} disabled={importing}>
          {importing ? <SpinnerGap className="spin" size={17} /> : <Plus size={17} />}
        </IconButton>
      </div>

      <label className="search-field">
        <MagnifyingGlass size={15} />
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search media" />
        <span>{filtered.length}</span>
      </label>

      {error && <div className="inline-error" role="alert">{error}</div>}

      <div className="media-grid" aria-live="polite">
        {filtered.map((item, index) => {
          const KindIcon = kindIcons[item.kind];
          return (
            <article
              className="media-item"
              key={item.id}
              draggable
              style={{ '--item-index': index }}
              onDragStart={(event) => event.dataTransfer.setData('application/x-pixelwave-media', item.id)}
              onDoubleClick={() => onAddToTimeline(item.id)}
              tabIndex={0}
              onKeyDown={(event) => event.target === event.currentTarget && event.key === 'Enter' && onAddToTimeline(item.id)}
              aria-label={`${item.name}. Double-click to add to timeline.`}
            >
              <div className={`media-item__visual media-item__visual--${item.kind}`}>
                {item.thumbnail ? <img src={item.thumbnail} alt="" /> : <KindIcon size={24} weight="duotone" />}
                <span className="media-item__duration">{formatTime(item.duration)}</span>
                {item.optimized && <span className="media-item__proxy">PROXY</span>}
              </div>
              <div className="media-item__meta">
                <div>
                  <strong>{item.name.replace(/\.[^.]+$/, '')}</strong>
                  <span>{fileTypeLabel(item)}</span>
                </div>
                <div className="media-item__actions" ref={openMenuId === item.id ? menuRootRef : null}>
                  <button
                    className="media-item__menu-button"
                    type="button"
                    aria-label={`More actions for ${item.name}`}
                    aria-haspopup="menu"
                    aria-expanded={openMenuId === item.id}
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={(event) => {
                      event.stopPropagation();
                      setOpenMenuId((current) => current === item.id ? null : item.id);
                    }}
                  >
                    <DotsThree size={17} weight="bold" />
                  </button>
                  {openMenuId === item.id && (
                    <div className="media-item__menu" role="menu" onDoubleClick={(event) => event.stopPropagation()}>
                      <button type="button" role="menuitem" onClick={() => { onAddToTimeline(item.id); setOpenMenuId(null); }}>
                        <PlusCircle size={14} /> Add to timeline
                      </button>
                      <button type="button" role="menuitem" onClick={() => { onReveal(item.id); setOpenMenuId(null); }}>
                        <FolderOpen size={14} /> Reveal in Finder
                      </button>
                      <span className="media-item__menu-divider" />
                      <button className="is-danger" type="button" role="menuitem" onClick={() => { onRemove(item.id); setOpenMenuId(null); }}>
                        <Trash size={14} /> Remove from project
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </article>
          );
        })}
        {!filtered.length && !importing && (
          <button className="media-bin__empty" type="button" onClick={onImport}>
            <Plus size={20} />
            <span>{media.length ? 'No matching media' : 'Import your first files'}</span>
          </button>
        )}
        {importing && (
          <div className="media-skeleton" aria-label="Importing media">
            <span /><span /><span />
          </div>
        )}
      </div>

      <div className="media-bin__footer">
        <span>{media.length} {media.length === 1 ? 'asset' : 'assets'}</span>
        <span>Double-click to append</span>
      </div>
    </aside>
  );
}
