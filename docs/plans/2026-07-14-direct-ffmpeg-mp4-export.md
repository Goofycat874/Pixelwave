# Direct FFmpeg MP4 Export Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the broken browser WebM recorder with deterministic PNG-frame streaming into FFmpeg so Pixelwave produces a real H.264 MP4.

**Architecture:** The renderer seeks and paints each timeline frame to its existing canvas, encodes that frame as PNG, and streams it through preload IPC. Electron owns a bounded export session and pipes the PNG sequence into FFmpeg `image2pipe`; FFmpeg writes MP4/MOV/WebM directly. Timeline audio is rendered separately to WAV in the renderer and supplied as FFmpeg's optional second input.

**Tech Stack:** React, Canvas 2D, Electron IPC, Node child processes, FFmpeg, Vitest

---

### Task 1: FFmpeg export-session argument model

**Files:**
- Create: `electron/export-session.cjs`
- Create: `electron/export-session.test.js`

**Step 1: Write the failing test**

Test that MP4 arguments read PNG frames from stdin at the project frame rate, encode H.264/yuv420p, optionally add WAV audio, and write the chosen path.

**Step 2: Run test to verify it fails**

Run: `npx vitest --run electron/export-session.test.js`
Expected: FAIL because the session helper does not exist.

**Step 3: Write minimal implementation**

Implement `buildFrameExportArgs({ format, frameRate, audioPath, outputPath })` and a safe `writeFrame(stream, bytes)` backpressure helper.

**Step 4: Run test to verify it passes**

Run: `npx vitest --run electron/export-session.test.js`
Expected: PASS.

### Task 2: Electron streaming IPC lifecycle

**Files:**
- Modify: `electron/main.cjs`
- Modify: `electron/preload.cjs`

**Step 1: Add IPC session lifecycle**

Add `export:begin`, `export:frame`, `export:finish`, and `export:cancel`. `begin` shows the save dialog, creates a temporary directory, writes optional WAV audio, starts FFmpeg, and returns a job id. `frame` writes one PNG with backpressure. `finish` closes stdin and waits for FFmpeg; `cancel` terminates and cleans up.

**Step 2: Expose lifecycle in preload**

Expose `beginExport`, `writeExportFrame`, `finishExport`, and `cancelExport`.

### Task 3: Deterministic renderer frame plan

**Files:**
- Modify: `src/lib/exporter.test.js`
- Modify: `src/lib/exporter.js`

**Step 1: Write failing tests**

Test `exportFrameTimes(duration, frameRate)` and the canvas-to-PNG rejection path.

**Step 2: Run test to verify it fails**

Run: `npx vitest --run src/lib/exporter.test.js`
Expected: FAIL because frame planning does not exist.

**Step 3: Implement deterministic frame rendering**

Remove MediaRecorder from `exportTimeline`. Generate exact frame timestamps, seek active video sources to each timestamp, draw the existing layered composition, encode PNG, and await the IPC frame callback for backpressure.

**Step 4: Run test to verify it passes**

Run: `npx vitest --run src/lib/exporter.test.js`
Expected: PASS.

### Task 4: Offline timeline audio

**Files:**
- Create: `src/lib/export-audio.js`
- Create: `src/lib/export-audio.test.js`

**Step 1: Write failing tests**

Test WAV header generation and clip scheduling calculations for start, source offset, speed, and volume.

**Step 2: Run test to verify it fails**

Run: `npx vitest --run src/lib/export-audio.test.js`
Expected: FAIL because audio export helpers do not exist.

**Step 3: Implement audio render**

Decode reusable audio assets with `OfflineAudioContext`, schedule every non-image clip, render the mix, and serialize stereo 16-bit WAV. Skip video assets that contain no decodable audio while surfacing failures for audio-only assets.

**Step 4: Run test to verify it passes**

Run: `npx vitest --run src/lib/export-audio.test.js`
Expected: PASS.

### Task 5: App orchestration and verification

**Files:**
- Modify: `src/App.jsx`

**Step 1: Wire direct export**

Render optional WAV audio, begin the FFmpeg job, stream every PNG frame, finish the job, and cancel both renderer and Electron work together.

**Step 2: Run automated verification**

Run: `npm run check`
Expected: all tests pass and Vite production build succeeds.

**Step 3: Run real MP4 export**

Export the current 15-second image/text project to a temporary MP4, then inspect it with FFmpeg for H.264 video, duration, and nonzero frame count.
