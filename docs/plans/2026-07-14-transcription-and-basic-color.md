# Voice Transcription and Basic Color Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add editable live voice transcription with optional clip captions, and make the existing non-destructive color controls easier to use with basic presets and a color-only reset.

**Architecture:** Keep speech recognition in the renderer through Chromium's Web Speech API so the first version needs no account or server. Store the resulting transcript on each clip, render it as an optional clip-wide caption in both preview and exported video, and keep color settings inside the existing `effects` object so projects remain serializable and undoable.

**Tech Stack:** React, Electron/Chromium Web Speech API, Canvas 2D, Vitest, CSS.

---

### Task 1: Define transcript and color behavior test-first

**Files:**
- Modify: `src/lib/editor.test.js`
- Modify: `src/lib/editor.js`
- Create: `src/lib/transcription.test.js`
- Create: `src/lib/transcription.js`

**Step 1:** Add failing tests for transcript defaults, non-destructive color presets, color-only reset, recognition support detection, result extraction, and friendly recognition errors.

**Step 2:** Run `npm test -- --run` and confirm the new tests fail because the APIs do not exist yet.

**Step 3:** Add the smallest pure helpers required by the tests.

**Step 4:** Run `npm test -- --run` and confirm the unit suite passes.

### Task 2: Add transcription controls and caption rendering

**Files:**
- Create: `src/components/TranscriptionControls.jsx`
- Modify: `src/components/Inspector.jsx`
- Modify: `src/components/Preview.jsx`
- Modify: `src/lib/exporter.js`

**Step 1:** Add start/stop microphone transcription, language selection, live interim text, editable final text, clear, and caption visibility controls.

**Step 2:** Render the saved transcript as a basic clip-wide caption in the monitor when enabled.

**Step 3:** Draw the same caption into Canvas exports so preview and output agree.

### Task 3: Expose basic color grading presets

**Files:**
- Modify: `src/components/Inspector.jsx`
- Modify: `src/styles.css`

**Step 1:** Add Original, Warm, Cool, Punch, Fade, and B&W preset buttons above the existing exposure, contrast, saturation, and temperature controls.

**Step 2:** Add a color-only reset while preserving transform, sound, title, and transcript edits.

**Step 3:** Style the transcription and grading controls to match the current compact inspector.

### Task 4: Verify the feature

**Files:**
- Verify: `src/**/*.js`
- Verify: `src/**/*.jsx`

**Step 1:** Run `npm run check` and require a clean unit suite and production build.

**Step 2:** Run syntax checks for the Electron entry points.

**Step 3:** Review the final diff against the requested transcription and basic color-grading scope.
