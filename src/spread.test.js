import { test } from "node:test";
import assert from "node:assert/strict";
import { spread } from "./spread.js";

const zone = (id, x, y, w, h) => ({ id, x, y, w, h });
const table = (id, zoneId, x, y, base, shown) => ({ id, zone: zoneId, x, y, base, shown });

test("выросшая таблица сдвигает соседа снизу и сохраняет зазор", () => {
  const result = spread(
    [zone("a", 0, 0, 500, 400)],
    [table("top", "a", 16, 36, 100, 180), table("below", "a", 16, 160, 60, 60), table("side", "a", 260, 160, 60, 60)],
  );
  assert.equal(result.tables.get("top"), 0);
  // Зазор был 24 (36 + 100 → 160), после роста низ верхней на 216, сосед — на 240.
  assert.equal(result.tables.get("below"), 80);
  assert.equal(result.tables.get("side"), 0, "таблица в другом столбце не двигается");
});

test("зона вытягивается под выросшие таблицы, зона ниже сдвигается", () => {
  const result = spread(
    [zone("a", 0, 0, 500, 200), zone("b", 0, 260, 500, 200), zone("c", 600, 260, 300, 200)],
    [table("t", "a", 16, 36, 140, 300)],
  );
  const a = result.zones.get("a");
  assert.equal(a.dh, 36 + 300 + 16 - 200);
  assert.equal(result.zones.get("b").dy, a.dh, "зазор между зонами сохраняется");
  assert.equal(result.zones.get("c").dy, 0, "зона сбоку не двигается");
});

test("без роста сдвигов нет", () => {
  const result = spread([zone("a", 0, 0, 500, 400)], [table("t", "a", 16, 36, 100, 100), table("u", "a", 16, 160, 100, 100)]);
  assert.deepEqual([...result.tables.values()], [0, 0]);
  assert.deepEqual(result.zones.get("a"), { dy: 0, dh: 0 });
});
