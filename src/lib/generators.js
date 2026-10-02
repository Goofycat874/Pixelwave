export const SOLID_COLORS = Object.freeze([
  ['#000000', 'Black'],
  ['#ffffff', 'White'],
  ['#18191c', 'Charcoal'],
  ['#3a3d44', 'Slate'],
  ['#f2b33d', 'Amber'],
  ['#e5484d', 'Red'],
  ['#f76b15', 'Orange'],
  ['#30a46c', 'Green'],
  ['#12a594', 'Teal'],
  ['#3e63dd', 'Blue'],
  ['#1b2a4a', 'Navy'],
  ['#d6409f', 'Pink'],
]);

export const GRADIENTS = Object.freeze([
  { id: 'dusk', label: 'Dusk', colors: ['#1d2b64', '#f8cdda'], angle: 135 },
  { id: 'ember', label: 'Ember', colors: ['#2b1a1a', '#f2994a'], angle: 160 },
  { id: 'lagoon', label: 'Lagoon', colors: ['#0f2027', '#2c7a8a'], angle: 120 },
  { id: 'citrus', label: 'Citrus', colors: ['#f7971e', '#ffd200'], angle: 135 },
  { id: 'forest', label: 'Forest', colors: ['#0f2a1d', '#5fa27a'], angle: 150 },
  { id: 'night', label: 'Night', colors: ['#08090c', '#24324a'], angle: 180 },
  { id: 'studio', label: 'Studio', colors: ['#f4f4f5', '#c9cbd1'], angle: 180 },
  { id: 'berry', label: 'Berry', colors: ['#3a1037', '#c2366d'], angle: 135 },
]);

export function generatorName(generator) {
  if (generator?.type === 'gradient') {
    const preset = GRADIENTS.find((item) => item.id === generator.id);
    return `${preset?.label || 'Custom'} gradient`;
  }
  const named = SOLID_COLORS.find(([color]) => color.toLowerCase() === String(generator?.color).toLowerCase());
  return `${named?.[1] || String(generator?.color || 'Color').toUpperCase()} background`;
}

export function generatorSize(generator, project = {}) {
  if (generator?.type !== 'gradient') return { width: 16, height: 16 };
  const width = Number(project.width) || 1920;
  const height = Number(project.height) || 1080;
  const factor = 1280 / Math.max(width, height);
  return { width: Math.max(2, Math.round(width * factor)), height: Math.max(2, Math.round(height * factor)) };
}

export function renderGenerator(generator, size, doc = globalThis.document) {
  const canvas = doc.createElement('canvas');
  canvas.width = size.width;
  canvas.height = size.height;
  const context = canvas.getContext('2d');
  if (generator.type === 'gradient') {
    const radians = ((Number(generator.angle) || 0) - 90) * (Math.PI / 180);
    const half = Math.hypot(size.width, size.height) / 2;
    const cx = size.width / 2;
    const cy = size.height / 2;
    const gradient = context.createLinearGradient(
      cx - Math.cos(radians) * half,
      cy - Math.sin(radians) * half,
      cx + Math.cos(radians) * half,
      cy + Math.sin(radians) * half,
    );
    (generator.colors || ['#000000', '#ffffff']).forEach((color, index, colors) => gradient.addColorStop(index / Math.max(1, colors.length - 1), color));
    context.fillStyle = gradient;
    context.fillRect(0, 0, size.width, size.height);
    return canvas.toDataURL('image/jpeg', 0.94);
  }
  context.fillStyle = generator.color || '#000000';
  context.fillRect(0, 0, size.width, size.height);
  return canvas.toDataURL('image/png');
}

export function createGeneratedAsset(generator, project, doc = globalThis.document) {
  const size = generatorSize(generator, project);
  const src = renderGenerator(generator, size, doc);
  return {
    id: `media-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    name: generatorName(generator),
    kind: 'image',
    generator,
    src,
    thumbnail: src,
    width: size.width,
    height: size.height,
    duration: 5,
  };
}

// Generated media is stored as its recipe; the picture is rebuilt when a project opens.
export function hydrateGeneratedAsset(asset, project, doc = globalThis.document) {
  if (!asset?.generator) return asset;
  const size = generatorSize(asset.generator, project);
  const src = renderGenerator(asset.generator, size, doc);
  return { ...asset, src, thumbnail: src, width: size.width, height: size.height };
}
