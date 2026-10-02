import { useMemo, useState } from 'react';
import { Export, FilmStrip, Gif, MusicNotes } from '@phosphor-icons/react';
import { EXPORT_FORMATS, EXPORT_QUALITIES, exportRange, exportResolutions } from '../lib/exporter.js';
import { formatTime } from '../lib/media.js';
import { FRAME_RATES } from '../lib/project.js';
import { Button, Dialog, Segmented, SelectField } from './ui.jsx';

const FORMAT_ICONS = { video: FilmStrip, gif: Gif, audio: MusicNotes };
const GIF_SIZES = ['480', '360', '720'];
const GIF_RATES = [10, 15, 24];

export default function ExportDialog({ project, inPoint, outPoint, initial, onClose, onExport }) {
  const resolutions = useMemo(() => exportResolutions(project), [project]);
  const nativeResolution = resolutions.find((option) => option.native)?.id || resolutions[0].id;
  const hasRange = inPoint !== null && outPoint !== null && outPoint > inPoint;
  const [settings, setSettings] = useState(() => ({
    format: initial?.format || 'mp4',
    quality: initial?.quality || 'standard',
    resolution: nativeResolution,
    frameRate: project.frameRate || 30,
    range: hasRange ? 'range' : 'all',
  }));
  const format = EXPORT_FORMATS.find((item) => item.id === settings.format) || EXPORT_FORMATS[0];
  const kind = format.kind;
  const range = exportRange(project, settings.range === 'range' && hasRange ? { start: inPoint, end: outPoint } : null);
  const resolutionId = kind === 'gif' && !GIF_SIZES.includes(settings.resolution) ? '480' : settings.resolution;
  const resolution = resolutions.find((option) => option.id === resolutionId)
    || exportResolutions({ width: project.width, height: project.height }).find((option) => option.id === resolutionId)
    || resolutions[0];
  const frameRate = kind === 'gif' ? (GIF_RATES.includes(settings.frameRate) ? settings.frameRate : 15) : settings.frameRate;
  const update = (patch) => setSettings((current) => ({ ...current, ...patch }));

  const submit = () => onExport({
    format: format.id,
    kind,
    quality: settings.quality,
    width: resolution.width,
    height: resolution.height,
    frameRate,
    range: { start: range.start, end: range.end },
  });

  const resolutionOptions = (kind === 'gif' ? resolutions.filter((option) => GIF_SIZES.includes(option.id)) : resolutions)
    .map((option) => [option.id, `${option.label}  (${option.width} × ${option.height})${option.native ? ', project size' : ''}`]);

  return (
    <Dialog
      title="Export"
      description={`${project.name || 'Untitled project'}, ${formatTime(range.duration, true, project.frameRate)} long`}
      onClose={onClose}
      width={560}
      footer={(
        <>
          <span className="dialog__footer-note">
            {kind === 'audio' ? 'Audio mix of every unmuted track.' : `${resolution.width} × ${resolution.height}, ${frameRate} fps`}
          </span>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={submit} disabled={!range.duration} data-autofocus><Export size={15} /> Export {format.label}</Button>
        </>
      )}
    >
      <div className="export-formats" role="radiogroup" aria-label="Format">
        {EXPORT_FORMATS.map((item) => {
          const Icon = FORMAT_ICONS[item.kind];
          return (
            <button
              key={item.id}
              type="button"
              role="radio"
              aria-checked={item.id === format.id}
              className={item.id === format.id ? 'is-active' : ''}
              onClick={() => update({ format: item.id })}
            >
              <Icon size={18} />
              <strong>{item.label}</strong>
              <small>{item.detail}</small>
            </button>
          );
        })}
      </div>

      <div className="form-grid">
        {kind !== 'audio' && (
          <SelectField label="Size" value={resolution.id} options={resolutionOptions} onChange={(value) => update({ resolution: value })} />
        )}
        {kind === 'video' && (
          <div className="field-row">
            <span className="field-row__label">Quality</span>
            <Segmented size="sm" label="Quality" value={settings.quality} onChange={(quality) => update({ quality })} options={EXPORT_QUALITIES.map((quality) => [quality.id, quality.label, null, quality.detail])} />
          </div>
        )}
        {kind !== 'audio' && (
          <SelectField
            label="Frame rate"
            value={String(frameRate)}
            options={(kind === 'gif' ? GIF_RATES : FRAME_RATES).map((rate) => [String(rate), `${rate} fps${rate === project.frameRate ? ' (project)' : ''}`])}
            onChange={(value) => update({ frameRate: Number(value) })}
          />
        )}
        <div className="field-row">
          <span className="field-row__label">Range</span>
          <Segmented
            size="sm"
            label="Range"
            value={hasRange ? settings.range : 'all'}
            onChange={(value) => update({ range: value })}
            options={[['all', 'Whole video'], ...(hasRange ? [['range', 'In to out']] : [])]}
          />
        </div>
      </div>
      {!hasRange && <p className="hint">Tip: press I and O on the timeline to export only part of your video.</p>}
    </Dialog>
  );
}
