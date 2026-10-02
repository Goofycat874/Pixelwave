import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, MagnifyingGlass, Timer } from '@phosphor-icons/react';
import { formatTime, parseTimecode } from '../lib/media.js';
import { formatShortcut } from '../lib/shortcuts.js';

function score(command, query) {
  if (!query) return 1;
  const label = command.label.toLowerCase();
  const haystack = `${label} ${command.group.toLowerCase()} ${(command.keywords || []).join(' ')}`;
  if (label.startsWith(query)) return 4;
  if (label.split(/\s+/).some((word) => word.startsWith(query))) return 3;
  if (haystack.includes(query)) return 2;
  let index = 0;
  for (const character of query) {
    index = haystack.indexOf(character, index);
    if (index < 0) return 0;
    index += 1;
  }
  return 1;
}

export default function CommandPalette({ commands, mac, frameRate, onSeek, onClose }) {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const listRef = useRef(null);
  const normalized = query.trim().toLowerCase();

  const results = useMemo(() => {
    const list = commands
      .filter((command) => command.palette !== false)
      .map((command) => ({ command, score: score(command, normalized) }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((entry) => entry.command);
    const time = /\d/.test(normalized) ? parseTimecode(normalized, frameRate) : null;
    if (time !== null) {
      list.unshift({ id: 'jump', label: `Jump to ${formatTime(time, true, frameRate)}`, group: 'Playback', icon: Timer, run: () => onSeek(time), enabled: true });
    }
    return list.slice(0, 40);
  }, [commands, frameRate, normalized, onSeek]);

  useEffect(() => setActive(0), [normalized]);
  useEffect(() => {
    listRef.current?.querySelector('.is-active')?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const run = (command) => {
    if (!command || command.enabled === false) return;
    onClose();
    requestAnimationFrame(() => command.run());
  };

  return (
    <div className="dialog-scrim dialog-scrim--top" role="presentation" onPointerDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="palette" role="dialog" aria-modal="true" aria-label="Search actions">
        <label className="palette__search">
          <MagnifyingGlass size={16} />
          <input
            autoFocus
            value={query}
            placeholder="Type an action, or a time like 1:30"
            aria-label="Search actions"
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'ArrowDown') { event.preventDefault(); setActive((value) => Math.min(results.length - 1, value + 1)); }
              if (event.key === 'ArrowUp') { event.preventDefault(); setActive((value) => Math.max(0, value - 1)); }
              if (event.key === 'Enter') { event.preventDefault(); run(results[active]); }
              if (event.key === 'Escape') { event.preventDefault(); onClose(); }
            }}
          />
        </label>
        <div className="palette__list" ref={listRef} role="listbox">
          {results.map((command, index) => {
            const Icon = command.icon || ArrowRight;
            return (
              <button
                key={command.id}
                type="button"
                role="option"
                aria-selected={index === active}
                className={`palette__item ${index === active ? 'is-active' : ''}`}
                disabled={command.enabled === false}
                onPointerMove={() => setActive(index)}
                onClick={() => run(command)}
              >
                <Icon size={15} />
                <span className="palette__label">{command.label}</span>
                <span className="palette__group">{command.group}</span>
                {command.keys?.[0] && <kbd className="kbd">{formatShortcut(command.keys[0], mac)}</kbd>}
              </button>
            );
          })}
          {!results.length && <p className="palette__empty">No matching actions.</p>}
        </div>
      </section>
    </div>
  );
}
