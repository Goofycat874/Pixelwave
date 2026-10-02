import { useRef, useState } from 'react';
import { ArrowCounterClockwise } from '@phosphor-icons/react';
import { curveFunction, defaultCurves, isIdentityCurve, normalizeCurve, sampleCurve } from '../lib/color.js';
import { Segmented } from './ui.jsx';

const CHANNELS = [
  ['master', 'RGB'],
  ['red', 'Red'],
  ['green', 'Green'],
  ['blue', 'Blue'],
];
const STROKE = { master: '#e2e6ea', red: '#ff5454', green: '#48dc6e', blue: '#548cff' };

const BOX = 200;
const PAD = 10;
const SPAN = BOX - PAD * 2;
const MIN_GAP = 0.02;
const HIT_RADIUS = 0.07;

const toX = (value) => PAD + value * SPAN;
const toY = (value) => PAD + (1 - value) * SPAN;
const clamp01 = (value) => Math.min(1, Math.max(0, value));
const rounded = (value) => Math.round(value * 1000) / 1000;

function pathOf(points) {
  return sampleCurve(points, 64).map(([x, y], index) => `${index ? 'L' : 'M'}${toX(x).toFixed(1)} ${toY(y).toFixed(1)}`).join(' ');
}

export default function CurveEditor({ curves, onChange, onBeginEdit = () => {} }) {
  const [channel, setChannel] = useState('master');
  const [selected, setSelected] = useState(null);
  const dragRef = useRef(null);
  const svgRef = useRef(null);
  const fallback = defaultCurves();
  const points = normalizeCurve(curves?.[channel] || fallback[channel]);
  const allCurves = { ...fallback, ...(curves || {}) };

  const commit = (nextPoints) => onChange({ ...allCurves, [channel]: nextPoints.map(([x, y]) => [rounded(x), rounded(y)]) });

  const pointer = (event) => {
    const bounds = svgRef.current.getBoundingClientRect();
    return [
      clamp01((((event.clientX - bounds.left) / bounds.width) * BOX - PAD) / SPAN),
      clamp01(1 - (((event.clientY - bounds.top) / bounds.height) * BOX - PAD) / SPAN),
    ];
  };

  const moveTo = (index, [x, y], base = points) => {
    const last = base.length - 1;
    const low = index === 0 ? 0 : base[index - 1][0] + MIN_GAP;
    const high = index === last ? 1 : base[index + 1][0] - MIN_GAP;
    const nextX = index === 0 || index === last ? base[index][0] : Math.min(high, Math.max(low, x));
    return base.map((point, i) => (i === index ? [nextX, clamp01(y)] : point));
  };

  const onPointerDown = (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    const [x, y] = pointer(event);
    svgRef.current.setPointerCapture(event.pointerId);
    onBeginEdit();
    let index = points.findIndex(([px, py]) => Math.hypot(px - x, py - y) < HIT_RADIUS);
    if (index < 0) {
      // A click away from every point adds one on the curve, so it can be dragged without jumping.
      const onCurve = curveFunction(points)(x);
      const next = [...points, [x, clamp01(onCurve)]].sort((a, b) => a[0] - b[0]);
      if (next.some((point, i) => i && point[0] - next[i - 1][0] < MIN_GAP)) return;
      index = next.findIndex(([px]) => px === x);
      dragRef.current = { index, points: next };
      setSelected(index);
      commit(next);
      return;
    }
    dragRef.current = { index, points };
    setSelected(index);
  };

  const onPointerMove = (event) => {
    const drag = dragRef.current;
    if (!drag) return;
    const next = moveTo(drag.index, pointer(event), drag.points);
    dragRef.current = { ...drag, points: next };
    commit(next);
  };

  const endDrag = (event) => {
    dragRef.current = null;
    if (svgRef.current.hasPointerCapture(event.pointerId)) svgRef.current.releasePointerCapture(event.pointerId);
  };

  const removePoint = (index) => {
    if (index <= 0 || index >= points.length - 1) return;
    onBeginEdit();
    setSelected(null);
    commit(points.filter((_, i) => i !== index));
  };

  const onKeyDown = (event, index) => {
    const step = event.shiftKey ? 0.05 : 0.01;
    const moves = { ArrowUp: [0, step], ArrowDown: [0, -step], ArrowLeft: [-step, 0], ArrowRight: [step, 0] };
    if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      removePoint(index);
      return;
    }
    const move = moves[event.key];
    if (!move) return;
    event.preventDefault();
    onBeginEdit();
    commit(moveTo(index, [points[index][0] + move[0], points[index][1] + move[1]]));
  };

  const resetChannel = () => {
    onBeginEdit();
    setSelected(null);
    commit(fallback[channel]);
  };

  return (
    <div className="curves">
      <Segmented size="sm" label="Curve channel" value={channel} options={CHANNELS} onChange={(value) => { setChannel(value); setSelected(null); }} />
      <svg
        ref={svgRef}
        className="curves__plot"
        viewBox={`0 0 ${BOX} ${BOX}`}
        role="group"
        aria-label={`${CHANNELS.find(([key]) => key === channel)[1]} curve`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <rect x={PAD} y={PAD} width={SPAN} height={SPAN} className="curves__field" />
        {[0.25, 0.5, 0.75].map((step) => (
          <g key={step} className="curves__grid">
            <line x1={toX(step)} y1={PAD} x2={toX(step)} y2={BOX - PAD} />
            <line x1={PAD} y1={toY(step)} x2={BOX - PAD} y2={toY(step)} />
          </g>
        ))}
        <line className="curves__diagonal" x1={toX(0)} y1={toY(0)} x2={toX(1)} y2={toY(1)} />
        {CHANNELS.filter(([key]) => key !== channel && !isIdentityCurve(allCurves[key])).map(([key]) => (
          <path key={key} d={pathOf(allCurves[key])} className="curves__ghost" stroke={STROKE[key]} />
        ))}
        <path d={pathOf(points)} className="curves__line" stroke={STROKE[channel]} />
        {points.map(([x, y], index) => (
          <circle
            key={index}
            className={`curves__point ${selected === index ? 'is-selected' : ''}`}
            cx={toX(x)}
            cy={toY(y)}
            r={selected === index ? 5 : 4}
            tabIndex={0}
            role="slider"
            aria-label={`Point ${index + 1}`}
            aria-valuetext={`Input ${Math.round(x * 100)}, output ${Math.round(y * 100)}`}
            onFocus={() => setSelected(index)}
            onKeyDown={(event) => onKeyDown(event, index)}
            onDoubleClick={() => removePoint(index)}
          />
        ))}
      </svg>
      <div className="curves__foot">
        <p className="hint">Click the line to add a point, double-click a point to remove it.</p>
        <button type="button" className="link-btn" disabled={isIdentityCurve(points)} onClick={resetChannel}><ArrowCounterClockwise size={12} /> Reset</button>
      </div>
    </div>
  );
}
