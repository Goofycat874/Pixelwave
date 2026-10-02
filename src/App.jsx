import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowsInLineHorizontal,
  BookmarkSimple,
  Camera,
  ClipboardText,
  Copy,
  CornersOut,
  CursorClick,
  DownloadSimple,
  Export,
  FilePlus,
  FilmStrip,
  FloppyDisk,
  FolderOpen,
  GridFour,
  Keyboard,
  MagnetStraight,
  Microphone,
  MusicNotes,
  Pause,
  Play,
  Repeat,
  Scissors,
  SpeakerSimpleSlash,
  TextT,
  Trash,
  Waveform,
} from '@phosphor-icons/react';
import ActionToast from './components/ActionToast.jsx';
import CommandPalette from './components/CommandPalette.jsx';
import ExportDialog from './components/ExportDialog.jsx';
import ExportProgress from './components/ExportProgress.jsx';
import Inspector from './components/inspector/Inspector.jsx';
import { presetPatch } from './components/inspector/TextTab.jsx';
import LibraryPanel from './components/LibraryPanel.jsx';
import MarkerPopover from './components/MarkerPopover.jsx';
import ShortcutGuide from './components/ShortcutGuide.jsx';
import Timeline from './components/timeline/Timeline.jsx';
import Topbar from './components/Topbar.jsx';
import { Menu } from './components/ui.jsx';
import Viewer from './components/Viewer.jsx';
import VoiceRecorder from './components/VoiceRecorder.jsx';
import useProjectHistory from './hooks/useProjectHistory.js';
import {
  adjacentEditPoint,
  appendClip,
  clipTextOverlays,
  closeGapAt,
  createClip,
  createTextClip,
  detachAudio,
  duplicateClips,
  freeLaneTrack,
  getProjectDuration,
  MAX_TIMELINE_ZOOM,
  MIN_TIMELINE_ZOOM,
  moveClips,
  pasteClipsAt,
  removeMediaFromProject,
  rippleDeleteClips,
  serializeProject,
  splitClip,
  splitClipsAt,
  stepPlayhead,
  timelineZoomForDuration,
} from './lib/editor.js';
import { exportProfile, exportTimeline, renderSnapshot } from './lib/exporter.js';
import { renderTimelineAudio } from './lib/export-audio.js';
import { createGeneratedAsset, hydrateGeneratedAsset } from './lib/generators.js';
import { formatTime, probeMedia } from './lib/media.js';
import {
  addTrack,
  CANVAS_FORMATS,
  createProject,
  isClipLocked,
  laneKind,
  MAX_TRACKS,
  normalizeProject,
  toggleTrackFlag,
} from './lib/project.js';
import { formatShortcut, isMacPlatform, isTextEntryTarget, matchesShortcut } from './lib/shortcuts.js';
import { textPreset } from './lib/text.js';
import { stepZoom } from './lib/timeline-math.js';

const TIMELINE_HEIGHT_KEY = 'pixelwave.timelineHeight.v2';
const AUTOSAVE_DELAY = 6000;
const JKL_RATES = [1, 2, 4, 8];

function readStoredNumber(key, fallback) {
  try {
    const value = Number(window.localStorage.getItem(key));
    return Number.isFinite(value) && value > 0 ? value : fallback;
  } catch {
    return fallback;
  }
}

function makeId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function readableError(error, fallback) {
  return String(error?.message || fallback)
    .replace(/^Error invoking remote method '[^']+': Error: /, '')
    .replace(/^Error: /, '');
}

function baseName(filePath) {
  return String(filePath || '').split(/[\\/]/).pop();
}

async function prepareMediaItem(item) {
  try {
    return await probeMedia(item);
  } catch (decodeError) {
    if (item.kind !== 'video' || !window.pixelwave?.createProxy) throw decodeError;
    return probeMedia(await window.pixelwave.createProxy(item));
  }
}

async function hydrateProjectMedia(project) {
  const results = await Promise.allSettled(project.media.map((item) => (
    item.generator ? Promise.resolve(hydrateGeneratedAsset(item, project)) : prepareMediaItem(item)
  )));
  return {
    media: results.map((result, index) => (result.status === 'fulfilled' ? result.value : { ...project.media[index], missing: true })),
    missing: results.filter((result) => result.status === 'rejected').length,
  };
}

function ensureTrackCount(project, kind, track) {
  const counts = project.trackCounts || { video: 3, audio: 2 };
  return track + 1 > counts[kind] ? { ...project, trackCounts: { ...counts, [kind]: Math.min(MAX_TRACKS, track + 1) } } : project;
}

// Places a new clip at the requested lane and time, or on the first free lane at the playhead.
function placeClip(project, clip, placement, playhead) {
  const kind = laneKind(clip);
  if (placement?.append) {
    const appended = appendClip(project.clips, { ...clip, track: 0 }).at(-1);
    return { project: { ...project, clips: [...project.clips, appended] }, clip: appended };
  }
  const start = Math.max(0, Math.round((placement?.time ?? playhead) * 1000) / 1000);
  const track = placement && placement.kind === kind
    ? placement.track
    : freeLaneTrack(project.clips, kind, start, clip.duration, clip.kind === 'text' ? 1 : 0);
  const placed = { ...clip, start, track };
  return { project: ensureTrackCount({ ...project, clips: [...project.clips, placed] }, kind, track), clip: placed };
}

