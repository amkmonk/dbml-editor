const TABLE_W = 196;
const GAP_X = 40;
const GAP_Y = 32;

export function autoplace(state) {
  for (const zone of state.zones) {
    const places = layoutZone(state, zone.id);
    for (const table of state.tables.filter((item) => item.zone === zone.id)) {
      const place = places[table.id] || { col: 0, row: 0 };
      table.x = 8 + place.col * (TABLE_W + GAP_X);
      table.y = 8 + place.row * 220;
    }
    fitZone(state, zone);
  }
  packZones(state);
}

function layoutZone(state, zoneId) {
  const nodes = state.tables.filter((table) => table.zone === zoneId).map((table) => table.id);
  const inside = new Set(nodes);
  const edges = state.refs.filter(
    (ref) => ref.from !== ref.to && inside.has(ref.from) && inside.has(ref.to),
  );
  const places = {};
  if (!nodes.length) return places;
  if (!edges.length) {
    const cols = Math.max(1, Math.ceil(Math.sqrt(nodes.length)));
    nodes.forEach((id, index) => {
      places[id] = { col: index % cols, row: Math.floor(index / cols) };
    });
    return places;
  }
  const rank = Object.fromEntries(nodes.map((id) => [id, 0]));
  for (let step = 0; step < nodes.length; step += 1) {
    for (const ref of edges) {
      rank[ref.from] = Math.max(rank[ref.from], rank[ref.to] + 1);
    }
  }
  const layers = [];
  for (const id of nodes) {
    (layers[rank[id]] || (layers[rank[id]] = [])).push(id);
  }
  if (layers.length >= 3 && layers.every((layer) => layer.length === 1)) {
    layers.flat().forEach((id, index) => {
      places[id] = { col: index % 2, row: Math.floor(index / 2) };
    });
    return places;
  }
  layers.forEach((layer, col) => {
    layer.forEach((id, index) => {
      places[id] = { col, row: index };
    });
  });
  return places;
}

export function fitZone(state, zone) {
  const tables = state.tables.filter((table) => table.zone === zone.id);
  let width = 280;
  let height = 120;
  for (const table of tables) {
    const rows = 28 + table.columns.length * 20 + 16;
    width = Math.max(width, table.x + TABLE_W + 24);
    height = Math.max(height, table.y + rows + 48);
  }
  zone.w = Math.max(zone.w || 0, width);
  zone.h = Math.max(zone.h || 0, height);
}

function packZones(state) {
  const gap = 16;
  const top = state.zones.slice(0, 3);
  const bottom = state.zones.slice(3);
  let x = 20;
  let y = 20;
  let rowH = 0;
  for (const zone of top) {
    zone.x = x;
    zone.y = y;
    x += (zone.w || 320) + gap;
    rowH = Math.max(rowH, zone.h || 200);
  }
  x = 20;
  y = 20 + rowH + gap;
  for (const zone of bottom) {
    zone.x = x;
    zone.y = y;
    x += (zone.w || 320) + gap;
  }
}
