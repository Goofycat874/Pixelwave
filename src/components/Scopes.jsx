import { useEffect, useRef, useState } from 'react';
import {
  analyzeFrame,
  HISTOGRAM_BINS,
  SKIN_LINE_END,
  traceIntensity,
  VECTOR_SIZE,
  VECTOR_TARGETS,
  WAVEFORM_COLUMNS,
  WAVEFORM_LEVELS,
} from '../lib/scopes.js';
import { Segmented } from './ui.jsx';

const MODES = [
  ['waveform', 'Waveform'],
  ['parade', 'Parade'],
  ['vector', 'Vector'],
  ['histogram', 'Histogram'],
];

// An exact multiple of the waveform columns, so every column gathers the same number of pixels.
const SAMPLE_WIDTH = WAVEFORM_COLUMNS * 2;
const REFRESH_MS = 100;
const BACKGROUND = '#0c0d0f';
const GRATICULE = 'rgba(255, 255, 255, 0.12)';
const LABEL = 'rgba(255, 255, 255, 0.4)';
const TRACE = {
  luma: [226, 230, 234],
  red: [255, 84, 84],
  green: [72, 220, 110],
  blue: [84, 140, 255],
};

// Counts to a small canvas of colored, partly transparent pixels that can be scaled onto the scope.
function traceImage(scratch, counts, width, height, reference, [r, g, b]) {
  scratch.width = width;
  scratch.height = height;
  const context = scratch.getContext('2d');
  const image = context.createImageData(width, height);
  for (let i = 0; i < counts.length; i += 1) {
    const intensity = traceIntensity(counts[i], reference);
    if (!intensity) continue;
    image.data[i * 4] = r;
    image.data[i * 4 + 1] = g;
    image.data[i * 4 + 2] = b;
    image.data[i * 4 + 3] = Math.round(40 + intensity * 215);
  }
  context.putImageData(image, 0, 0);
  return scratch;
}

// A slight blur closes the gaps a sparse trace leaves on smooth gradients, as a hardware scope's glow does.
function drawTrace(context, image, x, y, width, height, scale) {
  context.imageSmoothingEnabled = true;
  context.filter = `blur(${0.8 * scale}px)`;
  context.drawImage(image, x, y, width, height);
  context.filter = 'none';
}

function drawWaveform(context, width, height, analysis, scratch, parade, scale) {
  const { waveform, stats } = analysis;
  const reference = Math.max(1, (stats.pixels / WAVEFORM_COLUMNS) * 0.18);
  context.fillStyle = BACKGROUND;
  context.fillRect(0, 0, width, height);
  context.font = `${11 * scale}px sans-serif`;
  context.textBaseline = 'middle';
  for (const level of [0, 0.25, 0.5, 0.75, 1]) {
    const y = Math.round(4 * scale + (1 - level) * (height - 8 * scale));
    context.strokeStyle = GRATICULE;
    context.lineWidth = scale;
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(width, y);
    context.stroke();
  }
  const top = 4 * scale;
  const plotHeight = height - 8 * scale;
  if (parade) {
    const third = width / 3;
    [['red', waveform.red], ['green', waveform.green], ['blue', waveform.blue]].forEach(([key, counts], index) => {
      const image = traceImage(scratch, counts, WAVEFORM_COLUMNS, WAVEFORM_LEVELS, reference, TRACE[key]);
      drawTrace(context, image, index * third + scale, top, third - 2 * scale, plotHeight, scale);
    });
  } else {
    const image = traceImage(scratch, waveform.luma, WAVEFORM_COLUMNS, WAVEFORM_LEVELS, reference, TRACE.luma);
    drawTrace(context, image, 0, top, width, plotHeight, scale);
  }
  context.fillStyle = LABEL;
  context.fillText('100', 4 * scale, top + 6 * scale);
  context.fillText('0', 4 * scale, height - top - 6 * scale);
}

function drawVector(context, width, height, analysis, scratch, scale) {
  // The plot sits inside a margin so the target boxes at the extremes are not cut off.
  const margin = 12 * scale;
  const size = Math.min(width, height) - margin * 2;
  const left = (width - size) / 2;
  const top = margin;
  const center = [left + size / 2, top + size / 2];
  context.fillStyle = BACKGROUND;
  context.fillRect(0, 0, width, height);
  context.strokeStyle = GRATICULE;
  context.lineWidth = scale;
  for (const radius of [0.25, 0.5]) {
    context.beginPath();
    context.arc(center[0], center[1], radius * size, 0, Math.PI * 2);
    context.stroke();
  }
  context.beginPath();
  context.moveTo(left, center[1]);
  context.lineTo(left + size, center[1]);
  context.moveTo(center[0], top);
  context.lineTo(center[0], top + size);
  context.stroke();

  const reference = Math.max(1, analysis.stats.pixels / 900);
  const image = traceImage(scratch, analysis.vector.counts, VECTOR_SIZE, VECTOR_SIZE, reference, TRACE.luma);
  drawTrace(context, image, left, top, size, size, scale);

  context.strokeStyle = 'rgba(232, 160, 110, 0.7)';
  context.beginPath();
  context.moveTo(center[0], center[1]);
  context.lineTo(left + SKIN_LINE_END[0] * size, top + SKIN_LINE_END[1] * size);
  context.stroke();

  context.font = `${11 * scale}px sans-serif`;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  const box = 5 * scale;
  for (const { label, rgb, position } of VECTOR_TARGETS) {
    const x = left + position[0] * size;
    const y = top + position[1] * size;
    context.strokeStyle = `rgb(${rgb.map((value) => (value ? 230 : 70)).join(',')})`;
    context.strokeRect(x - box, y - box, box * 2, box * 2);
    context.fillStyle = LABEL;
    context.fillText(label, x + (x > center[0] ? -box * 2.6 : box * 2.6), y + (y > center[1] ? -box * 2.6 : box * 2.6));
  }
  context.textAlign = 'start';
}

