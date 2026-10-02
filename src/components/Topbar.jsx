import { useState } from 'react';
import {
  ArrowUUpLeft,
  ArrowUUpRight,
  CaretDown,
  Export,
  MagnifyingGlass,
  Question,
} from '@phosphor-icons/react';
import { Button, IconButton, Kbd, Menu } from './ui.jsx';

export default function Topbar({
  projectName,
  status,
  mac,
  canUndo,
  canRedo,
  undoLabel,
  redoLabel,
  shortcuts,
  fileMenu,
  canExport,
  onRename,
  onUndo,
  onRedo,
  onOpenPalette,
  onOpenShortcuts,
  onExport,
}) {
  const [menu, setMenu] = useState(null);
  return (
    <header className={`topbar ${mac ? 'is-mac' : ''}`}>
      <div className="topbar__left">
        <span className="brand" aria-label="Pixelwave">
          <span className="brand__mark" aria-hidden="true"><i /><i /><i /></span>
          <span className="brand__name">Pixelwave</span>
        </span>
        <button
          type="button"
          className="menu-trigger"
          aria-haspopup="menu"
          aria-expanded={Boolean(menu)}
          onClick={(event) => {
            const rect = event.currentTarget.getBoundingClientRect();
            setMenu({ x: rect.left, y: rect.bottom + 4 });
          }}
        >File <CaretDown size={11} /></button>
        <span className="topbar__divider" />
        <input
          className="project-name"
          aria-label="Project name"
          value={projectName}
          spellCheck={false}
          onChange={(event) => onRename(event.target.value)}
          onKeyDown={(event) => { if (event.key === 'Enter' || event.key === 'Escape') event.currentTarget.blur(); }}
        />
        <span className={`save-status save-status--${status.tone}`}>{status.label}</span>
      </div>
      <div className="topbar__right">
        <IconButton label={undoLabel ? `Undo ${undoLabel.toLowerCase()}` : 'Undo'} shortcut={shortcuts.undo} onClick={onUndo} disabled={!canUndo}><ArrowUUpLeft size={16} /></IconButton>
        <IconButton label={redoLabel ? `Redo ${redoLabel.toLowerCase()}` : 'Redo'} shortcut={shortcuts.redo} onClick={onRedo} disabled={!canRedo}><ArrowUUpRight size={16} /></IconButton>
        <span className="topbar__divider" />
        <button type="button" className="search-trigger" onClick={onOpenPalette}>
          <MagnifyingGlass size={14} />
          <span>Search actions</span>
          <Kbd>{shortcuts.palette}</Kbd>
        </button>
        <IconButton label="Keyboard shortcuts" shortcut="?" onClick={onOpenShortcuts}><Question size={16} /></IconButton>
        <Button variant="primary" onClick={onExport} disabled={!canExport}><Export size={15} /> Export</Button>
      </div>
      {menu && <Menu x={menu.x} y={menu.y} onClose={() => setMenu(null)} items={fileMenu} minWidth={240} />}
    </header>
  );
}
