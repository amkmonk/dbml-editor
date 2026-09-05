export const MIN_ZOOM = 0.25;
export const MAX_ZOOM = 3;

export function clampZoom(value) {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));
}

export function zoomAround(panX, panY, zoom, nextZoom, originX, originY) {
  const boardX = (originX - panX) / zoom;
  const boardY = (originY - panY) / zoom;
  return {
    zoom: nextZoom,
    panX: originX - boardX * nextZoom,
    panY: originY - boardY * nextZoom,
  };
}

export function centerOn(viewW, viewH, zoom, boardX, boardY) {
  return {
    panX: viewW / 2 - boardX * zoom,
    panY: viewH / 2 - boardY * zoom,
  };
}

export function contentCenter(zones) {
  if (!zones?.length) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const zone of zones) {
    minX = Math.min(minX, zone.x);
    minY = Math.min(minY, zone.y);
    maxX = Math.max(maxX, zone.x + zone.w);
    maxY = Math.max(maxY, zone.y + zone.h);
  }
  return { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
}
