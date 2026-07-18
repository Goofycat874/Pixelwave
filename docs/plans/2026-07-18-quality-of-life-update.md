# Pixelwave Quality-of-Life Update Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make Pixelwave's existing editor faster and easier to operate by adding discoverable shortcuts, frame-accurate navigation, clip copy/paste and nudging, timeline focus controls, and undoable action feedback.

**Architecture:** Keep project mutations in `src/lib/editor.js` as pure functions so shortcut and toolbar behavior share the same tested logic. Add small React components for the shortcut guide and action toast, while preserving `App.jsx` as the coordinator for editor state and history. Timeline-only viewport behavior remains inside `Timeline.jsx` and uses a tested zoom calculation helper.

**Tech Stack:** Electron, React 19, Vite, Phosphor Icons, Vitest, vanilla CSS.

---

### Task 1: Precision editing model helpers

**Files:**
- Modify: `src/lib/editor.js`
- Test: `src/lib/editor.test.js`

**Step 1: Write failing tests**

Add tests that require:

- `stepPlayhead()` to move by one frame or one second and clamp between zero and sequence duration.
- `nudgeClip()` to move only the selected clip and clamp its start to zero.
- `pasteClipAt()` to produce a new clip at the requested playhead with independent nested effects, transition, title, transcript, and text-overlay state.
- `timelineZoomForDuration()` to fit the whole sequence inside the available viewport and clamp to Pixelwave's supported zoom range.

**Step 2: Verify the tests fail**

Run: `npm test -- --run src/lib/editor.test.js`

Expected: the new tests fail because the four helpers do not exist.

**Step 3: Implement the helpers**

Add pure exported helpers using the existing `roundTime()`, `moveClip()`, nested-state cloning patterns, the 64-pixel base timeline scale, and zoom limits of `0.15` to `2` so longer sequences can genuinely fit.

**Step 4: Verify the tests pass**

Run: `npm test -- --run src/lib/editor.test.js`

Expected: all editor model tests pass.

### Task 2: Keyboard-first editing workflow

**Files:**
- Modify: `src/App.jsx`
- Modify: `src/components/IconButton.jsx`

**Step 1: Add shared shortcut behavior**

Wire the tested helpers into the global key handler while ignoring text-entry controls:

- `Left` / `Right`: move the playhead one frame.
- `Shift + Left` / `Shift + Right`: move the playhead one second.
- `Option/Alt + Left` / `Option/Alt + Right`: nudge the selected clip one frame.
- `Option/Alt + Shift + Left` / `Option/Alt + Shift + Right`: nudge the selected clip one second.
- `Cmd/Ctrl + C`: copy the selected clip into Pixelwave's internal clipboard.
- `Cmd/Ctrl + V`: paste the copied clip at the playhead.
- `Home` / `End`: jump to sequence start/end.
- `Escape`: stop playback and clear clip/text selection.
- `?`: open the shortcut guide.

**Step 2: Improve discoverability**

Allow `IconButton` to show a keyboard hint through its title and accessible label without changing existing callers.

### Task 3: Timeline focus controls

**Files:**
- Modify: `src/components/Timeline.jsx`
- Modify: `src/App.jsx`
- Modify: `src/styles.css`

**Step 1: Add Fit sequence**

Add a toolbar button that measures the timeline scroll viewport, calls `timelineZoomForDuration()`, updates zoom, and returns horizontal scrolling to the beginning.

**Step 2: Add Find playhead**

Add a toolbar button that smoothly centers the current playhead inside the timeline viewport without changing the playhead time.

**Step 3: Refine timeline feedback**

Show the current zoom percentage and add clear hover/focus states for both viewport controls.

### Task 4: Shortcut guide and undoable action toast

**Files:**
- Create: `src/components/ShortcutGuide.jsx`
- Create: `src/components/ActionToast.jsx`
- Modify: `src/App.jsx`
- Modify: `src/styles.css`

**Step 1: Build the shortcut guide**

Create a glass dialog grouped into Playback, Editing, and Project shortcuts. It must close with the close button, backdrop click, or `Escape`, and expose dialog semantics.

**Step 2: Build action feedback**

Create a compact toast that announces copy, paste, deletion, media removal, import completion, and export completion. Destructive project actions expose an Undo button that calls the existing history operation.

**Step 3: Keep motion restrained**

Use transform/opacity transitions and honor the existing reduced-motion rule.

### Task 5: Verification and documentation

**Files:**
- Modify: `README.md`

**Step 1: Update documentation**

Document the shortcut guide, copy/paste, frame navigation, precision nudging, Fit sequence, and Find playhead features.

**Step 2: Run full verification**

Run: `npm run check`

Expected: all Vitest files pass and the Vite production build succeeds.

**Step 3: Perform live Electron QA**

Restart the production Electron app and verify the shortcut button, shortcut dialog, timeline viewport controls, toast layout, and keyboard focus treatment visually.
