# Direct Text Button Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a visible Text button that creates inline-editable, freely positionable text on a visual clip and renders identically in preview and export.

**Architecture:** Extend the existing per-clip title model with horizontal position. A dedicated preview text editor owns typing and drag gestures, while App chooses the selected or topmost visual clip and opens edit mode. Preview and Canvas export share the same percentage-based title coordinates.

**Tech Stack:** React 19, Phosphor icons, pointer events, existing CSS, Vitest, Vite.

---

### Task 1: Add Tested Text Positioning

**Files:**
- Modify: `src/lib/editor.test.js`
- Modify: `src/lib/editor.js`
- Modify: `src/lib/preview-transform.test.js`
- Modify: `src/lib/preview-transform.js`
- Modify: `src/lib/exporter.test.js`
- Modify: `src/lib/exporter.js`

**Step 1: Write failing tests**

Test that new clips default title X/Y to 50/78, pointer movement converts to clamped text percentages, and Canvas title coordinates use both axes.

**Step 2: Run focused tests and verify failure**

Run: `npx vitest --run src/lib/editor.test.js src/lib/preview-transform.test.js src/lib/exporter.test.js`
Expected: FAIL because horizontal title placement and helpers do not exist.

**Step 3: Implement the model and geometry**

Add `title.positionX`, `textPositionFromPointer`, and `titleCanvasPosition`; use the latter inside `drawTitle`.

**Step 4: Run focused tests and verify success**

Run: `npx vitest --run src/lib/editor.test.js src/lib/preview-transform.test.js src/lib/exporter.test.js`
Expected: PASS.

### Task 2: Add Inline Text Editing and Dragging

**Files:**
- Create: `src/components/PreviewTextEditor.jsx`
- Modify: `src/components/Preview.jsx`
- Modify: `src/components/Inspector.jsx`
- Modify: `src/App.jsx`
- Modify: `src/styles.css`

**Step 1: Add the Text button**

Place a Phosphor text icon button in the top project actions. Target the selected visual clip, or the topmost visual clip under the playhead when nothing is selected.

**Step 2: Create inline editing mode**

Insert `Your text` for an empty title, focus the monitor input automatically, and let Enter/Escape finish editing.

**Step 3: Add direct text positioning**

Render a small drag grip above the text input. Record one undo snapshot when dragging starts and stream X/Y updates through the existing clip title object.

**Step 4: Extend Inspector controls**

Add Horizontal position alongside Vertical position so placement can be adjusted precisely.

**Step 5: Match normal preview rendering**

Use title X/Y for normal preview text and allow double-clicking an existing title to reopen inline editing.

### Task 3: Verify the Workflow

**Files:**
- Verify only

**Step 1: Run full checks**

Run: `npm run check`
Expected: all tests pass and production build succeeds.

**Step 2: Test in Electron**

Click Text, replace the placeholder, drag the grip to a new location, finish editing, and verify Inspector X/Y and normal preview placement.

**Step 3: Check syntax and diff integrity**

Run: `node --check electron/main.cjs && node --check electron/preload.cjs && git diff --check`
Expected: exit 0.
