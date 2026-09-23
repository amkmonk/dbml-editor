// Раскладка доски с минимумом пересечений связей и проходов линий сквозь таблицы.
// Модуль без DOM: им пользуются и кнопка «Разложить», и CLI.

import { cloneState } from "./history.js";

export const TABLE_W = 196;
const HEAD = 28;
const ROW = 20;
const TAIL = 16;
const ZONE_PAD = 16;
const ZONE_TOP = 36;
const GAP_X = 72;
const GAP_Y = 36;
const ZONE_GAP = 64;
const ORIGIN = 20;
const MAX_COLUMNS = 4;

// Цена штрафов: пересечение и проход сквозь таблицу важнее длины и формы.
const W_CROSS = 400;
const W_THROUGH = 500;
const W_LENGTH = 0.03;
const W_OVERFLOW = 20;
// Пустое место в зоне: столбцы разной высоты оставляют дыры, зона раздувается.
const W_WASTE = 0.004;

/** tableHeight — высота карточки в редакторе: все поля, как в режиме правки. */
export function tableHeight(table) {
  return HEAD + table.columns.length * ROW + TAIL;
}

function rowOffset(table, column) {
  const index = table.columns.findIndex((item) => item.name === column);
  return HEAD + Math.max(index, 0) * ROW + ROW / 2;
}

/**
 * sideFor — сторона выхода связи, как её выбирает редактор при «auto»:
 * к таблице правее — справа, левее — слева.
 */
function autoSides(fromX, toX) {
  return toX >= fromX ? ["right", "left"] : ["left", "right"];
}

/**
 * layoutSides — стороны, которые раскладка записывает явно. Таблицы в одном
 * столбце соединяются справа с обеих сторон: при «auto» линия шла бы сквозь
 * соседей по столбцу.
 */
function layoutSides(fromX, toX) {
  if (Math.abs(fromX - toX) < TABLE_W) return ["right", "right"];
  return autoSides(fromX, toX);
}

function segmentOf(from, to, fromOffset, toOffset, sides) {
  const x1 = sides[0] === "right" ? from.x + TABLE_W : from.x;
  const x2 = sides[1] === "right" ? to.x + TABLE_W : to.x;
  return [x1, from.y + fromOffset, x2, to.y + toOffset];
}

function crosses(s, t) {
  const d = (s[2] - s[0]) * (t[3] - t[1]) - (s[3] - s[1]) * (t[2] - t[0]);
  if (d === 0) return false;
  const u = ((t[0] - s[0]) * (t[3] - t[1]) - (t[1] - s[1]) * (t[2] - t[0])) / d;
  const v = ((t[0] - s[0]) * (s[3] - s[1]) - (t[1] - s[1]) * (s[2] - s[0])) / d;
  return u > 0.001 && u < 0.999 && v > 0.001 && v < 0.999;
}

function hitsBox(s, box) {
  const l = box.x + 2;
  const t = box.y + 2;
  const r = box.x + TABLE_W - 2;
  const b = box.y + box.h - 2;
  const inside = (x, y) => x > l && x < r && y > t && y < b;
  if (inside(s[0], s[1]) || inside(s[2], s[3])) return true;
  return (
    crosses(s, [l, t, r, t]) || crosses(s, [r, t, r, b]) || crosses(s, [r, b, l, b]) || crosses(s, [l, b, l, t])
  );
}

/**
 * countConflicts — пересечения связей между собой и проходы связей сквозь
 * чужие таблицы. Связи считаются отрезками от стороны таблицы на уровне поля;
 * связи с общей таблицей не считаются пересечением.
 */
function countConflicts(edges, boxes, segments) {
  let crossings = 0;
  let through = 0;
  let length = 0;
  for (let i = 0; i < edges.length; i += 1) {
    const s = segments[i];
    length += Math.hypot(s[2] - s[0], s[3] - s[1]);
    const a = edges[i];
    for (let j = i + 1; j < edges.length; j += 1) {
      const b = edges[j];
      if (a.from === b.from || a.from === b.to || a.to === b.from || a.to === b.to) continue;
      if (crosses(s, segments[j])) crossings += 1;
    }
    for (let k = 0; k < boxes.length; k += 1) {
      if (k === a.from || k === a.to) continue;
      if (hitsBox(s, boxes[k])) through += 1;
    }
  }
  return { crossings, through, length };
}

