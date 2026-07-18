# Word-Timed Caption Styling Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Redesign the Voice inspector, add selectable Google Fonts for captions, and display long transcriptions one spoken word at a time in preview and export.

**Architecture:** Ask the existing local Whisper pipeline for word timestamps and save normalized `{ text, start, end }` entries alongside each clip transcript. A shared pure helper will resolve the active word from timeline time and playback speed so React preview and Canvas export remain identical; older projects without timestamps keep their full-text fallback.

**Tech Stack:** React, Electron, Transformers.js Whisper word timestamps, Canvas 2D, Google Fonts CSS2 API, Vitest.

---

### Task 1: Define timestamp and caption-style data

**Files:**
- Modify: `electron/clip-transcription.test.js`
- Modify: `electron/clip-transcription.cjs`
- Modify: `src/lib/transcription.test.js`
- Modify: `src/lib/transcription.js`
- Modify: `src/lib/editor.test.js`
- Modify: `src/lib/editor.js`

**Step 1:** Add failing tests for normalized Whisper word chunks, active-word timing across gaps and playback speeds, font-family validation, and new transcript defaults.

**Step 2:** Run the focused tests and confirm the timestamp/style helpers are missing.

**Step 3:** Implement the minimal pure helpers and defaults.

**Step 4:** Re-run the focused tests and require them to pass.

### Task 2: Return word timestamps from local transcription

**Files:**
- Modify: `electron/clip-transcription.cjs`
- Modify: `src/components/TranscriptionControls.jsx`

**Step 1:** Request `return_timestamps: 'word'` from Whisper and return normalized words with the full text.

**Step 2:** Save both `text` and `words` to the selected clip while preserving caption style.

**Step 3:** Clear stale timestamps whenever the transcript is manually edited or cleared.

### Task 3: Make preview and export word-timed

**Files:**
- Modify: `src/components/Preview.jsx`
- Modify: `src/lib/exporter.js`
- Modify: `src/lib/exporter.test.js`

**Step 1:** Render only the active word at the current clip time, accounting for clip speed.

**Step 2:** Apply the chosen font family, size, and color in the monitor.

**Step 3:** Draw the identical active word and font styling into each exported frame.

**Step 4:** Preserve the full-text caption behavior for old projects without word timestamps.

### Task 4: Redesign the Voice inspector

**Files:**
- Modify: `src/components/TranscriptionControls.jsx`
- Modify: `src/styles.css`

**Step 1:** Build a compact status header with duration/word-count readouts and a stronger primary action.

**Step 2:** Add a live caption sample and a visual Google Font picker with rendered font previews.

**Step 3:** Add caption size and color controls, plus polished loading, success, empty, disabled, and error states.

**Step 4:** Load only the curated Google Font families and weights required by the picker.

### Task 5: Verify real playback

**Files:**
- Verify: `electron/**/*.{cjs,js}`
- Verify: `src/**/*.{js,jsx}`

**Step 1:** Run the full tests, build, Electron syntax checks, and whitespace validation.

**Step 2:** Restart Pixelwave, transcribe the known test take, play it, and confirm captions advance word by word with the chosen font.
