# Selected Clip Transcription Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make the Voice tab transcribe the audio already contained in the selected timeline clip with one click.

**Architecture:** Resolve the selected clip to its imported media file in the renderer, then send only its source range through Electron IPC. The main process will extract mono 16 kHz PCM with the bundled FFmpeg binary and run the multilingual Whisper Tiny ONNX model locally with Transformers.js, caching model files in Pixelwave's user-data directory after the first download.

**Tech Stack:** React, Electron IPC, FFmpeg, Transformers.js, Whisper Tiny ONNX, Vitest.

---

### Task 1: Define the clip transcription request

**Files:**
- Modify: `src/lib/transcription.test.js`
- Modify: `src/lib/transcription.js`

**Step 1:** Add a failing test that resolves a selected audio/video clip to a safe request containing its media path, source range, and language.

**Step 2:** Run `npm test -- --run src/lib/transcription.test.js` and confirm the helper is missing.

**Step 3:** Implement the request helper and friendly main-process error normalization.

**Step 4:** Re-run the focused tests and require them to pass.

### Task 2: Add the local Whisper engine behind Electron IPC

**Files:**
- Create: `electron/clip-transcription.cjs`
- Create: `electron/clip-transcription.test.js`
- Modify: `electron/main.cjs`
- Modify: `electron/preload.cjs`
- Modify: `package.json`
- Modify: `package-lock.json`

**Step 1:** Add failing tests for request validation, FFmpeg argument construction, PCM decoding, and transcript text cleanup.

**Step 2:** Run the focused test and confirm the engine helpers do not yet exist.

**Step 3:** Implement FFmpeg extraction, lazy model loading, user-data model caching, multilingual language mapping, and serialized inference.

**Step 4:** Expose a narrow `transcribeClip` preload method and register an IPC handler that only accepts media paths already authorized by Pixelwave.

**Step 5:** Re-run the engine tests and require them to pass.

### Task 3: Replace live dictation with selected-clip transcription

**Files:**
- Modify: `src/App.jsx`
- Modify: `src/components/Inspector.jsx`
- Modify: `src/components/TranscriptionControls.jsx`
- Modify: `src/styles.css`

**Step 1:** Pass the selected clip's media asset to the Voice controls.

**Step 2:** Replace the microphone-recognition state with one-click processing, first-download messaging, progress animation, editable results, retry, and clear controls.

**Step 3:** Keep the existing caption toggle so the generated text remains visible in preview and export.

### Task 4: Verify the complete workflow

**Files:**
- Verify: `electron/**/*.cjs`
- Verify: `src/**/*.{js,jsx}`

**Step 1:** Run `npm run check`, Electron syntax checks, and `git diff --check`.

**Step 2:** Restart Pixelwave, import a known speech clip, press Transcribe clip, and verify the generated text appears without the renderer crashing.
