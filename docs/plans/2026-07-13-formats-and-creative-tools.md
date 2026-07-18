# Formats and Creative Tools Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add genuine MP4/MOV import and export support plus the next set of practical clip-editing and title tools.

**Architecture:** Keep the browser-based canvas renderer as the visual compositor, then pass its WebM master to Electron's main process for validated FFmpeg transcoding. Use the same FFmpeg binary to create H.264 proxy media whenever Chromium cannot decode an imported MP4 or MOV, while retaining the original file path in the project.

**Tech Stack:** Electron, React, Vite, Vitest, Canvas 2D, MediaRecorder, FFmpeg static binary.

---

### Task 1: Test-first clip tooling

**Files:**
- Modify: `src/lib/editor.test.js`
- Modify: `src/lib/editor.js`

**Step 1:** Write failing tests for clip duplication, speed changes, and new transform/title defaults.

**Step 2:** Run `npm test -- --run` and verify the new expectations fail.

**Step 3:** Implement `duplicateClip`, `setClipSpeed`, and durable new defaults.

**Step 4:** Run the unit suite and expect all tests to pass.

### Task 2: FFmpeg import and export bridge

**Files:**
- Modify: `package.json`
- Modify: `electron/main.cjs`
- Modify: `electron/preload.cjs`
- Modify: `src/App.jsx`
- Modify: `src/lib/media.js`

**Step 1:** Install the pinned `ffmpeg-static` runtime dependency.

**Step 2:** Add format-validation, temporary-file cleanup, MP4/MOV transcoding, and proxy generation in the Electron main process.

**Step 3:** Expose only `createProxy` and format-aware `saveExport` through the preload bridge.

**Step 4:** Retry undecodable MP4/MOV imports through an H.264/AAC proxy.

**Step 5:** Add WebM, MP4, and MOV export choices and clear conversion status.

### Task 3: Creative clip controls

**Files:**
- Modify: `src/components/Inspector.jsx`
- Modify: `src/components/Preview.jsx`
- Modify: `src/lib/exporter.js`
- Modify: `src/App.jsx`

**Step 1:** Add speed, horizontal/vertical flip, X/Y positioning, and fit controls.

**Step 2:** Add editable clip-title text, size, placement, and opacity controls.

**Step 3:** Add zoom and wipe transitions to both preview and export rendering.

**Step 4:** Add duplicate clip and project rename controls.

### Task 4: UI polish and verification

**Files:**
- Modify: `src/styles.css`
- Modify: `src/components/Timeline.jsx`

**Step 1:** Add concise format, title, speed, proxy, and duplicate affordances without increasing visual clutter.

**Step 2:** Run `npm run check`, Electron syntax checks, FFmpeg version check, and `npm audit`.

**Step 3:** Launch Electron and inspect the empty and selected-clip states.
