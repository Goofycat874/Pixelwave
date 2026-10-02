import { describe, expect, it } from 'vitest';
import { formatShortcut, isTextEntryTarget, matchesShortcut, parseShortcut } from './shortcuts.js';

const press = (key, modifiers = {}) => ({ key, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, ...modifiers });

describe('keyboard shortcuts', () => {
  it('parses modifiers and aliases', () => {
    expect(parseShortcut('mod+shift+z')).toEqual({ key: 'z', mod: true, shift: true, alt: false });
    expect(parseShortcut('alt+left')).toMatchObject({ key: 'arrowleft', alt: true });
  });

  it('maps mod to Cmd on macOS and Ctrl elsewhere', () => {
    expect(matchesShortcut(press('s', { metaKey: true }), 'mod+s', true)).toBe(true);
    expect(matchesShortcut(press('s', { ctrlKey: true }), 'mod+s', true)).toBe(false);
    expect(matchesShortcut(press('s', { ctrlKey: true }), 'mod+s', false)).toBe(true);
  });

  it('requires an exact modifier match except for shifted symbols', () => {
    expect(matchesShortcut(press('Z', { metaKey: true, shiftKey: true }), 'mod+z', true)).toBe(false);
    expect(matchesShortcut(press('Z', { metaKey: true, shiftKey: true }), 'mod+shift+z', true)).toBe(true);
    expect(matchesShortcut(press('?', { shiftKey: true }), '?', true)).toBe(true);
    expect(matchesShortcut(press(' '), 'space', true)).toBe(true);
  });

  it('formats shortcuts for each platform', () => {
    expect(formatShortcut('mod+shift+z', true)).toBe('⇧⌘Z');
    expect(formatShortcut('mod+shift+z', false)).toBe('Ctrl+Shift+Z');
    expect(formatShortcut('alt+arrowleft', false)).toBe('Alt+←');
  });

  it('only treats typing fields as text entry', () => {
    expect(isTextEntryTarget({ tagName: 'INPUT', type: 'text' })).toBe(true);
    expect(isTextEntryTarget({ tagName: 'INPUT', type: 'range' })).toBe(false);
    expect(isTextEntryTarget({ tagName: 'TEXTAREA' })).toBe(true);
    expect(isTextEntryTarget({ tagName: 'DIV' })).toBe(false);
  });
});