/** layoutMetrics — пересечения и проходы для раскладки как она есть на доске. */
export function layoutMetrics(state) {
  const index = new Map(state.tables.map((table, i) => [table.id, i]));
  const zones = new Map(state.zones.map((zone) => [zone.id, zone]));
  const boxes = state.tables.map((table) => {
    const zone = zones.get(table.zone);
    return { x: (zone?.x || 0) + table.x, y: (zone?.y || 0) + table.y, h: tableHeight(table) };
  });
  const edges = [];
  const segments = [];
  for (const ref of state.refs) {
    const from = index.get(ref.from);
    const to = index.get(ref.to);
    if (from === undefined || to === undefined || from === to) continue;
    const auto = autoSides(boxes[from].x, boxes[to].x);
    const sides = [
      ref.fromSide === "left" || ref.fromSide === "right" ? ref.fromSide : auto[0],
      ref.toSide === "left" || ref.toSide === "right" ? ref.toSide : auto[1],
    ];
    edges.push({ from, to });
    segments.push(
      segmentOf(
        boxes[from],
        boxes[to],
        rowOffset(state.tables[from], ref.fromCol),
        rowOffset(state.tables[to], ref.toCol),
        sides,
      ),
    );
  }
  const { crossings, through } = countConflicts(edges, boxes, segments);
  return { crossings, through };
}

function random(seed) {
  let value = seed >>> 0 || 1;
  return () => {
    value = (Math.imul(value, 1103515245) + 12345) >>> 0;
    return value / 4294967296;
  };
}

/**
 * arrange — новая раскладка доски. Зоны встают в сетку (ряды подряд, без
 * пустых мест, по центру самого широкого ряда), таблицы внутри зоны — в
 * столбцы. Порядок зон перебирается полностью, таблицы переставляются отжигом.
 * Возвращает новое состояние; исходное не меняется. Зоны без таблиц и таблицы
 * без зоны остаются на месте.
 */
