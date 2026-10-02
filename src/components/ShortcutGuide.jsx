import { formatShortcut } from '../lib/shortcuts.js';
import { Dialog } from './ui.jsx';

const GROUP_ORDER = ['Playback', 'Edit', 'Timeline', 'Add', 'Project', 'View'];

export default function ShortcutGuide({ commands, mac, onClose }) {
  const groups = GROUP_ORDER.map((group) => ({
    group,
    items: commands.filter((command) => command.group === group && command.keys?.length),
  })).filter((entry) => entry.items.length);

  return (
    <Dialog title="Keyboard shortcuts" description={`Press ${formatShortcut('mod+k', mac)} to search every action by name.`} onClose={onClose} width={860}>
      <div className="shortcut-columns">
        {groups.map(({ group, items }) => (
          <section key={group} className="shortcut-group">
            <h3>{group}</h3>
            {items.map((command) => (
              <p key={command.id}>
                <span>{command.label}</span>
                <span className="shortcut-keys">
                  {command.keys.map((key) => <kbd className="kbd" key={key}>{formatShortcut(key, mac)}</kbd>)}
                </span>
              </p>
            ))}
          </section>
        ))}
      </div>
    </Dialog>
  );
}
