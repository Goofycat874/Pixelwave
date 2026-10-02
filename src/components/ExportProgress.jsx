import { formatTime } from '../lib/media.js';
import { Button } from './ui.jsx';

export default function ExportProgress({ state, onCancel }) {
  if (!state.active) return null;
  const percent = Math.round(state.progress * 100);
  const remaining = state.etaSeconds && Number.isFinite(state.etaSeconds) ? `About ${formatTime(state.etaSeconds)} left` : 'Estimating time left';
  return (
    <div className="dialog-scrim" role="presentation">
      <section className="dialog export-progress" role="dialog" aria-modal="true" aria-label="Exporting">
        <div className="dialog__body">
          <h2>{state.status}</h2>
          <p>{state.detail || 'Keep Pixelwave open until the export finishes.'}</p>
          <div className="progress progress--large" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
            <span style={{ transform: `scaleX(${Math.max(0.01, state.progress)})` }} />
          </div>
          <div className="export-progress__meta mono">
            <strong>{percent}%</strong>
            <span>{state.progress > 0.02 ? remaining : ''}</span>
          </div>
        </div>
        <footer className="dialog__footer">
          <Button variant="ghost" onClick={onCancel}>Cancel export</Button>
        </footer>
      </section>
    </div>
  );
}
