import { describe, expect, it } from 'vitest';
import * as mediaTools from './media.js';

describe('media element configuration', () => {
  it('opts custom-protocol media into anonymous CORS before setting its source', () => {
    const element = { crossOrigin: null, src: '' };
    mediaTools.configureMediaElement(element, 'pixelwave-media://local/file?path=clip.mp4');
    expect(element).toMatchObject({ crossOrigin: 'anonymous', src: 'pixelwave-media://local/file?path=clip.mp4' });
  });
});
