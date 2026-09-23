import { test } from "node:test";
import assert from "node:assert/strict";
import { arrange, layoutMetrics, TABLE_W, tableHeight } from "./arrange.js";

// Две зоны: звезда вокруг center и цепочка; исходная раскладка нарочно запутана.
function tangled() {
  const table = (id, zone, x, y, extra = []) => ({
    id,
    zone,
    x,
    y,
    columns: [{ name: "id", type: "uuid", pk: true }, ...extra.map((name) => ({ name, type: "uuid" }))],
  });
  return {
    zones: [
      { id: "a", title: "a", color: "#6d4caf", x: 0, y: 0, w: 900, h: 700 },
      { id: "b", title: "b", color: "#c4921a", x: 950, y: 0, w: 700, h: 700 },
    ],
    tables: [
      table("center", "a", 16, 36),
      table("s1", "a", 600, 400, ["center_id"]),
      table("s2", "a", 16, 400, ["center_id", "s1_id"]),
      table("s3", "a", 600, 36, ["center_id", "s2_id"]),
      table("c1", "b", 400, 400, ["center_id"]),
      table("c2", "b", 16, 36, ["c1_id"]),
      table("c3", "b", 400, 36, ["c2_id", "s3_id"]),
    ],
    refs: [
      ["s1", "center_id", "center"],
      ["s2", "center_id", "center"],
      ["s2", "s1_id", "s1"],
      ["s3", "center_id", "center"],
      ["s3", "s2_id", "s2"],
      ["c1", "center_id", "center"],
      ["c2", "c1_id", "c1"],
      ["c3", "c2_id", "c2"],
      ["c3", "s3_id", "s3"],
    ].map(([from, fromCol, to]) => ({ from, fromCol, to, toCol: "id", onDelete: "RESTRICT", fromSide: "auto", toSide: "auto" })),
  };
}

function overlaps(state) {
  const zones = new Map(state.zones.map((zone) => [zone.id, zone]));
  const boxes = state.tables.map((table) => {
    const zone = zones.get(table.zone);
    return { id: table.id, x: zone.x + table.x, y: zone.y + table.y, h: tableHeight(table), zone };
  });
  const hits = [];
  for (let i = 0; i < boxes.length; i += 1) {
    const a = boxes[i];
    if (a.x < a.zone.x || a.y < a.zone.y || a.x + TABLE_W > a.zone.x + a.zone.w || a.y + a.h > a.zone.y + a.zone.h) {
      hits.push(`${a.id} вне зоны`);
    }
    for (let j = i + 1; j < boxes.length; j += 1) {
      const b = boxes[j];
      if (a.x < b.x + TABLE_W && b.x < a.x + TABLE_W && a.y < b.y + b.h && b.y < a.y + a.h) hits.push(`${a.id}×${b.id}`);
    }
  }
  const zoneList = [...zones.values()];
  for (let i = 0; i < zoneList.length; i += 1) {
    for (let j = i + 1; j < zoneList.length; j += 1) {
      const a = zoneList[i];
      const b = zoneList[j];
      if (a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h) hits.push(`${a.id}×${b.id}`);
    }
  }
  return hits;
}

test("раскладка не накладывает таблицы и зоны и держит таблицы внутри зон", () => {
  const { state } = arrange(tangled(), { steps: 800, restarts: 1 });
  assert.deepEqual(overlaps(state), []);
});

test("раскладка распутывает связи и не трогает исходное состояние", () => {
  const source = tangled();
  const snapshot = JSON.stringify(source);
  const result = arrange(source, { steps: 800, restarts: 1 });
  assert.equal(JSON.stringify(source), snapshot);
  const before = result.before.crossings + result.before.through;
  const after = result.after.crossings + result.after.through;
  assert.ok(before > 0, "исходная раскладка должна быть запутанной");
  assert.ok(after < before, `ожидалось меньше конфликтов: было ${before}, стало ${after}`);
  assert.deepEqual(result.after, layoutMetrics(result.state));
});

test("одинаковое зерно — одинаковая раскладка", () => {
  const first = arrange(tangled(), { seed: 7, steps: 300, restarts: 1 }).state;
  const second = arrange(tangled(), { seed: 7, steps: 300, restarts: 1 }).state;
  assert.deepEqual(first, second);
});

test("состав зон, таблицы и связи сохраняются, стороны связей заданы явно", () => {
  const source = tangled();
  const { state } = arrange(source, { steps: 300, restarts: 1 });
  assert.deepEqual(
    state.tables.map((table) => [table.id, table.zone]),
    source.tables.map((table) => [table.id, table.zone]),
  );
  assert.equal(state.refs.length, source.refs.length);
  for (const ref of state.refs) {
    assert.ok(["left", "right"].includes(ref.fromSide));
    assert.ok(["left", "right"].includes(ref.toSide));
  }
});

test("пустая доска возвращается без изменений", () => {
  const empty = { zones: [], tables: [], refs: [] };
  const result = arrange(empty);
  assert.deepEqual(result.state, empty);
  assert.deepEqual(result.after, { crossings: 0, through: 0 });
});