export default function App() {
  const mac = useMemo(() => isMacPlatform(window.pixelwave?.platform === 'darwin' ? 'Mac' : globalThis.navigator?.platform), []);
  const history = useProjectHistory(createProject());
  const { project, projectRef, commit, live, checkpoint, undo, redo, reset, dirty, setDirty } = history;
  const [projectPath, setProjectPath] = useState(null);
  const [selection, setSelection] = useState({ clipIds: [], textId: null });
  const [editingText, setEditingText] = useState(null);
  const [playhead, setPlayheadState] = useState(0);
  const playheadRef = useRef(0);
  const [playing, setPlaying] = useState(false);
  const [rate, setRate] = useState(1);
  const [loop, setLoop] = useState(false);
  const [inPoint, setInPoint] = useState(null);
  const [outPoint, setOutPoint] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [tool, setTool] = useState('select');
  const [snapping, setSnapping] = useState(true);
  const [guides, setGuides] = useState(false);
  const [libraryTab, setLibraryTab] = useState('media');
  const [timelineHeight, setTimelineHeight] = useState(() => readStoredNumber(TIMELINE_HEIGHT_KEY, 340));
  const [importing, setImporting] = useState(false);
  const [mediaError, setMediaError] = useState('');
  const [notice, setNotice] = useState(null);
  const [dialog, setDialog] = useState(null);
  const [exportState, setExportState] = useState({ active: false, progress: 0, status: '' });
  const [contextMenu, setContextMenu] = useState(null);
  const [markerEdit, setMarkerEdit] = useState(null);
  const [recent, setRecent] = useState([]);
  const [restore, setRestore] = useState(null);
  const [fileDrag, setFileDrag] = useState(false);
  const [lastAutosave, setLastAutosave] = useState(null);
  const clipboard = useRef([]);
  const exportToken = useRef(null);
  const duration = useMemo(() => getProjectDuration(project.clips), [project.clips]);
  const fps = project.frameRate || 30;
  const frame = 1 / fps;
  const selectedIds = selection.clipIds;
  const selectedClips = useMemo(() => project.clips.filter((clip) => selectedIds.includes(clip.id)), [project.clips, selectedIds]);
  const primaryClip = selectedClips.at(-1) || null;

  // ---------- feedback ----------
  const showNotice = useCallback((message, options = {}) => setNotice({ id: Date.now(), message, ...options }), []);
  const closeNotice = useCallback(() => setNotice(null), []);

  // ---------- playhead ----------
  const setPlayhead = useCallback((value) => {
    const next = Math.max(0, Number(value) || 0);
    playheadRef.current = next;
    setPlayheadState(next);
  }, []);

  const seek = useCallback((time, { scrub = false } = {}) => {
    setPlaying(false);
    setRate(1);
    setPlayhead(time);
    if (!scrub) setEditingText(null);
  }, [setPlayhead]);

  const playbackRange = useCallback(() => {
    const start = loop && inPoint !== null ? inPoint : 0;
    const end = loop && outPoint !== null && outPoint > start ? outPoint : duration;
    return { start, end };
  }, [duration, inPoint, loop, outPoint]);

  const togglePlay = useCallback(() => {
    if (!projectRef.current.clips.length) return;
    setEditingText(null);
    setRate(1);
    setPlaying((value) => {
      if (value) return false;
      const { start, end } = playbackRange();
      if (playheadRef.current >= end - frame / 2 || playheadRef.current < start - frame / 2) setPlayhead(start);
      return true;
    });
  }, [frame, playbackRange, projectRef, setPlayhead]);

  const shuttle = useCallback((direction) => {
    if (!projectRef.current.clips.length) return;
    setEditingText(null);
    setRate((current) => {
      const sameDirection = Math.sign(current) === direction;
      if (!playing || !sameDirection) return direction;
      const next = JKL_RATES[Math.min(JKL_RATES.length - 1, JKL_RATES.indexOf(Math.abs(current)) + 1)];
      return next * direction;
    });
    setPlaying(true);
  }, [playing, projectRef]);

  useEffect(() => {
    if (!playing) return undefined;
    let animation = 0;
    let last = performance.now();
    const tick = (now) => {
      const delta = ((now - last) / 1000) * rate;
      last = now;
      const { start, end } = playbackRange();
      let next = playheadRef.current + delta;
      if (rate > 0 && next >= end) {
        if (loop && end > start) next = start;
        else {
          setPlayhead(end);
          setPlaying(false);
          setRate(1);
          return;
        }
      }
      if (rate < 0 && next <= 0) {
        setPlayhead(0);
        setPlaying(false);
        setRate(1);
        return;
      }
      setPlayhead(next);
      animation = requestAnimationFrame(tick);
    };
    animation = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animation);
  }, [loop, playbackRange, playing, rate, setPlayhead]);

  // ---------- selection ----------
  const selectClips = useCallback((ids, mode = 'replace') => {
    setSelection((current) => {
      if (mode === 'toggle') {
        const set = new Set(current.clipIds);
        for (const id of ids) {
          if (set.has(id)) set.delete(id);
          else set.add(id);
        }
        return { clipIds: [...set], textId: null };
      }
      if (mode === 'add') return { clipIds: [...new Set([...current.clipIds, ...ids])], textId: null };
      return { clipIds: [...ids], textId: null };
    });
    setEditingText(null);
  }, []);

  const clearSelection = useCallback(() => {
    setSelection({ clipIds: [], textId: null });
    setEditingText(null);
  }, []);

  const selectText = useCallback((clipId, textId) => {
    setSelection({ clipIds: [clipId], textId });
  }, []);

  const editText = useCallback((clipId, textId) => {
    checkpoint('Edit text');
    setSelection({ clipIds: [clipId], textId });
    setEditingText({ clipId, textId });
    setPlaying(false);
  }, [checkpoint]);

  // ---------- project mutation helpers ----------
  const liveClip = useCallback((clipId, updater) => live((current) => ({
    ...current,
    clips: current.clips.map((clip) => (clip.id === clipId ? updater(clip) : clip)),
  })), [live]);
  const commitClip = useCallback((clipId, updater, label) => commit((current) => ({
    ...current,
    clips: current.clips.map((clip) => (clip.id === clipId ? updater(clip) : clip)),
  }), label), [commit]);
  const commitClips = useCallback((ids, updater, label) => commit((current) => ({
    ...current,
    clips: current.clips.map((clip) => (ids.includes(clip.id) ? updater(clip) : clip)),
  }), label), [commit]);

  // ---------- media ----------
  const addPreparedMedia = useCallback((ready, placement = null) => {
    const placed = [];
    commit((current) => {
      let next = { ...current, media: [...current.media, ...ready] };
      if (placement) {
        let time = placement.time;
        for (const asset of ready) {
          const result = placeClip(next, createClip(asset, time), { ...placement, time }, playheadRef.current);
          next = result.project;
          placed.push(result.clip);
          time += result.clip.duration;
        }
      }
      return next;
    }, ready.length === 1 ? 'Import media' : `Import ${ready.length} files`);
    if (placed.length) setSelection({ clipIds: placed.map((clip) => clip.id), textId: null });
  }, [commit]);

  const importDescriptors = useCallback(async (descriptors, placement = null) => {
    const existing = new Set(projectRef.current.media.map((item) => item.path));
    const fresh = descriptors.filter((item) => !existing.has(item.path));
    const duplicates = descriptors.length - fresh.length;
    if (!fresh.length) {
      if (descriptors.length) showNotice('Those files are already in this project');
      return;
    }
    setImporting(true);
    setMediaError('');
    try {
      const results = await Promise.allSettled(fresh.map(prepareMediaItem));
      const ready = results.filter((result) => result.status === 'fulfilled').map((result) => result.value);
      const failed = results.length - ready.length;
      if (ready.length) {
        addPreparedMedia(ready, placement);
        setLibraryTab('media');
        showNotice(`${ready.length} ${ready.length === 1 ? 'file' : 'files'} imported${duplicates ? `, ${duplicates} already here` : ''}`);
      }
      if (failed) setMediaError(`${failed} ${failed === 1 ? 'file was' : 'files were'} skipped because they could not be decoded, even as an optimized copy.`);
    } finally {
      setImporting(false);
    }
  }, [addPreparedMedia, projectRef, showNotice]);

  const importMedia = useCallback(async () => {
    if (!window.pixelwave?.openMedia) {
      setMediaError('Importing files works in the Pixelwave desktop app.');
      return;
    }
    try {
      const picked = await window.pixelwave.openMedia();
      if (picked?.length) await importDescriptors(picked);
    } catch (error) {
      setMediaError(readableError(error, 'The media import could not be completed.'));
    }
  }, [importDescriptors]);

  const importFiles = useCallback(async (files, placement = null) => {
    if (!window.pixelwave?.pathForFile || !window.pixelwave?.registerMedia) return;
    const paths = [...files].map((file) => window.pixelwave.pathForFile(file)).filter(Boolean);
    if (!paths.length) return;
    try {
      const descriptors = await window.pixelwave.registerMedia(paths);
      if (!descriptors.length) {
        showNotice('Pixelwave can import video, audio and image files', { tone: 'error' });
        return;
      }
      await importDescriptors(descriptors, placement);
    } catch (error) {
      setMediaError(readableError(error, 'Those files could not be imported.'));
    }
  }, [importDescriptors, showNotice]);

  const addAssetToTimeline = useCallback((assetId, placement = null) => {
    const asset = projectRef.current.media.find((item) => item.id === assetId);
    if (!asset) return;
    let placed = null;
    commit((current) => {
      const clip = createClip(asset, 0, 0);
      if (asset.generator) clip.fit = 'cover';
      const result = placeClip(current, clip, placement || { append: true }, playheadRef.current);
      placed = result.clip;
      return result.project;
    }, 'Add clip');
    if (placed) {
      setSelection({ clipIds: [placed.id], textId: null });
      setPlaying(false);
      setPlayhead(placed.start);
    }
  }, [commit, projectRef, setPlayhead]);

  const addAllMedia = useCallback(() => {
    commit((current) => {
      let clips = current.clips;
      for (const asset of current.media) {
        const clip = createClip(asset, 0, 0);
        if (asset.generator) clip.fit = 'cover';
        clips = appendClip(clips, clip);
      }
      return { ...current, clips };
    }, 'Add all media');
    showNotice('Added every file to the timeline');
  }, [commit, showNotice]);

  const removeMedia = useCallback((assetId) => {
    const asset = projectRef.current.media.find((item) => item.id === assetId);
    const linked = projectRef.current.clips.filter((clip) => clip.assetId === assetId).map((clip) => clip.id);
    commit((current) => removeMediaFromProject(current, assetId), 'Remove media');
    setSelection((current) => ({ ...current, clipIds: current.clipIds.filter((id) => !linked.includes(id)) }));
    showNotice(`${asset?.name?.replace(/\.[^.]+$/, '') || 'File'} removed${linked.length ? ` with ${linked.length} ${linked.length === 1 ? 'clip' : 'clips'}` : ''}`, { actionLabel: 'Undo', onAction: undo, duration: 5200 });
  }, [commit, projectRef, showNotice, undo]);

  const revealMedia = useCallback((assetId) => {
    const asset = projectRef.current.media.find((item) => item.id === assetId);
    if (asset?.path) window.pixelwave?.revealMedia?.(asset.path);
  }, [projectRef]);

  // ---------- text and backgrounds ----------
  const addTextClip = useCallback((presetId = null, placement = null) => {
    const preset = presetId ? textPreset(presetId) : null;
    const patch = preset
      ? { ...presetPatch(preset.id), text: preset.sample }
      : { text: 'Your title', fontFamily: 'Geist', fontWeight: 700, fontSize: 84, backgroundEnabled: false, shadow: true, animationIn: 'fade', animationOut: 'fade' };
    let placed = null;
    commit((current) => {
      const result = placeClip(current, createTextClip(0, 1, patch), placement, playheadRef.current);
      placed = result.clip;
      return result.project;
    }, 'Add text');
    if (!placed) return;
    const overlay = clipTextOverlays(placed)[0];
    setPlaying(false);
    // Land a little inside the clip so an entrance animation has finished and the text is visible.
    setPlayhead(placed.start + Math.min(0.8, placed.duration / 2));
    setSelection({ clipIds: [placed.id], textId: overlay.id });
    setEditingText({ clipId: placed.id, textId: overlay.id });
  }, [commit, setPlayhead]);

  const addTextToClip = useCallback((clipId) => {
    const overlay = { id: makeId('text'), text: 'Your text', fontSize: 54, positionX: 50, positionY: 50, opacity: 100, color: '#ffffff' };
    commitClip(clipId, (clip) => ({ ...clip, textOverlays: [...(clip.textOverlays || []), overlay] }), 'Add text');
    const clip = projectRef.current.clips.find((item) => item.id === clipId);
    if (clip && (playheadRef.current < clip.start || playheadRef.current >= clip.start + clip.duration)) setPlayhead(clip.start);
    setSelection({ clipIds: [clipId], textId: overlay.id });
    setEditingText({ clipId, textId: overlay.id });
  }, [commitClip, projectRef, setPlayhead]);

  const deleteText = useCallback((clipId, textId) => {
    commitClip(clipId, (clip) => (textId === 'legacy-title'
      ? { ...clip, title: { ...clip.title, text: '' } }
      : { ...clip, textOverlays: (clip.textOverlays || []).filter((text) => text.id !== textId) }), 'Remove text');
    setSelection({ clipIds: [clipId], textId: null });
    setEditingText(null);
  }, [commitClip]);

  const addBackground = useCallback((generator, placement = null) => {
    const asset = createGeneratedAsset(generator, projectRef.current);
    let placed = null;
    commit((current) => {
      const clip = { ...createClip(asset, 0, 0), fit: 'cover' };
      const target = placement || { time: playheadRef.current, kind: 'video', track: freeLaneTrack(current.clips, 'video', playheadRef.current, clip.duration, 0) };
      const result = placeClip({ ...current, media: [...current.media, asset] }, clip, target, playheadRef.current);
      placed = result.clip;
      return result.project;
    }, 'Add background');
    if (placed) setSelection({ clipIds: [placed.id], textId: null });
  }, [commit, projectRef]);

  const addVoiceRecording = useCallback(async (blob) => {
    if (!window.pixelwave?.saveVoiceRecording) throw new Error('Voice recording works in the Pixelwave desktop app.');
    const descriptor = await window.pixelwave.saveVoiceRecording(await blob.arrayBuffer(), blob.type);
    const asset = await probeMedia(descriptor);
    let placed = null;
    commit((current) => {
      const result = placeClip({ ...current, media: [...current.media, asset] }, createClip(asset, 0, 0), null, playheadRef.current);
      placed = result.clip;
      return result.project;
    }, 'Record voiceover');
    if (placed) setSelection({ clipIds: [placed.id], textId: null });
    setPlaying(false);
  }, [commit]);

  // ---------- clip editing ----------
  const editableIds = useCallback((ids = selectedIds) => ids.filter((id) => {
    const clip = projectRef.current.clips.find((item) => item.id === id);
    return clip && !isClipLocked(projectRef.current, clip);
  }), [projectRef, selectedIds]);

  const deleteSelection = useCallback((ripple = false) => {
    if (selection.textId && primaryClip && primaryClip.kind !== 'text' && selectedIds.length === 1) {
      deleteText(primaryClip.id, selection.textId);
      return;
    }
    const ids = editableIds();
    if (!ids.length) return;
    commit((current) => ({
      ...current,
      clips: ripple ? rippleDeleteClips(current.clips, ids) : current.clips.filter((clip) => !ids.includes(clip.id)),
    }), ripple ? 'Ripple delete' : 'Delete');
    clearSelection();
    showNotice(`${ids.length === 1 ? 'Clip' : `${ids.length} clips`} removed${ripple ? ' and gap closed' : ''}`, { actionLabel: 'Undo', onAction: undo, duration: 4600 });
  }, [clearSelection, commit, deleteText, editableIds, primaryClip, selectedIds.length, selection.textId, showNotice, undo]);

  const splitAtPlayhead = useCallback(() => {
    const time = playheadRef.current;
    const current = projectRef.current;
    const under = (clip) => clip && time > clip.start + 0.05 && time < clip.start + clip.duration - 0.05 && !isClipLocked(current, clip);
    const chosen = editableIds().filter((id) => under(current.clips.find((clip) => clip.id === id)));
    const targets = chosen.length ? chosen : current.clips.filter(under).map((clip) => clip.id);
    if (!targets.length) {
      showNotice('Move the playhead over a clip to split it');
      return;
    }
    commit((value) => ({ ...value, clips: splitClipsAt(value.clips, time, targets) }), 'Split');
    clearSelection();
  }, [clearSelection, commit, editableIds, projectRef, showNotice]);

  const bladeAt = useCallback((clipId, time) => {
    commit((current) => ({ ...current, clips: splitClip(current.clips, clipId, time) }), 'Cut clip');
  }, [commit]);

  const copyClips = useCallback((clips) => {
    if (!clips.length) return;
    clipboard.current = structuredClone(clips);
    showNotice(`${clips.length === 1 ? 'Clip' : `${clips.length} clips`} copied`);
  }, [showNotice]);

  const cutClips = useCallback((ids) => {
    const clips = projectRef.current.clips.filter((clip) => ids.includes(clip.id) && !isClipLocked(projectRef.current, clip));
    if (!clips.length) return;
    clipboard.current = structuredClone(clips);
    commit((current) => ({ ...current, clips: current.clips.filter((clip) => !clips.some((cut) => cut.id === clip.id)) }), 'Cut');
    clearSelection();
  }, [clearSelection, commit, projectRef]);

  const pasteClips = useCallback((time = playheadRef.current, placement = null) => {
    const sources = clipboard.current.filter((clip) => clip.kind === 'text' || projectRef.current.media.some((asset) => asset.id === clip.assetId));
    if (!sources.length) {
      showNotice(clipboard.current.length ? 'The copied media is no longer in this project' : 'Copy a clip first');
      return;
    }
    const pasted = pasteClipsAt(sources, time).map((clip) => (
      placement && sources.length === 1 && laneKind(clip) === placement.kind ? { ...clip, track: placement.track } : clip
    ));
    commit((current) => ({ ...current, clips: [...current.clips, ...pasted] }), 'Paste');
    setSelection({ clipIds: pasted.map((clip) => clip.id), textId: null });
    setPlaying(false);
  }, [commit, projectRef, showNotice]);

  const duplicateSelection = useCallback(() => {
    const ids = editableIds();
    if (!ids.length) return;
    let created = [];
    commit((current) => {
      const result = duplicateClips(current.clips, ids);
      created = result.created;
      return { ...current, clips: result.clips };
    }, 'Duplicate');
    if (created.length) setSelection({ clipIds: created.map((clip) => clip.id), textId: null });
  }, [commit, editableIds]);

  const nudgeSelection = useCallback((direction, large = false) => {
    const ids = editableIds();
    if (!ids.length) return;
    commit((current) => ({ ...current, clips: moveClips(current.clips, ids, direction * (large ? 1 : frame)) }), 'Nudge');
  }, [commit, editableIds, frame]);

  const detachClipAudio = useCallback((clipId) => {
    let created = null;
    commit((current) => {
      const clip = current.clips.find((item) => item.id === clipId);
      if (!clip) return current;
      const track = freeLaneTrack(current.clips, 'audio', clip.start, clip.duration, 0);
      const result = detachAudio(current.clips, clipId, track);
      created = result.audioClip;
      return ensureTrackCount({ ...current, clips: result.clips }, 'audio', track);
    }, 'Detach audio');
    if (created) {
      setSelection({ clipIds: [created.id], textId: null });
      showNotice('Audio moved to its own track');
    }
  }, [commit, showNotice]);

  const toggleClipMute = useCallback(() => {
    const ids = editableIds();
    if (!ids.length) return;
    const muted = !selectedClips.every((clip) => clip.muted);
    commitClips(ids, (clip) => ({ ...clip, muted }), muted ? 'Mute' : 'Unmute');
  }, [commitClips, editableIds, selectedClips]);

  // ---------- markers ----------
  const addMarker = useCallback((time = playheadRef.current) => {
    const existing = (projectRef.current.markers || []).find((marker) => Math.abs(marker.time - time) < frame / 2);
    if (existing) return existing;
    const marker = { id: makeId('marker'), time: Math.round(time * 1000) / 1000, label: '', color: '#f2b33d' };
    commit((current) => ({ ...current, markers: [...(current.markers || []), marker].sort((a, b) => a.time - b.time) }), 'Add marker');
    return marker;
  }, [commit, frame, projectRef]);

  const jumpMarker = useCallback((direction) => {
    const markers = [...(projectRef.current.markers || [])].sort((a, b) => a.time - b.time);
    const target = direction > 0
      ? markers.find((marker) => marker.time > playheadRef.current + 0.001)
      : [...markers].reverse().find((marker) => marker.time < playheadRef.current - 0.001);
    if (target) seek(target.time);
  }, [projectRef, seek]);

  // ---------- project files ----------
  const refreshRecent = useCallback(() => {
    window.pixelwave?.listRecentProjects?.().then(setRecent).catch(() => {});
  }, []);

  const saveProject = useCallback(async (saveAs = false) => {
    if (!window.pixelwave?.saveProject) return;
    try {
      const path = await window.pixelwave.saveProject(serializeProject(projectRef.current), projectPath, { saveAs });
      if (path) {
        setProjectPath(path);
        setDirty(false);
        setLastAutosave(null);
        showNotice(`Saved ${baseName(path)}`);
        refreshRecent();
      }
    } catch (error) {
      showNotice(readableError(error, 'The project could not be saved.'), { tone: 'error', duration: 6000 });
    }
  }, [projectPath, projectRef, refreshRecent, setDirty, showNotice]);

  const loadProject = useCallback(async (raw, filePath, { clean = true } = {}) => {
    setImporting(true);
    try {
      const normalized = normalizeProject(raw);
      const { media, missing } = await hydrateProjectMedia(normalized);
      reset({ ...normalized, media }, { clean });
      setProjectPath(filePath || null);
      clearSelection();
      setPlayhead(0);
      setPlaying(false);
      setInPoint(null);
      setOutPoint(null);
      setRestore(null);
      if (missing) showNotice(`${missing} media ${missing === 1 ? 'file is' : 'files are'} missing, so their clips show as empty.`, { tone: 'error', duration: 7000 });
    } finally {
      setImporting(false);
    }
  }, [clearSelection, reset, setPlayhead, showNotice]);

  const confirmDiscard = useCallback(() => !dirty || window.confirm('Discard unsaved changes to this project?'), [dirty]);

  const openProject = useCallback(async (filePath = null) => {
    if (!window.pixelwave?.openProject || !confirmDiscard()) return;
    try {
      const loaded = await window.pixelwave.openProject(filePath);
      if (loaded) await loadProject(loaded.project, loaded.filePath);
      refreshRecent();
    } catch (error) {
      showNotice(readableError(error, 'The project could not be opened.'), { tone: 'error', duration: 6000 });
    }
  }, [confirmDiscard, loadProject, refreshRecent, showNotice]);

  const newProject = useCallback(() => {
    if (!confirmDiscard()) return;
    const current = projectRef.current;
    reset(createProject({ width: current.width, height: current.height, frameRate: current.frameRate }));
    setProjectPath(null);
    clearSelection();
    setPlayhead(0);
    setInPoint(null);
    setOutPoint(null);
    window.pixelwave?.clearAutosave?.();
  }, [clearSelection, confirmDiscard, projectRef, reset, setPlayhead]);

  const setCanvas = useCallback((format) => {
    commit((current) => ({ ...current, width: format.width, height: format.height }), `Canvas: ${format.label}`);
  }, [commit]);

  useEffect(() => {
    refreshRecent();
    window.pixelwave?.readAutosave?.().then((saved) => {
      if (saved?.project && (saved.project.clips?.length || saved.project.media?.length)) {
        setRestore({ savedAt: saved.savedAt, name: saved.project.name, project: saved.project, filePath: saved.project.filePath || null });
      }
    }).catch(() => {});
  }, [refreshRecent]);

  useEffect(() => {
    if (!dirty || !window.pixelwave?.writeAutosave) return undefined;
    const timeout = window.setTimeout(() => {
      window.pixelwave.writeAutosave({ ...serializeProject(projectRef.current), filePath: projectPath })
        .then((written) => { if (written) setLastAutosave(new Date()); })
        .catch(() => {});
    }, AUTOSAVE_DELAY);
    return () => window.clearTimeout(timeout);
  }, [dirty, project, projectPath, projectRef]);

  useEffect(() => {
    window.onbeforeunload = dirty ? (event) => {
      event.returnValue = false;
      return false;
    } : null;
    return () => { window.onbeforeunload = null; };
  }, [dirty]);

  // ---------- export ----------
  const runExport = useCallback(async (settings) => {
    setDialog(null);
    setPlaying(false);
    const snapshot = projectRef.current;
    const profile = exportProfile(settings.format);
    const suggestedName = `${snapshot.name || 'Pixelwave export'}.${profile.extension}`;
    const token = {
      cancelled: false,
      jobId: null,
      cancel() {
        this.cancelled = true;
        if (this.jobId) window.pixelwave?.cancelExport(this.jobId).catch(() => {});
      },
    };
    exportToken.current = token;
    const finished = (path) => {
      setExportState({ active: false, progress: 0, status: '' });
      if (path) showNotice(`Exported ${baseName(path)}`, { actionLabel: 'Show file', onAction: () => window.pixelwave.revealMedia(path), duration: 7000 });
    };
    try {
      if (!window.pixelwave?.beginExport) throw new Error('Exporting works in the Pixelwave desktop app.');
      if (settings.kind === 'audio') {
        setExportState({ active: true, progress: 0.2, status: 'Mixing audio' });
        const wav = await renderTimelineAudio(snapshot, settings.range);
        if (!wav) throw new Error('There is no audible clip in that range.');
        if (token.cancelled) throw new Error('Export cancelled.');
        setExportState({ active: true, progress: 0.7, status: `Saving ${profile.label}` });
        finished(await window.pixelwave.exportAudio(wav, { format: settings.format, suggestedName }));
        return;
      }
      setExportState({ active: true, progress: 0, status: 'Preparing', detail: settings.kind === 'video' ? 'Mixing the soundtrack.' : 'Getting frames ready.' });
      const audioBytes = settings.kind === 'video' ? await renderTimelineAudio(snapshot, settings.range) : null;
      if (token.cancelled) throw new Error('Export cancelled.');
      setExportState({ active: true, progress: 0, status: 'Choose where to save' });
      const session = await window.pixelwave.beginExport({
        format: settings.format,
        width: settings.width,
        height: settings.height,
        frameRate: settings.frameRate,
        quality: settings.quality,
        suggestedName,
        audioBytes,
      });
      if (!session) {
        finished(null);
        return;
      }
      token.jobId = session.jobId;
      const started = performance.now();
      await exportTimeline({
        project: snapshot,
        width: settings.width,
        height: settings.height,
        frameRate: settings.frameRate,
        range: settings.range,
        cancelToken: token,
        onFrame: (bytes) => window.pixelwave.writeExportFrame(session.jobId, bytes),
        onProgress: (progress) => {
          const elapsed = (performance.now() - started) / 1000;
          setExportState({
            active: true,
            progress,
            status: `Exporting ${profile.label}`,
            detail: `${settings.width} × ${settings.height} at ${settings.frameRate} fps. Keep Pixelwave open until it finishes.`,
            etaSeconds: progress > 0 ? (elapsed / progress) * (1 - progress) : null,
          });
        },
      });
      if (token.cancelled) throw new Error('Export cancelled.');
      setExportState({ active: true, progress: 1, status: 'Finishing file' });
      const path = await window.pixelwave.finishExport(session.jobId);
      token.jobId = null;
      finished(path);
    } catch (error) {
      if (token.jobId) await window.pixelwave.cancelExport(token.jobId).catch(() => {});
      setExportState({ active: false, progress: 0, status: '' });
      if (readableError(error, '') !== 'Export cancelled.') showNotice(readableError(error, 'The export could not be completed.'), { tone: 'error', duration: 8000 });
    } finally {
      exportToken.current = null;
    }
  }, [projectRef, showNotice]);

  const saveSnapshot = useCallback(async () => {
    if (!projectRef.current.clips.length || !window.pixelwave?.exportImage) return;
    try {
      const bytes = await renderSnapshot(projectRef.current, playheadRef.current);
      const name = `${projectRef.current.name || 'Pixelwave'} ${formatTime(playheadRef.current, true, fps).replace(/:/g, '-')}.png`;
      const path = await window.pixelwave.exportImage(bytes, { suggestedName: name });
      if (path) showNotice(`Saved ${baseName(path)}`, { actionLabel: 'Show file', onAction: () => window.pixelwave.revealMedia(path) });
    } catch (error) {
      showNotice(readableError(error, 'The frame could not be saved.'), { tone: 'error' });
    }
  }, [fps, projectRef, showNotice]);

  // ---------- timeline helpers ----------
  const fitTimeline = useCallback(() => {
    const width = document.querySelector('.timeline-scroll')?.clientWidth || 1200;
    setZoom(timelineZoomForDuration(duration, width));
  }, [duration]);

  const handleTimelineDrop = useCallback((dataTransfer, target) => {
    const assetId = dataTransfer.getData('application/x-pixelwave-media');
    if (assetId) {
      addAssetToTimeline(assetId, target);
      return;
    }
    const preset = dataTransfer.getData('application/x-pixelwave-preset');
    if (preset) {
      try {
        const payload = JSON.parse(preset);
        const videoTarget = target.kind === 'video' ? target : { ...target, kind: 'video', track: payload.type === 'text' ? 1 : 0 };
        if (payload.type === 'text') addTextClip(payload.presetId, videoTarget);
        if (payload.type === 'background') addBackground(payload.generator, videoTarget);
      } catch {
        // Ignore malformed drag payloads.
      }
      return;
    }
    if (dataTransfer.files?.length) importFiles(dataTransfer.files, target);
  }, [addAssetToTimeline, addBackground, addTextClip, importFiles]);

  const startTimelineResize = useCallback((event) => {
    event.preventDefault();
    const startY = event.clientY;
    const startHeight = timelineHeight;
    let latest = startHeight;
    const move = (moveEvent) => {
      latest = Math.round(Math.min(window.innerHeight - 300, Math.max(190, startHeight - (moveEvent.clientY - startY))));
      setTimelineHeight(latest);
    };
    const stop = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', stop);
      try {
        window.localStorage.setItem(TIMELINE_HEIGHT_KEY, String(latest));
      } catch {
        // Panel size is a convenience; ignore storage failures.
      }
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', stop);
  }, [timelineHeight]);

  // ---------- commands ----------
  const hasSelection = selectedIds.length > 0;
  const runUndo = useCallback(() => {
    const label = undo();
    if (label) showNotice(`Undid ${label.toLowerCase()}`, { duration: 1800 });
  }, [showNotice, undo]);
  const runRedo = useCallback(() => {
    const label = redo();
    if (label) showNotice(`Redid ${label.toLowerCase()}`, { duration: 1800 });
  }, [redo, showNotice]);

  const commands = useMemo(() => [
    { id: 'play', label: playing ? 'Pause' : 'Play', group: 'Playback', keys: ['space'], icon: playing ? Pause : Play, run: togglePlay },
    { id: 'shuttle-forward', label: 'Play forward, press again to go faster', group: 'Playback', keys: ['l'], run: () => shuttle(1) },
    { id: 'shuttle-stop', label: 'Stop', group: 'Playback', keys: ['k'], run: () => { setPlaying(false); setRate(1); } },
    { id: 'shuttle-back', label: 'Play backward', group: 'Playback', keys: ['j'], run: () => shuttle(-1) },
    { id: 'frame-back', label: 'Back one frame', group: 'Playback', keys: ['arrowleft'], run: () => seek(stepPlayhead(playheadRef.current, -1, Number.POSITIVE_INFINITY, fps)) },
    { id: 'frame-forward', label: 'Forward one frame', group: 'Playback', keys: ['arrowright'], run: () => seek(stepPlayhead(playheadRef.current, 1, Number.POSITIVE_INFINITY, fps)) },
    { id: 'second-back', label: 'Back one second', group: 'Playback', keys: ['shift+arrowleft'], run: () => seek(stepPlayhead(playheadRef.current, -1, Number.POSITIVE_INFINITY, fps, true)) },
    { id: 'second-forward', label: 'Forward one second', group: 'Playback', keys: ['shift+arrowright'], run: () => seek(stepPlayhead(playheadRef.current, 1, Number.POSITIVE_INFINITY, fps, true)) },
    { id: 'previous-edit', label: 'Previous cut', group: 'Playback', keys: ['arrowup'], run: () => seek(adjacentEditPoint(projectRef.current.clips, playheadRef.current, -1)) },
    { id: 'next-edit', label: 'Next cut', group: 'Playback', keys: ['arrowdown'], run: () => seek(adjacentEditPoint(projectRef.current.clips, playheadRef.current, 1)) },
    { id: 'previous-marker', label: 'Previous marker', group: 'Playback', keys: ['shift+arrowup'], run: () => jumpMarker(-1) },
    { id: 'next-marker', label: 'Next marker', group: 'Playback', keys: ['shift+arrowdown'], run: () => jumpMarker(1) },
    { id: 'start', label: 'Go to start', group: 'Playback', keys: ['home'], run: () => seek(0) },
    { id: 'end', label: 'Go to end', group: 'Playback', keys: ['end'], run: () => seek(duration) },
    { id: 'set-in', label: 'Set in point', group: 'Playback', keys: ['i'], run: () => { setInPoint(playheadRef.current); if (outPoint !== null && outPoint <= playheadRef.current) setOutPoint(null); } },
    { id: 'set-out', label: 'Set out point', group: 'Playback', keys: ['o'], run: () => { setOutPoint(playheadRef.current); if (inPoint !== null && inPoint >= playheadRef.current) setInPoint(null); } },
    { id: 'clear-range', label: 'Clear in and out points', group: 'Playback', keys: ['alt+x'], run: () => { setInPoint(null); setOutPoint(null); } },
    { id: 'loop', label: loop ? 'Turn off looping' : 'Loop playback', group: 'Playback', keys: ['mod+l'], icon: Repeat, run: () => setLoop((value) => !value) },

    { id: 'undo', label: history.undoLabel ? `Undo ${history.undoLabel.toLowerCase()}` : 'Undo', group: 'Edit', keys: ['mod+z'], enabled: history.canUndo, run: runUndo },
    { id: 'redo', label: history.redoLabel ? `Redo ${history.redoLabel.toLowerCase()}` : 'Redo', group: 'Edit', keys: ['mod+shift+z', 'mod+y'], enabled: history.canRedo, run: runRedo },
    { id: 'split', label: 'Split at playhead', group: 'Edit', keys: ['s'], icon: Scissors, run: splitAtPlayhead },
    { id: 'delete', label: 'Delete', group: 'Edit', keys: ['delete', 'backspace'], icon: Trash, enabled: hasSelection, run: () => deleteSelection(false) },
    { id: 'ripple-delete', label: 'Ripple delete', group: 'Edit', keys: ['shift+delete', 'shift+backspace'], icon: ArrowsInLineHorizontal, enabled: hasSelection, run: () => deleteSelection(true) },
    { id: 'cut', label: 'Cut', group: 'Edit', keys: ['mod+x'], enabled: hasSelection, run: () => cutClips(selectedIds) },
    { id: 'copy', label: 'Copy', group: 'Edit', keys: ['mod+c'], icon: Copy, enabled: hasSelection, run: () => copyClips(selectedClips) },
    { id: 'paste', label: 'Paste at playhead', group: 'Edit', keys: ['mod+v'], icon: ClipboardText, run: () => pasteClips() },
    { id: 'duplicate', label: 'Duplicate', group: 'Edit', keys: ['mod+d'], enabled: hasSelection, run: duplicateSelection },
    { id: 'select-all', label: 'Select all clips', group: 'Edit', keys: ['mod+a'], run: () => selectClips(projectRef.current.clips.filter((clip) => !isClipLocked(projectRef.current, clip)).map((clip) => clip.id)) },
    { id: 'deselect', label: 'Clear selection', group: 'Edit', keys: ['escape'], run: () => {
      if (editingText) setEditingText(null);
      else if (selectedIds.length) clearSelection();
      else { setPlaying(false); setRate(1); }
    } },
    { id: 'nudge-left', label: 'Nudge left one frame', group: 'Edit', keys: ['alt+arrowleft'], enabled: hasSelection, run: () => nudgeSelection(-1) },
    { id: 'nudge-right', label: 'Nudge right one frame', group: 'Edit', keys: ['alt+arrowright'], enabled: hasSelection, run: () => nudgeSelection(1) },
    { id: 'nudge-left-big', label: 'Nudge left one second', group: 'Edit', keys: ['alt+shift+arrowleft'], enabled: hasSelection, run: () => nudgeSelection(-1, true) },
    { id: 'nudge-right-big', label: 'Nudge right one second', group: 'Edit', keys: ['alt+shift+arrowright'], enabled: hasSelection, run: () => nudgeSelection(1, true) },
    { id: 'mute-clip', label: 'Mute or unmute clip', group: 'Edit', keys: ['shift+m'], icon: SpeakerSimpleSlash, enabled: hasSelection, run: toggleClipMute },
    { id: 'detach-audio', label: 'Detach audio', group: 'Edit', icon: Waveform, enabled: primaryClip?.kind === 'video' && !primaryClip?.muted, run: () => primaryClip && detachClipAudio(primaryClip.id) },

    { id: 'tool-select', label: 'Select tool', group: 'Timeline', keys: ['v'], icon: CursorClick, run: () => setTool('select') },
    { id: 'tool-blade', label: 'Blade tool', group: 'Timeline', keys: ['b'], icon: Scissors, run: () => setTool('blade') },
    { id: 'snapping', label: snapping ? 'Turn off snapping' : 'Turn on snapping', group: 'Timeline', keys: ['n'], icon: MagnetStraight, run: () => setSnapping((value) => !value) },
    { id: 'marker', label: 'Add marker', group: 'Timeline', keys: ['m'], icon: BookmarkSimple, run: () => addMarker() },
    { id: 'zoom-in', label: 'Zoom in', group: 'Timeline', keys: ['=', 'mod+='], run: () => setZoom((value) => Math.min(MAX_TIMELINE_ZOOM, stepZoom(value, 1))) },
    { id: 'zoom-out', label: 'Zoom out', group: 'Timeline', keys: ['-', 'mod+-'], run: () => setZoom((value) => Math.max(MIN_TIMELINE_ZOOM, stepZoom(value, -1))) },
    { id: 'zoom-fit', label: 'Fit timeline to window', group: 'Timeline', keys: ['shift+z'], icon: CornersOut, run: fitTimeline },
    { id: 'add-video-track', label: 'Add video track', group: 'Timeline', icon: FilmStrip, run: () => commit((current) => addTrack(current, 'video'), 'Add track') },
    { id: 'add-audio-track', label: 'Add audio track', group: 'Timeline', icon: MusicNotes, run: () => commit((current) => addTrack(current, 'audio'), 'Add track') },

    { id: 'add-text', label: 'Add text', group: 'Add', keys: ['t'], icon: TextT, run: () => addTextClip() },
    { id: 'import', label: 'Import media', group: 'Add', keys: ['mod+i'], icon: DownloadSimple, global: true, run: importMedia },
    { id: 'record', label: 'Record voiceover', group: 'Add', keys: ['r'], icon: Microphone, run: () => setDialog('voice') },

    { id: 'new', label: 'New project', group: 'Project', keys: ['mod+n'], icon: FilePlus, global: true, run: newProject },
    { id: 'open', label: 'Open project', group: 'Project', keys: ['mod+o'], icon: FolderOpen, global: true, run: () => openProject() },
    { id: 'save', label: 'Save project', group: 'Project', keys: ['mod+s'], icon: FloppyDisk, global: true, run: () => saveProject(false) },
    { id: 'save-as', label: 'Save project as', group: 'Project', keys: ['mod+shift+s'], icon: FloppyDisk, global: true, run: () => saveProject(true) },
    { id: 'export', label: 'Export video', group: 'Project', keys: ['mod+e'], icon: Export, global: true, enabled: project.clips.length > 0, run: () => setDialog('export') },
    { id: 'snapshot', label: 'Save frame as image', group: 'Project', icon: Camera, enabled: project.clips.length > 0, run: saveSnapshot },
    ...CANVAS_FORMATS.map((format) => ({
      id: `canvas-${format.id}`,
      label: `Canvas: ${format.label} ${format.ratio}`,
      group: 'Project',
      keywords: [format.detail, 'aspect', 'resolution', 'size'],
      run: () => setCanvas(format),
    })),

    { id: 'palette', label: 'Search actions', group: 'View', keys: ['mod+k', 'mod+shift+p'], global: true, palette: false, run: () => setDialog('palette') },
    { id: 'shortcuts', label: 'Keyboard shortcuts', group: 'View', keys: ['?'], icon: Keyboard, run: () => setDialog('shortcuts') },
    { id: 'guides', label: guides ? 'Hide guides' : 'Show guides', group: 'View', keys: ["'"], icon: GridFour, run: () => setGuides((value) => !value) },
    { id: 'fullscreen', label: 'Full screen viewer', group: 'View', keys: ['f'], icon: CornersOut, run: () => {
      if (document.fullscreenElement) document.exitFullscreen?.();
      else document.querySelector('.viewer')?.requestFullscreen?.();
    } },
    { id: 'media-tab', label: 'Show media library', group: 'View', run: () => setLibraryTab('media') },
    { id: 'text-tab', label: 'Show text styles', group: 'View', run: () => setLibraryTab('text') },
    { id: 'backgrounds-tab', label: 'Show backgrounds', group: 'View', run: () => setLibraryTab('backgrounds') },
  ], [addMarker, addTextClip, clearSelection, commit, copyClips, cutClips, deleteSelection, detachClipAudio, duplicateSelection, duration, editingText, fitTimeline, fps, guides, hasSelection, history.canRedo, history.canUndo, history.redoLabel, history.undoLabel, importMedia, inPoint, jumpMarker, loop, newProject, nudgeSelection, openProject, outPoint, pasteClips, playing, primaryClip, project.clips.length, projectRef, runRedo, runUndo, saveProject, saveSnapshot, seek, selectClips, selectedClips, selectedIds, setCanvas, shuttle, snapping, splitAtPlayhead, toggleClipMute, togglePlay]);

  const commandsRef = useRef(commands);
  commandsRef.current = commands;
  const overlayOpen = Boolean(dialog || contextMenu || markerEdit || exportState.active);
  const overlayRef = useRef(overlayOpen);
  overlayRef.current = overlayOpen;

  useEffect(() => {
    const onKeyDown = (event) => {
      if (overlayRef.current || event.defaultPrevented) return;
      const typing = isTextEntryTarget(event.target);
      const onSlider = event.target?.type === 'range' && event.key.startsWith('Arrow');
      for (const command of commandsRef.current) {
        if (!command.keys?.some((key) => matchesShortcut(event, key, mac))) continue;
        if ((typing && !command.global) || onSlider) return;
        event.preventDefault();
        if (command.enabled !== false) command.run();
        return;
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [mac]);

  useEffect(() => {
    const hasFiles = (event) => event.dataTransfer?.types?.includes('Files');
    let depth = 0;
    const enter = (event) => {
      if (!hasFiles(event)) return;
      depth += 1;
      setFileDrag(true);
    };
    const leave = (event) => {
      if (!hasFiles(event)) return;
      depth = Math.max(0, depth - 1);
      if (!depth) setFileDrag(false);
    };
    const over = (event) => { if (hasFiles(event)) event.preventDefault(); };
    const drop = (event) => {
      depth = 0;
      setFileDrag(false);
      if (!hasFiles(event)) return;
      event.preventDefault();
      importFiles(event.dataTransfer.files);
    };
    window.addEventListener('dragenter', enter);
    window.addEventListener('dragleave', leave);
    window.addEventListener('dragover', over);
    window.addEventListener('drop', drop);
    return () => {
      window.removeEventListener('dragenter', enter);
      window.removeEventListener('dragleave', leave);
      window.removeEventListener('dragover', over);
      window.removeEventListener('drop', drop);
    };
  }, [importFiles]);

  const commandById = (id) => commands.find((command) => command.id === id);
  const shortcutLabel = (id) => {
    const key = commandById(id)?.keys?.[0];
    return key ? formatShortcut(key, mac) : '';
  };
  const shortcutLabels = {
    split: shortcutLabel('split'),
    delete: shortcutLabel('delete'),
    rippleDelete: shortcutLabel('ripple-delete'),
    marker: shortcutLabel('marker'),
    text: shortcutLabel('add-text'),
    select: shortcutLabel('tool-select'),
    blade: shortcutLabel('tool-blade'),
    snapping: shortcutLabel('snapping'),
    fit: shortcutLabel('zoom-fit'),
    guides: shortcutLabel('guides'),
    fullscreen: shortcutLabel('fullscreen'),
    loop: shortcutLabel('loop'),
    undo: shortcutLabel('undo'),
    redo: shortcutLabel('redo'),
    palette: shortcutLabel('palette'),
    import: shortcutLabel('import'),
  };
  const menuItem = (id, overrides = {}) => {
    const command = commandById(id);
    return command ? {
      id,
      label: command.label,
      icon: command.icon,
      shortcut: command.keys?.[0] ? formatShortcut(command.keys[0], mac) : '',
      disabled: command.enabled === false,
      onSelect: command.run,
      ...overrides,
    } : null;
  };

  // ---------- context menus ----------
  const openClipMenu = (event, clip) => {
    const ids = selectedIds.includes(clip.id) ? selectedIds : [clip.id];
    if (!selectedIds.includes(clip.id)) setSelection({ clipIds: [clip.id], textId: null });
    const targets = project.clips.filter((item) => ids.includes(item.id));
    const under = playheadRef.current > clip.start && playheadRef.current < clip.start + clip.duration;
    setContextMenu({
      x: event.clientX,
      y: event.clientY,
      items: [
        { id: 'cut', label: 'Cut', shortcut: formatShortcut('mod+x', mac), onSelect: () => cutClips(ids) },
        { id: 'copy', label: 'Copy', icon: Copy, shortcut: formatShortcut('mod+c', mac), onSelect: () => copyClips(targets) },
        menuItem('paste'),
        { id: 'duplicate', label: 'Duplicate', shortcut: formatShortcut('mod+d', mac), onSelect: () => {
          let created = [];
          commit((current) => {
            const result = duplicateClips(current.clips, ids);
            created = result.created;
            return { ...current, clips: result.clips };
          }, 'Duplicate');
          if (created.length) setSelection({ clipIds: created.map((item) => item.id), textId: null });
        } },
        { separator: true },
        { id: 'split-here', label: 'Split at playhead', icon: Scissors, shortcut: 'S', disabled: !under, onSelect: () => commit((current) => ({ ...current, clips: splitClip(current.clips, clip.id, playheadRef.current) }), 'Split') },
        clip.kind === 'video' && { id: 'detach', label: 'Detach audio', icon: Waveform, disabled: clip.muted, onSelect: () => detachClipAudio(clip.id) },
        (clip.kind === 'video' || clip.kind === 'audio') && { id: 'mute', label: clip.muted ? 'Unmute clip' : 'Mute clip', icon: SpeakerSimpleSlash, onSelect: () => commitClip(clip.id, (item) => ({ ...item, muted: !item.muted }), clip.muted ? 'Unmute' : 'Mute') },
        {
          id: 'fades',
          label: clip.fadeIn || clip.fadeOut ? 'Remove fades' : 'Fade in and out',
          onSelect: () => commitClip(clip.id, (item) => (item.fadeIn || item.fadeOut
            ? { ...item, fadeIn: 0, fadeOut: 0 }
            : { ...item, fadeIn: Math.min(0.5, item.duration / 3), fadeOut: Math.min(0.5, item.duration / 3) }), 'Fades'),
        },
        (clip.kind === 'video' || clip.kind === 'image') && { id: 'add-text-clip', label: 'Add text on this clip', icon: TextT, onSelect: () => addTextToClip(clip.id) },
        { separator: true },
        { id: 'delete', label: 'Delete', icon: Trash, danger: true, shortcut: formatShortcut('delete', mac), onSelect: () => {
          commit((current) => ({ ...current, clips: current.clips.filter((item) => !ids.includes(item.id)) }), 'Delete');
          clearSelection();
        } },
        { id: 'ripple-delete', label: 'Ripple delete', icon: ArrowsInLineHorizontal, danger: true, onSelect: () => {
          commit((current) => ({ ...current, clips: rippleDeleteClips(current.clips, ids) }), 'Ripple delete');
          clearSelection();
        } },
      ],
    });
  };

  const openLaneMenu = (event, target) => {
    const lane = target.kind ? { kind: target.kind, track: target.track } : null;
    setContextMenu({
      x: event.clientX,
      y: event.clientY,
      items: [
        { id: 'paste-here', label: 'Paste here', icon: ClipboardText, disabled: !clipboard.current.length, onSelect: () => pasteClips(target.time, lane) },
        { id: 'text-here', label: 'Add text here', icon: TextT, onSelect: () => addTextClip(null, lane?.kind === 'video' ? { time: target.time, ...lane } : { time: target.time, kind: 'video', track: 1 }) },
        { id: 'marker-here', label: 'Add marker here', icon: BookmarkSimple, onSelect: () => addMarker(target.time) },
        lane && { id: 'close-gap', label: 'Close gap', icon: ArrowsInLineHorizontal, onSelect: () => commit((current) => ({ ...current, clips: closeGapAt(current.clips, lane.kind, lane.track, target.time) }), 'Close gap') },
        { separator: true },
        { id: 'seek-here', label: 'Move playhead here', onSelect: () => seek(target.time) },
      ],
    });
  };

  const openMarkerMenu = (event, marker) => {
    setContextMenu({
      x: event.clientX,
      y: event.clientY,
      items: [
        { id: 'marker-edit', label: 'Rename marker', onSelect: () => setMarkerEdit({ markerId: marker.id, rect: { left: event.clientX, right: event.clientX, top: event.clientY, bottom: event.clientY } }) },
        { id: 'marker-jump', label: 'Move playhead here', onSelect: () => seek(marker.time) },
        { separator: true },
        { id: 'marker-delete', label: 'Delete marker', icon: Trash, danger: true, onSelect: () => commit((current) => ({ ...current, markers: current.markers.filter((item) => item.id !== marker.id) }), 'Delete marker') },
      ],
    });
  };

  // ---------- render ----------
  const status = dirty
    ? { label: lastAutosave ? `Edited, autosaved ${lastAutosave.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : 'Edited', tone: 'dirty' }
    : projectPath ? { label: 'Saved', tone: 'saved' } : { label: 'Not saved yet', tone: 'idle' };

  const fileMenu = [
    menuItem('new'),
    menuItem('open'),
    recent.length > 0 && { heading: 'Recent' },
    ...recent.slice(0, 5).map((item) => ({ id: `recent-${item.path}`, label: item.name, detail: item.missing ? 'missing' : '', disabled: item.missing, onSelect: () => openProject(item.path) })),
    { separator: true },
    menuItem('save'),
    menuItem('save-as'),
    { separator: true },
    menuItem('import'),
    menuItem('export'),
    menuItem('snapshot'),
  ];

  const inspectorHandlers = {
    onBeginEdit: checkpoint,
    onLiveClip: liveClip,
    onCommitClip: commitClip,
    onCommitClips: commitClips,
    onCommitProject: commit,
    onLiveProject: live,
    onSeek: (time) => seek(time),
    onDetachAudio: detachClipAudio,
    onAddTextToClip: addTextToClip,
    onSelectText: selectText,
    onDeleteText: deleteText,
    onDeleteSelected: () => deleteSelection(false),
    onRippleDelete: () => deleteSelection(true),
  };

  const usage = useMemo(() => {
    const counts = new Map();
    for (const clip of project.clips) counts.set(clip.assetId, (counts.get(clip.assetId) || 0) + 1);
    return counts;
  }, [project.clips]);

  const markerBeingEdited = markerEdit ? (project.markers || []).find((marker) => marker.id === markerEdit.markerId) : null;

  return (
    <div className="app">
      <Topbar
        projectName={project.name}
        status={status}
        mac={mac}
        canUndo={history.canUndo}
        canRedo={history.canRedo}
        undoLabel={history.undoLabel}
        redoLabel={history.redoLabel}
        shortcuts={shortcutLabels}
        fileMenu={fileMenu}
        canExport={project.clips.length > 0}
        onRename={(name) => live((current) => ({ ...current, name }))}
        onUndo={runUndo}
        onRedo={runRedo}
        onOpenPalette={() => setDialog('palette')}
        onOpenShortcuts={() => setDialog('shortcuts')}
        onExport={() => setDialog('export')}
      />
      <main className="workspace" style={{ '--timeline-height': `${timelineHeight}px` }}>
        <LibraryPanel
          tab={libraryTab}
          onTab={setLibraryTab}
          media={project.media}
          importing={importing}
          error={mediaError}
          usage={usage}
          onImport={importMedia}
          onAddToTimeline={(assetId) => addAssetToTimeline(assetId)}
          onReveal={revealMedia}
          onRemove={removeMedia}
          onRecordVoice={() => setDialog('voice')}
          onAddText={(presetId) => addTextClip(presetId)}
          onAddBackground={(generator) => addBackground(generator)}
        />
        <Viewer
          project={project}
          playhead={playhead}
          playing={playing && rate > 0}
          rate={rate}
          duration={duration}
          loop={loop}
          inPoint={inPoint}
          outPoint={outPoint}
          guides={guides}
          selectedClipIds={selectedIds}
          selectedTextId={selection.textId}
          editingText={editingText}
          shortcuts={shortcutLabels}
          onTogglePlay={togglePlay}
          onSeek={(time) => seek(time)}
          onStepEdit={(direction) => seek(adjacentEditPoint(project.clips, playheadRef.current, direction))}
          onToggleLoop={() => setLoop((value) => !value)}
          onClearRange={() => { setInPoint(null); setOutPoint(null); }}
          onToggleGuides={() => setGuides((value) => !value)}
          onSnapshot={saveSnapshot}
          onFormat={setCanvas}
          onFrameRate={(frameRate) => commit((current) => ({ ...current, frameRate }), `${frameRate} fps`)}
          welcome={{
            mediaCount: project.media.length,
            recent,
            restore,
            onImport: importMedia,
            onAddText: () => addTextClip('headline'),
            onOpen: () => openProject(),
            onOpenRecent: (path) => openProject(path),
            onRestore: () => restore && loadProject(restore.project, restore.filePath, { clean: false }),
            onDiscardRestore: () => { setRestore(null); window.pixelwave?.clearAutosave?.(); },
            onAddAllMedia: addAllMedia,
          }}
          previewHandlers={{
            onSelect: ({ clipId, textId, additive }) => {
              if (textId) selectText(clipId, textId);
              else selectClips([clipId], additive ? 'toggle' : 'replace');
            },
            onClearSelection: clearSelection,
            onEditText: editText,
            onFinishText: () => setEditingText(null),
            onBeginEdit: checkpoint,
            onLiveClip: liveClip,
          }}
        />
        <Inspector
          project={project}
          selectedClipIds={selectedIds}
          selectedTextId={selection.textId}
          playhead={playhead}
          handlers={inspectorHandlers}
        />
        <Timeline
          project={project}
          playhead={playhead}
          playing={playing}
          selectedClipIds={selectedIds}
          zoom={zoom}
          tool={tool}
          snapping={snapping}
          inPoint={inPoint}
          outPoint={outPoint}
          shortcuts={shortcutLabels}
          onZoom={setZoom}
          onTool={setTool}
          onSnapping={setSnapping}
          onSeek={seek}
          onSelect={selectClips}
          onBeginEdit={checkpoint}
          onLiveProject={live}
          onBlade={bladeAt}
          onDrop={handleTimelineDrop}
          onClipContextMenu={openClipMenu}
          onLaneContextMenu={openLaneMenu}
          onMarkerContextMenu={openMarkerMenu}
          onEditMarker={(marker, rect) => setMarkerEdit({ markerId: marker.id, rect })}
          onToggleTrack={(kind, index, flag) => commit((current) => toggleTrackFlag(current, kind, index, flag), { hidden: 'Hide track', muted: 'Mute track', locked: 'Lock track' }[flag])}
          onAddTrack={(kind) => commit((current) => addTrack(current, kind), 'Add track')}
          onResizeStart={startTimelineResize}
          actions={{
            split: splitAtPlayhead,
            delete: () => deleteSelection(false),
            rippleDelete: () => deleteSelection(true),
            addMarker: () => {
              const marker = addMarker();
              const ruler = document.querySelector('.timeline-ruler');
              if (marker && ruler) {
                const rect = ruler.getBoundingClientRect();
                const left = Math.min(rect.right - 20, Math.max(rect.left, rect.left + marker.time * 64 * zoom - (document.querySelector('.timeline-scroll')?.scrollLeft || 0)));
                setMarkerEdit({ markerId: marker.id, rect: { left, right: left, top: rect.top, bottom: rect.bottom } });
              }
            },
            addText: () => addTextClip(),
            recordVoice: () => setDialog('voice'),
          }}
        />
      </main>

      {fileDrag && (
        <div className="file-drop-hint" aria-hidden="true">
          <DownloadSimple size={16} /> Drop to import. Drop on the timeline to place the clips as well.
        </div>
      )}
      {dialog === 'palette' && <CommandPalette commands={commands} mac={mac} frameRate={fps} onSeek={(time) => seek(time)} onClose={() => setDialog(null)} />}
      {dialog === 'shortcuts' && <ShortcutGuide commands={commands} mac={mac} onClose={() => setDialog(null)} />}
      {dialog === 'export' && <ExportDialog project={project} inPoint={inPoint} outPoint={outPoint} onClose={() => setDialog(null)} onExport={runExport} />}
      <VoiceRecorder open={dialog === 'voice'} onClose={() => setDialog(null)} onComplete={addVoiceRecording} />
      <ExportProgress state={exportState} onCancel={() => exportToken.current?.cancel()} />
      {contextMenu && <Menu x={contextMenu.x} y={contextMenu.y} items={contextMenu.items} onClose={() => setContextMenu(null)} />}
      {markerBeingEdited && (
        <MarkerPopover
          marker={markerBeingEdited}
          anchorRect={markerEdit.rect}
          frameRate={fps}
          onSave={(next) => commit((current) => ({ ...current, markers: current.markers.map((marker) => (marker.id === next.id ? next : marker)) }), 'Edit marker')}
          onDelete={(id) => commit((current) => ({ ...current, markers: current.markers.filter((marker) => marker.id !== id) }), 'Delete marker')}
          onClose={() => setMarkerEdit(null)}
        />
      )}
      <ActionToast notice={notice} onClose={closeNotice} />
    </div>
  );
}
