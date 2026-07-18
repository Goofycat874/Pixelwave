import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowCounterClockwise,
  ArrowClockwise,
  CaretDown,
  DownloadSimple,
  FolderOpen,
  Microphone,
  Pause,
  Play,
  Rewind,
  SkipBack,
  SkipForward,
  Sparkle,
  TextT,
  UploadSimple,
} from '@phosphor-icons/react';
import MediaBin from './components/MediaBin.jsx';
import Preview from './components/Preview.jsx';
import Inspector from './components/Inspector.jsx';
import Timeline from './components/Timeline.jsx';
import EmptyState from './components/EmptyState.jsx';
import IconButton from './components/IconButton.jsx';
import VoiceRecorder from './components/VoiceRecorder.jsx';
import {
  activeClipsAt,
  appendClip,
  clipTextOverlays,
  createClip,
  createTextOverlay,
  defaultEffects,
  duplicateClip,
  getProjectDuration,
  removeClip,
  removeMediaFromProject,
  serializeProject,
  setClipSpeed,
  splitClip,
  updateClipTextOverlay,
} from './lib/editor.js';
import { exportProfile, exportTimeline } from './lib/exporter.js';
import { renderTimelineAudio } from './lib/export-audio.js';
import { formatTime, probeMedia } from './lib/media.js';

const initialProject = {
  version: 1,
  name: 'Untitled cut',
  width: 1280,
  height: 720,
  frameRate: 30,
  media: [],
  clips: [],
  createdAt: new Date().toISOString(),
};

function clone(value) {
  return structuredClone(value);
}

