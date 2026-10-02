import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { isImportableMediaPath, mediaKindForPath, mergeRecentProjects } = require('./project-files.cjs');

describe('dropped media paths', () => {
  it('accepts supported media regardless of extension case', () => {
    expect(mediaKindForPath('/clips/Take 1.MOV')).toBe('video');
    expect(mediaKindForPath('/audio/song.flac')).toBe('audio');
    expect(mediaKindForPath('/stills/a.JPEG')).toBe('image');
    expect(isImportableMediaPath('/etc/passwd')).toBe(false);
    expect(isImportableMediaPath('/docs/notes.pixelwave')).toBe(false);
  });
});

describe('recent projects', () => {
  it('moves the latest project to the top without duplicates', () => {
    const list = [
      { path: '/a.pixelwave', name: 'A', openedAt: '1' },
      { path: '/b.pixelwave', name: 'B', openedAt: '2' },
    ];
    expect(mergeRecentProjects(list, { path: '/b.pixelwave', name: 'B2', openedAt: '3' }).map((item) => item.name)).toEqual(['B2', 'A']);
  });

  it('caps the list and names projects from their file when needed', () => {
    const many = Array.from({ length: 12 }, (_, index) => ({ path: `/p${index}.pixelwave`, name: `P${index}` }));
    const merged = mergeRecentProjects(many, { path: '/new/Holiday.pixelwave', openedAt: 'now' });
    expect(merged).toHaveLength(10);
    expect(merged[0].name).toBe('Holiday');
  });
});
