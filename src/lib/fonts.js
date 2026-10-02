// Every font here is bundled with the app (see src/fonts.js) so text renders the same
// in the preview and in exported video, even offline.
export const TEXT_FONTS = Object.freeze([
  { family: 'Geist', face: 'Geist Variable', category: 'sans-serif', weights: [400, 500, 600, 700, 800, 900], range: [100, 900] },
  { family: 'Montserrat', face: 'Montserrat Variable', category: 'sans-serif', weights: [400, 500, 600, 700, 800, 900], range: [100, 900] },
  { family: 'Outfit', face: 'Outfit Variable', category: 'sans-serif', weights: [400, 500, 600, 700, 800, 900], range: [100, 900] },
  { family: 'DM Sans', face: 'DM Sans Variable', category: 'sans-serif', weights: [400, 500, 600, 700, 800, 900], range: [100, 1000] },
  { family: 'Space Grotesk', face: 'Space Grotesk Variable', category: 'sans-serif', weights: [400, 500, 600, 700], range: [300, 700] },
  { family: 'Noto Sans', face: 'Noto Sans Variable', category: 'sans-serif', weights: [400, 500, 600, 700, 800, 900], range: [100, 900] },
  { family: 'Oswald', face: 'Oswald Variable', category: 'sans-serif', weights: [400, 500, 600, 700], range: [200, 700] },
  { family: 'Anton', face: 'Anton', category: 'sans-serif', weights: [400] },
  { family: 'Bebas Neue', face: 'Bebas Neue', category: 'sans-serif', weights: [400] },
  { family: 'Archivo Black', face: 'Archivo Black', category: 'sans-serif', weights: [400] },
  { family: 'Playfair Display', face: 'Playfair Display Variable', category: 'serif', weights: [400, 500, 600, 700, 800, 900], range: [400, 900] },
  { family: 'Caveat', face: 'Caveat Variable', category: 'cursive', weights: [400, 500, 600, 700], range: [400, 700] },
  { family: 'Permanent Marker', face: 'Permanent Marker', category: 'cursive', weights: [400] },
  { family: 'Pacifico', face: 'Pacifico', category: 'cursive', weights: [400] },
]);

export function fontEntry(family) {
  return TEXT_FONTS.find((font) => font.family === family) || null;
}

function quoted(family) {
  return `'${String(family || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

export function fontStack(family, customFont = null) {
  if (customFont?.src && customFont.family === family) return `${quoted(customFont.family)}, sans-serif`;
  const entry = fontEntry(family) || TEXT_FONTS[0];
  return `${quoted(entry.face)}, ${quoted(entry.family)}, ${entry.category}`;
}

export function nearestWeight(family, requested = 700) {
  const entry = fontEntry(family);
  if (!entry) return requested;
  if (entry.range) return Math.min(entry.range[1], Math.max(entry.range[0], Math.round(requested)));
  return entry.weights.reduce((best, weight) => (
    Math.abs(weight - requested) < Math.abs(best - requested) ? weight : best
  ), entry.weights[0]);
}