export default function App() {
  const [project, setProject] = useState(initialProject);
  const [projectPath, setProjectPath] = useState(null);
  const [selectedClipId, setSelectedClipId] = useState(null);
  const [playhead, setPlayhead] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [dirty, setDirty] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState('');
  const [exportFormat, setExportFormat] = useState('mp4');
  const [exportState, setExportState] = useState({ active: false, progress: 0, status: '' });
  const [voiceRecorderOpen, setVoiceRecorderOpen] = useState(false);
  const [textEditingClipId, setTextEditingClipId] = useState(null);
  const [textEditingTextId, setTextEditingTextId] = useState(null);
  const [selectedTextId, setSelectedTextId] = useState(null);
  const history = useRef({ past: [], future: [] });
  const cancelExport = useRef(null);
  const duration = useMemo(() => getProjectDuration(project.clips), [project.clips]);
  const selectedClip = project.clips.find((clip) => clip.id === selectedClipId) || null;
  const selectedAsset = selectedClip
    ? project.media.find((asset) => asset.id === selectedClip.assetId) || null
    : null;
  const selectedText = selectedClip
    ? clipTextOverlays(selectedClip).find((text) => text.id === selectedTextId) || null
    : null;

  const clearTextState = useCallback(() => {
    setSelectedTextId(null);
    setTextEditingClipId(null);
    setTextEditingTextId(null);
  }, []);

  const changeProject = useCallback((updater, record = true) => {
    setProject((current) => {
      if (record) {
        history.current.past.push(clone(current));
        if (history.current.past.length > 80) history.current.past.shift();
        history.current.future = [];
      }
      return updater(current);
    });
    setDirty(true);
  }, []);

  const beginEdit = useCallback(() => {
    setProject((current) => {
      history.current.past.push(clone(current));
      if (history.current.past.length > 80) history.current.past.shift();
      history.current.future = [];
      return current;
    });
    setDirty(true);
  }, []);

  const undo = useCallback(() => {
    const previous = history.current.past.pop();
    if (!previous) return;
    setProject((current) => {
      history.current.future.push(clone(current));
      return previous;
    });
    setSelectedClipId(null);
    clearTextState();
    setDirty(true);
  }, [clearTextState]);

  const redo = useCallback(() => {
    const next = history.current.future.pop();
    if (!next) return;
    setProject((current) => {
      history.current.past.push(clone(current));
      return next;
    });
    setSelectedClipId(null);
    clearTextState();
    setDirty(true);
  }, [clearTextState]);

  const importMedia = useCallback(async () => {
    if (!window.pixelwave?.openMedia) {
      setError('Media import is available in the Electron desktop app.');
      return;
    }
    setError('');
    setImporting(true);
    try {
      const picked = await window.pixelwave.openMedia();
      if (!picked.length) return;
      const existingPaths = new Set(project.media.map((item) => item.path));
      const fresh = picked.filter((item) => !existingPaths.has(item.path));
      const prepareImportedMedia = async (item) => {
        try {
          return await probeMedia(item);
        } catch (decodeError) {
          if (item.kind !== 'video' || !window.pixelwave?.createProxy) throw decodeError;
          const proxy = await window.pixelwave.createProxy(item);
          return probeMedia(proxy);
        }
      };
      const results = await Promise.allSettled(fresh.map(prepareImportedMedia));
      const ready = results.filter((result) => result.status === 'fulfilled').map((result) => result.value);
      const failed = results.filter((result) => result.status === 'rejected').length;
      if (ready.length) changeProject((current) => ({ ...current, media: [...current.media, ...ready] }));
      if (failed) setError(`${failed} ${failed === 1 ? 'file was' : 'files were'} skipped because neither the original nor an optimized proxy could be decoded.`);
    } catch (importError) {
      setError(importError.message || 'The media import could not be completed.');
    } finally {
      setImporting(false);
    }
  }, [changeProject, project.media]);

  const addToTimeline = useCallback((assetId, start = null, track = 0) => {
    const asset = project.media.find((item) => item.id === assetId);
    if (!asset) return;
    const clip = createClip(asset, start ?? 0, track);
    changeProject((current) => ({
      ...current,
      clips: start === null ? appendClip(current.clips, clip) : [...current.clips, clip],
    }));
    setSelectedClipId(clip.id);
    clearTextState();
    setPlayhead(start ?? duration);
  }, [changeProject, clearTextState, duration, project.media]);

  const removeMedia = useCallback((assetId) => {
    const removesSelection = project.clips.some((clip) => clip.id === selectedClipId && clip.assetId === assetId);
    changeProject((current) => removeMediaFromProject(current, assetId));
    if (removesSelection) {
      setSelectedClipId(null);
      clearTextState();
    }
  }, [changeProject, clearTextState, project.clips, selectedClipId]);

  const revealMedia = useCallback((assetId) => {
    const asset = project.media.find((item) => item.id === assetId);
    if (asset?.path) window.pixelwave?.revealMedia?.(asset.path);
  }, [project.media]);

  const patchClip = useCallback((clipId, patch) => {
    setProject((current) => ({
      ...current,
      clips: current.clips.map((clip) => clip.id === clipId ? { ...clip, ...patch } : clip),
    }));
    setDirty(true);
  }, []);

  const updateSelected = useCallback((patch, reset = false, record = true) => {
    if (!selectedClipId) return;
    changeProject((current) => ({
      ...current,
      clips: current.clips.map((clip) => {
        if (clip.id !== selectedClipId) return clip;
        if (reset) return { ...clip, effects: defaultEffects() };
        return { ...clip, ...patch };
      }),
    }), record);
  }, [changeProject, selectedClipId]);

  const updateSelectedText = useCallback((nextText) => {
    if (!selectedClipId || !selectedTextId) return;
    changeProject((current) => ({
      ...current,
      clips: current.clips.map((clip) => (
        clip.id === selectedClipId
          ? updateClipTextOverlay(clip, selectedTextId, nextText)
          : clip
      )),
    }));
  }, [changeProject, selectedClipId, selectedTextId]);

  const deleteSelected = useCallback(() => {
    if (!selectedClipId) return;
    changeProject((current) => ({ ...current, clips: removeClip(current.clips, selectedClipId) }));
    setSelectedClipId(null);
    clearTextState();
  }, [changeProject, clearTextState, selectedClipId]);

  const splitSelected = useCallback(() => {
    if (!selectedClipId) return;
    changeProject((current) => ({ ...current, clips: splitClip(current.clips, selectedClipId, playhead) }));
    setSelectedClipId(null);
    clearTextState();
  }, [changeProject, clearTextState, playhead, selectedClipId]);

  const duplicateSelected = useCallback(() => {
    if (!selectedClipId) return;
    const nextClips = duplicateClip(project.clips, selectedClipId);
    const originalIndex = project.clips.findIndex((clip) => clip.id === selectedClipId);
    const duplicated = nextClips[originalIndex + 1];
    changeProject((current) => ({ ...current, clips: nextClips }));
    if (duplicated) {
      setSelectedClipId(duplicated.id);
      clearTextState();
      setPlayhead(duplicated.start);
    }
  }, [changeProject, clearTextState, project.clips, selectedClipId]);

  const updateSelectedSpeed = useCallback((speed) => {
    if (!selectedClipId) return;
    changeProject((current) => ({
      ...current,
      clips: current.clips.map((clip) => clip.id === selectedClipId ? setClipSpeed(clip, speed) : clip),
    }));
  }, [changeProject, selectedClipId]);

  const selectClip = useCallback((clipId) => {
    setSelectedClipId(clipId);
    clearTextState();
  }, [clearTextState]);

  const selectText = useCallback((clipId, textId) => {
    setSelectedClipId(clipId);
    setSelectedTextId(textId);
  }, []);

  const editText = useCallback((clipId, textId) => {
    setSelectedClipId(clipId);
    setSelectedTextId(textId);
    setTextEditingClipId(clipId);
    setTextEditingTextId(textId);
    setPlaying(false);
  }, []);

  const addText = useCallback(() => {
    const target = selectedClip && selectedClip.kind !== 'audio'
      ? selectedClip
      : activeClipsAt(project.clips, playhead, 'video').at(-1);
    if (!target) {
      setError('Select an image or video clip before adding text.');
      return;
    }
    const textOverlay = createTextOverlay();
    changeProject((current) => ({
      ...current,
      clips: current.clips.map((clip) => clip.id === target.id ? {
        ...clip,
        textOverlays: [...(clip.textOverlays || []), textOverlay],
      } : clip),
    }));
    setSelectedClipId(target.id);
    setSelectedTextId(textOverlay.id);
    setTextEditingClipId(target.id);
    setTextEditingTextId(textOverlay.id);
    setPlayhead((current) => current >= target.start && current < target.start + target.duration ? current : target.start);
    setPlaying(false);
    setError('');
  }, [changeProject, playhead, project.clips, selectedClip]);

  const addVoiceRecording = useCallback(async (blob) => {
    if (!window.pixelwave?.saveVoiceRecording) {
      throw new Error('Voice recording is available in the Electron desktop app.');
    }
    const descriptor = await window.pixelwave.saveVoiceRecording(await blob.arrayBuffer(), blob.type);
    const asset = await probeMedia(descriptor);
    const clip = createClip(asset, playhead);
    changeProject((current) => ({
      ...current,
      media: [...current.media, asset],
      clips: [...current.clips, clip],
    }));
    setSelectedClipId(clip.id);
    clearTextState();
    setPlaying(false);
    setError('');
  }, [changeProject, clearTextState, playhead]);

  const saveProject = useCallback(async () => {
    if (!window.pixelwave?.saveProject) return;
    try {
      const path = await window.pixelwave.saveProject(serializeProject(project), projectPath);
      if (path) {
        setProjectPath(path);
        setDirty(false);
        setError('');
      }
    } catch (saveError) {
      setError(saveError.message || 'The project could not be saved.');
    }
  }, [project, projectPath]);

  const openProject = useCallback(async () => {
    if (!window.pixelwave?.openProject) return;
    if (dirty && !window.confirm('Open another project and discard unsaved changes?')) return;
    setImporting(true);
    try {
      const loaded = await window.pixelwave.openProject();
      if (!loaded) return;
      const mediaResults = await Promise.allSettled((loaded.project.media || []).map(async (item) => {
        try {
          return await probeMedia(item);
        } catch (decodeError) {
          if (item.kind !== 'video' || !window.pixelwave?.createProxy) throw decodeError;
          return probeMedia(await window.pixelwave.createProxy(item));
        }
      }));
      const media = mediaResults.map((result, index) => result.status === 'fulfilled' ? result.value : loaded.project.media[index]);
      setProject({ ...initialProject, ...loaded.project, media });
      setProjectPath(loaded.filePath);
      setSelectedClipId(null);
      clearTextState();
      setPlayhead(0);
      setDirty(false);
      history.current = { past: [], future: [] };
      setError('');
    } catch (openError) {
      setError(openError.message || 'The project file could not be opened.');
    } finally {
      setImporting(false);
    }
  }, [clearTextState, dirty]);

  const startExport = useCallback(async () => {
    if (!project.clips.length || exportState.active) return;
    if (!window.pixelwave?.beginExport) {
      setError('Pixelwave needs to restart once before using the new direct MP4 exporter.');
      return;
    }
    const token = {
      cancelled: false,
      jobId: null,
      cancel() {
        this.cancelled = true;
        if (this.jobId) window.pixelwave.cancelExport(this.jobId).catch(() => {});
      },
    };
    cancelExport.current = token;
    setPlaying(false);
    setError('');
    setExportState({ active: true, progress: 0, status: 'Preparing audio' });
    try {
      const profile = exportProfile(exportFormat);
      const audioBytes = await renderTimelineAudio(project);
      if (token.cancelled) throw new Error('Export cancelled.');
      setExportState({ active: true, progress: 0, status: 'Choose export location' });
      const session = await window.pixelwave.beginExport({
        format: exportFormat,
        suggestedName: `${project.name || 'Pixelwave export'}.${profile.extension}`,
        frameRate: project.frameRate || 30,
        audioBytes,
      });
      if (!session) {
        setExportState({ active: false, progress: 0, status: '' });
        return;
      }
      token.jobId = session.jobId;
      setExportState({ active: true, progress: 0, status: 'Rendering MP4 frames' });
      await exportTimeline({
        project,
        cancelToken: token,
        onFrame: (bytes) => window.pixelwave.writeExportFrame(session.jobId, bytes),
        onProgress: (progress) => setExportState({ active: true, progress, status: 'Rendering timeline' }),
      });
      if (token.cancelled) throw new Error('Export cancelled.');
      setExportState({ active: true, progress: 1, status: `Finalizing ${exportFormat.toUpperCase()}` });
      const path = await window.pixelwave.finishExport(session.jobId);
      token.jobId = null;
      setExportState({ active: false, progress: 0, status: path ? 'Export complete' : '' });
    } catch (exportError) {
      if (token.jobId) await window.pixelwave.cancelExport(token.jobId).catch(() => {});
      setExportState({ active: false, progress: 0, status: '' });
      if (exportError.message !== 'Export cancelled.') setError(exportError.message || 'The export could not be completed.');
    } finally {
      cancelExport.current = null;
    }
  }, [exportFormat, exportState.active, project]);

  useEffect(() => {
    if (!playing) return undefined;
    let animationFrame;
    let last = performance.now();
    const tick = (now) => {
      const delta = (now - last) / 1000;
      last = now;
      setPlayhead((current) => {
        const next = current + delta;
        if (next >= duration) {
          setPlaying(false);
          return duration;
        }
        return next;
      });
      animationFrame = requestAnimationFrame(tick);
    };
    animationFrame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animationFrame);
  }, [duration, playing]);

  useEffect(() => {
    const onKeyDown = (event) => {
      const editingText = event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement;
      const command = event.metaKey || event.ctrlKey;
      if (command && event.key.toLowerCase() === 's') { event.preventDefault(); saveProject(); }
      else if (command && event.key.toLowerCase() === 'o') { event.preventDefault(); openProject(); }
      else if (command && event.key.toLowerCase() === 'i') { event.preventDefault(); importMedia(); }
      else if (command && event.key.toLowerCase() === 'z' && event.shiftKey) { event.preventDefault(); redo(); }
      else if (command && event.key.toLowerCase() === 'z') { event.preventDefault(); undo(); }
      else if (command && event.key.toLowerCase() === 'd') { event.preventDefault(); duplicateSelected(); }
      else if (!editingText && event.code === 'Space') { event.preventDefault(); setPlaying((value) => !value); }
      else if (!editingText && (event.key === 'Backspace' || event.key === 'Delete')) { event.preventDefault(); deleteSelected(); }
      else if (!editingText && event.key.toLowerCase() === 's') splitSelected();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [deleteSelected, duplicateSelected, importMedia, openProject, redo, saveProject, splitSelected, undo]);

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar__brand">
          <div className="brand-mark"><span /><span /><span /></div>
          <div><strong>Pixelwave</strong><span>Studio</span></div>
        </div>
        <div className="topbar__project">
          <span className={`save-indicator ${dirty ? 'is-dirty' : ''}`} />
          <input
            className="project-name-input"
            aria-label="Project name"
            value={project.name}
            onChange={(event) => {
              setProject((current) => ({ ...current, name: event.target.value }));
              setDirty(true);
            }}
          />
          <span>{dirty ? 'Unsaved changes' : projectPath ? 'Saved locally' : 'New project'}</span>
          <CaretDown size={12} />
        </div>
        <nav className="topbar__actions" aria-label="Project actions">
          <IconButton label="Undo" onClick={undo} disabled={!history.current.past.length}><ArrowCounterClockwise size={16} /></IconButton>
          <IconButton label="Redo" onClick={redo} disabled={!history.current.future.length}><ArrowClockwise size={16} /></IconButton>
          <span className="toolbar-divider" />
          <button className="quiet-button" type="button" onClick={openProject}><FolderOpen size={16} /> Open</button>
          <button className="quiet-button" type="button" onClick={importMedia}><UploadSimple size={16} /> Import</button>
          <button className="text-tool-button" type="button" onClick={addText}><TextT size={16} weight="bold" /> Text</button>
          <button className="record-voice-button" type="button" onClick={() => setVoiceRecorderOpen(true)}><Microphone size={16} weight="fill" /> Record voice</button>
          <div className="export-action">
            <select aria-label="Export format" value={exportFormat} onChange={(event) => setExportFormat(event.target.value)}>
              <option value="mp4">MP4</option>
              <option value="mov">MOV</option>
              <option value="webm">WebM</option>
            </select>
            <button className="primary-button primary-button--compact" type="button" onClick={startExport} disabled={!project.clips.length || exportState.active}>
              <DownloadSimple size={16} /> Export
            </button>
          </div>
        </nav>
      </header>

      <main className="editor-grid">
        <MediaBin
          media={project.media}
          importing={importing}
          error={error}
          onImport={importMedia}
          onAddToTimeline={addToTimeline}
          onReveal={revealMedia}
          onRemove={removeMedia}
        />

        <section className="workspace">
          <div className="workspace__toolbar">
            <span><Sparkle size={15} weight="duotone" /> Program monitor</span>
            <div><button type="button">Fit <CaretDown size={11} /></button><span>1280 × 720</span></div>
          </div>
          <div className="workspace__monitor">
            <Preview
              clips={project.clips}
              media={project.media}
              playhead={playhead}
              playing={playing}
              selectedClipId={selectedClipId}
              selectedTextId={selectedTextId}
              textEditingClipId={textEditingClipId}
              textEditingTextId={textEditingTextId}
              onSelectClip={selectClip}
              onSelectText={selectText}
              onBeginEdit={beginEdit}
              onEditText={editText}
              onFinishText={() => { setTextEditingClipId(null); setTextEditingTextId(null); }}
              onTransformClip={patchClip}
              width={project.width}
              height={project.height}
            />
            {!project.clips.length && <EmptyState onImport={importMedia} />}
          </div>
          <div className="transport">
            <div className="transport__time"><strong>{formatTime(playhead, true)}</strong><span>/ {formatTime(duration, true)}</span></div>
            <div className="transport__controls">
              <IconButton label="Go to start" onClick={() => { setPlayhead(0); setPlaying(false); }}><SkipBack size={17} weight="fill" /></IconButton>
              <IconButton label="Back one second" onClick={() => setPlayhead((value) => Math.max(0, value - 1))}><Rewind size={17} weight="fill" /></IconButton>
              <button className="play-button" type="button" aria-label={playing ? 'Pause' : 'Play'} onClick={() => duration && setPlaying((value) => !value)}>
                {playing ? <Pause size={18} weight="fill" /> : <Play size={18} weight="fill" />}
              </button>
              <IconButton label="Forward one second" onClick={() => setPlayhead((value) => Math.min(duration, value + 1))}><SkipForward size={17} weight="fill" /></IconButton>
            </div>
            <div className="transport__status"><span>30 FPS</span><span>HD</span></div>
          </div>
        </section>

        <Inspector
          clip={selectedClip}
          asset={selectedAsset}
          selectedText={selectedText}
          onUpdate={updateSelected}
          onTextUpdate={updateSelectedText}
          onLiveUpdate={(patch) => updateSelected(patch, false, false)}
          onBeginEdit={beginEdit}
          onSpeedChange={updateSelectedSpeed}
        />

        <Timeline
          clips={project.clips}
          media={project.media}
          selectedClipId={selectedClipId}
          playhead={playhead}
          duration={duration}
          zoom={zoom}
          onZoom={setZoom}
          onSelect={selectClip}
          onSeek={(time) => { setPlayhead(Math.min(Math.max(0, time), Math.max(duration, time))); setPlaying(false); }}
          onBeginEdit={beginEdit}
          onPatchClip={patchClip}
          onSplit={splitSelected}
          onDuplicate={duplicateSelected}
          onDelete={deleteSelected}
          onDropAsset={addToTimeline}
        />
      </main>

      {exportState.active && (
        <div className="export-overlay" role="dialog" aria-modal="true" aria-label="Exporting video">
          <div className="export-dialog">
            <div className="export-dialog__icon"><DownloadSimple size={22} /></div>
            <p className="eyebrow">Exporting {exportFormat.toUpperCase()}</p>
            <h2>{exportState.status}</h2>
            <p>Pixelwave is playing the timeline through its render engine. Keep the app open until it finishes.</p>
            <div className="export-progress"><span style={{ transform: `scaleX(${exportState.progress})` }} /></div>
            <div className="export-dialog__meta"><strong>{Math.round(exportState.progress * 100)}%</strong><span>{formatTime(duration * exportState.progress)} / {formatTime(duration)}</span></div>
            <button type="button" className="quiet-button" onClick={() => cancelExport.current?.cancel?.()}>Cancel export</button>
          </div>
        </div>
      )}
      <VoiceRecorder
        open={voiceRecorderOpen}
        onClose={() => setVoiceRecorderOpen(false)}
        onComplete={addVoiceRecording}
      />
    </div>
  );
}
