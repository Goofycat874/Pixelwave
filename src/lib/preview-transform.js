function round(value) {
  return Math.round(value * 10000) / 10000;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function textOverlayWidth(text) {
  return `${clamp(String(text || '').length + 2, 8, 32)}ch`;
}

export function mediaSelectionBox({ asset = {}, fit = 'contain', effects = {}, stageWidth, stageHeight }) {
  const safeStageWidth = Math.max(1, Number(stageWidth) || 1);
  const safeStageHeight = Math.max(1, Number(stageHeight) || 1);
  const stageRatio = safeStageWidth / safeStageHeight;
  const sourceRatio = Math.max(1, Number(asset.width) || safeStageWidth) / Math.max(1, Number(asset.height) || safeStageHeight);
  let baseWidth = 100;
  let baseHeight = 100;

  if (fit !== 'cover') {
    if (sourceRatio >= stageRatio) baseHeight = (stageRatio / sourceRatio) * 100;
    else baseWidth = (sourceRatio / stageRatio) * 100;
  }

  const scale = clamp(Number(effects.scale) || 100, 25, 200) / 100;
  return {
    centerX: round(50 + (Number(effects.positionX) || 0) / 2),
    centerY: round(50 + (Number(effects.positionY) || 0) / 2),
    width: round(baseWidth * scale),
    height: round(baseHeight * scale),
    rotation: round(Number(effects.rotation) || 0),
  };
}

export function positionDeltaFromPointer({ deltaX, deltaY, stageWidth, stageHeight }) {
  return {
    x: round(((Number(deltaX) || 0) / Math.max(1, Number(stageWidth) || 1)) * 200),
    y: round(((Number(deltaY) || 0) / Math.max(1, Number(stageHeight) || 1)) * 200),
  };
}

export function textPositionFromPointer({ initialX, initialY, deltaX, deltaY, stageWidth, stageHeight }) {
  return {
    x: round(clamp((Number(initialX) || 0) + ((Number(deltaX) || 0) / Math.max(1, Number(stageWidth) || 1)) * 100, 0, 100)),
    y: round(clamp((Number(initialY) || 0) + ((Number(deltaY) || 0) / Math.max(1, Number(stageHeight) || 1)) * 100, 0, 100)),
  };
}

export function scaleFromCornerPointer({
  initialScale,
  centerX,
  centerY,
  startX,
  startY,
  currentX,
  currentY,
}) {
  const initialDistance = Math.hypot(startX - centerX, startY - centerY);
  if (initialDistance < 0.001) return clamp(Number(initialScale) || 100, 25, 200);
  const currentDistance = Math.hypot(currentX - centerX, currentY - centerY);
  return round(clamp((Number(initialScale) || 100) * (currentDistance / initialDistance), 25, 200));
}

export function textSizeFromCornerPointer({
  initialFontSize,
  centerX,
  centerY,
  startX,
  startY,
  currentX,
  currentY,
}) {
  const initialDistance = Math.hypot(startX - centerX, startY - centerY);
  if (initialDistance < 0.001) return clamp(Number(initialFontSize) || 54, 12, 180);
  const currentDistance = Math.hypot(currentX - centerX, currentY - centerY);
  return round(clamp((Number(initialFontSize) || 54) * (currentDistance / initialDistance), 12, 180));
}
