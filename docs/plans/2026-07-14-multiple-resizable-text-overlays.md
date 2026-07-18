# Multiple Resizable Text Overlays Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Allow unlimited independent text overlays on each visual clip and direct proportional text resizing from monitor corner handles.

**Architecture:** Keep the existing `title` object as a backwards-compatible legacy overlay and add a `textOverlays` array for new text. Shared editor helpers create, enumerate, select, and update overlays. Preview, Inspector, timeline markers, duplication, and Canvas export all consume the same overlay list.

**Tech Stack:** React 19, Phosphor icons, pointer events, Canvas export, Vitest, Vite.

---

### Task 1: Add the Multiple-Text Model

**Files:**
- Modify: `src/lib/editor.test.js`
- Modify: `src/lib/editor.js`

**Step 1: Write failing model tests**

Test default empty `textOverlays`, independent overlay creation, legacy-title enumeration, overlay update by ID, and deep-cloned overlays when duplicating clips.

**Step 2: Run and verify failure**

Run: `npx vitest --run src/lib/editor.test.js`
Expected: FAIL because overlay helpers do not exist.

**Step 3: Implement model helpers**

Add `LEGACY_TEXT_ID`, `createTextOverlay`, `clipTextOverlays`, and `updateClipTextOverlay`; initialize `textOverlays` on new clips and clone them during duplication.

**Step 4: Run and verify success**

Run: `npx vitest --run src/lib/editor.test.js`
Expected: PASS.

### Task 2: Add Tested Direct Text Resizing

**Files:**
- Modify: `src/lib/preview-transform.test.js`
- Modify: `src/lib/preview-transform.js`
- Modify: `src/components/PreviewTextEditor.jsx`
- Modify: `src/styles.css`

**Step 1: Write the failing geometry test**

Test radial pointer resizing from 54px to 108px with 12px and 180px clamps.

**Step 2: Run and verify failure**

Run: `npx vitest --run src/lib/preview-transform.test.js`
Expected: FAIL because text-size geometry does not exist.

**Step 3: Implement the resize helper and corner handles**

Add `textSizeFromCornerPointer`. Render four accessible handles around the inline editor and stream font-size updates without React animation state.

**Step 4: Run and verify success**

Run: `npx vitest --run src/lib/preview-transform.test.js`
Expected: PASS.

### Task 3: Wire Multiple Overlays Through the Editor

**Files:**
- Modify: `src/App.jsx`
- Modify: `src/components/Preview.jsx`
- Modify: `src/components/Inspector.jsx`
- Modify: `src/components/Timeline.jsx`
- Modify: `src/styles.css`

**Step 1: Track selected and editing text IDs**

Separate text selection from inline editing. Keep selection after Enter so Inspector controls remain connected to the chosen overlay.

**Step 2: Create one overlay per Text click**

Append a fresh overlay to the selected or active visual clip and focus it inline. Never overwrite existing text.

**Step 3: Render and select every overlay**

Render all legacy and new overlays. Single click selects; double click edits. Show a selected outline and inline corner handles only for the active overlay.

**Step 4: Connect Inspector controls**

Make text, color, size, X/Y, and opacity edit the selected overlay, with legacy title fallback.

**Step 5: Update timeline text markers**

Show the text marker when a clip contains either legacy or new overlays.

### Task 4: Export Every Text Overlay

**Files:**
- Modify: `src/lib/exporter.test.js`
- Modify: `src/lib/exporter.js`

**Step 1: Write the failing export-list test**

Verify Canvas export receives legacy and new overlays in stable order.

**Step 2: Run and verify failure**

Run: `npx vitest --run src/lib/exporter.test.js`
Expected: FAIL because export draws only `clip.title`.

**Step 3: Draw all overlays**

Extract generic text drawing and iterate `clipTextOverlays(clip)` for every visual layer.

**Step 4: Run and verify success**

Run: `npx vitest --run src/lib/exporter.test.js`
Expected: PASS.

### Task 5: Verify the Complete Workflow

**Files:**
- Verify only

**Step 1: Run `npm run check`**

Expected: all tests pass and Vite production build succeeds.

**Step 2: Test Electron**

Create two text overlays, type different content, move and resize each independently, press Enter, and verify the Inspector follows the selected overlay.

**Step 3: Run syntax and diff checks**

Run: `node --check electron/main.cjs && node --check electron/preload.cjs && git diff --check`
Expected: exit 0.
