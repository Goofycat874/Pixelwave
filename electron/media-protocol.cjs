function buildMediaFetchInit(request) {
  return {
    method: request?.method || 'GET',
    headers: new Headers(request?.headers),
  };
}

function isSupportedCaptionFontPath(filePath) {
  return /\.(ttf|otf|woff2?)$/i.test(String(filePath || ''));
}

function resolveMediaByteRange(header, totalBytes) {
  const match = /^bytes=(\d*)-(\d*)$/i.exec(String(header || '').trim());
  const size = Math.max(0, Number(totalBytes) || 0);
  if (!match || !size || (!match[1] && !match[2])) return null;
  let start;
  let end;
  if (!match[1]) {
    const suffixLength = Math.min(size, Number(match[2]) || 0);
    if (!suffixLength) return null;
    start = size - suffixLength;
    end = size - 1;
  } else {
    start = Number(match[1]);
    end = match[2] ? Math.min(size - 1, Number(match[2])) : size - 1;
  }
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || start >= size || end < start) return null;
  return {
    start,
    end,
    length: end - start + 1,
    contentRange: `bytes ${start}-${end}/${size}`,
  };
}

module.exports = { buildMediaFetchInit, isSupportedCaptionFontPath, resolveMediaByteRange };
