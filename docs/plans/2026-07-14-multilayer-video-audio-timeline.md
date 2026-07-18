# Multilayer Video and Audio Timeline Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add three stackable video tracks and three independently timed audio tracks that behave consistently in the timeline, live preview, saved projects, and exports.

**Architecture:** Every clip gains a zero-based `track` value. Shared editor helpers normalize track values, append clips to their own lane, and return active clips in bottom-to-top layer order. The timeline renders V3/V2/V1 and A1/A2/A3 lanes, while preview and export render every active layer rather than choosing only one clip.

**Tech Stack:** React 19, Electron, Canvas export renderer, Vitest, Vite.

---

### Task 1: Add Track-Aware Timeline Model

**Files:**
- Modify: `src/lib/editor.test.js`
- Modify: `src/lib/editor.js`

**Step 1: Write the failing tests**

Test that new clips default to track 0, clips can be created and moved onto another track, appending uses the end of only the matching kind and track, and active layers sort by track.

**Step 2: Run test to verify it fails**

Run: `npx vitest --run src/lib/editor.test.js`
Expected: FAIL because track helpers and behavior do not exist.

**Step 3: Write minimal implementation**

Add `clipTrack`, `activeClipsAt`, a third `track` argument to `createClip`, track-aware `appendClip`, and an optional `track` argument to `moveClip`.

**Step 4: Run test to verify it passes**

Run: `npx vitest --run src/lib/editor.test.js`
Expected: PASS.

### Task 2: Build Six-Lane Timeline Interaction

**Files:**
- Modify: `src/components/Timeline.jsx`
- Modify: `src/App.jsx`
- Modify: `src/styles.css`

**Step 1: Render V3, V2, V1, A1, A2, and A3**

Filter each lane by clip kind and normalized track. Keep V1 as the base layer and render higher video tracks above it.

**Step 2: Route dropped assets into the target lane**

Add lane-level drop handlers and pass the lane track to `addToTimeline`.

**Step 3: Support vertical clip dragging**

During a pointer move, inspect the lane under the cursor and update `track` when it matches the clip kind.

**Step 4: Style the layers**

Make the taller timeline readable, distinguish overlay tracks, and show a brief lane hint without adding modal UI.

### Task 3: Render All Active Layers in Preview and Export

**Files:**
- Modify: `src/lib/exporter.test.js`
- Modify: `src/lib/exporter.js`
- Modify: `src/components/Preview.jsx`
- Modify: `src/styles.css`

**Step 1: Write the failing export-order test**

Test that the render plan orders simultaneous visual clips from track 0 upward.

**Step 2: Run test to verify it fails**

Run: `npx vitest --run src/lib/exporter.test.js`
Expected: FAIL because the plan currently sorts only by time.

**Step 3: Implement layered export**

Draw every active visual in track order. Keep every active audio/video media element connected to the export audio mix, and draw captions from the topmost eligible layer.

**Step 4: Implement layered preview**

Render every active visual layer, render concurrent audio elements without covering the monitor, and choose titles/captions by visual layer order.

**Step 5: Run focused tests**

Run: `npx vitest --run src/lib/editor.test.js src/lib/exporter.test.js`
Expected: PASS.

### Task 4: Verify the Desktop Workflow

**Files:**
- Verify only

**Step 1: Run the full check**

Run: `npm run check`
Expected: all tests pass and Vite build succeeds.

**Step 2: Run syntax and diff checks**

Run: `node --check electron/main.cjs && node --check electron/preload.cjs && git diff --check`
Expected: exit 0.

**Step 3: Test in Electron**

Place overlapping clips on separate video and audio lanes, confirm simultaneous preview, then verify the same stack is included in an export.
