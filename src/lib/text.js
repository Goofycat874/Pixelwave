import { fontStack, nearestWeight } from './fonts.js';

// Older projects stored bare overlays ({ text, fontSize, color, ... }). Their look was
// Geist semibold on a translucent dark box, so those stay the defaults.
export const TEXT_DEFAULTS = Object.freeze({
  text: 'Your text',
  fontFamily: 'Geist',
  fontWeight: 650,
  fontSize: 54,
  italic: false,
  uppercase: false,
  color: '#ffffff',
  align: 'center',
  letterSpacing: 0,
  lineHeight: 1.12,
  positionX: 50,
  positionY: 50,
  opacity: 100,
  backgroundEnabled: true,
  backgroundColor: '#0a0c0b',
  backgroundOpacity: 48,
  strokeWidth: 0,
  strokeColor: '#000000',
  shadow: true,
  glow: false,
  animationIn: 'none',
  animationOut: 'none',
  animationDuration: 0.5,
});

export const TEXT_ANIMATIONS_IN = Object.freeze([
  ['none', 'None'],
  ['fade', 'Fade'],
  ['pop', 'Pop'],
  ['slide-up', 'Rise'],
  ['slide-right', 'Slide'],
  ['zoom', 'Zoom'],
  ['blur', 'Focus'],
  ['typewriter', 'Type on'],
]);

export const TEXT_ANIMATIONS_OUT = Object.freeze([
  ['none', 'None'],
  ['fade', 'Fade'],
  ['pop', 'Pop'],
  ['slide-down', 'Sink'],
  ['zoom', 'Zoom'],
  ['blur', 'Blur'],
]);

export const TEXT_PRESETS = Object.freeze([
  {
    id: 'headline',
    label: 'Headline',
    sample: 'Big idea',
    style: { fontFamily: 'Montserrat', fontWeight: 900, fontSize: 104, backgroundEnabled: false, shadow: true, animationIn: 'pop', animationOut: 'fade' },
  },
  {
    id: 'subtitle',
    label: 'Subtitle',
    sample: 'A quiet line',
    style: { fontFamily: 'Geist', fontWeight: 500, fontSize: 42, backgroundEnabled: false, shadow: true, positionY: 62, animationIn: 'fade', animationOut: 'fade' },
  },
  {
    id: 'lower-third',
    label: 'Lower third',
    sample: 'Mara Okafor',
    style: { fontFamily: 'Geist', fontWeight: 700, fontSize: 38, color: '#111214', backgroundEnabled: true, backgroundColor: '#f4f4f5', backgroundOpacity: 100, shadow: false, positionX: 24, positionY: 84, animationIn: 'slide-right', animationOut: 'fade' },
  },
  {
    id: 'social-caption',
    label: 'Social caption',
    sample: 'Wait for it',
    style: { fontFamily: 'Montserrat', fontWeight: 800, fontSize: 64, uppercase: true, backgroundEnabled: false, strokeWidth: 7, strokeColor: '#000000', shadow: false, positionY: 70, animationIn: 'pop' },
  },
  {
    id: 'boxed',
    label: 'Boxed',
    sample: 'Chapter 1',
    style: { fontFamily: 'Geist', fontWeight: 600, fontSize: 46, backgroundEnabled: true, backgroundColor: '#111214', backgroundOpacity: 88, shadow: false, animationIn: 'slide-up', animationOut: 'fade' },
  },
  {
    id: 'cinematic',
    label: 'Cinematic',
    sample: 'One year on',
    style: { fontFamily: 'Bebas Neue', fontWeight: 400, fontSize: 92, letterSpacing: 18, backgroundEnabled: false, shadow: true, animationIn: 'blur', animationOut: 'blur' },
  },
  {
    id: 'neon',
    label: 'Neon',
    sample: 'Open late',
    style: { fontFamily: 'Outfit', fontWeight: 700, fontSize: 82, color: '#8ff3ff', backgroundEnabled: false, shadow: false, glow: true, animationIn: 'fade' },
  },
  {
    id: 'handwritten',
    label: 'Handwritten',
    sample: 'Summer notes',
    style: { fontFamily: 'Caveat', fontWeight: 700, fontSize: 88, backgroundEnabled: false, shadow: true, animationIn: 'typewriter' },
  },
  {
    id: 'marker',
    label: 'Marker',
    sample: 'Do not skip',
    style: { fontFamily: 'Permanent Marker', fontWeight: 400, fontSize: 70, color: '#ffd84d', backgroundEnabled: false, shadow: true, animationIn: 'pop' },
  },
  {
    id: 'quote',
    label: 'Quote',
    sample: 'Make it simple',
    style: { fontFamily: 'Playfair Display', fontWeight: 600, italic: true, fontSize: 60, backgroundEnabled: false, shadow: true, animationIn: 'fade', animationOut: 'fade' },
  },
]);

export function textPreset(id) {
  return TEXT_PRESETS.find((preset) => preset.id === id) || null;
}

export function resolveTextStyle(overlay = {}) {
  const style = { ...TEXT_DEFAULTS };
  for (const [key, value] of Object.entries(overlay || {})) {
    if (value !== undefined && value !== null) style[key] = value;
  }
  style.fontWeight = nearestWeight(style.fontFamily, Number(style.fontWeight) || 650);
  style.fontSize = Math.max(6, Number(style.fontSize) || TEXT_DEFAULTS.fontSize);
  return style;
}

export function textFont(style, pixelSize) {
  return `${style.italic ? 'italic ' : ''}${style.fontWeight} ${Math.max(1, pixelSize)}px ${fontStack(style.fontFamily, style.customFont)}`;
}

