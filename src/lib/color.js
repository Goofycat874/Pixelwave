// Color grading math. Temperature, tint and the lift/gamma/gain wheels all resolve to one
// per-channel transfer: out = clamp(slope * in + intercept) ^ exponent. The compositor turns
// that into an SVG filter, so the monitor and the exporter grade pixels identically.

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function round(value) {
  return Math.round(value * 10000) / 10000;
}

// Fully saturated RGB (0 to 1) for a hue in degrees: 0 red, 60 yellow, 120 green, 180 cyan, 240 blue, 300 magenta.
export function hueToRgb(hue) {
  const sector = (((hue % 360) + 360) % 360) / 60;
  const x = 1 - Math.abs((sector % 2) - 1);
  if (sector < 1) return [1, x, 0];
  if (sector < 2) return [x, 1, 0];
  if (sector < 3) return [0, 1, x];
  if (sector < 4) return [0, x, 1];
  if (sector < 5) return [x, 0, 1];
  return [1, 0, x];
}

// The wheel is drawn red at the right and runs clockwise (yellow, green, cyan, blue, magenta),
// with y pointing up. A puck dragged toward a color pushes the picture toward that color:
// the result is that color's RGB minus its average, scaled by how far the puck is from center.
export function wheelVector({ x = 0, y = 0 } = {}) {
  const strength = Math.min(1, Math.hypot(x, y));
  if (strength < 0.0005) return [0, 0, 0];
  const hue = (-Math.atan2(y, x) * 180) / Math.PI;
  const rgb = hueToRgb(hue);
  const mean = (rgb[0] + rgb[1] + rgb[2]) / 3;
  return rgb.map((value) => (value - mean) * strength);
}

function wheelOf(wheels, key) {
  return { x: 0, y: 0, luma: 0, ...(wheels?.[key] || {}) };
}

export function isNeutralChannels(channels) {
  return channels.every(({ slope, intercept, exponent }) => (
    Math.abs(slope - 1) < 0.0005 && Math.abs(intercept) < 0.0005 && Math.abs(exponent - 1) < 0.0005
  ));
}

// Returns [{ slope, intercept, exponent }] for red, green and blue, or null when the grade is neutral.
export function gradeChannels(effects = {}) {
  const temperature = clamp((Number(effects.temperature) || 0) / 100, -1, 1);
  const tint = clamp((Number(effects.tint) || 0) / 100, -1, 1);
  const lift = wheelOf(effects.primaryWheels, 'lift');
  const gamma = wheelOf(effects.primaryWheels, 'gamma');
  const gain = wheelOf(effects.primaryWheels, 'gain');
  const liftVector = wheelVector(lift);
  const gammaVector = wheelVector(gamma);
  const gainVector = wheelVector(gain);

  // Warm raises red and lowers blue; positive tint leans magenta by lowering green.
  const balance = [
    1 + 0.28 * temperature + 0.06 * tint,
    1 - 0.3 * tint,
    1 - 0.28 * temperature + 0.06 * tint,
  ];

  const channels = [0, 1, 2].map((index) => {
    const offset = clamp(0.3 * liftVector[index] + 0.12 * lift.luma, -0.4, 0.4);
    const gainMultiplier = Math.max(0.05, 1 + 0.45 * gainVector[index] + 0.5 * gain.luma);
    const power = clamp(1 + 0.9 * gammaVector[index] + 0.7 * gamma.luma, 0.45, 2.2);
    return {
      // Lift is anchored at white: out = in * (1 - offset) + offset.
      slope: round(Math.max(0.02, balance[index] * gainMultiplier * (1 - offset))),
      intercept: round(offset),
      exponent: round(1 / power),
    };
  });
  return isNeutralChannels(channels) ? null : channels;
}

export function gradeKey(channels) {
  return channels.map(({ slope, intercept, exponent }) => `${slope},${intercept},${exponent}`).join('|');
}

// The same transfer the SVG filter applies, for tests and for any future scopes.
export function applyGrade(rgb, channels) {
  if (!channels) return [...rgb];
  return rgb.map((value, index) => {
    const { slope, intercept, exponent } = channels[index];
    return clamp(clamp(slope * value + intercept, 0, 1) ** exponent, 0, 1);
  });
}