export function arrange(source, options = {}) {
  const { seed = 1, steps = 6000, restarts = 3 } = options;
  const state = cloneState(source);
  const zones = state.zones.filter((zone) => state.tables.some((table) => table.zone === zone.id));
  if (!zones.length) return { state, before: layoutMetrics(source), after: layoutMetrics(source) };

  const tables = state.tables;
  const index = new Map(tables.map((table, i) => [table.id, i]));
  const zoneIndex = new Map(zones.map((zone, i) => [zone.id, i]));
  const heights = tables.map(tableHeight);
  const edges = [];
  for (const ref of state.refs) {
    const from = index.get(ref.from);
    const to = index.get(ref.to);
    if (from === undefined || to === undefined || from === to) continue;
    if (!zoneIndex.has(tables[from].zone) || !zoneIndex.has(tables[to].zone)) continue;
    edges.push({ from, to, fromOffset: rowOffset(tables[from], ref.fromCol), toOffset: rowOffset(tables[to], ref.toCol) });
  }

  const rows = zones.length <= 3 ? 1 : 2;
  const slots = rows * (Math.ceil(zones.length / rows) + 1);
  const rand = random(seed);

  // Раскладка — столбцы таблиц каждой зоны и слот зоны.
  const initial = {
    columns: zones.map((zone) => layerColumns(zone.id)),
    slot: zones.map((_, i) => i),
  };

  function layerColumns(zoneId) {
    const ids = tables.map((table, i) => (table.zone === zoneId ? i : -1)).filter((i) => i >= 0);
    const inside = edges.filter((edge) => tables[edge.from].zone === zoneId && tables[edge.to].zone === zoneId);
    const rank = new Map(ids.map((id) => [id, 0]));
    for (let step = 0; step < ids.length; step += 1) {
      for (const edge of inside) rank.set(edge.from, Math.max(rank.get(edge.from), rank.get(edge.to) + 1));
    }
    const layers = [];
    for (const id of ids) (layers[rank.get(id)] ||= []).push(id);
    const columns = layers.filter(Boolean);
    while (columns.length > 3) columns[columns.length - 2].push(...columns.pop());
    return columns;
  }

  function place(layout) {
    const sizes = layout.columns.map((columns) => {
      const heightOf = (column) => column.reduce((sum, id) => sum + heights[id], 0) + GAP_Y * (column.length - 1);
      return {
        w: ZONE_PAD * 2 + columns.length * TABLE_W + (columns.length - 1) * GAP_X,
        h: ZONE_TOP + Math.max(...columns.map(heightOf)) + ZONE_PAD,
      };
    });
    const perRow = slots / rows;
    const byRow = Array.from({ length: rows }, () => []);
    layout.slot.forEach((slot, zone) => byRow[Math.floor(slot / perRow)].push([slot % perRow, zone]));
    byRow.forEach((row) => row.sort((a, b) => a[0] - b[0]));
    const rowWidth = byRow.map((row) => row.reduce((w, [, z], i) => w + sizes[z].w + (i ? ZONE_GAP : 0), 0));
    const rowHeight = byRow.map((row) => Math.max(0, ...row.map(([, z]) => sizes[z].h)));
    const widest = Math.max(...rowWidth);
    const zoneBoxes = [];
    let top = 0;
    byRow.forEach((row, r) => {
      if (!row.length) return;
      let x = (widest - rowWidth[r]) / 2;
      for (const [, z] of row) {
        // Верхний ряд прижат вниз, остальные — вверх: связи между рядами короче.
        const y = r === 0 && rows > 1 ? top + rowHeight[r] - sizes[z].h : top;
        zoneBoxes[z] = { x: Math.round(x), y: Math.round(y), w: sizes[z].w, h: sizes[z].h };
        x += sizes[z].w + ZONE_GAP;
      }
      top += rowHeight[r] + ZONE_GAP;
    });
    const boxes = tables.map(() => null);
    layout.columns.forEach((columns, z) => {
      columns.forEach((column, c) => {
        let y = ZONE_TOP;
        for (const id of column) {
          boxes[id] = { x: zoneBoxes[z].x + ZONE_PAD + c * (TABLE_W + GAP_X), y: zoneBoxes[z].y + y, h: heights[id], rx: ZONE_PAD + c * (TABLE_W + GAP_X), ry: y };
          y += heights[id] + GAP_Y;
        }
      });
    });
    return { zoneBoxes, boxes };
  }

  function score(layout) {
    const { zoneBoxes, boxes } = place(layout);
    const placed = boxes.map((box, i) => box || { x: -1e6 - i * 1000, y: -1e6, h: heights[i] });
    const segments = edges.map((edge) =>
      segmentOf(placed[edge.from], placed[edge.to], edge.fromOffset, edge.toOffset, layoutSides(placed[edge.from].x, placed[edge.to].x)),
    );
    const { crossings, through, length } = countConflicts(edges, placed.filter(Boolean), segments);
    const width = Math.max(...zoneBoxes.map((b) => b.x + b.w)) - Math.min(...zoneBoxes.map((b) => b.x));
    const height = Math.max(...zoneBoxes.map((b) => b.y + b.h)) - Math.min(...zoneBoxes.map((b) => b.y));
    const overflow = Math.max(0, height - width);
    let waste = 0;
    zoneBoxes.forEach((box, z) => {
      const used = layout.columns[z].reduce((sum, column) => sum + column.reduce((acc, id) => acc + TABLE_W * heights[id], 0), 0);
      waste += box.w * box.h - used;
    });
    return {
      total: crossings * W_CROSS + through * W_THROUGH + length * W_LENGTH + overflow * W_OVERFLOW + waste * W_WASTE,
      crossings,
      through,
    };
  }

  const copy = (layout) => ({ columns: layout.columns.map((columns) => columns.map((column) => [...column])), slot: [...layout.slot] });

  function bestSlots(layout) {
    let best = null;
    const used = new Array(slots).fill(false);
    const pick = [];
    const visit = () => {
      if (pick.length === zones.length) {
        const candidate = { columns: layout.columns, slot: [...pick] };
        const value = score(candidate).total;
        if (!best || value < best.value) best = { value, slot: [...pick] };
        return;
      }
      for (let s = 0; s < slots; s += 1) {
        if (used[s]) continue;
        used[s] = true;
        pick.push(s);
        visit();
        pick.pop();
        used[s] = false;
      }
    };
    // Полный перебор — пока вариантов немного; иначе порядок остаётся, его двигает отжиг.
    let count = 1;
    for (let i = 0; i < zones.length; i += 1) count *= slots - i;
    if (count > 25000) return copy(layout);
    visit();
    return { columns: layout.columns.map((columns) => columns.map((column) => [...column])), slot: best.slot };
  }

  function mutate(layout) {
    const next = copy(layout);
    const z = Math.floor(rand() * zones.length);
    const columns = next.columns[z];
    const roll = rand();
    if (roll < 0.15 && columns.length > 1) {
      // Выравнивание: таблица из самого высокого столбца уходит в самый низкий.
      const heightOf = (column) => column.reduce((sum, id) => sum + heights[id] + GAP_Y, 0);
      const order = columns.map((column, c) => [heightOf(column), c]).sort((a, b) => a[0] - b[0]);
      const low = columns[order[0][1]];
      const high = columns[order[order.length - 1][1]];
      if (high.length > 1) low.splice(Math.floor(rand() * (low.length + 1)), 0, high.splice(Math.floor(rand() * high.length), 1)[0]);
    } else if (roll < 0.25 && zones.length > 1) {
      const target = Math.floor(rand() * slots);
      const other = next.slot.indexOf(target);
      if (other >= 0) next.slot[other] = next.slot[z];
      next.slot[z] = target;
    } else if (roll < 0.55) {
      const cells = columns.flatMap((column, c) => column.map((_, r) => [c, r]));
      const a = cells[Math.floor(rand() * cells.length)];
      const b = cells[Math.floor(rand() * cells.length)];
      [columns[a[0]][a[1]], columns[b[0]][b[1]]] = [columns[b[0]][b[1]], columns[a[0]][a[1]]];
    } else if (roll < 0.9) {
      const from = Math.floor(rand() * columns.length);
      const [id] = columns[from].splice(Math.floor(rand() * columns[from].length), 1);
      const to = Math.floor(rand() * Math.min(MAX_COLUMNS, columns.length + 1));
      if (to === columns.length) columns.push([]);
      columns[to].splice(Math.floor(rand() * (columns[to].length + 1)), 0, id);
      next.columns[z] = columns.filter((column) => column.length);
    } else if (columns.length > 1) {
      const a = Math.floor(rand() * columns.length);
      const b = Math.floor(rand() * columns.length);
      [columns[a], columns[b]] = [columns[b], columns[a]];
    }
    return next;
  }

  let best = bestSlots(initial);
  let bestScore = score(best);
  for (let restart = 0; restart < restarts; restart += 1) {
    let current = restart === 0 ? best : mutate(mutate(mutate(best)));
    let currentScore = score(current);
    for (let step = 0; step < steps; step += 1) {
      const next = mutate(current);
      const nextScore = score(next);
      const temperature = 800 * (1 - step / steps) ** 2;
      if (nextScore.total < currentScore.total || rand() < Math.exp((currentScore.total - nextScore.total) / Math.max(temperature, 0.01))) {
        current = next;
        currentScore = nextScore;
      }
      if (currentScore.total < bestScore.total) {
        best = current;
        bestScore = currentScore;
      }
    }
    best = bestSlots(best);
    bestScore = score(best);
  }

  const { zoneBoxes, boxes } = place(best);
  const minX = Math.min(...zoneBoxes.map((b) => b.x));
  const minY = Math.min(...zoneBoxes.map((b) => b.y));
  zones.forEach((zone, z) => {
    zone.x = zoneBoxes[z].x - minX + ORIGIN;
    zone.y = zoneBoxes[z].y - minY + ORIGIN;
    zone.w = zoneBoxes[z].w;
    zone.h = zoneBoxes[z].h;
  });
  tables.forEach((table, i) => {
    if (!boxes[i]) return;
    table.x = boxes[i].rx;
    table.y = boxes[i].ry;
  });
  for (const ref of state.refs) {
    const from = index.get(ref.from);
    const to = index.get(ref.to);
    if (from === undefined || to === undefined || from === to || !boxes[from] || !boxes[to]) continue;
    [ref.fromSide, ref.toSide] = layoutSides(boxes[from].x, boxes[to].x);
  }
  return { state, before: layoutMetrics(source), after: layoutMetrics(state) };
}
