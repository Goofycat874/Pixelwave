import { CursorClick } from '@phosphor-icons/react';
import { getProjectDuration } from '../../lib/editor.js';
import { formatTime } from '../../lib/media.js';
import { aspectLabel } from '../../lib/project.js';
import FormatPicker from '../FormatPicker.jsx';
import { ColorField, Section } from '../ui.jsx';

export default function ProjectPanel({ project, onCommitProject, onBeginEdit, onLiveProject }) {
  const duration = getProjectDuration(project.clips);
  return (
    <>
      <div className="inspector-intro">
        <CursorClick size={18} />
        <p>Select a clip to edit it. These settings apply to the whole project.</p>
      </div>
      <Section id="project-canvas" title="Canvas" badge={aspectLabel(project.width, project.height)}>
        <FormatPicker
          width={project.width}
          height={project.height}
          frameRate={project.frameRate}
          onFormat={(format) => onCommitProject((current) => ({ ...current, width: format.width, height: format.height }), `Canvas: ${format.label}`)}
          onFrameRate={(frameRate) => onCommitProject((current) => ({ ...current, frameRate }), `${frameRate} fps`)}
        />
        <ColorField
          label="Background"
          value={project.background || '#000000'}
          onBegin={() => onBeginEdit('Background color')}
          onChange={(background) => onLiveProject((current) => ({ ...current, background }))}
        />
      </Section>
      <Section id="project-overview" title="Overview">
        <dl className="stat-list">
          <div><dt>Length</dt><dd>{formatTime(duration, true, project.frameRate)}</dd></div>
          <div><dt>Clips</dt><dd>{project.clips.length}</dd></div>
          <div><dt>Media files</dt><dd>{project.media.length}</dd></div>
          <div><dt>Markers</dt><dd>{project.markers?.length || 0}</dd></div>
        </dl>
      </Section>
    </>
  );
}
