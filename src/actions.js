const STEP = 8;
const SHIFT_STEP = 32;
const COPY_OFFSET = 32;

export function nudgeStep(shift) {
  return shift ? SHIFT_STEP : STEP;
}

export function uniqueToken(used, base) {
  const clean = String(base || "item").replace(/_копия$/, "").replace(/_copy$/, "");
  const first = `${clean}_copy`;
  if (!used.has(first)) return first;
  let n = 2;
  while (used.has(`${clean}_${n}`)) n += 1;
  return `${clean}_${n}`;
}

export function relatedTableIds(state, tableId) {
  const ids = new Set([tableId]);
  for (const ref of state.refs) {
    if (ref.from === tableId) ids.add(ref.to);
    if (ref.to === tableId) ids.add(ref.from);
  }
  return ids;
}

export function moveColumnTo(table, columnName, targetIndex) {
  const columns = table?.columns;
  if (!columns) return false;
  const from = columns.findIndex((column) => column.name === columnName);
  if (from < 0 || targetIndex < 0 || targetIndex >= columns.length || from === targetIndex) return false;
  const [item] = columns.splice(from, 1);
  columns.splice(targetIndex, 0, item);
  return true;
}

export function moveColumn(table, columnName, delta) {
  const from = table?.columns?.findIndex((column) => column.name === columnName) ?? -1;
  if (from < 0 || !delta) return false;
  return moveColumnTo(table, columnName, from + delta);
}

export function moveSelection(state, selected, dx, dy) {
  if (!selected || (!dx && !dy)) return false;
  if (selected.type === "zone") {
    const zone = state.zones.find((item) => item.id === selected.id);
    if (!zone) return false;
    zone.x += dx;
    zone.y += dy;
    return true;
  }
  if (selected.type === "table" || selected.type === "field") {
    const table = state.tables.find((item) => item.id === (selected.type === "table" ? selected.id : selected.table));
    if (!table) return false;
    table.x += dx;
    table.y += dy;
    return true;
  }
  return false;
}

export function copySelection(state, selected) {
  if (!selected) return null;
  if (selected.type === "zone") return copyZone(state, selected.id);
  if (selected.type === "table") return copyTable(state, selected.id);
  if (selected.type === "field") return copyField(state, selected.table, selected.column);
  if (selected.type === "ref") return copyRef(state, selected.index);
  return null;
}

function copyZone(state, zoneId) {
  const zone = state.zones.find((item) => item.id === zoneId);
  if (!zone) return null;
  const usedZones = new Set(state.zones.map((item) => item.id));
  const usedTables = new Set(state.tables.map((item) => item.id));
  const newId = uniqueToken(usedZones, zone.id);
  const idMap = new Map();
  state.zones.push({
    ...zone,
    id: newId,
    title: `${zone.title} копия`,
    x: zone.x + COPY_OFFSET,
    y: zone.y + COPY_OFFSET,
  });
  for (const table of state.tables.filter((item) => item.zone === zone.id)) {
    const nextId = uniqueToken(usedTables, table.id);
    usedTables.add(nextId);
    idMap.set(table.id, nextId);
    state.tables.push({
      ...table,
      id: nextId,
      zone: newId,
      columns: table.columns.map((column) => ({ ...column })),
    });
  }
  for (const ref of [...state.refs]) {
    if (!idMap.has(ref.from) || !idMap.has(ref.to)) continue;
    state.refs.push({
      ...ref,
      from: idMap.get(ref.from),
      to: idMap.get(ref.to),
    });
  }
  return { type: "zone", id: newId };
}

function copyTable(state, tableId) {
  const table = state.tables.find((item) => item.id === tableId);
  if (!table) return null;
  const used = new Set(state.tables.map((item) => item.id));
  const newId = uniqueToken(used, table.id);
  state.tables.push({
    ...table,
    id: newId,
    x: table.x + COPY_OFFSET,
    y: table.y + COPY_OFFSET,
    columns: table.columns.map((column) => ({ ...column })),
  });
  for (const ref of [...state.refs]) {
    if (ref.from !== table.id) continue;
    state.refs.push({ ...ref, from: newId });
  }
  return { type: "table", id: newId };
}

function copyField(state, tableId, columnName) {
  const table = state.tables.find((item) => item.id === tableId);
  const column = table?.columns.find((item) => item.name === columnName);
  if (!column) return null;
  const used = new Set(table.columns.map((item) => item.name));
  const name = uniqueToken(used, column.name);
  table.columns.push({ ...column, name });
  return { type: "field", table: tableId, column: name };
}

function copyRef(state, index) {
  const ref = state.refs[index];
  if (!ref) return null;
  state.refs.push({ ...ref });
  return { type: "ref", index: state.refs.length - 1 };
}