export function displayText(style) {
  const text = String(style.text ?? '');
  return style.uppercase ? text.toUpperCase() : text;
}

export function hexToRgba(hex, alpha = 1) {
  const clean = String(hex || '#000000').replace('#', '');
  const full = clean.length === 3 ? clean.split('').map((part) => part + part).join('') : clean.padEnd(6, '0').slice(0, 6);
  const value = Number.parseInt(full, 16);
  const red = (value >> 16) & 255;
  const green = (value >> 8) & 255;
  const blue = value & 255;
  return `rgba(${red}, ${green}, ${blue}, ${Math.max(0, Math.min(1, alpha))})`;
}

export function wrapTextLines(measure, text, maxWidth) {
  const lines = [];
  for (const paragraph of String(text || '').split('\n')) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (!words.length) {
      lines.push('');
      continue;
    }
    let current = '';
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (measure(candidate) <= maxWidth || !current) {
        if (!current && measure(word) > maxWidth) {
          let chunk = '';
          for (const character of word) {
            if (chunk && measure(chunk + character) > maxWidth) {
              lines.push(chunk);
              chunk = character;
            } else chunk += character;
          }
          current = chunk;
        } else current = candidate;
      } else {
        lines.push(current);
        current = word;
      }
    }
    lines.push(current);
  }
  return lines;
}

export function textReferenceScale(width, height) {
  return Math.min(Number(width) || 1280, Number(height) || 720) / 720;
}

// Lays text out in project pixels. `context` only needs measureText, font and letterSpacing.
export function layoutTextOverlay(context, overlay, frame) {
  const style = resolveTextStyle(overlay);
  const scale = textReferenceScale(frame.width, frame.height);
  const size = style.fontSize * scale;
  context.font = textFont(style, size);
  if ('letterSpacing' in context) context.letterSpacing = `${(style.letterSpacing / 100) * size}px`;
  const hasBox = Boolean(style.backgroundEnabled);
  const padX = hasBox ? size * 0.42 : size * 0.08;
  const padY = hasBox ? size * 0.22 : size * 0.04;
  const maxWidth = Math.max(size, frame.width * 0.9 - padX * 2);
  const lines = wrapTextLines((value) => context.measureText(value).width, displayText(style), maxWidth);
  const widths = lines.map((line) => context.measureText(line).width);
  const textWidth = Math.max(size * 0.4, ...widths);
  const lineHeight = size * style.lineHeight;
  const boxWidth = textWidth + padX * 2;
  const boxHeight = Math.max(1, lines.length) * lineHeight + padY * 2;
  return {
    style,
    size,
    lines,
    widths,
    textWidth,
    lineHeight,
    padX,
    padY,
    boxWidth,
    boxHeight,
    centerX: frame.width * ((Number(style.positionX) ?? 50) / 100),
    centerY: frame.height * ((Number(style.positionY) ?? 50) / 100),
  };
}

function easeOut(value) {
  return 1 - (1 - Math.max(0, Math.min(1, value))) ** 3;
}

function backOut(value) {
  const x = Math.max(0, Math.min(1, value));
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * (x - 1) ** 3 + c1 * (x - 1) ** 2;
}

// Returns how the text should look `localTime` seconds into a clip of `clipDuration`.
// Offsets are in multiples of the font size so they scale with the text.
export function textAnimationState(style, localTime, clipDuration) {
  const state = { alpha: 1, scale: 1, offsetX: 0, offsetY: 0, blur: 0, reveal: 1 };
  const duration = Math.max(0.05, Math.min(Number(style.animationDuration) || 0.5, (clipDuration || 1) / 2));
  const enter = Math.max(0, Math.min(1, localTime / duration));
  const exit = Math.max(0, Math.min(1, (clipDuration - localTime) / duration));

  if (style.animationIn && style.animationIn !== 'none' && enter < 1) {
    const eased = easeOut(enter);
    if (style.animationIn === 'fade') state.alpha *= eased;
    if (style.animationIn === 'pop') { state.scale *= 0.4 + 0.6 * backOut(enter); state.alpha *= Math.min(1, enter * 2.5); }
    if (style.animationIn === 'slide-up') { state.offsetY += (1 - eased) * 0.9; state.alpha *= eased; }
    if (style.animationIn === 'slide-right') { state.offsetX -= (1 - eased) * 1.6; state.alpha *= eased; }
    if (style.animationIn === 'zoom') { state.scale *= 1.6 - 0.6 * eased; state.alpha *= eased; }
    if (style.animationIn === 'blur') { state.blur += (1 - eased) * 0.35; state.alpha *= eased; }
    if (style.animationIn === 'typewriter') state.reveal = enter;
  }

  if (style.animationOut && style.animationOut !== 'none' && exit < 1) {
    const eased = easeOut(exit);
    if (style.animationOut === 'fade') state.alpha *= eased;
    if (style.animationOut === 'pop') { state.scale *= 0.5 + 0.5 * eased; state.alpha *= eased; }
    if (style.animationOut === 'slide-down') { state.offsetY += (1 - eased) * 0.9; state.alpha *= eased; }
    if (style.animationOut === 'zoom') { state.scale *= 1 + (1 - eased) * 0.6; state.alpha *= eased; }
    if (style.animationOut === 'blur') { state.blur += (1 - eased) * 0.35; state.alpha *= eased; }
  }
  return state;
}

export function revealLines(lines, reveal) {
  if (reveal >= 1) return lines;
  const total = lines.reduce((sum, line) => sum + line.length, 0);
  let remaining = Math.floor(total * Math.max(0, reveal));
  return lines.map((line) => {
    const visible = line.slice(0, Math.max(0, remaining));
    remaining -= line.length;
    return visible;
  });
}
