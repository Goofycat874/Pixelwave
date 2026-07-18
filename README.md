# Pixelwave

Pixelwave is a desktop video editor built with Electron and React. It focuses on a fast, tactile editing workflow with a layered timeline, direct preview controls, local media processing, and a polished liquid-glass interface.

## Highlights

- Import video, audio, and still images, including MP4 and MOV sources
- Automatic MP4 proxy generation when Electron cannot decode an imported video directly
- Multi-layer video and audio timeline with smooth scrubbing and snapping
- Frame-accurate keyboard navigation, clip nudging, and internal copy/paste
- Fit-sequence and center-playhead timeline controls
- Move, trim, split, duplicate, reorder, and change clip playback speed
- Directly position and scale clips in the program monitor
- Multiple editable text overlays with custom fonts, backgrounds, and placement controls
- Clip transcription and word-timed caption styling
- Built-in voice recording for narration and voice-over takes
- Color workspace with presets and manual grading controls
- Entry transitions, opacity, audio, transform, and visual effect controls
- MP4, MOV, and WebM export through the bundled FFmpeg pipeline
- Project save/open, undo/redo, searchable media pool, and media actions

## Tech stack

- Electron
- React 19
- Vite
- FFmpeg
- Hugging Face Transformers for local transcription
- Vitest

## Getting started

Pixelwave is currently developed and tested on macOS. Install a recent Node.js release (Node 20.19+ or 22.12+ is recommended), then run:

```bash
npm install
npm run dev
```

The development command starts Vite and opens the Electron desktop window automatically.

To run the production build locally:

```bash
npm run build
npm start
```

## Available commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start Vite and Electron in development mode |
| `npm start` | Open Electron using the current production build |
| `npm run build` | Build the renderer into `dist/` |
| `npm test` | Run the Vitest suite in watch mode |
| `npm run check` | Run all tests once and create a production build |

## Basic workflow

1. Import video, audio, or images from the Media panel.
2. Double-click an asset or drag it onto the timeline.
3. Trim and arrange clips across layers, then use the Inspector for timing, transitions, effects, captions, and color.
4. Add text or record a voice-over from the top toolbar.
5. Choose MP4, MOV, or WebM and export the finished timeline.

The three-dot menu on each media item can append it to the timeline, reveal the source in Finder, or remove it and its linked timeline instances from the project. Removal is recorded in project history, so it can be undone.

Press `?` inside the editor to open the keyboard shortcut guide. Arrow keys step through frames, Shift+Arrow moves by one second, Option/Alt+Arrow nudges the selected clip, and Cmd/Ctrl+C and Cmd/Ctrl+V copy and paste clips at the playhead.

## Media notes

Pixelwave accepts common desktop formats including MP4, MOV, M4V, WebM, AVI, MKV, MP3, WAV, M4A, AAC, OGG, PNG, JPEG, WebP, and GIF. If Chromium cannot decode an imported video, Pixelwave uses its bundled FFmpeg binary to create an H.264/AAC MP4 proxy.

Transcription runs locally. The first transcription may take longer while the speech model is prepared and cached.

## Project status

Pixelwave is under active development. The editor is functional, but packaging, platform testing, performance work, and additional editing tools are still in progress.
