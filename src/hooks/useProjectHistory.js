import { useCallback, useRef, useState } from 'react';

const HISTORY_LIMIT = 150;

// Project state with undo/redo. The ref is the source of truth so rapid updates (drags,
// keyboard repeats) never read a stale project, and history is written outside React's
// state updaters so StrictMode double-invocation cannot record an edit twice.
export default function useProjectHistory(initialProject) {
  const [project, setProjectState] = useState(initialProject);
  const projectRef = useRef(initialProject);
  const historyRef = useRef({ past: [], future: [] });
  const [, setHistoryVersion] = useState(0);
  const [dirty, setDirty] = useState(false);

  const apply = useCallback((next) => {
    projectRef.current = next;
    setProjectState(next);
  }, []);

  const bump = useCallback(() => setHistoryVersion((value) => value + 1), []);

  const record = useCallback((snapshot, label) => {
    const history = historyRef.current;
    history.past.push({ project: snapshot, label });
    if (history.past.length > HISTORY_LIMIT) history.past.shift();
    history.future = [];
    bump();
  }, [bump]);

  const commit = useCallback((updater, label = 'Edit') => {
    const current = projectRef.current;
    const next = typeof updater === 'function' ? updater(current) : updater;
    if (!next || next === current) return current;
    record(current, label);
    apply(next);
    setDirty(true);
    return next;
  }, [apply, record]);

  const live = useCallback((updater) => {
    const current = projectRef.current;
    const next = typeof updater === 'function' ? updater(current) : updater;
    if (!next || next === current) return current;
    apply(next);
    setDirty(true);
    return next;
  }, [apply]);

  const checkpoint = useCallback((label = 'Edit') => {
    record(projectRef.current, label);
    setDirty(true);
  }, [record]);

  const undo = useCallback(() => {
    const history = historyRef.current;
    const entry = history.past.pop();
    if (!entry) return null;
    history.future.push({ project: projectRef.current, label: entry.label });
    apply(entry.project);
    setDirty(true);
    bump();
    return entry.label;
  }, [apply, bump]);

  const redo = useCallback(() => {
    const history = historyRef.current;
    const entry = history.future.pop();
    if (!entry) return null;
    history.past.push({ project: projectRef.current, label: entry.label });
    apply(entry.project);
    setDirty(true);
    bump();
    return entry.label;
  }, [apply, bump]);

  const reset = useCallback((next, { clean = true } = {}) => {
    historyRef.current = { past: [], future: [] };
    apply(next);
    setDirty(!clean);
    bump();
  }, [apply, bump]);

  const history = historyRef.current;
  return {
    project,
    projectRef,
    commit,
    live,
    checkpoint,
    undo,
    redo,
    reset,
    dirty,
    setDirty,
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
    undoLabel: history.past.at(-1)?.label || '',
    redoLabel: history.future.at(-1)?.label || '',
  };
}
