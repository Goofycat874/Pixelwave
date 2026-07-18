# Custom Caption Font and Background Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Let people import a local caption font and independently remove the dark caption box in preview and exported video.

**Architecture:** Electron will authorize a user-selected font file and expose it through the existing secure local-media protocol. Shared caption helpers will register the font with the browser FontFace API and resolve the correct font stack, while the transcript model stores the selected custom font and caption-box preference so preview, project saves, and exports stay consistent.

**Tech Stack:** Electron IPC, React 19, CSS FontFace API, Canvas 2D export, Vitest.

---

### Task 1: Caption style model and helpers

**Files:**
- Modify: `src/lib/transcription.test.js`
- Modify: `src/lib/transcription.js`
- Modify: `src/lib/editor.test.js`
- Modify: `src/lib/editor.js`

**Steps:**
1. Write failing tests for custom font stacks, FontFace registration, and the default enabled caption box.
2. Run the focused tests and confirm the new assertions fail for missing behavior.
3. Implement the minimal shared font-loading and style-default helpers.
4. Run the focused tests and confirm they pass.

### Task 2: Secure local font selection

**Files:**
- Modify: `electron/main.cjs`
- Modify: `electron/preload.cjs`
- Modify: `electron/media-protocol.test.js`

**Steps:**
1. Write a failing test for supported caption font extensions.
2. Run it and confirm the missing validator fails.
3. Add a filtered Electron font picker that authorizes the chosen file and returns a secure local URL.
4. Expose the picker through the preload bridge and rerun focused tests.

### Task 3: Voice panel controls and preview

**Files:**
- Modify: `src/components/TranscriptionControls.jsx`
- Modify: `src/components/Preview.jsx`
- Modify: `src/styles.css`

**Steps:**
1. Add a compact custom-font import button with loading, selected, and error states.
2. Add the caption-box switch beside the text color control.
3. Register selected custom fonts and apply transparent caption styling live in the monitor.
4. Visually verify both interaction states in Pixelwave.

### Task 4: Export fidelity

**Files:**
- Modify: `src/lib/exporter.test.js`
- Modify: `src/lib/exporter.js`

**Steps:**
1. Write failing tests for custom-font resolution and optional caption-box drawing.
2. Run them and confirm the new expectations fail.
3. Load custom fonts before rendering and skip the background rectangle when disabled.
4. Run exporter tests and confirm they pass.

### Task 5: Verification

**Files:**
- Verify all modified files.

**Steps:**
1. Run the full test suite and production build with `npm run check`.
2. Run Node syntax checks for Electron files and `git diff --check`.
3. Test a local font and caption-box toggle in the running app.
4. Leave Pixelwave open for the user; do not commit unless requested.
