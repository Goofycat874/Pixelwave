# Revival: a better OpenShot

Goal: make Pixelwave clearly easier and more capable than OpenShot, with an interface that feels designed rather than generated.

## Why the old UI read as generated

The previous interface stacked frosted glass, radial color glows, dot-grid backgrounds, a coral accent and 6 to 9 pixel text. It looked busy and was hard to read. The redesign removes all of it:

- Flat, opaque panels with 1px borders. No blur, no glows, no decorative gradients behind controls.
- One blue accent, used only for interactive state. Clip colors are the only other hues and they carry meaning (video, image, audio, text).
- Real type sizes: 13px body, 12px secondary, 11px minimum. Geist for the interface, Geist Mono for timecode only.
- One radius scale: 4px small parts, 6px controls, 8px panels and menus, 10px dialogs.
- Sentence case labels, no uppercase tracked eyebrows, no status dots, no section numbers.
- Dark only on purpose. Color work needs a neutral, dim surround.

## Structure

| Area | Files |
| --- | --- |
| Rendering | `src/lib/compositor.js`, `src/lib/preview-sources.js`, `src/lib/exporter.js` |
| Animation and text | `src/lib/animation.js`, `src/lib/text.js`, `src/lib/fonts.js` |
| Project model | `src/lib/editor.js`, `src/lib/project.js`, `src/hooks/useProjectHistory.js` |
| Timeline | `src/components/timeline/`, `src/lib/timeline-math.js`, `src/lib/media-analysis.js` |
| Panels | `src/components/LibraryPanel.jsx`, `Viewer.jsx`, `inspector/` |
| Shared UI | `src/components/ui.jsx`, `src/ui.css` |
| Electron | `electron/main.cjs`, `electron/export-session.cjs`, `electron/project-files.cjs` |

## Decisions worth knowing

- **One renderer.** The monitor and the exporter call the same `drawFrame`, so effects, keying, text and transitions cannot drift apart.
- **History lives in a ref.** The old code recorded history inside React state updaters, which StrictMode ran twice in development. History now records outside updaters, and drags use one checkpoint for the whole gesture.
- **Raw RGBA to FFmpeg.** The exporter sends raw frames instead of PNGs, which removes PNG encoding from the hot path. Main validates frame size before writing.
- **Keyframe time is clip-local.** Trimming, splitting and changing speed move keyframes with the picture.
- **Generated backgrounds are recipes.** Project files store the color or gradient definition and the picture is rebuilt on open.
- **CSP.** `connect-src` now allows `pixelwave-media:` so waveforms and audio export can read local files.

## Not done yet

- Light theme.
- Per-keyframe curve editor (easing is chosen per segment).
- Nested sequences and adjustment layers.
- Speed ramps and reverse playback of clips.
- Packaging and auto-update.
