# Pixelwave Editor Foundation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a polished, working Electron video editor foundation with local media import, timeline editing, effects, transitions, project persistence, and WebM export.

**Architecture:** Use Electron's main process only for native file dialogs and filesystem access, exposed through a narrow context-isolated preload bridge. Keep the editor in React, with pure timeline/project functions separated from UI so editing behavior is testable and future rendering backends can replace the first-pass canvas exporter without rewriting the interface.

**Tech Stack:** Electron, React, Vite, Vitest, Phosphor Icons, CSS, Canvas 2D, MediaRecorder.

---

### Task 1: Project scaffold and secure desktop shell

**Files:**
- Create: `package.json`
- Create: `vite.config.js`
- Create: `index.html`
- Create: `electron/main.cjs`
- Create: `electron/preload.cjs`

**Step 1:** Add package scripts for Vite development, Vitest, production build, and Electron launch.

**Step 2:** Install React, Electron, Vite, Vitest, and Phosphor Icons.

**Step 3:** Add a context-isolated Electron window and a narrow preload API for media dialogs, project open/save, and export writes.

**Step 4:** Run `npm run build` and expect an exit code of 0.

### Task 2: Test-first editor domain model

**Files:**
- Create: `src/lib/editor.test.js`
- Create: `src/lib/editor.js`

**Step 1:** Write failing tests for clip insertion, duration calculation, trim bounds, splitting, removal, movement, and effect serialization.

**Step 2:** Run `npm test -- --run` and verify the tests fail because the model is missing.

**Step 3:** Implement the smallest pure functions that satisfy the tests.

**Step 4:** Run `npm test -- --run` and expect all tests to pass.

### Task 3: Premium editor shell and media workflow

**Files:**
- Create: `src/main.jsx`
- Create: `src/App.jsx`
- Create: `src/styles.css`
- Create: `src/components/IconButton.jsx`
- Create: `src/components/MediaBin.jsx`
- Create: `src/components/Preview.jsx`
- Create: `src/components/Inspector.jsx`
- Create: `src/components/Timeline.jsx`
- Create: `src/components/EmptyState.jsx`

**Step 1:** Build the dark neutral desktop shell with one coral accent, custom title bar, media panel, preview monitor, inspector, transport, and timeline.

**Step 2:** Implement native and drag-and-drop import for video, image, and audio assets with metadata probing and generated thumbnails.

**Step 3:** Implement selection, play/pause, seeking, timeline playhead, zoom, clip reorder, clip movement, trim handles, splitting, deletion, undo, and redo.

**Step 4:** Implement empty, importing, and inline error states plus accessible labels and keyboard shortcuts.

**Step 5:** Run `npm run build` and expect an exit code of 0.

### Task 4: Effects, transitions, and project persistence

**Files:**
- Modify: `src/App.jsx`
- Modify: `src/components/Preview.jsx`
- Modify: `src/components/Inspector.jsx`
- Modify: `src/components/Timeline.jsx`

**Step 1:** Add adjustable exposure, contrast, saturation, temperature, blur, vignette, rotation, scale, opacity, and volume controls.

**Step 2:** Add cut, cross-dissolve, dip-to-black, and slide transition choices with duration controls and preview behavior.

**Step 3:** Add project save/open through the preload bridge and maintain a dirty-state indicator.

**Step 4:** Run unit tests and the production build.

### Task 5: Canvas export and final verification

**Files:**
- Create: `src/lib/exporter.js`
- Modify: `src/App.jsx`

**Step 1:** Render the timeline to canvas with clip transforms, visual effects, and transition compositing.

**Step 2:** Record the canvas stream to WebM and save it through Electron with progress and cancellation UI.

**Step 3:** Run `npm test -- --run`, `npm run build`, and `npm run check`.

**Step 4:** Launch the Electron app and verify the renderer opens without console or process errors.
