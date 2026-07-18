import { describe, expect, it } from 'vitest';
import * as editor from './editor.js';
import {
  activeClipsAt,
  applyColorPreset,
  appendClip,
  clipTrack,
  createClip,
  defaultEffects,
  defaultPrimaryWheels,
  computedColorAdjustments,
  getProjectDuration,
  getTransitionProgress,
  moveClip,
  removeClip,
  removeMediaFromProject,
  resetColorEffects,
  resizeClipEnd,
  serializeProject,
  splitClip,
  trimClip,
} from './editor.js';

const video = {
  id: 'media-a',
  name: 'Harbor light.mp4',
  kind: 'video',
  duration: 12,
  width: 1920,
  height: 1080,
  path: '/film/harbor-light.mp4',
  src: 'file:///film/harbor-light.mp4',
};

describe('editor timeline model', () => {
  it('creates a clip spanning the source media', () => {
    const clip = createClip(video, 3);
    expect(clip).toMatchObject({ assetId: 'media-a', start: 3, track: 0, sourceStart: 0, sourceEnd: 12, duration: 12 });
    expect(clip.effects).toEqual(defaultEffects());
    expect(clip.title).toMatchObject({ positionX: 50, positionY: 78 });
    expect(clip.textOverlays).toEqual([]);
    expect(clip.transcript).toMatchObject({
      words: [],
      fontFamily: 'Outfit',
      customFont: null,
      fontSize: 54,
      color: '#ffffff',
      backgroundEnabled: true,
    });
  });

  it('creates and updates independent text overlays while preserving legacy titles', () => {
    const first = editor.createTextOverlay('text-a');
    const second = { ...editor.createTextOverlay('text-b'), text: 'Second line' };
    const clip = {
      ...createClip(video, 0),
      title: { text: 'Legacy title', fontSize: 54, positionX: 50, positionY: 78 },
      textOverlays: [first, second],
    };
    expect(first).toMatchObject({ id: 'text-a', text: 'Your text', fontSize: 54, positionX: 50, positionY: 50 });
    expect(editor.clipTextOverlays(clip).map((text) => text.id)).toEqual([
      editor.LEGACY_TEXT_ID,
      'text-a',
      'text-b',
    ]);

    const updated = editor.updateClipTextOverlay(clip, 'text-a', { ...first, text: 'Birthday wishes', fontSize: 76 });
    expect(updated.textOverlays[0]).toMatchObject({ text: 'Birthday wishes', fontSize: 76 });
    expect(clip.textOverlays[0].text).toBe('Your text');
  });

  it('updates a legacy title through the same text overlay API', () => {
    const clip = { ...createClip(video, 0), title: { text: 'Original', positionX: 50, positionY: 78 } };
    const updated = editor.updateClipTextOverlay(clip, editor.LEGACY_TEXT_ID, {
      id: editor.LEGACY_TEXT_ID,
      text: 'Changed',
      positionX: 24,
      positionY: 30,
    });
    expect(updated.title).toMatchObject({ text: 'Changed', positionX: 24, positionY: 30 });
  });

  it('keeps the selected text control active after wording edit mode closes', () => {
    const overlay = { ...editor.createTextOverlay('text-a'), text: 'Move me' };
    const clip = { ...createClip(video, 0), textOverlays: [overlay] };

    expect(editor.resolveTextControlEntry([clip], {
      selectedClipId: clip.id,
      selectedTextId: overlay.id,
      textEditingClipId: null,
      textEditingTextId: null,
    })).toMatchObject({
      clip: { id: clip.id },
      textOverlay: { id: overlay.id, text: 'Move me' },
      editing: false,
    });
  });

  it('creates and moves clips between normalized layers', () => {
    const clip = createClip(video, 0, 2);
    const [moved] = moveClip([clip], clip.id, 4.25, 1);
    expect(clip.track).toBe(2);
    expect(moved).toMatchObject({ start: 4.25, track: 1 });
    expect(clipTrack({ track: -4 })).toBe(0);
    expect(clipTrack({ track: 2.7 })).toBe(2);
  });

  it('uses a five second duration for still images', () => {
    const clip = createClip({ ...video, id: 'still', kind: 'image', duration: 0 }, 0);
    expect(clip.duration).toBe(5);
    expect(clip.sourceEnd).toBe(5);
  });

  it('appends clips after the current project end', () => {
    const first = createClip(video, 0);
    const second = createClip({ ...video, id: 'media-b', duration: 4 }, 0);
    const appended = appendClip([first], second);
    expect(appended[1].start).toBe(12);
    expect(getProjectDuration(appended)).toBe(16);
  });

  it('appends within the matching media kind and track', () => {
    const base = createClip(video, 0, 0);
    const overlay = { ...createClip({ ...video, id: 'overlay', duration: 4 }, 3, 1), duration: 4, sourceEnd: 4 };
    const music = createClip({ ...video, id: 'music', kind: 'audio', duration: 20 }, 0, 1);
    const nextOverlay = createClip({ ...video, id: 'next-overlay', duration: 2 }, 0, 1);
    const appended = appendClip([base, overlay, music], nextOverlay);
    expect(appended.at(-1).start).toBe(7);
  });

  it('returns active clips from the base layer to the top layer', () => {
    const clips = [
      { id: 'top', kind: 'video', track: 2, start: 0, duration: 8 },
      { id: 'base', kind: 'video', track: 0, start: 0, duration: 8 },
      { id: 'music', kind: 'audio', track: 1, start: 0, duration: 8 },
      { id: 'later', kind: 'video', track: 1, start: 9, duration: 2 },
    ];
    expect(activeClipsAt(clips, 4).map((clip) => clip.id)).toEqual(['base', 'music', 'top']);
    expect(activeClipsAt(clips, 4, 'video').map((clip) => clip.id)).toEqual(['base', 'top']);
  });

  it('defines three stacked video lanes and three audio lanes', () => {
    expect(editor.TIMELINE_TRACKS.map(({ kind, track, label }) => `${kind}:${track}:${label}`)).toEqual([
      'video:2:V3',
      'video:1:V2',
      'video:0:V1',
      'audio:0:A1',
      'audio:1:A2',
      'audio:2:A3',
    ]);
    expect(editor.trackAcceptsKind('video', 'image')).toBe(true);
    expect(editor.trackAcceptsKind('audio', 'audio')).toBe(true);
    expect(editor.trackAcceptsKind('audio', 'video')).toBe(false);
  });

  it('trims a clip in while preserving its timeline end', () => {
    const clip = createClip(video, 2);
    const [trimmed] = trimClip([clip], clip.id, 'start', 3);
    expect(trimmed).toMatchObject({ start: 5, sourceStart: 3, sourceEnd: 12, duration: 9 });
  });

  it('clamps trims so a clip remains visible', () => {
    const clip = createClip(video, 0);
    const [trimmed] = trimClip([clip], clip.id, 'end', 30);
    expect(trimmed.duration).toBe(0.1);
    expect(trimmed.sourceEnd).toBe(0.1);
  });

  it('splits a clip at the playhead without changing the combined duration', () => {
    const clip = createClip(video, 2);
    const result = splitClip([clip], clip.id, 7);
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ start: 2, sourceStart: 0, sourceEnd: 5, duration: 5 });
    expect(result[1]).toMatchObject({ start: 7, sourceStart: 5, sourceEnd: 12, duration: 7 });
  });

  it('moves and removes clips without mutating the input', () => {
    const clip = createClip(video, 0);
    const moved = moveClip([clip], clip.id, 4.25);
    const removed = removeClip(moved, clip.id);
    expect(clip.start).toBe(0);
    expect(moved[0].start).toBe(4.25);
    expect(removed).toEqual([]);
  });

  it('removes media from the pool together with every linked timeline clip', () => {
    const linkedClip = createClip(video, 0);
    const otherMedia = { ...video, id: 'media-b', name: 'Clouds.mov' };
    const otherClip = createClip(otherMedia, 12);
    const project = { media: [video, otherMedia], clips: [linkedClip, otherClip] };

    const result = removeMediaFromProject(project, video.id);

    expect(result.media).toEqual([otherMedia]);
    expect(result.clips).toEqual([otherClip]);
    expect(project.media).toHaveLength(2);
    expect(project.clips).toHaveLength(2);
  });

  it('serializes durable project data without renderer-only URLs', () => {
    const clip = createClip(video, 0);
    clip.transcript.customFont = {
      name: 'Studio Sans.ttf',
      family: 'Pixelwave Custom Studio Sans',
      path: '/tmp/Studio Sans.ttf',
      src: 'pixelwave-media://local/file?path=font',
    };
    const data = serializeProject({ name: 'Field notes', media: [video], clips: [clip] });
    expect(data.media[0].src).toBeUndefined();
    expect(data.media[0].thumbnail).toBeUndefined();
    expect(data.clips[0].transcript.customFont).toEqual({
      name: 'Studio Sans.ttf',
      family: 'Pixelwave Custom Studio Sans',
      path: '/tmp/Studio Sans.ttf',
    });
    expect(data.version).toBe(1);
  });

  it('treats an empty preview as transition-complete', () => {
    expect(getTransitionProgress(undefined, 0)).toBe(1);
  });

  it('duplicates a clip immediately after the source with independent state', () => {
    const clip = createClip(video, 2);
    clip.textOverlays = [{ ...editor.createTextOverlay('text-copy'), text: 'Copy me' }];
    const result = editor.duplicateClip([clip], clip.id);
    expect(result).toHaveLength(2);
    expect(result[1]).toMatchObject({ start: 14, duration: 12, assetId: clip.assetId });
    expect(result[1].id).not.toBe(clip.id);
    expect(result[1].effects).not.toBe(clip.effects);
    expect(result[1].textOverlays).not.toBe(clip.textOverlays);
    expect(result[1].textOverlays[0]).not.toBe(clip.textOverlays[0]);
  });

  it('changes playback speed while preserving the source range', () => {
    const clip = createClip(video, 0);
    const faster = editor.setClipSpeed(clip, 2);
    expect(faster).toMatchObject({ speed: 2, duration: 6, sourceStart: 0, sourceEnd: 12 });
    expect(clip.duration).toBe(12);
  });

  it('splits and trims sped-up clips in source time', () => {
    const fast = editor.setClipSpeed(createClip(video, 0), 2);
    const split = splitClip([fast], fast.id, 3);
    expect(split[0]).toMatchObject({ duration: 3, sourceStart: 0, sourceEnd: 6 });
    expect(split[1]).toMatchObject({ duration: 3, sourceStart: 6, sourceEnd: 12 });
    const [trimmed] = trimClip([fast], fast.id, 'start', 1);
    expect(trimmed).toMatchObject({ start: 1, duration: 5, sourceStart: 2, sourceEnd: 12 });
  });

  it('creates clips with transform and title defaults', () => {
    const clip = createClip(video, 0);
    expect(clip).toMatchObject({
      speed: 1,
      fit: 'contain',
      title: { text: '', fontSize: 54, positionY: 78, opacity: 100, color: '#ffffff' },
      transcript: { text: '', language: 'en-US', showAsCaptions: true },
      effects: {
        positionX: 0,
        positionY: 0,
        flipX: false,
        flipY: false,
        tint: 0,
        primaryWheels: defaultPrimaryWheels(),
      },
    });
  });

  it('applies a basic color preset without changing non-color effects', () => {
    const effects = { ...defaultEffects(), blur: 3, volume: 72, scale: 114 };
    const graded = applyColorPreset(effects, 'warm');

    expect(graded).toMatchObject({ exposure: 4, contrast: 106, saturation: 112, temperature: 28 });
    expect(graded).toMatchObject({ blur: 3, volume: 72, scale: 114 });
    expect(effects).toEqual({ ...defaultEffects(), blur: 3, volume: 72, scale: 114 });
  });

  it('resets only the basic color controls', () => {
    const effects = {
      ...defaultEffects(),
      exposure: 18,
      contrast: 135,
      saturation: 70,
      temperature: -32,
      tint: 24,
      primaryWheels: { ...defaultPrimaryWheels(), lift: { x: 0.4, y: -0.2, luma: 0.3 } },
      vignette: 44,
      positionX: 12,
    };
    expect(resetColorEffects(effects)).toMatchObject({
      exposure: 0,
      contrast: 100,
      saturation: 100,
      temperature: 0,
      tint: 0,
      primaryWheels: defaultPrimaryWheels(),
      vignette: 44,
      positionX: 12,
    });
  });

  it('keeps duplicated primary wheel state independent', () => {
    const clip = createClip(video, 0);
    clip.effects.primaryWheels.lift.x = 0.25;
    const duplicate = editor.duplicateClip([clip], clip.id)[1];
    expect(duplicate.effects.primaryWheels).not.toBe(clip.effects.primaryWheels);
    expect(duplicate.effects.primaryWheels.lift).not.toBe(clip.effects.primaryWheels.lift);
    expect(duplicate.effects.primaryWheels.lift.x).toBe(0.25);
  });

  it('maps lift wheel tint and luma into shared grade adjustments', () => {
    const effects = {
      ...defaultEffects(),
      primaryWheels: {
        ...defaultPrimaryWheels(),
        lift: { x: 0.5, y: -0.2, luma: 0.4 },
      },
    };
    expect(computedColorAdjustments(effects)).toMatchObject({
      exposure: 4,
      contrast: 96,
      saturation: 100,
      temperature: 10,
      tint: -4,
    });
  });

  it('extends a still image beyond its default duration', () => {
    const image = createClip({ ...video, id: 'still', kind: 'image', duration: 0 }, 0);
    expect(resizeClipEnd(image, 5, 7)).toMatchObject({ duration: 12, sourceEnd: 12 });
  });

  it('does not extend video beyond the source duration', () => {
    const clip = createClip(video, 0);
    expect(resizeClipEnd(clip, video.duration, 7)).toMatchObject({ duration: 12, sourceEnd: 12 });
  });

  it('treats a pressed primary-button pointer as a live wheel drag', () => {
    expect(editor.isLiveWheelDrag({ buttons: 1 }, false)).toBe(true);
    expect(editor.isLiveWheelDrag({ buttons: 0 }, true)).toBe(true);
    expect(editor.isLiveWheelDrag({ buttons: 0 }, false)).toBe(false);
  });

  it('maps the ruler start to exactly zero after the track gutter', () => {
    expect(editor.timelineTimeFromPointer({
      clientX: 184,
      viewportLeft: 100,
      scrollLeft: 0,
      pixelsPerSecond: 64,
      gutterWidth: 84,
    })).toBe(0);
  });

  it('keeps unsnapped movement continuous and ignores the moving clip edges', () => {
    const clips = [{ id: 'moving', start: 0.7, duration: 2 }, { id: 'other', start: 4, duration: 1 }];
    expect(editor.snapTimelineTime(0.734, clips, 64, 'moving', true)).toBe(0.734);
    expect(editor.snapTimelineTime(3.94, clips, 64, 'moving', true)).toBe(4);
    expect(editor.snapTimelineTime(3.94, clips, 64, 'moving', false)).toBe(3.94);
  });
});
