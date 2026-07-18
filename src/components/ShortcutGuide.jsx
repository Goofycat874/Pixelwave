import { Keyboard, X } from '@phosphor-icons/react';
import { useEffect } from 'react';

const groups = [
  {
    title: 'Playback',
    shortcuts: [
      ['Space', 'Play or pause'],
      ['← / →', 'Step one frame'],
      ['Shift + ← / →', 'Step one second'],
      ['Home / End', 'Sequence start or end'],
    ],
  },
  {
    title: 'Editing',
    shortcuts: [
      ['⌘ / Ctrl + C', 'Copy selected clip'],
      ['⌘ / Ctrl + V', 'Paste at playhead'],
      ['⌘ / Ctrl + D', 'Duplicate selected clip'],
      ['Option / Alt + ← / →', 'Nudge clip one frame'],
      ['Option / Alt + Shift + ← / →', 'Nudge clip one second'],
      ['S', 'Split at playhead'],
      ['Delete', 'Remove selected clip'],
      ['Escape', 'Clear selection'],
    ],
  },
  {
    title: 'Project',
    shortcuts: [
      ['⌘ / Ctrl + S', 'Save project'],
      ['⌘ / Ctrl + O', 'Open project'],
      ['⌘ / Ctrl + I', 'Import media'],
      ['⌘ / Ctrl + Z', 'Undo'],
      ['Shift + ⌘ / Ctrl + Z', 'Redo'],
      ['?', 'Open this guide'],
    ],
  },
];

export default function ShortcutGuide({ open, onClose }) {
  useEffect(() => {
    if (!open) return undefined;
    const closeOnEscape = (event) => event.key === 'Escape' && onClose();
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [onClose, open]);

  if (!open) return null;

  return (
    <div className="shortcut-overlay" role="presentation" onPointerDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="shortcut-dialog" role="dialog" aria-modal="true" aria-labelledby="shortcut-guide-title">
        <header className="shortcut-dialog__header">
          <div className="shortcut-dialog__mark"><Keyboard size={21} weight="duotone" /></div>
          <div>
            <p className="eyebrow">Work faster</p>
            <h2 id="shortcut-guide-title">Keyboard shortcuts</h2>
          </div>
          <button type="button" aria-label="Close keyboard shortcuts" onClick={onClose}><X size={15} /></button>
        </header>
        <div className="shortcut-groups">
          {groups.map((group) => (
            <section className="shortcut-group" key={group.title}>
              <h3>{group.title}</h3>
              <div>
                {group.shortcuts.map(([keys, description]) => (
                  <p key={keys}><span>{description}</span><kbd>{keys}</kbd></p>
                ))}
              </div>
            </section>
          ))}
        </div>
        <footer><span>Tip</span> Hover toolbar controls to see their shortcuts.</footer>
      </section>
    </div>
  );
}
