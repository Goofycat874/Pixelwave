# Voice Recording and Color Workspace Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add durable microphone recording and a dedicated DaVinci-inspired primary color-grading workspace.

**Architecture:** Capture microphone audio in the renderer with `MediaRecorder`, persist each completed take through a narrowly scoped Electron IPC handler, then add the returned audio asset and clip at the current playhead in one undoable project update. Move grading into Inspector tabs and approximate Lift/Gamma/Gain wheel adjustments through a shared color transform used by both DOM preview and Canvas export.

**Tech Stack:** React 19, Electron, MediaRecorder/getUserMedia, Canvas 2D, Vitest, CSS, Phosphor icons.

---

### Task 1: Define recording and primary-grade behavior test-first

**Files:**
- Create: `src/lib/recording.test.js`
- Create: `src/lib/recording.js`
- Modify: `src/lib/editor.test.js`
- Modify: `src/lib/editor.js`
- Modify: `src/lib/exporter.test.js`

**Step 1:** Add failing tests for supported audio MIME selection, elapsed-time formatting, default primary-wheel state, independent duplication, wheel-to-filter adjustment mapping, and full color reset.

**Step 2:** Run `npm test -- --run` and verify the failures are caused by missing behavior.

**Step 3:** Implement the pure recording and color-transform helpers.

**Step 4:** Run the focused tests and require them to pass.

### Task 2: Persist recorded voice takes

**Files:**
- Modify: `electron/main.cjs`
- Modify: `electron/preload.cjs`
- Modify: `src/App.jsx`
- Create: `src/components/VoiceRecorder.jsx`

**Step 1:** Add a validated `recording:save` IPC handler that writes supported audio data under Pixelwave's user-data directory and returns an authorized audio descriptor.

**Step 2:** Expose only `saveVoiceRecording` through the preload bridge.

**Step 3:** Add a top-bar Record voice button and a recorder dialog with ready, recording, saving, error, cancel, and completed states.

**Step 4:** Probe the saved audio, add it to the media bin, and insert its clip at the current playhead with selection moved to the new take.

### Task 3: Build the dedicated Color tab

**Files:**
- Create: `src/components/ColorWorkspace.jsx`
- Modify: `src/components/Inspector.jsx`
- Modify: `src/components/Preview.jsx`
- Modify: `src/lib/exporter.js`
- Modify: `src/styles.css`

**Step 1:** Add Edit, Color, and Voice inspector tabs with appropriate empty/disabled behavior per clip kind.

**Step 2:** Add Lift, Gamma, and Gain two-axis wheels with separate luma sliders, plus presets and basic exposure/contrast/saturation/temperature controls.

**Step 3:** Use the same computed color adjustments in preview and export so the displayed grade matches output.

**Step 4:** Apply a compact, panel-divider-heavy visual system inspired by professional color pages without copying DaVinci branding.

### Task 4: Verification

**Files:**
- Verify: `src/**/*.js`
- Verify: `src/**/*.jsx`
- Verify: `electron/*.cjs`

**Step 1:** Run `npm run check` for the full unit suite and production build.

**Step 2:** Run Electron syntax checks and whitespace checks.

**Step 3:** Review the recording lifecycle, permission/error handling, timer cleanup, and preview/export grade parity against this plan.