function drawHistogram(context, width, height, analysis, scale) {
  const { histogram } = analysis;
  context.fillStyle = BACKGROUND;
  context.fillRect(0, 0, width, height);
  context.strokeStyle = GRATICULE;
  context.lineWidth = scale;
  for (const fraction of [0.25, 0.5, 0.75]) {
    const x = Math.round(width * fraction);
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x, height);
    context.stroke();
  }
  // The end bins collect every clipped pixel and would flatten the rest of the graph.
  const peak = Math.max(1, ...['luma', 'red', 'green', 'blue'].flatMap((key) => Array.from(histogram[key]).slice(1, HISTOGRAM_BINS - 1)));
  const plot = (bins) => {
    context.beginPath();
    context.moveTo(0, height);
    bins.forEach((count, index) => {
      const x = (index / (HISTOGRAM_BINS - 1)) * width;
      context.lineTo(x, height - Math.min(1, count / (peak * 1.1)) * (height - 4 * scale));
    });
    context.lineTo(width, height);
    context.closePath();
  };
  context.globalCompositeOperation = 'lighter';
  for (const key of ['red', 'green', 'blue']) {
    const [r, g, b] = TRACE[key];
    context.fillStyle = `rgba(${r}, ${g}, ${b}, 0.55)`;
    plot(histogram[key]);
    context.fill();
  }
  context.globalCompositeOperation = 'source-over';
  context.strokeStyle = 'rgba(255, 255, 255, 0.75)';
  context.lineWidth = scale * 1.2;
  plot(histogram.luma);
  context.stroke();
}

const percent = (value) => `${Math.round(value * 100)}%`;
const share = (count, total) => (total ? `${((count / total) * 100).toFixed(1)}%` : '0%');

export default function Scopes() {
  const [mode, setMode] = useState('waveform');
  const [readout, setReadout] = useState(null);
  const canvasRef = useRef(null);

  useEffect(() => {
    const display = canvasRef.current;
    if (!display) return undefined;
    const sample = document.createElement('canvas');
    const sampleContext = sample.getContext('2d', { willReadFrequently: true });
    const scratch = document.createElement('canvas');
    let frame = 0;
    let last = 0;
    let lastReadout = '';

    const tick = (now) => {
      frame = requestAnimationFrame(tick);
      if (now - last < REFRESH_MS || document.hidden) return;
      last = now;
      const source = document.querySelector('canvas.viewer-canvas');
      const scale = Math.min(window.devicePixelRatio || 1, 2);
      const cssWidth = display.clientWidth;
      if (!source || !source.width || !source.height || !cssWidth) return;
      const cssHeight = mode === 'vector' ? cssWidth : Math.round(cssWidth * 0.56);
      const width = Math.round(cssWidth * scale);
      const height = Math.round(cssHeight * scale);
      if (display.width !== width || display.height !== height) {
        display.width = width;
        display.height = height;
        display.style.height = `${cssHeight}px`;
      }
      sample.width = SAMPLE_WIDTH;
      sample.height = Math.max(2, Math.round(SAMPLE_WIDTH * (source.height / source.width)));
      let pixels;
      try {
        sampleContext.drawImage(source, 0, 0, sample.width, sample.height);
        pixels = sampleContext.getImageData(0, 0, sample.width, sample.height).data;
      } catch {
        return;
      }
      const analysis = analyzeFrame(pixels, sample.width, sample.height);
      const context = display.getContext('2d');
      if (mode === 'waveform' || mode === 'parade') drawWaveform(context, width, height, analysis, scratch, mode === 'parade', scale);
      else if (mode === 'vector') drawVector(context, width, height, analysis, scratch, scale);
      else drawHistogram(context, width, height, analysis, scale);

      const { stats } = analysis;
      const next = [percent(stats.min), percent(stats.mean), percent(stats.max), share(stats.clippedHigh, stats.pixels)];
      if (next.join('|') !== lastReadout) {
        lastReadout = next.join('|');
        setReadout(next);
      }
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [mode]);

  return (
    <div className="scopes">
      <Segmented size="sm" label="Scope" value={mode} options={MODES} onChange={setMode} />
      <canvas ref={canvasRef} className="scopes__canvas" role="img" aria-label={`${MODES.find(([key]) => key === mode)[1]} scope of the program monitor`} />
      {readout && (
        <dl className="grade-readout">
          {[['Black', readout[0]], ['Average', readout[1]], ['White', readout[2]], ['Clipped', readout[3]]].map(([label, value]) => (
            <div key={label}><dt>{label}</dt><dd>{value}</dd></div>
          ))}
        </dl>
      )}
    </div>
  );
}
