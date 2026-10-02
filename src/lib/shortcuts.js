// Shortcuts are written like 'mod+shift+z', where mod is Cmd on macOS and Ctrl elsewhere.

const KEY_ALIASES = {
  ' ': 'space',
  spacebar: 'space',
  esc: 'escape',
  del: 'delete',
  left: 'arrowleft',
  right: 'arrowright',
  up: 'arrowup',
  down: 'arrowdown',
};

// Keys whose character already implies Shift on common layouts.
const SHIFTED_SYMBOLS = new Set(['?', '+', '_', '{', '}', '|', ':', '"', '<', '>', '~', '!', '@', '#', '$', '%', '^', '&', '*', '(', ')']);

export function isMacPlatform(platform = globalThis.navigator?.platform || '') {
  return /mac|iphone|ipad/i.test(platform);
}

export function normalizeKey(key) {
  const lower = String(key || '').toLowerCase();
  return KEY_ALIASES[lower] || lower;
}

export function parseShortcut(spec) {
  const parts = String(spec).toLowerCase().split('+').filter(Boolean);
  const key = normalizeKey(parts.pop() || (String(spec).endsWith('+') ? '+' : ''));
  return {
    key,
    mod: parts.includes('mod'),
    shift: parts.includes('shift'),
    alt: parts.includes('alt'),
  };
}

export function matchesShortcut(event, spec, mac = isMacPlatform()) {
  const shortcut = parseShortcut(spec);
  const key = normalizeKey(event.key);
  const mod = mac ? event.metaKey : event.ctrlKey;
  const otherMod = mac ? event.ctrlKey : event.metaKey;
  if (key !== shortcut.key || mod !== shortcut.mod || otherMod || event.altKey !== shortcut.alt) return false;
  if (SHIFTED_SYMBOLS.has(shortcut.key)) return true;
  return event.shiftKey === shortcut.shift;
}

const KEY_LABELS = {
  arrowleft: '←',
  arrowright: '→',
  arrowup: '↑',
  arrowdown: '↓',
  space: 'Space',
  escape: 'Esc',
  delete: 'Del',
  backspace: '⌫',
  home: 'Home',
  end: 'End',
  enter: 'Enter',
};

export function formatShortcut(spec, mac = isMacPlatform()) {
  const shortcut = parseShortcut(spec);
  const key = KEY_LABELS[shortcut.key] || (shortcut.key.length === 1 ? shortcut.key.toUpperCase() : shortcut.key);
  if (mac) return `${shortcut.alt ? '⌥' : ''}${shortcut.shift ? '⇧' : ''}${shortcut.mod ? '⌘' : ''}${key}`;
  return [shortcut.mod && 'Ctrl', shortcut.alt && 'Alt', shortcut.shift && 'Shift', key].filter(Boolean).join('+');
}

export function isTextEntryTarget(target) {
  if (!target) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (tag !== 'INPUT') return false;
  return !['checkbox', 'radio', 'range', 'button', 'color'].includes(String(target.type).toLowerCase());
}
