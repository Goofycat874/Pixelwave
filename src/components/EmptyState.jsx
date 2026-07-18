import { FilmSlate } from '@phosphor-icons/react';

export default function EmptyState({ onImport }) {
  return (
    <div className="empty-state">
      <div className="empty-state__mark" aria-hidden="true">
        <FilmSlate size={28} weight="duotone" />
      </div>
      <div>
        <p className="eyebrow">Your cut starts here</p>
        <h2>Bring in the first shot.</h2>
        <p>Import video, stills, or audio. Double-click an item to place it on the timeline.</p>
      </div>
      <button className="primary-button" type="button" onClick={onImport}>Import media</button>
      <span className="empty-state__hint">⌘ I</span>
    </div>
  );
}
