# Direct Preview Transform Controls Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Let users move and proportionally resize selected image/video clips directly in the program monitor using a selection outline and four corner handles.

**Architecture:** Pure geometry helpers convert media dimensions, fit mode, scale, and position into a monitor-relative selection box. A focused React overlay owns pointer interactions, records one undo snapshot at gesture start, and streams position/scale changes through the existing clip effect model so preview and canvas export stay aligned.

**Tech Stack:** React 19, pointer events, existing CSS, Vitest, Vite.

---

### Task 1: Add Tested Transform Geometry

**Files:**
- Create: `src/lib/preview-transform.test.js`
- Create: `src/lib/preview-transform.js`

**Step 1: Write failing tests**

Test contain-fit geometry for landscape and portrait media, cover-fit selection geometry, pointer-to-position delta conversion, and proportional corner scaling with minimum/maximum clamps.

**Step 2: Run tests and verify failure**

Run: `npx vitest --run src/lib/preview-transform.test.js`
Expected: FAIL because the geometry module does not exist.

**Step 3: Implement minimal helpers**

Add `mediaSelectionBox`, `positionDeltaFromPointer`, and `scaleFromCornerPointer` with deterministic numeric output.

**Step 4: Run tests and verify success**

Run: `npx vitest --run src/lib/preview-transform.test.js`
Expected: PASS.

### Task 2: Add the Direct Manipulation Overlay

**Files:**
- Create: `src/components/PreviewTransformControls.jsx`
- Modify: `src/components/Preview.jsx`
- Modify: `src/App.jsx`
- Modify: `src/styles.css`

**Step 1: Build an isolated interaction component**

Render one transform box for the selected, currently visible visual clip. Add one move surface and four accessible corner handles.

**Step 2: Implement move gestures**

On pointer down, capture the starting pointer and effects, call `onBeginEdit` once, then update `positionX` and `positionY` continuously until pointer up.

**Step 3: Implement scale gestures**

Use center-to-pointer distance to update uniform scale from any corner, clamped to the Inspector's 25–200% range.

**Step 4: Match preview and export coordinate systems**

Use half-frame percentage translation in the preview, matching the Canvas renderer's existing transform calculation.

**Step 5: Style interaction states**

Use a thin coral outline, compact neutral handles, clear move/resize cursors, and transform-only motion without obscuring the video.

### Task 3: Verify the Workflow

**Files:**
- Verify only

**Step 1: Run focused tests**

Run: `npx vitest --run src/lib/preview-transform.test.js src/lib/editor.test.js src/lib/exporter.test.js`
Expected: PASS.

**Step 2: Run the full check**

Run: `npm run check`
Expected: all tests pass and the production build succeeds.

**Step 3: Inspect Electron**

Select a visible image/video clip, drag the selection, resize it from multiple corners, and confirm Inspector values update live without console or playback errors.
