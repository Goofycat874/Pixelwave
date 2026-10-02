# Pixelwave

Pixelwave is a desktop video editor built with Electron and React. It aims to be the editor you reach for when OpenShot feels clunky: a clear layout, a fast timeline, and the effects creators actually use, all processed locally.

## What you get

**Editing**
- Multi-track timeline (up to 6 video and 6 audio tracks) with move, trim, split, blade tool, ripple delete, close gaps, multi-select, marquee select, copy, cut, paste and duplicate
- Snapping to clip edges, the playhead, markers and in/out points
- Markers with names and colors, in and out points, loop playback
- Track mute, hide and lock, plus detach audio from a video clip
- Audio waveforms and video filmstrips right on the clips, drag-to-fade handles, zoom with Ctrl/Cmd + scroll
- Frame stepping, J/K/L shuttle, jump between cuts and markers, type a time to jump anywhere
- Undo and redo for everything, with named steps ("Undo split")

**Looks and motion**
- Keyframes on position, scale, rotation, opacity, volume and blur, with easing, plus one-click animations (pop in, slide, spin, slow zoom, pan, exits and more)
- Quick layouts for picture-in-picture and split screen, crop, rounded corners, drop shadow
- Green and blue screen keying with softness and spill control
- Eight transitions, fade in and out on any clip
- Color grading: twelve looks, lift/gamma/gain wheels, RGB and per-channel curves, highlights, shadows, whites and blacks, exposure in stops, white balance, contrast and saturation
- Live scopes for the program monitor: waveform, RGB parade, vectorscope with skin-tone line, and histogram with clipping readout
- Stylize effects with one-click looks (Crisp, Grain, Dreamy, VHS, Glitch, Pixelate): sharpen, glow, film grain, color fringe, glitch and pixelate, all keyframable
- Hue, invert, blur and vignette

**Titles and captions**
- Standalone text clips with ten ready-made styles, 14 bundled fonts, outline, glow, shadow, background box, and in and out animations
- Type directly on the monitor, drag, resize and rotate with handles
- Local speech to text with word-by-word captions
- Solid color and gradient backgrounds

**Formats and export**
- Vertical, square, portrait, cinematic, 1080p and 4K canvases, 24 to 60 fps
- Export MP4, MOV, WebM, GIF, MP3 or WAV with size, quality, frame rate and in/out range options
- Save any frame as a PNG
- The monitor and the exporter share one renderer, so what you see is what you get

**Everything else**
- Drop files from your computer onto the window or straight onto a track
- Command palette (Ctrl/Cmd + K) for every action, and a shortcut guide (`?`)
- Autosave with crash recovery, recent projects, unsaved-changes prompt
- Voiceover recording with a live level meter

## Getting started

Pixelwave is developed and tested on macOS and Linux. Install a recent Node.js release (Node 20.19+ or 22.12+), then run:

```bash
npm install
npm run dev
```

The dev command starts Vite and opens the Electron window.

To run the production build locally:

```bash
npm run build
npm start
```

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start Vite and Electron in development mode |
| `npm start` | Open Electron using the current production build |
| `npm run build` | Build the renderer into `dist/` |
| `npm test` | Run the Vitest suite in watch mode |
| `npm run check` | Run all tests once and create a production build |

## A quick tour

1. Pick a canvas shape on the start screen (or any time from the format button above the monitor).
2. Import media with `Ctrl/Cmd + I`, or drop files anywhere in the window.
3. Drag clips from the library onto a track. Double-click a clip to add it at the end.
4. Select a clip and use the inspector: Edit for layout, effects, fades and speed, Animate for keyframes and one-click motion, Color for looks and wheels, Captions for speech to text.
5. Add titles from the Text tab in the library, then type right on the monitor.
6. Press `Ctrl/Cmd + E` to export.

Press `?` for every keyboard shortcut, or `Ctrl/Cmd + K` to search actions by name.

## How it is built

- `src/lib/compositor.js` draws one frame of the timeline to a canvas. The live monitor and the exporter both call it.
- `src/lib/color.js` is the grading engine. Exposure and white balance run in linear light, then the wheels, tone, contrast and curves, and everything bakes into one 256-entry table per channel that the compositor applies as an SVG filter. `src/lib/scopes.js` is the scope math. `src/lib/effects.js` builds the stylize filter and holds the pixelate math.
- `src/lib/animation.js` holds keyframes, easing, fades and the motion presets. `src/lib/text.js` holds text styling, layout and text animation.
- `src/lib/editor.js` and `src/lib/project.js` are pure, tested functions for every timeline edit and the project format. Older version 1 projects are upgraded on open.
- `src/hooks/useProjectHistory.js` owns the project and its undo stack.
- Electron's main process streams raw frames to FFmpeg for encoding. Fonts are bundled, so text looks the same on screen and in the exported file.

Plans for earlier milestones live in `docs/plans/`.

## Media notes

Pixelwave accepts MP4, MOV, M4V, WebM, AVI, MKV, MP3, WAV, M4A, AAC, OGG, FLAC, Opus, PNG, JPEG, WebP and GIF. If Chromium cannot decode a video, Pixelwave uses the bundled FFmpeg to make an H.264/AAC proxy.

Transcription runs locally. The first run downloads and caches the speech model.

## Project status

Pixelwave is under active development. The interface is dark only, because a neutral dim surround keeps color judgement honest.
