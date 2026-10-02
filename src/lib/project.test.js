import { describe, expect, it } from 'vitest';
import {
  addTrack,
  aspectLabel,
  CANVAS_FORMATS,
  createProject,
  isClipHidden,
  isClipLocked,
  isClipMuted,
  normalizeProject,
  snapToFrame,
  toggleTrackFlag,
} from './project.js';

describe('project formats', () => {
  it('starts new projects in 1080p landscape at 30 fps', () => {
    expect(createProject()).toMatchObject({ width: 1920, height: 1080, frameRate: 30, trackCounts: { video: 3, audio: 2 } });
    expect(createProject({ formatId: 'vertical-1080' })).toMatchObject({ width: 1080, height: 1920 });
  });

  it('labels every preset and custom sizes with an aspect ratio', () => {
    expect(CANVAS_FORMATS.map((format) => aspectLabel(format.width, format.height))).toContain('9:16');
    expect(aspectLabel(1440, 1080)).toBe('4:3');
  });

  it('upgrades version 1 projects without changing how they look', () => {
    const upgraded = normalizeProject({
      version: 1,
      name: 'Old cut',
      clips: [{ id: 'a', kind: 'video', track: 4, start: 0, duration: 2, effects: { blur: 3 } }],
    });
    expect(upgraded).toMatchObject({ version: 2, width: 1280, height: 720, markers: [], trackCounts: { video: 5, audio: 2 } });
    expect(upgraded.clips[0]).toMatchObject({ fadeIn: 0, fadeOut: 0, keyframes: {} });
    expect(upgraded.clips[0].effects).toMatchObject({ blur: 3, scale: 100, keyMode: 'off' });
  });

  it('snaps times to whole frames', () => {
    expect(snapToFrame(1.02, 30)).toBeCloseTo(1.0333, 3);
    expect(snapToFrame(1.0166, 30)).toBe(1);
    expect(snapToFrame(-2, 24)).toBe(0);
  });
});

describe('track state', () => {
  const project = createProject({ clips: [] });
  const video = { id: 'v', kind: 'video', track: 1 };
  const audio = { id: 'a', kind: 'audio', track: 0 };

  it('hides, mutes and locks tracks independently', () => {
    const hidden = toggleTrackFlag(project, 'video', 1, 'hidden');
    expect(isClipHidden(hidden, video)).toBe(true);
    expect(isClipHidden(hidden, audio)).toBe(false);
    const muted = toggleTrackFlag(project, 'audio', 0, 'muted');
    expect(isClipMuted(muted, audio)).toBe(true);
    expect(isClipMuted(project, { ...video, muted: true })).toBe(true);
    const locked = toggleTrackFlag(project, 'video', 1, 'locked');
    expect(isClipLocked(locked, video)).toBe(true);
    expect(isClipLocked(toggleTrackFlag(locked, 'video', 1, 'locked'), video)).toBe(false);
  });

  it('adds tracks up to the supported maximum', () => {
    let next = project;
    for (let index = 0; index < 8; index += 1) next = addTrack(next, 'audio');
    expect(next.trackCounts.audio).toBe(6);
  });
});
